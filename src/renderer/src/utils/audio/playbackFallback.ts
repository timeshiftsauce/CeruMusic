import { toRaw } from 'vue'
import type { PlaybackTarget } from '@common/playbackAttempt'
import { songKey } from '@common/musicItem'
import { isProviderTrackRef, normalizeAppTrackRef } from '@common/pluginMusic'
import { calculateBestQuality } from '@common/utils/quality'
import { desktopBridge } from '@renderer/services/desktopBridge'
import { activePluginContributions } from '@renderer/services/pluginState'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import type { SongList } from '@renderer/types/audio'
import { getSongRealUrl } from '@renderer/utils/playlist/playlistManager'
import { parseInterval, strSim } from './audioHelpers'
import {
  fallbackPreferences,
  fallbackStrategyLabels,
  orderedIds,
  type FallbackStrategy
} from './fallbackPreferences'
import { createPlaybackTrace } from './playbackTrace'

const throttleUntil = new Map<string, number>()

export function notePlaybackThrottle(pluginId: string, duration?: number) {
  if (duration && duration > 0) throttleUntil.set(pluginId, Date.now() + duration)
}

function musicProviders() {
  return activePluginContributions.value.flatMap(({ pluginId, descriptor, providerMethods }) =>
    descriptor.providers
      .filter(
        ({ id, name }) =>
          // Older plugins can register a resolver on their aggregate browsing entry.
          // Keep that entry out of automatic playback routing.
          id !== 'all' &&
          !(id === 'mix' && name?.startsWith('聚合')) &&
          providerMethods?.[id]?.some(
            (method) => method === 'tracks.resolve' || method === 'tracks.search'
          )
      )
      .map(({ id, name, qualities }) => ({
        pluginId,
        manifestId: descriptor.id,
        pluginName: descriptor.name,
        source: id,
        sourceName: name || id,
        qualities: qualities ?? [],
        searchable: !!providerMethods?.[id]?.includes('tracks.search'),
        playable: !!providerMethods?.[id]?.includes('tracks.resolve')
      }))
  )
}

export function playbackProviders() {
  return musicProviders().filter((provider) => provider.playable)
}

type Provider = ReturnType<typeof musicProviders>[number]
type Candidate = { song: SongList; target: PlaybackTarget; score?: number }
type Loaded = { url: string; target: PlaybackTarget; fallback: boolean }

function matchTitle(song: SongList) {
  const title = (song.name || '').trim()
  const annotation = title.match(/[（(]([^()（）]+)[）)]$/)
  if (!annotation) return title
  const [tail, label] = annotation
  const artist = (song.singer || '').toLowerCase()
  const suffix = label.trim().toLowerCase()
  return suffix.length > 1 && artist.includes(suffix) ? title.slice(0, -tail.length).trim() : title
}

function scoreSong(original: SongList, candidate: SongList) {
  const titleScore = strSim(matchTitle(candidate), matchTitle(original))
  if (!titleScore) return 0
  const similarity = titleScore * 0.6 + strSim(candidate.singer, original.singer) * 0.4
  const a = parseInterval(original.interval)
  const b = parseInterval(candidate.interval)
  if (!(a > 0 && b > 0)) return similarity
  const delta = Math.abs(a - b)
  return similarity + (delta <= 5 ? 0.2 : delta > 40 ? -0.3 : 0)
}

