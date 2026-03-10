import { defineStore } from 'pinia'
import type { LyricLine } from '@applemusic-like-lyrics/core'
import { analyzeImageColors, Color } from '@renderer/utils/color/colorExtractor'
import { parseYrc, parseLrc, parseTTML, parseQrc } from '@applemusic-like-lyrics/lyric'
import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { reactive, computed, watch, toRaw, type ComputedRef } from 'vue'
import _ from 'lodash'
import defaultCover from '@renderer/assets/images/song.jpg'
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
    lines: LyricLine[]
    trans?: string
    source?: string
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

// 辅助函数：将URL转换为 Blob URL
async function getBlobUrlFromUrl(url: string): Promise<string> {
  try {
    const response = await fetch(url)
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
        lines: []
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

    // 同步 userInfo.lastPlaySongId
    watch(
      () => localUserStore.userInfo.lastPlaySongId,
      (newId) => {
        if (newId && newId !== player.songId) {
          player.songId = newId
          const song = localUserStore.list.find((s: any) => s.songmid === newId)
          if (song) {
            updatePlayerInfo(song)
          }
        }
      },
      { immediate: true }
    )

    // 记录当前的 Blob URL 以便清理
    let currentBlobUrl: string | null = null

    // 监听 songInfo 变化，处理封面
    watch(
      () => player.songInfo,
      async (newVal) => {
        // 清理旧的 Blob URL
        if (currentBlobUrl) {
          URL.revokeObjectURL(currentBlobUrl)
          currentBlobUrl = null
        }

        if (!newVal) return

        // 处理封面 Blob URL
        const coverUrl = newVal.img || defaultCover

        if (coverUrl.startsWith('http')) {
          const blobUrl = await getBlobUrlFromUrl(coverUrl)
          if (blobUrl) {
            currentBlobUrl = blobUrl
            player.cover = blobUrl
          } else {
            player.cover = coverUrl
          }
        } else {
          player.cover = coverUrl
        }
      },
      { immediate: true }
    )

    // 监听 cover 变化，提取颜色
    watch(
      () => player.cover,
      async (newCover) => {
        if (!newCover) return
        try {
          const { dominantColor, useBlackText } = await analyzeImageColors(newCover)
          player.coverDetail.ColorObject = dominantColor
          player.coverDetail.mainColor = `rgba(${dominantColor.r},${dominantColor.g},${dominantColor.b},1)`

          // 计算文字对比色
          const baseTextColor = useBlackText ? '0, 0, 0' : '255, 255, 255'
          player.coverDetail.textColor = `rgba(${baseTextColor}, 0.6)`
          player.coverDetail.hoverColor = `rgba(${baseTextColor}, 1)`
          player.coverDetail.contrastColor = player.coverDetail.textColor // 复用

          player.coverDetail.playBg = 'rgba(255,255,255,0.2)'
          player.coverDetail.playBgHover = 'rgba(255,255,255,0.33)'

          // 计算 lightMainColor (偏白主题色)
          let r = dominantColor.r
          let g = dominantColor.g
          let b = dominantColor.b
          // 适度向白色偏移
          r = Math.min(255, r + (255 - r) * 0.8)
          g = Math.min(255, g + (255 - g) * 0.8)
          b = Math.min(255, b + (255 - b) * 0.8)
          player.coverDetail.lightMainColor = `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.9)`
          player.coverDetail.useBlackText = useBlackText
          console.log('useBlackText', player.coverDetail.useBlackText)
        } catch (e) {
          console.error('颜色提取失败', e)
          // 恢复默认
          resetColors()
        }
      }
    )

    function resetColors() {
      player.coverDetail.mainColor = 'var(--td-brand-color-5)'
      player.coverDetail.lightMainColor = 'rgba(255, 255, 255, 0.9)'
      player.coverDetail.contrastColor = 'var(--player-text-idle)'
      player.coverDetail.textColor = 'var(--player-text-idle)'
      player.coverDetail.hoverColor = 'var(--player-text-hover-idle)'
      player.coverDetail.playBg = 'var(--player-btn-bg-idle)'
      player.coverDetail.playBgHover = 'var(--player-btn-bg-hover-idle)'
    }

    // 监听歌曲ID变化，获取歌词, 评论
    watch(
      [() => player.songId, () => player.songInfo?.songmid],
      async ([newId], _oldArgs, onCleanup) => {
        if (!newId || !player.songInfo) {
          player.lyrics.lines = []
          return
        }
        player.isLoading = true

        // 竞态与取消控制
        let active = true
        const abort = new AbortController()
        onCleanup(() => {
          active = false
          abort.abort()
        })

        const getCleanSongInfo = () => JSON.parse(JSON.stringify(toRaw(player.songInfo)))
        updateCommon(getCleanSongInfo())

        const parseCrLyricBySource = (source: string, text: string): LyricLine[] => {
          return source === 'tx' ? (parseQrc(text) as any) : (parseYrc(text) as any)
        }

        const mergeTranslation = (base: LyricLine[], tlyric?: string): LyricLine[] => {
          if (!tlyric || base.length === 0) return base

          const translated = parseLrc(tlyric)
          if (!translated || translated.length === 0) return base

          const joinWords = (line: LyricLine) => (line.words || []).map((w) => w.word).join('')

          const translatedSorted = translated.slice().sort((a, b) => a.startTime - b.startTime)

          const baseTolerance = 300
          const ratioTolerance = 0.4

          if (base.length > 0) {
            const firstBase = base[0]
            const firstDuration = Math.max(1, firstBase.endTime - firstBase.startTime)
            const firstTol = Math.min(baseTolerance, firstDuration * ratioTolerance)

            let anchorIndex: number | null = null
            let bestDiff = Number.POSITIVE_INFINITY
            for (let i = 0; i < translatedSorted.length; i++) {
              const diff = Math.abs(translatedSorted[i].startTime - firstBase.startTime)
              if (diff <= firstTol && diff < bestDiff) {
                bestDiff = diff
                anchorIndex = i
              }
            }

            if (anchorIndex !== null) {
              let j = anchorIndex
              for (let i = 0; i < base.length && j < translatedSorted.length; i++, j++) {
                const bl = base[i]
                const tl = translatedSorted[j] as LyricLine
                if (tl.words[0].word === '//' || !bl.words[0].word) continue
                const text = joinWords(tl)
                if (text) bl.translatedLyric = text
              }
              return base
            }
          }
          return base
        }

        try {
          const source = (player.songInfo as any).source || 'kg'
          let parsedLyrics: LyricLine[] = []

          if (source === 'wy' || source === 'tx') {
            const sdkPromise = (async () => {
              try {
                const lyricData = await window.api.music.requestSdk('getLyric', {
                  source,
                  songInfo: getCleanSongInfo(),
                  grepLyricInfo: playSettingStore.getIsGrepLyricInfo,
                  useStrictMode: playSettingStore.getStrictGrep
                })
                console.log('平台 Lyrics 获取成功')

                if (!active) return null

                let lyrics: null | LyricLine[] = null
                if (lyricData?.crlyric) {
                  lyrics = parseCrLyricBySource(source, lyricData.crlyric)
                } else if (lyricData?.lyric) {
                  lyrics = parseLrc(lyricData.lyric) as any
                }
                lyrics = mergeTranslation(lyrics as any, lyricData?.tlyric)

                if (!lyrics || lyrics.length === 0) {
                  return null
                }
                return lyrics
              } catch (err: any) {
                throw new Error(`SDK request failed: ${err.message}`)
              }
            })()

            try {
              const response = await fetch(
                `https://amll-ttml-db.stevexmh.net/${source === 'wy' ? 'ncm' : 'qq'}/${newId}`,
                {
                  signal: abort.signal
                }
              )

              if (!active) return

              if (!response.ok) {
                throw new Error(`TTML request failed with status ${response.status}`)
              }

              const res = await response.text()

              if (!res || res.length < 100) {
                throw new Error('ttml 无歌词')
              }

              const ttmlLyrics = parseTTML(res).lines

              if (!ttmlLyrics || ttmlLyrics.length === 0) {
                throw new Error('TTML 解析为空')
              }

              parsedLyrics = ttmlLyrics as LyricLine[]

              sdkPromise.catch(() => {})
            } catch (ttmlError: any) {
              if (!active || (ttmlError && ttmlError.name === 'AbortError')) {
                return
              }

              try {
                const sdkLyrics = await sdkPromise
                if (sdkLyrics) {
                  parsedLyrics = sdkLyrics
                } else {
                  parsedLyrics = []
                }
              } catch (sdkError) {
                parsedLyrics = []
              }
            }
          } else if (source !== 'local') {
            const lyricData = await window.api.music.requestSdk('getLyric', {
              source,
              songInfo: getCleanSongInfo(),
              grepLyricInfo: playSettingStore.getIsGrepLyricInfo,
              useStrictMode: playSettingStore.getStrictGrep
            })
            if (!active) return

            if (lyricData?.crlyric) {
              parsedLyrics = parseCrLyricBySource(source, lyricData.crlyric)
            } else if (lyricData?.lyric) {
              parsedLyrics = parseLrc(lyricData.lyric) as LyricLine[]
            }

            parsedLyrics = mergeTranslation(parsedLyrics, lyricData?.tlyric)
          } else {
            let text = (player.songInfo as any).lrc as string | null
            if (!text) {
              text = await window.api.music.invoke(
                'local-music:get-lyric',
                (player.songInfo as any).songmid
              )
            }

            if (text && (/^\[(\d+),\d+\]/.test(text) || /\(\d+,\d+,\d+\)/.test(text))) {
              parsedLyrics = text ? (parseYrc(text) as any) : []
            } else {
              parsedLyrics = text ? (parseLrc(text) as any) : []
            }
          }
          if (!active) return
          player.lyrics.lines = parsedLyrics.length > 0 ? sanitizeLyricLines(parsedLyrics) : []
        } catch (error) {
          console.error('获取歌词失败:', error)
          if (!active) return
          player.lyrics.lines = []
        } finally {
          if (active) player.isLoading = false
        }
      },
      { immediate: true }
    )

    function updatePlayerInfo(songInfo: SongList) {
      // 避免重复更新
      if (player.songInfo?.songmid === songInfo.songmid) return
      player.songInfo = songInfo
    }

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
      if (songInfo.source === 'local') return
      // Reset comments
      player.comments.hotList = []
      player.comments.latestList = []
      player.comments.hotPage = 0
      player.comments.hotTotal = 0
      player.comments.hotMaxPage = 0
      player.comments.latestPage = 0
      player.comments.latestTotal = 0
      player.comments.latestMaxPage = 0

      // 同时获取热门和最新评论
      fetchComments(1, 'hot')
      fetchComments(1, 'latest')
    }

    return {
      player,
      updatePlayerInfo,
      fetchComments
    }
  },
  {
    persist: true
  }
)
