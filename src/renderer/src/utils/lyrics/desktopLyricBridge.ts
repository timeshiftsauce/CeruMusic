import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import _ from 'lodash'
import { toRaw } from 'vue'
import {
  parseYrc,
  parseLrc,
  parseTTML,
  parseQrc
} from '@applemusic-like-lyrics/lyric/pkg/amll_lyric.js'

interface LyricWord {
  word: string
}
interface LyricLine {
  startTime: number
  endTime: number
  words: LyricWord[]
  translatedLyric?: string
}

let installed = false

function buildLyricPayload(lines: LyricLine[]) {
  return (lines || []).map((l) => ({
    content: (l.words || []).map((w) => w.word).join(''),
    tran: l.translatedLyric || ''
  }))
}

function computeLyricIndex(timeMs: number, lines: LyricLine[]) {
  if (!lines || lines.length === 0) return -1
  const t = timeMs
  const i = lines.findIndex((l) => t >= l.startTime && t < l.endTime)
  if (i !== -1) return i
  for (let j = lines.length - 1; j >= 0; j--) {
    if (t >= lines[j].startTime) return j
  }
  return -1
}

function mergeTranslation(base: LyricLine[], tlyric?: string): LyricLine[] {
  if (!tlyric || base.length === 0) return base
  const translated = parseLrc(tlyric) as LyricLine[]
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
        const tl = translatedSorted[j]
        if (!tl?.words?.[0]?.word || tl.words[0].word === '//' || !bl?.words?.[0]?.word) continue
        const text = joinWords(tl)
        if (text) bl.translatedLyric = text
      }
      return base
    }
  }
  return base
}

export function installDesktopLyricBridge() {
  if (installed) return
  installed = true

  const controlAudio = ControlAudioStore()
  const localUser = LocalUserDetailStore()

  let currentLines: LyricLine[] = []
  let lastIndex = -1
  let abortCtrl: AbortController | null = null

  async function fetchLyricsForCurrentSong() {
    const songId = localUser.userInfo.lastPlaySongId
    if (!songId) {
      currentLines = []
      lastIndex = -1
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-change', { index: -1, lyric: [] })
      return
    }
    const song = localUser.list.find((s: any) => s.songmid === songId)
    if (!song) {
      currentLines = []
      lastIndex = -1
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-change', { index: -1, lyric: [] })
      return
    }

    // 取消上一轮请求
    if (abortCtrl) abortCtrl.abort()
    abortCtrl = new AbortController()

    const source = (song as any).source || 'kg'
    let parsed: LyricLine[] = []
    try {
      if (source === 'wy' || source === 'tx') {
        try {
          const res = await (
            await fetch(
              `https://amll-ttml-db.stevexmh.net/${source === 'wy' ? 'ncm' : 'qq'}/${songId}`,
              { signal: abortCtrl.signal }
            )
          ).text()
          if (!res || res.length < 100) throw new Error('no ttml')
          parsed = (parseTTML(res) as any).lines as LyricLine[]
        } catch {
          const lyricData = await (window as any)?.api?.music?.requestSdk?.('getLyric', {
            source,
            songInfo: _.cloneDeep(toRaw(song))
          })
          if (lyricData?.crlyric) {
            parsed = (
              source === 'tx' ? parseQrc(lyricData.crlyric) : parseYrc(lyricData.crlyric)
            ) as LyricLine[]
          } else if (lyricData?.lyric) {
            parsed = parseLrc(lyricData.lyric) as LyricLine[]
          }
          parsed = mergeTranslation(parsed, lyricData?.tlyric)
        }
      } else if (source !== 'local') {
        const lyricData = await (window as any)?.api?.music?.requestSdk?.('getLyric', {
          source,
          songInfo: _.cloneDeep(toRaw(song))
        })
        if (lyricData?.crlyric) {
          parsed = (
            source === 'tx' ? parseQrc(lyricData.crlyric) : parseYrc(lyricData.crlyric)
          ) as LyricLine[]
        } else if (lyricData?.lyric) {
          parsed = parseLrc(lyricData.lyric) as LyricLine[]
        }
        parsed = mergeTranslation(parsed, lyricData?.tlyric)
      } else {
        const text = (song as any).lrc as string | null
        if (text && (/^\[(\d+),\d+\]/.test(text) || /\(\d+,\d+,\d+\)/.test(text))) {
          parsed = text ? (parseQrc(text) as any) : []
        } else {
          parsed = text ? (parseLrc(text) as any) : []
        }
      }
    } catch (e) {
      console.error('获取歌词失败:', e)
      parsed = []
    }

    currentLines = parsed || []
    lastIndex = -1
    ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-change', {
      index: -1,
      lyric: buildLyricPayload(currentLines)
    })
    // 提示前端进入准备态：先渲染 1、2 句左右铺开
    ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-index', -1)

    // 同步歌名
    try {
      const name = (song as any)?.name || ''
      const artist = (song as any)?.singer || ''
      const title = [name, artist].filter(Boolean).join(' - ')
      if (title) (window as any)?.electron?.ipcRenderer?.send?.('play-song-change', title)
    } catch {}
  }

  // 监听歌曲切换
  let lastSongId: any = undefined
  setInterval(() => {
    if (localUser.userInfo.lastPlaySongId !== lastSongId) {
      lastSongId = localUser.userInfo.lastPlaySongId
      fetchLyricsForCurrentSong()
    }
  }, 300)

  // 播放状态推送
  let lastPlayState: any = undefined
  setInterval(() => {
    if (controlAudio.Audio.isPlay !== lastPlayState) {
      lastPlayState = controlAudio.Audio.isPlay
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-status-change', lastPlayState)
    }
  }, 300)

  // 时间推进与当前行/进度推送
  setInterval(() => {
    const a = controlAudio.Audio
    const ms = Math.round((a?.currentTime || 0) * 1000)
    const idx = computeLyricIndex(ms, currentLines)

    // 计算当前行进度（0~1）
    let progress = 0
    if (idx >= 0 && currentLines[idx]) {
      const line = currentLines[idx]
      const dur = Math.max(1, (line.endTime ?? line.startTime + 1) - line.startTime)
      progress = Math.min(1, Math.max(0, (ms - line.startTime) / dur))
    }

    // 首先推送进度，便于前端做 30% 判定（避免 setTimeout 带来的抖动）
    ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-progress', {
      index: idx,
      progress
    })

    // 当行变化时，推送 index（立即切换高亮），并附带完整歌词集合（仅在变化时下发，减少开销）
    if (idx !== lastIndex) {
      lastIndex = idx
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-index', idx)
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-change', {
        index: idx,
        lyric: buildLyricPayload(currentLines)
      })
    }
  }, 100)
}
