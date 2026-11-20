import {
  ACCOUNT_OPERATIONS,
  accountSwitchInput,
  SEARCH_OPERATIONS,
  isSearchOperation,
  searchInput,
  WINDOW_OPERATIONS,
  windowCloseInput,
  OperationBus,
  OperationEngine
} from '@shiqianjiang/ceru-plugin-core/operations'
import type { OperationSource, PluginRoute } from '@shiqianjiang/ceru-plugin-sdk'
import { publishHookNames } from '../uiBridge'
import {
  LIBRARY_OPERATIONS,
  libraryInput,
  isLibraryOperation,
  RESOLVE_OPERATIONS,
  resolveInput
} from '@shiqianjiang/ceru-plugin-core/operations'
import { PlaybackHookPolicy } from './policy'
import {
  LYRIC_OPERATIONS,
  lyricInput,
  lyricResult,
  isLyricOperation
} from '@shiqianjiang/ceru-plugin-core/operations'
import {
  DOWNLOAD_OPERATIONS,
  downloadInput,
  isDownloadOperation
} from '@shiqianjiang/ceru-plugin-core/operations'
import {
  SHARING_OPERATIONS,
  shareInput,
  shareResult
} from '@shiqianjiang/ceru-plugin-core/operations'
import { SYSTEM_OPERATIONS, systemInput } from '@shiqianjiang/ceru-plugin-core/operations'
import type {
  HookActivity,
  HookActivityChange,
  HookActivitySummary
} from '@common/pluginHookControls'
import { isDeepStrictEqual } from 'node:util'

let revision = 0,
  names: string[] = [],
  policy: PlaybackHookPolicy | undefined
type HookName = import('@common/pluginHookControls').HookName
interface RouteInput {
  to: PluginRoute
  from: PluginRoute | null
}
type ReportChange = { target: 'input' | 'result'; before: unknown; after: unknown }
const object = (value: unknown): Record<string, any> =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const enums = {
  position: ['next', 'end'],
  mode: ['sequence', 'random', 'single'],
  reason: ['user', 'ended', 'error'],
  quality: ['128k', '192k', '320k', 'lossless', 'hires'],
  format: ['cmpl', 'cpl', 'crlyric'],
  level: ['info', 'success', 'warning', 'error'],
  route: [
    'welcome',
    'home',
    'find',
    'songlist',
    'local',
    'recent',
    'search',
    'recognize',
    'list',
    'download',
    'local-tag-editor',
    'profile',
    'community',
    'settings',
    'plugin-page'
  ]
} as const

