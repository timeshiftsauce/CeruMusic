import { getMusicStorage, setMusicStorage } from '@renderer/services/musicDataPersistence'
import { savedCoverDetail } from '@common/musicAppearance'
import {
  normalizeMusicItem,
  sameSong,
  songKey,
  restoredSong,
  type MusicItem
} from '@common/musicItem'
import { canPersistMusicData, musicStartupReady } from '@renderer/services/musicDataPersistence'
import { defineStore } from 'pinia'
import type { LyricLine } from '@applemusic-like-lyrics/core'
import { analyzeImageColors, Color } from '@renderer/utils/color/colorExtractor'
import { filterLyricInfo, toPlayerLyrics } from '@common/pluginMusic'
import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { reactive, ref, computed, watch, toRaw, onScopeDispose, type ComputedRef } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { readLocalMusicMetadata } from '@renderer/utils/localMusicMetadata'
import { contributionsRevision } from '@renderer/services/pluginState'
import _ from 'lodash'
import defaultCover from '/default-cover.png'
import { playSetting } from './playSetting'

interface Player {
  songId?: string
  songInfo?: Omit<SongList, 'songmid'> & { songmid: null | number | string }
  // base64编码 封面
  cover?: string
  // 封面详情
  coverDetail: {
    ColorObject?: Color
    mainColor?: string
    lightMainColor?: string
    // 对比色
    contrastColor?: string
    // 文本对比颜色
    textColor?: string
    hoverColor?: string
    playBg?: string
    playBgHover?: string
    useBlackText?: boolean
  }
  // 歌曲名
  songName: ComputedRef<string>
  // 歌手
  singer: ComputedRef<string>
  // 歌词
  lyrics: {
    crlyric?: import('@shiqianjiang/ceru-plugin-sdk').CrLyric
    lines: LyricLine[]
    trans?: string
    source?: string
    // 原始歌词字符串，用于分享上传到后端（不要使用解析后的 LyricLine）
    raw?: {
      lrc?: string
      yrc?: string
      ttml?: string
      qrc?: string
      trans?: string
      format?: 'lrc' | 'yrc' | 'qrc' | 'ttml'
    }
  }
  isLoading: boolean
  comments: {
    hotList: Comment[]
    latestList: Comment[]
    hotTotal: number
    hotPage: number
    hotMaxPage: number
    latestTotal: number
    latestPage: number
    latestMaxPage: number
    limit: number
    type: 'hot' | 'latest'
    hotIsLoading: boolean
    latestIsLoading: boolean
  }
}

export interface Comment {
  id: number | string
  text: string
  time: number
  timeStr: string
  location: string
  userName: string
  avatar: string
  userId: number | string
  likedCount: number
  images: string[]
  reply: Comment[]
}

export interface CommentResponse {
  source: string
  comments: Comment[]
  total: number
  page: number
  limit: number
  maxPage: number
}

async function getBlobUrlFromUrl(url: string, signal?: AbortSignal): Promise<string> {
  if (!url) return ''
  if (/^(data:|blob:|file:)/i.test(url)) return url
  try {
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000)
    })
    if (!response.ok) return ''
    const blob = await response.blob()
    return URL.createObjectURL(blob)
  } catch (e) {
    console.error('封面转Blob失败:', e)
    return ''
  }
}

