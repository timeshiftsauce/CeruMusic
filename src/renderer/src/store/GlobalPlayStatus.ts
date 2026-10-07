import { getMusicStorage, setMusicStorage } from '@renderer/services/musicDataPersistence'
import { savedCoverDetail } from '@common/musicAppearance'
import {
  normalizeMusicItem,
  sameSong,
  songKey,
  songCacheKey,
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
import mediaSessionController from '@renderer/utils/audio/useSmtc'

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

/**
 * 封面 URL → 可用的 Blob URL（联网下载，并回写本地缓存）。
 *
 * 调用方需先自行查过本地缓存（`loadCover` 第 1 步已做），这里只负责下载与回写。
 * 回写用 `blob.arrayBuffer()` 而不是 `response.clone()` —— body 已被 blob() 消费，
 * clone 会抛 "Response body is already used"。
 *
 * @param cacheId 这首歌的缓存标识（与音频/歌词共用），用于回写
 */
/** 元信息耗时超过该阈值才打日志，避免正常情况刷屏（用于排查切歌变慢） */
const METADATA_SLOW_MS = 400

/**
 * 切歌时「兜底等待」歌词的上限 —— 超时只是不再阻塞切歌，**不再丢弃结果**。
 *
 * 封面与歌词都要就绪后才切歌（避免中间态），但不该让外链歌词拖住切歌节奏：
 * 插件侧取歌词要串两次网络（先试 TTML 库，404/超时后再回退平台接口），
 * 实测无缓存歌曲常见 10s+（`scripts` 里的插件日志可见 TTML 段单独就 10s）。
 * 这里只决定「什么时候先切过去」，真正的结果到达后由下方回填补齐。
 */
const LYRICS_WAIT_TIMEOUT_MS = 8000

async function getBlobUrlFromUrl(
  url: string,
  signal?: AbortSignal,
  cacheId?: string
): Promise<string> {
  if (!url) return ''
  // 已是本地/内联资源，无需处理
  if (/^(data:|blob:|file:)/i.test(url)) return url

  try {
    const response = await fetch(url, {
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(15000)])
        : AbortSignal.timeout(15000)
    })
    if (!response.ok) return ''
    const blob = await response.blob()

    // 回写本地缓存（失败不影响本次播放）
    if (cacheId) {
      void blob
        .arrayBuffer()
        .then((buf) => {
          const ext = coverExtFromMime(blob.type) || coverExtFromUrl(url)
          return window.api.musicCache.putCoverFile(cacheId, buf, ext)
        })
        .catch((e) => console.warn('写入封面缓存失败:', e))
    }

    return URL.createObjectURL(blob)
  } catch (e) {
    console.error('封面转Blob失败:', e)
    return ''
  }
}

/** 由 MIME 推断封面扩展名（缓存文件用） */
function coverExtFromMime(mime: string | undefined): string {
  if (!mime) return ''
  const m = mime.split(';')[0].trim().toLowerCase()
  switch (m) {
    case 'image/jpeg':
    case 'image/jpg':
      return '.jpg'
    case 'image/png':
      return '.png'
    case 'image/webp':
      return '.webp'
    case 'image/gif':
      return '.gif'
    case 'image/bmp':
      return '.bmp'
    default:
      return ''
  }
}