/** Raw hook packets never leave this call; the ledger gets only this bounded allowlist. */
export function summarizeHookChange(
  action: 'cancel' | 'rewrite',
  name: HookName,
  change?: ReportChange
): HookActivitySummary {
  if (action === 'cancel') return { target: 'cancel', changes: [] }
  if (!change) return { target: 'input', changes: [] }
  const before = object(change.before),
    after = object(change.after)
  const changes: HookActivityChange[] = []
  const hidden = (field: HookActivityChange['field'], a: unknown, b: unknown) => {
    if (!isDeepStrictEqual(a, b)) changes.push({ field, redacted: true })
  }
  const numeric = (field: HookActivityChange['field'], a: unknown, b: unknown, max: number) => {
    if (Object.is(a, b)) return
    if (
      typeof a === 'number' &&
      Number.isFinite(a) &&
      typeof b === 'number' &&
      Number.isFinite(b)
    ) {
      const clamp = (value: number) => Math.round(Math.min(max, Math.max(0, value)) * 100) / 100
      changes.push({ field, before: clamp(a), after: clamp(b) })
    } else changes.push({ field, redacted: true })
  }
  const enumeration = (field: keyof typeof enums, a: unknown, b: unknown) => {
    if (Object.is(a, b)) return
    const allowed = enums[field] as readonly unknown[]
    changes.push(
      allowed.includes(a) && allowed.includes(b)
        ? { field, before: a as string, after: b as string }
        : { field, redacted: true }
    )
  }
  const list = (field: 'tracks' | 'results' | 'suggestions' | 'order', a: unknown, b: unknown) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length)
        numeric(
          field === 'tracks' || field === 'order' ? 'count' : field,
          a.length,
          b.length,
          100000
        )
      else hidden(field, a, b)
    } else hidden(field, a, b)
  }
  if (change.target === 'result') {
    if (name === 'lyrics.load' || name === 'lyrics.transform') {
      hidden('lyric', change.before, change.after)
      numeric(
        'lines',
        Array.isArray(before.lines) ? before.lines.length : 0,
        Array.isArray(after.lines) ? after.lines.length : 0,
        100000
      )
    } else hidden('result', change.before, change.after)
  } else {
    // Do not copy arbitrary keys, strings, refs, routes, paths or lyric objects into history.
    switch (name) {
      case 'player.seek':
        numeric('positionMs', before.positionMs, after.positionMs, 86400000)
        break
      case 'player.setVolume':
        numeric('volume', before.volume, after.volume, 1)
        break
      case 'player.setMode':
        enumeration('mode', before.mode, after.mode)
        break
      case 'player.play':
        hidden('track', before.track, after.track)
        numeric('queueIndex', before.queueIndex, after.queueIndex, 100000)
        break
      case 'queue.add':
        list('tracks', before.tracks, after.tracks)
        enumeration('position', before.position, after.position)
        break
      case 'queue.remove':
      case 'queue.clear':
      case 'player.queueEnded':
        list('tracks', before.tracks, after.tracks)
        break
      case 'queue.shuffle':
        list('order', before.items, after.items)
        break
      case 'player.next':
        enumeration('reason', before.reason, after.reason)
        hidden('track', before.track, after.track)
        break
      case 'player.resolve':
        hidden('track', before.track, after.track)
        enumeration('quality', before.quality, after.quality)
        break
      case 'track.like':
        hidden('track', before.track, after.track)
        if (before.liked !== after.liked)
          changes.push(
            typeof before.liked === 'boolean' && typeof after.liked === 'boolean'
              ? { field: 'liked', before: before.liked, after: after.liked }
              : { field: 'liked', redacted: true }
          )
        break
      case 'playlist.create':
      case 'download.filename':
        hidden('name', before.name, after.name)
        break
      case 'playlist.addTracks':
      case 'playlist.removeTracks':
        list('tracks', before.tracks, after.tracks)
        break
      case 'playlist.export':
        enumeration('format', before.format, after.format)
        break
      case 'playlist.import':
        hidden('value', before.value, after.value)
        hidden('importer', before.importerId, after.importerId)
        break
      case 'download.create':
        list('tracks', before.tracks, after.tracks)
        enumeration('quality', before.quality, after.quality)
        break
      case 'search.query':
        hidden('query', before.query, after.query)
        break
      case 'search.suggest':
        list('suggestions', before.items, after.items)
        break
      case 'search.results':
        list('results', before.page?.items, after.page?.items)
        break
      case 'router.navigate':
        enumeration('route', before.to?.name, after.to?.name)
        hidden('params', before.to?.params, after.to?.params)
        hidden('queryParams', before.to?.query, after.to?.query)
        break
      case 'link.open':
        hidden('url', before.url, after.url)
        break
      case 'notification.show':
        hidden('title', before.title, after.title)
        hidden('body', before.body, after.body)
        enumeration('level', before.level, after.level)
        break
      case 'share.create':
        hidden('track', before.track, after.track)
        break
      case 'lyrics.transform':
        hidden('lyric', before.lyric, after.lyric)
        numeric(
          'lines',
          Array.isArray(before.lyric?.lines) ? before.lyric.lines.length : 0,
          Array.isArray(after.lyric?.lines) ? after.lyric.lines.length : 0,
          100000
        )
        break
    }
  }
  return { target: change.target, changes: changes.slice(0, 6) }
}
const history = new Map<string, HookActivity[]>()
export const hookSnapshot = () => ({
  revision,
  names: [...names],
  announce: policy?.snapshot().announce ?? true
})
function broadcast() {
  revision++
  publishHookNames(hookSnapshot())
}
function changed() {
  const next = [
    ...operationBus.names(),
    ...resolveBus.names(),
    ...routeBus.names(),
    ...accountBus.names(),
    ...searchBus.names(),
    ...libraryBus.names(),
    ...windowBus.names(),
    ...lyricBus.names(),
    ...downloadBus.names(),
    ...sharingBus.names(),
    ...linkBus.names(),
    ...notificationBus.names()
  ]
  if (JSON.stringify(names) !== JSON.stringify(next)) {
    names = next
    broadcast()
  }
}
function warn(pluginId: string, name: HookName, paused: boolean) {
  console.warn('插件拦截' + (paused ? '已暂停' : '出错'), pluginId, name)
  if (paused) {
    try {
      policy?.change({ entry: { pluginId, name }, suspend: true })
    } catch (error) {
      console.warn('保存拦截设置失败', error)
    }
    broadcast()
  }
}
const blocked = (id: string, name: HookName) => policy?.blocked(id, name) ?? false
function report(
  pluginId: string,
  name: HookName,
  action: 'cancel' | 'rewrite',
  source: OperationSource,
  change?: ReportChange
) {
  const rows = history.get(pluginId) ?? []
  rows.unshift({
    time: Date.now(),
    pluginId,
    name,
    action,
    source: source.kind,
    summary: summarizeHookChange(action, name, change)
  })
  rows.length = Math.min(rows.length, 100)
  history.set(pluginId, rows)
}
export const operationBus: OperationBus = new OperationBus(
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const resolveBus = new OperationEngine(
  RESOLVE_OPERATIONS,
  resolveInput,
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const interceptsResolve = () => names.includes('player.resolve')
export const accountBus = new OperationEngine(
  ACCOUNT_OPERATIONS,
  accountSwitchInput,
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const windowBus = new OperationEngine(
  WINDOW_OPERATIONS,
  windowCloseInput,
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const lyricBus = new OperationEngine(
  LYRIC_OPERATIONS,
  lyricInput,
  changed,
  warn,
  undefined,
  blocked,
  report,
  lyricResult
)
export const downloadBus = new OperationEngine(
  DOWNLOAD_OPERATIONS,
  downloadInput,
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const sharingBus = new OperationEngine(
  SHARING_OPERATIONS,
  shareInput,
  changed,
  warn,
  undefined,
  blocked,
  report,
  shareResult
)
export const linkBus = new OperationEngine<
  'link.open',
  import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['link.open']
>(
  { 'link.open': SYSTEM_OPERATIONS['link.open'] },
  (name, value, original) =>
    systemInput(
      name,
      value,
      original
    ) as import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['link.open'],
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const notificationBus = new OperationEngine<
  'notification.show',
  import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['notification.show']
>(
  { 'notification.show': SYSTEM_OPERATIONS['notification.show'] },
  (name, value) =>
    systemInput(
      name,
      value
    ) as import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['notification.show'],
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const interceptsLyrics = () => names.some(isLyricOperation)
export const searchBus = new OperationEngine(
  SEARCH_OPERATIONS,
  searchInput,
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const libraryBus = new OperationEngine(
  LIBRARY_OPERATIONS,
  libraryInput,
  changed,
  warn,
  undefined,
  blocked,
  report
)
export const routeBus = new OperationEngine<'router.navigate', RouteInput>(
  { 'router.navigate': { cancelable: true, hookTimeoutMs: 500 } },
  (_name, value) => {
    const packet = value as RouteInput
    if (!packet?.to?.name || (packet.from !== null && !packet.from?.name))
      throw Error('无效的路由操作')
    return packet
  },
  changed,
  warn,
  undefined,
  blocked,
  report
)
export function setupHookPolicy(file: string, safeMode = false) {
  if (policy) return
  policy = new PlaybackHookPolicy(file)
  if (safeMode && !policy.snapshot().invalid) policy.change({ paused: true })
  resolveBus.setPaused(policy.snapshot().paused)
  operationBus.setPaused(policy.snapshot().paused)
  libraryBus.setPaused(policy.snapshot().paused)
  searchBus.setPaused(policy.snapshot().paused)
  accountBus.setPaused(policy.snapshot().paused)
  windowBus.setPaused(policy.snapshot().paused)
  lyricBus.setPaused(policy.snapshot().paused)
  downloadBus.setPaused(policy.snapshot().paused)
  sharingBus.setPaused(policy.snapshot().paused)
  linkBus.setPaused(policy.snapshot().paused)
  notificationBus.setPaused(policy.snapshot().paused)
  routeBus.setPaused(policy.snapshot().paused)
}
export function getHookControls() {
  return {
    ...policy!.snapshot(),
    activity: [...history.values()].flat().sort((first, second) => second.time - first.time)
  }
}
export function updateHookControls(update: Parameters<PlaybackHookPolicy['change']>[0]) {
  if (!policy || !update || typeof update !== 'object' || update.suspend === true)
    throw Error('无效的拦截设置')
  policy.change(update)
  if (update.entry) {
    const { pluginId, name } = update.entry
    if (name === 'router.navigate') routeBus.resume(pluginId, name)
    else if (name === 'account.switch') accountBus.resume(pluginId, name)
    else if (name === 'window.close') windowBus.resume(pluginId, name)
    else if (isLyricOperation(name)) lyricBus.resume(pluginId, name)
    else if (isDownloadOperation(name)) downloadBus.resume(pluginId, name)
    else if (name === 'share.create') sharingBus.resume(pluginId, name)
    else if (name === 'link.open') linkBus.resume(pluginId, name)
    else if (name === 'notification.show') notificationBus.resume(pluginId, name)
    else if (isLibraryOperation(name)) libraryBus.resume(pluginId, name)
    else if (name === 'player.resolve') resolveBus.resume(pluginId, name)
    else if (isSearchOperation(name)) searchBus.resume(pluginId, name)
    else operationBus.resume(pluginId, name)
  }
  operationBus.setPaused(policy.snapshot().paused)
  libraryBus.setPaused(policy.snapshot().paused)
  searchBus.setPaused(policy.snapshot().paused)
  accountBus.setPaused(policy.snapshot().paused)
  windowBus.setPaused(policy.snapshot().paused)
  lyricBus.setPaused(policy.snapshot().paused)
  downloadBus.setPaused(policy.snapshot().paused)
  sharingBus.setPaused(policy.snapshot().paused)
  linkBus.setPaused(policy.snapshot().paused)
  notificationBus.setPaused(policy.snapshot().paused)
  routeBus.setPaused(policy.snapshot().paused)
  broadcast()
  resolveBus.setPaused(policy.snapshot().paused)
  return getHookControls()
}