// 辅助函数：清洗歌词
const sanitizeLyricLines = (lines: LyricLine[]): LyricLine[] => {
  const defaultLineDuration = 3000
  const toFiniteNumber = (v: any, fallback: number) => {
    const n = typeof v === 'number' ? v : Number(v)
    return Number.isFinite(n) ? n : fallback
  }
  const cleaned: LyricLine[] = []
  for (const rawLine of lines || []) {
    const rawWords = Array.isArray((rawLine as any).words) ? (rawLine as any).words : []
    const fixedWords: any[] = []
    let prevEnd = -1
    for (const rawWord of rawWords) {
      const rawStart = toFiniteNumber(rawWord?.startTime, Number.NaN)
      const rawEnd = toFiniteNumber(rawWord?.endTime, Number.NaN)
      if (!Number.isFinite(rawStart)) continue
      let startTime = Math.max(0, rawStart)
      if (startTime < prevEnd) startTime = prevEnd
      let endTime = Number.isFinite(rawEnd) ? rawEnd : startTime + 1
      if (endTime <= startTime) endTime = startTime + 1
      prevEnd = endTime
      fixedWords.push({ ...rawWord, startTime, endTime })
    }
    if (fixedWords.length === 0) continue

    const firstWordStart = fixedWords[0].startTime
    const lastWordEnd = fixedWords[fixedWords.length - 1].endTime
    let startTime = toFiniteNumber((rawLine as any).startTime, firstWordStart)
    startTime = Math.max(0, startTime)
    let endTime = toFiniteNumber((rawLine as any).endTime, lastWordEnd)
    if (!Number.isFinite(endTime) || endTime <= startTime) endTime = startTime + defaultLineDuration
    if (endTime < lastWordEnd) endTime = lastWordEnd

    cleaned.push({ ...(rawLine as any), startTime, endTime, words: fixedWords })
  }
  cleaned.sort((a: any, b: any) => (a?.startTime ?? 0) - (b?.startTime ?? 0))
  return cleaned
}

const DEFAULT_SONG_INFO = {
  songmid: null,
  hash: '',
  name: '欢迎使用CeruMusic 🎉',
  singer: '可以配置音源插件来播放你的歌曲',
  albumName: '',
  albumId: '0',
  source: '',
  interval: '00:00',
  img: '',
  lrc: null,
  types: [],
  _types: {},
  typeUrl: {}
}