/** 由 URL 推断封面扩展名（MIME 缺失时兜底） */
function coverExtFromUrl(url: string): string {
  try {
    const ext = new URL(url).pathname.match(/\.(jpe?g|png|webp|gif|bmp)$/i)?.[0]
    return ext ? ext.toLowerCase() : '.jpg'
  } catch {
    return '.jpg'
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
          // 这里只恢复「封面颜色」等外观，不用 songInfo.img 设封面 ——
          // 那个链接多半已过期，会先闪一下再被真正的加载结果覆盖。
          // 封面交给 prepareSong 统一加载（本地缓存 → 插件）。
          player.cover = defaultCover
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
    /**
     * 正在加载元信息的歌曲 key（加载完成后保留，直到下一首）。
     *
     * 用于去重：playSong 在改 lastPlaySongKey 之前就会发起 prepareSong，
     * 该写入又会触发下方的 watch；若无此守卫，同一首歌会被加载两次
     * （表现为重复请求歌词、切歌更慢）。
     */
    let inFlightMetadataKey: string | undefined
    const lyricWarnings = new Map<string, number>()
    function reportLocalLyricError(id: string, error: unknown) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn('本地歌词转换失败:', message)
      if (Date.now() - (lyricWarnings.get(id) ?? 0) < 10000) return
      lyricWarnings.set(id, Date.now())
      void MessagePlugin.warning(`本地歌词无法显示：${message}`)
    }
    const keyOf = songKey
    const withDeadline = async <T>(
      task: Promise<T>,
      fallback: T,
      timeoutMs = 20000
    ): Promise<T> => {
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          task.catch(() => fallback),
          new Promise<T>((resolve) => {
            timer = setTimeout(() => resolve(fallback), timeoutMs)
          })
        ])
      } finally {
        clearTimeout(timer)
      }
    }

    /**
     * 只补歌词，不动封面/颜色/其它元信息。
     *
     * 用于「歌曲已加载但歌词缺失」的场景：`prepareSong` 的歌词等待超时后会先切歌
     * （`crlyric` 为 undefined），此时重跑整条 `prepareSong` 代价过高，而且第二次
     * 请求的空结果还会覆盖掉迟到的回填。这里只做一次歌词请求，命中缓存即可返回。
     */
    async function reloadLyricsOnly(song: SongList) {
      const key = keyOf(song)
      const clean = JSON.parse(JSON.stringify(toRaw(song))) as SongList
      try {
        if (clean.source === 'local') {
          const metadata = await readLocalMusicMetadata(String(clean.songmid))
          const parsed = await window.api.music.requestSdk('parseLyrics', {
            source: 'local',
            text: metadata?.lrc || '',
            track: {
              pluginId: 'local.library',
              providerId: 'local',
              kind: 'track',
              id: String(clean.songmid)
            }
          })
          if (parsed?.error) return
          // 期间用户可能已切走或已被别的路径填上，过期结果直接丢弃
          if (key !== keyOf(player.songInfo as SongList) || player.lyrics.crlyric) return
          if (parsed) {
            player.lyrics.crlyric = playSettingStore.getIsGrepLyricInfo
              ? filterLyricInfo(parsed, playSettingStore.getStrictGrep)
              : parsed
            player.lyrics.lines = sanitizeLyricLines(toPlayerLyrics(parsed))
          }
          return
        }
        const result = await window.api.music.requestSdk('getLyric', {
          source: clean.source,
          songInfo: clean,
          grepLyricInfo: playSettingStore.getIsGrepLyricInfo,
          useStrictMode: playSettingStore.getStrictGrep
        })
        if (key !== keyOf(player.songInfo as SongList) || player.lyrics.crlyric) return
        backfillLyrics(song, result?.crlyric)
      } catch (error) {
        if (clean?.source === 'local') reportLocalLyricError(String(song.songmid), error)
      }
    }

    /**
     * 歌词迟到时的回填。
     *
     * `prepareSong` 等歌词有超时上限（`LYRICS_WAIT_TIMEOUT_MS`），但插件取歌词
     * 本身要串行两次网络（先探 TTML 库、再回退平台接口），实测常超过上限。
     * 超时只该让切歌先过去，不该让结果作废 —— 否则本次播放就永远是空白歌词，
     * 用户切走再切回来才重新拉取（那时结果已进缓存，所以「又有了」）。
     *
     * 判断刻意与 `commitPrepared` / `updatePlayerInfo` 用同一套 songKey，
     * 避免把上一首的歌词贴到新歌上。
     */
    function backfillLyrics(song: SongList, crlyric: unknown) {
      if (!crlyric) return
      // 已经通过正常路径拿到了歌词，无需回填
      if (player.lyrics.crlyric) return
      // 用户已经切走 —— 迟到的结果属于上一首
      if (keyOf(song) !== keyOf(player.songInfo as SongList)) return
      const lines = sanitizeLyricLines(toPlayerLyrics(crlyric as any))
      if (!lines.length) return
      player.lyrics.crlyric = crlyric as any
      player.lyrics.lines = lines
    }

    async function prepareSong(
      song: SongList,
      signal?: AbortSignal,
      onArtwork?: (
        cover: string,
        colors: Awaited<ReturnType<typeof analyzeImageColors>> | null
      ) => void
    ) {
      // 标记「这首歌的元信息正在加载」—— playSong 与 updatePlayerInfo 都会走到这里，
      // 下方的 watch 凭此跳过重复加载（否则同一首歌会被请求两次歌词）。
      inFlightMetadataKey = keyOf(song)
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
        // 本地音乐不缓存：封面直接读本地文件的元数据，没必要落一份缓存副本。
        // 这样既省空间，也避免本地曲目把缓存预算吃掉。
        const isLocal = clean.source === 'local'
        // 与主进程 songCacheKey 保持同一构造，才能命中同一份封面缓存
        const coverCacheId = isLocal ? '' : songCacheKey(clean)

        // 1) 本地封面缓存优先 —— 不依赖 song.img 是否还有效。
        // 旧缓存/旧歌单里存的 img 常是过期签名链接，若先拿它去联网必然失败。
        // 命中即返回 file://，不做解码校验（校验留给加载失败时的兜底路径，
        // 否则每次启动都要多等一次图片解码）。
        if (coverCacheId) {
          try {
            const local = await window.api.musicCache.getCoverFile(coverCacheId)
            if (local) return local
          } catch (e) {
            console.warn('读取封面缓存失败，回退网络:', e)
          }
        }

        // 2) 本地没有：向插件要一个「新鲜」的图片链接。
        // getPic 内部已保证优先返回插件给的新链接（songInfo.img 只作兜底），
        // 因为歌单里存的 img 多是带签名的临时链接、重启后已失效。
        let url = ''
        if (isLocal) {
          url = (await localMetadata)?.img || ''
        } else {
          const value = await window.api.music.requestSdk('getPic', {
            source: clean.source,
            songInfo: clean
          })
          if (typeof value === 'string') url = value
        }
        coverSignal.throwIfAborted()
        if (!url) return defaultCover

        // 3) 下载并回写缓存（此时本地一定没有，传 cacheId 只为回写）
        const cover = await getBlobUrlFromUrl(url, coverSignal, coverCacheId)

        // 4) 兜底：下载失败时，若此前有本地缓存文件（可能损坏），清掉它，
        //    避免下次仍然命中一个加载不出来的文件。
        if (!cover && coverCacheId) {
          await window.api.musicCache.invalidateCoverFile(coverCacheId).catch(() => {})
        }

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
          // parseLyrics 成功时返回的是纯 CrLyric（没有 format 字段），
          // 只有失败才返回 { error }。内置解析器已覆盖 lrc/enhanced-lrc/yrc/ttml 等格式，
          // 未安装歌词转换插件也不该被判定为失败。
          if (parsed.error) throw new Error(parsed.error)
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
      const __t0 = performance.now()

      // 封面始终等待：它很快（缓存命中约 10ms）且直接决定视觉，缺了会闪空。
      const lyricsPromise = withDeadline<
        import('@shiqianjiang/ceru-plugin-sdk').CrLyric | undefined
      >(
        loadLyrics()
          .then((r) => {
            const cost = performance.now() - __t0
            if (cost > METADATA_SLOW_MS) {
              console.warn(`[切歌耗时] ${clean.name} 歌词=${cost.toFixed(0)}ms（偏慢）`)
            }
            // 迟到的歌词不能白白丢掉：超时只是先切歌，结果到了就补上。
            //
            // 这里**不能**判断 signal.aborted —— 该 signal 由 playSong 的
            // metadataController 持有，一旦音频就绪后发生重入（play() 会再次触发
            // 加载流程）它就被 abort 了。但 abort 只代表「这次请求不再阻塞切歌」，
            // 不代表结果作废：歌词已经成功取回，此时用户往往还停在这首歌上。
            // 是否该写入交给 backfillLyrics 用 songKey 判断（它只认「当前歌是否就是这首」）。
            void backfillLyrics(clean, r)
            return r
          })
          .catch((error) => {
            if (clean.source === 'local' && !signal?.aborted)
              reportLocalLyricError(String(clean.songmid), error)
            throw error
          }),
        undefined,
        LYRICS_WAIT_TIMEOUT_MS
      )

      const artwork = await withDeadline(loadCover(), defaultCover).then(async (cover) => {
        const __tCover = performance.now()
        const cached =
          appearanceSongKey === songKey(song) && song.img === player.songInfo?.img
            ? savedCoverDetail(player.coverDetail)
            : undefined
        const colors = cached
          ? { dominantColor: cached.ColorObject, useBlackText: cached.useBlackText }
          : await withDeadline(analyzeImageColors(cover), null)
        const __tColors = performance.now()
        if (__tColors - __t0 > METADATA_SLOW_MS) {
          console.log(
            `[切歌耗时] ${clean.name} 封面=${(__tCover - __t0).toFixed(0)}ms ` +
              `颜色分析=${(__tColors - __tCover).toFixed(0)}ms`
          )
        }
        if (!signal?.aborted) onArtwork?.(cover, colors)
        return { cover, colors }
      })

      const { cover, colors } = artwork
      const dispose = () => {
        if (cover.startsWith('blob:')) URL.revokeObjectURL(cover)
      }
      if (signal?.aborted) {
        dispose()
        signal.throwIfAborted()
      }
      // 默认等歌词一起就绪：切歌时「封面 + 歌词」同时到位，不出现中间态。
      const crlyric = await lyricsPromise
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
      const nextKey = songKey(prepared.song)
      // 是否换歌了 —— 必须在覆盖 preparedSongKey / player.songInfo 之前判断
      const songChanged = preparedSongKey !== nextKey
      preparedSongKey = nextKey
      if (currentBlobUrl && currentBlobUrl !== prepared.cover) URL.revokeObjectURL(currentBlobUrl)
      currentBlobUrl = prepared.cover.startsWith('blob:') ? prepared.cover : null
      player.songInfo = prepared.song
      player.songId = String(prepared.song.songmid)
      player.cover = prepared.cover
      // 只在真有歌词时写入。超时提交会带来 crlyric === undefined，
      // 而此时可能已经有「迟到的回填」把歌词补上了（backfillLyrics），
      // 无条件赋值会把已经显示出来的歌词抹掉，让用户看到歌词闪一下又没了。
      if (prepared.crlyric) {
        player.lyrics.crlyric = prepared.crlyric
        player.lyrics.lines = prepared.lines
        player.lyrics.raw = {}
      } else if (songChanged) {
        // 换了首歌且这首歌没拿到歌词 —— 清空上一首的，避免串词
        player.lyrics.crlyric = undefined
        player.lyrics.lines = []
        player.lyrics.raw = {}
      }
      player.isLoading = false
      applyCoverColors(prepared.colors)
      updateCommon(prepared.song)

      // SMTC 统一在此同步：UI 提交了什么，系统媒体卡片就显示什么。
      // 封面用已加载好的那张(prepared.cover)，由 useSmtc 转成 data URL，
      // 避免 song.img 为空/不可达时卡片显示问号或停留在上一首歌。
      try {
        mediaSessionController.updateMetadata({
          title: prepared.song.name,
          artist: prepared.song.singer,
          album: prepared.song.albumName || '未知专辑',
          artworkUrl: prepared.cover
        })
      } catch {}
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
      if (!force && preparedSongKey === keyOf(song)) {
        // 歌曲已经加载过、只差歌词（超时提交的典型状态）：只补歌词，
        // 不重跑封面/颜色/插件链路 —— 重复的 tracks.lyrics 请求既慢，
        // 又会用它的空结果覆盖掉迟到的回填（backfillLyrics）。
        if (!player.lyrics.crlyric) void reloadLyricsOnly(song)
        return
      }
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

    /**
     * 启动时的封面快速通道：只用已落盘的封面缓存，不等音乐数据/插件就绪。
     *
     * 封面缓存在磁盘上是独立且确定的，没理由跟歌词、颜色分析一起排在
     * `musicStartupReady` 后面 —— 那会导致进首页后要等一会才出现封面。
     */
    let startupCoverToken = 0
    async function hydrateStartupCover() {
      const song = player.songInfo as SongList | undefined
      if (!song?.songmid || song.source === 'local') return
      const cacheId = songCacheKey(song)
      if (!cacheId) return
      const token = ++startupCoverToken
      try {
        const local = await window.api.musicCache.getCoverFile(cacheId)
        // 期间用户可能已切歌 / 已有更新流程接管，过期结果直接丢弃
        if (!local || token !== startupCoverToken) return
        if (!sameSong(player.songInfo, song) || player.cover !== defaultCover) return
        player.cover = local
      } catch {
        // 启动期封面失败无所谓，后续 updatePlayerInfo 会兜底
      }
    }
    void hydrateStartupCover()

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
        const key = keyOf(song)
        // 插件列表变化时，旧歌词可能来自已被卸载的插件，需要重新拉取。
        const pluginsChanged = previous?.[2] !== contributionsRevision.value
        const retryLyrics = pluginsChanged && !player.lyrics.crlyric

        // playSong 在改 lastPlaySongKey 之前就已发起 prepareSong（其中歌词是异步的），
        // 该写入会走到这里。若不加判断会重复加载同一首歌（实测歌词会被请求两次）。
        // 注意：歌词现在是「稍后填充」，所以不能靠 player.lyrics.crlyric 判断是否已加载，
        // 必须用 inFlightMetadataKey（它标记的是这首歌的元信息是否已被接管）。
        if (inFlightMetadataKey === key && !pluginsChanged) return

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