/** Owns one playback request. Tried URLs and plugin recovery decisions survive media retries. */
export function createPlaybackFallback(song: SongList, current: () => boolean, background = false) {
  const preferences = fallbackPreferences(useSettingsStore().settings.playbackFallback)
  const trace = createPlaybackTrace(song, background)
  const source = song.pluginResource?.providerId || song.source
  const primary: PlaybackTarget = { source }
  const local = LocalUserDetailStore()
  const blocked = new Set<string>()
  const implementations = musicProviders()
  const providers = implementations.filter((provider) => provider.playable)
  const pluginOrder = orderedIds(
    providers.map((provider) => provider.pluginId),
    preferences.pluginOrder
  )
  const byPlugin = (a: Provider, b: Provider) =>
    pluginOrder.indexOf(a.pluginId) - pluginOrder.indexOf(b.pluginId)
  const attempted = new Set<string>()
  const failedUrls = new Set<string>()
  const originalRef = normalizeAppTrackRef(song.pluginResource)
  const privateSong = originalRef && !isProviderTrackRef(originalRef)
  const usedTargets = { source: new Set<string>(), plugin: new Set<string>() }
  const limits = { source: preferences.sourceAttempts, plugin: preferences.pluginAttempts }
  const strategies = preferences.order.filter((strategy) => preferences.strategies[strategy])

  const isBlocked = (id?: string) => {
    if (!id) return false
    const expires = throttleUntil.get(id)
    if (expires !== undefined && expires <= Date.now()) throttleUntil.delete(id)
    return blocked.has(id) || (expires !== undefined && expires > Date.now())
  }

  function candidate(track: SongList, provider: Provider): Candidate {
    const desired =
      local.userInfo.sourceQualityMap?.[provider.source] || local.userSource?.quality || ''
    const quality =
      (desired ? calculateBestQuality(track.types, desired, provider.qualities) : null) ??
      provider.qualities.at(-1) ??
      desired
    return {
      song: track,
      target: { source: provider.source, pluginId: provider.pluginId, quality }
    }
  }

  async function* crossSource() {
    const choices = providers.filter((provider) => provider.source !== source)
    const platformOrder = orderedIds(
      choices.map((item) => item.source),
      preferences.preferPlatforms ? preferences.platformOrder : []
    )
    const title = matchTitle(song)
    const keywords = [...new Set([[title, song.singer].filter(Boolean).join(' '), title])].filter(
      Boolean
    )

    async function searchPlatform(platform: string): Promise<Candidate[]> {
      const targets = choices.filter((provider) => provider.source === platform).sort(byPlugin)
      const searchers = implementations
        .filter((provider) => provider.source === platform && provider.searchable)
        .sort(byPlugin)
      for (const searcher of searchers) {
        for (const keyword of keywords) {
          if (isBlocked(searcher.pluginId)) break
          if (!current() || !targets.some((provider) => !isBlocked(provider.pluginId))) return []
          try {
            const response = await desktopBridge.api.music.requestSdk('search', {
              source: platform,
              ownerId: searcher.pluginId,
              keyword,
              page: 1,
              limit: 15
            })
            const ranked = (response?.list ?? []).flatMap((item: SongList) => {
              if (item.songmid == null || item.songmid === '' || !item.name?.trim()) return []
              const resource = normalizeAppTrackRef(item.pluginResource)
              // Search can return songs belonging to another provider, particularly
              // on aggregate feeds. Never rewrite their identity to match the query.
              if ((resource?.providerId || item.source || platform) !== platform) return []
              const score = scoreSong(song, item)
              if (score <= 0.6) return []
              const track = { ...item, source: platform }
              return targets
                .filter(
                  (target) =>
                    !isBlocked(target.pluginId) &&
                    (!resource ||
                      isProviderTrackRef(resource) ||
                      (target.pluginId === searcher.pluginId &&
                        [target.pluginId, target.manifestId].includes(resource.pluginId)))
                )
                .map((target) => ({ ...candidate(track, target), score }))
            })
            if (ranked.length) return ranked.sort((a, b) => b.score - a.score)
          } catch {
            if (current()) trace.step('平台搜索失败', 'warning', searcher)
            break
          }
        }
      }
      if (current()) trace.step('平台未找到可播放的匹配歌曲', 'info', { source: platform })
      return []
    }

    if (preferences.preferPlatforms) {
      // Search in priority order and stop issuing searches when playback succeeds.
      for (const platform of platformOrder) {
        if (!current() || usedTargets.source.size >= limits.source) return
        yield* await searchPlatform(platform)
      }
    } else {
      const matches = await Promise.all(platformOrder.map(searchPlatform))
      yield* matches.flat().sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    }
  }

  const plan = {
    plugin: () =>
      privateSong
        ? []
        : providers
            .filter(
              (provider) => provider.source === source && provider.pluginId !== primary.pluginId
            )
            .sort(byPlugin)
            .map((provider) => candidate(song, provider)),
    source: crossSource,
    quality: () => {
      const provider = providers.find(
        (item) => item.pluginId === primary.pluginId && item.source === source
      )
      if (!provider || !primary.quality) return []
      const index = provider.qualities.indexOf(primary.quality)
      if (index <= 0) return []
      return provider.qualities
        .slice(0, index)
        .reverse()
        .map((quality) => ({
          song,
          target: { ...primary, quality }
        }))
    }
  }

  const key = (item: Candidate, target = item.target) =>
    JSON.stringify([songKey(item.song), target.pluginId, target.source, target.quality])

  async function tryCandidate(
    item: Candidate,
    load: (url: string) => Promise<void>,
    strategy?: FallbackStrategy
  ): Promise<Loaded | undefined> {
    const fallback = strategy !== undefined
    if (!current() || attempted.has(key(item))) return
    if (isBlocked(item.target.pluginId)) {
      trace.step('跳过受限插件', 'warning', item.target)
      return
    }
    if (strategy === 'plugin' || strategy === 'source') {
      const targetId = strategy === 'plugin' ? item.target.pluginId : item.target.source
      const tried = usedTargets[strategy]
      if (!targetId || tried.has(targetId) || tried.size >= limits[strategy]) return
      tried.add(targetId)
    }
    attempted.add(key(item))
    let actual = item.target
    trace.step(
      '开始解析播放地址',
      'info',
      actual,
      item.score === undefined ? undefined : '歌曲匹配分 ' + item.score.toFixed(2)
    )
    let url: string
    try {
      url = await getSongRealUrl(toRaw(item.song), {
        target: fallback ? item.target : undefined,
        skipCachedAudio:
          fallback && item.song === song && item.target.pluginId === primary.pluginId,
        blockedPluginIds: [...new Set([...blocked, ...throttleUntil.keys()])].filter(isBlocked),
        report(result) {
          if (!current()) return
          actual = { source: result.source, pluginId: result.pluginId, quality: result.quality }
          if (!fallback) Object.assign(primary, actual)
          attempted.add(key(item, actual))
          if (result.blockPlugin && result.pluginId) {
            blocked.add(result.pluginId)
            trace.step('插件拦截本轮同插件换源', 'warning', actual)
          }
        }
      })
    } catch {
      if (current()) trace.step('解析失败', 'error', actual)
      return
    }
    if (!current()) return
    if (!url || failedUrls.has(url)) {
      trace.step('跳过无效或已失败的地址', 'warning', actual)
      return
    }
    trace.step('已获取播放地址，正在加载音频', 'info', actual)
    try {
      await load(url)
    } catch {
      failedUrls.add(url)
      if (current()) trace.step('音频加载失败', 'error', actual)
      return
    }
    if (!current()) return
    trace.step('音频已就绪', 'success', actual)
    trace.status('ready', actual)
    return { url, target: actual, fallback }
  }

  trace.step('开始播放', 'info', primary)
  let initial = true
  async function* alternatives() {
    if (!preferences.enabled || !strategies.length) {
      trace.step(preferences.enabled ? '所有换源策略均已关闭' : '自动换源已关闭')
      return
    }
    trace.step(
      '换源策略顺序',
      'info',
      undefined,
      strategies.map((id) => fallbackStrategyLabels[id]).join(' → ')
    )
    for (const strategy of strategies) {
      if (!current()) return
      trace.step(fallbackStrategyLabels[strategy])
      let hasCandidates = false
      const candidates: Iterable<Candidate> | AsyncIterable<Candidate> = plan[strategy]()
      for await (const item of candidates) {
        if (!current()) return
        hasCandidates = true
        yield { item, strategy }
        if (strategy !== 'quality' && usedTargets[strategy].size >= limits[strategy]) {
          trace.step(
            '达到尝试上限',
            'info',
            undefined,
            fallbackStrategyLabels[strategy] + ' · ' + limits[strategy] + ' 次'
          )
          break
        }
      }
      if (current() && !hasCandidates) trace.step('没有可尝试的候选项')
    }
  }
  const remaining = alternatives()

  return {
    trace,
    autoNext: !preferences.enabled || preferences.autoNext,
    async load(loadAudio: (url: string) => Promise<void>): Promise<Loaded | undefined> {
      if (!current()) return
      trace.status('resolving')
      if (initial) {
        initial = false
        const result = await tryCandidate({ song, target: primary }, loadAudio)
        if (result) return result
      }
      // Resume the same iterator after a playback error. Search and attempts are not repeated.
      while (current()) {
        const next = await remaining.next()
        if (next.done) break
        const result = await tryCandidate(next.value.item, loadAudio, next.value.strategy)
        if (result) return result
      }
      if (current()) trace.status('failed')
      return undefined
    },
    failPlayback(result: Loaded, stage: 'start' | 'media') {
      failedUrls.add(result.url)
      trace.step(stage === 'start' ? '启动播放失败' : '播放中断', 'error', result.target)
    },
    playing(result: Loaded) {
      trace.step('开始出声', 'success', result.target)
      trace.status('playing', result.target)
      if (background) trace.publish()
    }
  }
}