export const useGlobalPlayStatusStore = defineStore(
  'globalPlayStatus',
  () => {
    const localUserStore = LocalUserDetailStore()
    const playSettingStore = playSetting()
    const player = reactive<Player>({
      songId: void 0,
      songInfo: DEFAULT_SONG_INFO,
      cover: void 0,
      coverDetail: {
        ColorObject: void 0,
        mainColor: 'var(--td-brand-color-5)',
        lightMainColor: 'rgba(255, 255, 255, 0.9)',
        contrastColor: 'var(--player-text-idle)',
        textColor: 'var(--player-text-idle)',
        hoverColor: 'var(--player-text-hover-idle)',
        playBg: 'var(--player-btn-bg-idle)',
        playBgHover: 'var(--player-btn-bg-hover-idle)',
        useBlackText: false
      },
      songName: computed(() => player.songInfo?.name || ''),
      singer: computed(() => player.songInfo?.singer || ''),
      lyrics: {
        lines: [],
        raw: {}
      },
      isLoading: false,
      comments: {
        hotList: [],
        latestList: [],
        hotTotal: 0,
        hotPage: 0,
        hotMaxPage: 0,
        latestTotal: 0,
        latestPage: 0,
        latestMaxPage: 0,
        limit: 20,
        type: 'hot',
        hotIsLoading: false,
        latestIsLoading: false
      }
    })

    const history = ref<MusicItem[]>([])
    let appearanceSongKey: string | undefined
    function reloadSnapshot() {
      try {
        const saved = JSON.parse(getMusicStorage('globalPlayStatus') || '{}')
        const snapshot = saved.player ?? saved
        if (snapshot.songInfo?.songmid != null) {
          player.songInfo = normalizeMusicItem(snapshot.songInfo)
          player.songId = String(player.songInfo.songmid)
          player.cover = player.songInfo.img || defaultCover
          const appearance = savedCoverDetail(snapshot.coverDetail)
          if (appearance) {
            player.coverDetail = appearance
            appearanceSongKey = songKey(player.songInfo)
          }
        }
        history.value = (Array.isArray(saved.history) ? saved.history : [])
          .flatMap((value) => {
            try {
              return [normalizeMusicItem(value)]
            } catch {
              return []
            }
          })
          .slice(0, 200)
      } catch {
        /* Repair retains unreadable originals; startup remains usable. */
      }
    }
    reloadSnapshot()
    function persistSnapshot() {
      if (!canPersistMusicData()) return
      const song =
        player.songInfo?.songmid != null ? normalizeMusicItem(toRaw(player.songInfo)) : undefined
      setMusicStorage(
        'globalPlayStatus',
        JSON.stringify({
          schemaVersion: 2,
          player: song
            ? {
                songId: String(song.songmid),
                songInfo: song,
                ...(appearanceSongKey === songKey(song)
                  ? { coverDetail: savedCoverDetail(player.coverDetail) }
                  : {})
              }
            : {},
          history: history.value
        })
      )
    }
    function recordHistory(value: any) {
      if (!musicStartupReady.value || value?.songmid == null || !value.source) return
      const song = normalizeMusicItem(value)
      history.value = [song, ...history.value.filter((item) => !sameSong(item, song))].slice(0, 200)
      persistSnapshot()
    }
    watch(() => [player.songInfo, player.coverDetail], persistSnapshot, {
      deep: true,
      flush: 'sync'
    })

    let currentBlobUrl: string | null = null
    let metadataRevision = 0
    let preparedSongKey: string | undefined
    const lyricWarnings = new Map<string, number>()
    function reportLocalLyricError(id: string, error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('本地歌词转换失败:', message)
      if (Date.now() - (lyricWarnings.get(id) ?? 0) < 10000) return
      lyricWarnings.set(id, Date.now())
      void MessagePlugin.warning(`本地歌词无法显示：${message}`)
    }
    const keyOf = songKey
    const withDeadline = async <T>(task: Promise<T>, fallback: T): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          task.catch(() => fallback),
          new Promise<T>((resolve) => {
            timer = setTimeout(() => resolve(fallback), 20000)
          })
        ])
      } finally {
        clearTimeout(timer)
      }
    }

    async function prepareSong(
      song: SongList,
      signal?: AbortSignal,
      onArtwork?: (
        cover: string,
        colors: Awaited<ReturnType<typeof analyzeImageColors>> | null
      ) => void
    ) {
      const clean = JSON.parse(JSON.stringify(toRaw(song))) as SongList
      const localMetadata =
        clean.source === 'local'
          ? readLocalMusicMetadata(String(clean.songmid)).then((metadata) => {
              Object.assign(clean, metadata)
              return metadata
            })
          : undefined
      const coverSignal = signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20000)])
        : AbortSignal.timeout(20000)
      const loadCover = async () => {
        let url = clean.img
        if (clean.source === 'local') url = (await localMetadata)?.img || ''
        else if (!url) {
          const value = await window.api.music.requestSdk('getPic', {
            source: clean.source,
            songInfo: clean
          })
          if (typeof value === 'string') url = value
        }
        coverSignal.throwIfAborted()
        if (!url) return defaultCover
        const cover = await getBlobUrlFromUrl(url, coverSignal)
        if (signal?.aborted) {
          if (cover.startsWith('blob:')) URL.revokeObjectURL(cover)
          signal.throwIfAborted()
        }
        return cover || defaultCover
      }
      const loadLyrics = async () => {
        if (clean.source === 'local') {
          const text = (await localMetadata)?.lrc || ''
          const parsed = await window.api.music.requestSdk('parseLyrics', {
            source: 'local',
            text,
            track: {
              pluginId: 'local.library',
              providerId: 'local',
              kind: 'track',
              id: String(clean.songmid)
            }
          })
          if (!parsed) return undefined
          if (parsed.error || parsed.format !== 'crlyric')
            throw new Error(parsed?.error || '没有可用的歌词转换结果，请检查歌词转换插件')
          return playSettingStore.getIsGrepLyricInfo
            ? filterLyricInfo(parsed, playSettingStore.getStrictGrep)
            : parsed
        }
        const result = await window.api.music.requestSdk('getLyric', {
          source: clean.source,
          songInfo: clean,
          grepLyricInfo: playSettingStore.getIsGrepLyricInfo,
          useStrictMode: playSettingStore.getStrictGrep
        })
        const lyric = result?.crlyric
        return lyric && playSettingStore.getIsGrepLyricInfo
          ? filterLyricInfo(lyric, playSettingStore.getStrictGrep)
          : lyric
      }
      const [artwork, crlyric] = await Promise.all([
        withDeadline(loadCover(), defaultCover).then(async (cover) => {
          const cached =
            appearanceSongKey === songKey(song) && song.img === player.songInfo?.img
              ? savedCoverDetail(player.coverDetail)
              : undefined
          const colors = cached
            ? { dominantColor: cached.ColorObject, useBlackText: cached.useBlackText }
            : await withDeadline(analyzeImageColors(cover), null)
          if (!signal?.aborted) onArtwork?.(cover, colors)
          return { cover, colors }
        }),
        withDeadline<import('@shiqianjiang/ceru-plugin-sdk').CrLyric | undefined>(
          loadLyrics().catch((error) => {
            if (clean.source === 'local' && !signal?.aborted)
              reportLocalLyricError(String(clean.songmid), error)
            throw error
          }),
          undefined
        )
      ])
      const { cover, colors } = artwork
      const dispose = () => {
        if (cover.startsWith('blob:')) URL.revokeObjectURL(cover)
      }
      if (signal?.aborted) {
        dispose()
        signal.throwIfAborted()
      }
      return {
        song: clean,
        cover,
        crlyric,
        colors,
        lines: crlyric ? sanitizeLyricLines(toPlayerLyrics(crlyric)) : [],
        dispose
      }
    }

    function commitPrepared(prepared: Awaited<ReturnType<typeof prepareSong>>) {
      metadataRevision++
      preparedSongKey = songKey(prepared.song)
      if (currentBlobUrl && currentBlobUrl !== prepared.cover) URL.revokeObjectURL(currentBlobUrl)
      currentBlobUrl = prepared.cover.startsWith('blob:') ? prepared.cover : null
      player.songInfo = prepared.song
      player.songId = String(prepared.song.songmid)
      player.cover = prepared.cover
      player.lyrics.crlyric = prepared.crlyric
      player.lyrics.lines = prepared.lines
      player.lyrics.raw = {}
      player.isLoading = false
      applyCoverColors(prepared.colors)
      updateCommon(prepared.song)
    }

    function applyCoverColors(color: Awaited<ReturnType<typeof analyzeImageColors>> | null) {
      appearanceSongKey = player.songInfo?.songmid != null ? songKey(player.songInfo) : undefined
      if (color) {
        const { dominantColor, useBlackText } = color
        const base = useBlackText ? '0, 0, 0' : '255, 255, 255'
        player.coverDetail = {
          ColorObject: dominantColor,
          mainColor: `rgba(${dominantColor.r},${dominantColor.g},${dominantColor.b},1)`,
          lightMainColor: `rgba(${Math.round(255 - (255 - dominantColor.r) * 0.2)},${Math.round(255 - (255 - dominantColor.g) * 0.2)},${Math.round(255 - (255 - dominantColor.b) * 0.2)},.9)`,
          contrastColor: `rgba(${base},.6)`,
          textColor: `rgba(${base},.6)`,
          hoverColor: `rgba(${base},1)`,
          playBg: 'rgba(255,255,255,.2)',
          playBgHover: 'rgba(255,255,255,.33)',
          useBlackText
        }
      } else
        player.coverDetail = {
          mainColor: 'var(--td-brand-color-5)',
          lightMainColor: 'rgba(255, 255, 255, 0.9)',
          contrastColor: 'var(--player-text-idle)',
          textColor: 'var(--player-text-idle)',
          hoverColor: 'var(--player-text-hover-idle)',
          playBg: 'var(--player-btn-bg-idle)',
          playBgHover: 'var(--player-btn-bg-hover-idle)',
          useBlackText: false
        }
    }

    async function updatePlayerInfo(song: SongList, force = false) {
      // Hydrating songInfo is not the same as loading its artwork and lyrics.
      if (!force && preparedSongKey === keyOf(song)) return
      const revision = ++metadataRevision
      player.isLoading = true
      const prepared = await prepareSong(song, undefined, (cover, colors) => {
        if (revision !== metadataRevision || !sameSong(player.songInfo, song)) return
        if (currentBlobUrl && currentBlobUrl !== cover) URL.revokeObjectURL(currentBlobUrl)
        currentBlobUrl = cover.startsWith('blob:') ? cover : null
        player.cover = cover
        applyCoverColors(colors)
      })
      if (revision !== metadataRevision) {
        prepared.dispose()
        return
      }
      commitPrepared(prepared)
    }

    const stopTagListener = window.api.localMusic.onTagsChanged(({ oldSongmid, song }) => {
      localUserStore.list = localUserStore.list.map((item) =>
        item.source === 'local' && String(item.songmid) === oldSongmid ? { ...item, ...song } : item
      )
      if (
        player.songInfo?.source === 'local' &&
        String(localUserStore.userInfo.lastPlaySongId) === oldSongmid
      ) {
        localUserStore.userInfo.lastPlaySongId = song.songmid
        localUserStore.userInfo.lastPlaySongKey = songKey(song)
      }
      if (player.songInfo?.source === 'local' && String(player.songInfo.songmid) === oldSongmid) {
        void updatePlayerInfo({ ...toRaw(player.songInfo), ...song } as SongList, true)
      }
    })
    onScopeDispose(stopTagListener)
    watch(
      [
        () => localUserStore.userInfo.lastPlaySongKey || localUserStore.userInfo.lastPlaySongId,
        () => localUserStore.list,
        contributionsRevision,
        musicStartupReady
      ],
      (_selection, previous) => {
        if (!musicStartupReady.value) return
        const song = restoredSong(
          localUserStore.list,
          localUserStore.userInfo,
          player.songInfo as SongList
        )
        if (!song) return
        // Startup metadata can finish before plugins and their routing are restored.
        // Retry from the saved selection, even if the first metadata request is still pending.
        const retryLyrics = previous[2] !== contributionsRevision.value && !player.lyrics.crlyric
        if (sameSong(song, player.songInfo) && player.lyrics.crlyric && !retryLyrics) return
        void updatePlayerInfo(song, retryLyrics)
      },
      { immediate: true }
    )

    async function fetchComments(page = 1, type: 'hot' | 'latest' = 'hot') {
      const currentSongInfo = toRaw(player.songInfo)
      if (!currentSongInfo || !currentSongInfo.songmid) return

      if (type === 'hot') {
        player.comments.hotIsLoading = true
      } else {
        player.comments.latestIsLoading = true
      }
      try {
        const method = type === 'hot' ? 'getHotComment' : 'getComment'
        const res = await window.api.music.requestSdk(method, {
          source: currentSongInfo.source || 'wy',
          songInfo: currentSongInfo,
          page,
          limit: player.comments.limit
        })

        console.log('评论获取成功', res)
        if (keyOf(player.songInfo) !== keyOf(currentSongInfo)) return

        if (type === 'hot') {
          if (page === 1) {
            player.comments.hotList = res.comments || []
          } else {
            player.comments.hotList.push(...(res.comments || []))
          }
          player.comments.hotTotal = res.total
          // Use requested page instead of response page to avoid infinite loop with 0-based APIs
          player.comments.hotPage = page
          player.comments.hotMaxPage = res.maxPage
        } else {
          if (page === 1) {
            player.comments.latestList = res.comments || []
          } else {
            player.comments.latestList.push(...(res.comments || []))
          }
          player.comments.latestTotal = res.total
          // Use requested page instead of response page
          player.comments.latestPage = page
          player.comments.latestMaxPage = res.maxPage
        }

        player.comments.type = type
      } catch (err) {
        console.error('评论获取失败', err)
      } finally {
        if (type === 'hot') {
          player.comments.hotIsLoading = false
        } else {
          player.comments.latestIsLoading = false
        }
      }
    }

    function updateCommon(songInfo: SongList) {
      // Reset comments
      player.comments.hotList = []
      player.comments.latestList = []
      player.comments.hotPage = 0
      player.comments.hotTotal = 0
      player.comments.hotMaxPage = 0
      player.comments.latestPage = 0
      player.comments.latestTotal = 0
      player.comments.latestMaxPage = 0
      if (songInfo.source === 'local') return

      // 同时获取热门和最新评论
      fetchComments(1, 'hot')
      fetchComments(1, 'latest')
    }

    return {
      player,
      history,
      recordHistory,
      reloadSnapshot,
      prepareSong,
      commitPrepared,
      updatePlayerInfo,
      fetchComments
    }
  },
  {
    persist: false
  }
)
