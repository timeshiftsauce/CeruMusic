import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'

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
// 保存定时器ID以便清理
let playStateInterval: number | null = null
let lyricProgressInterval: number | null = null
// 桌面歌词同步提前量（毫秒），用于抵消渲染链路延迟
const DESKTOP_LYRIC_LEAD_MS = 120

function lineText(line?: LyricLine) {
  return (line?.words || []).map((w) => w.word).join('').trim()
}

function buildLyricPayload(lines: LyricLine[], source?: string) {
  const raw = lines || []
  if (source !== 'local') {
    return raw.map((l) => ({
      content: lineText(l),
      tran: (l.translatedLyric || '').trim()
    }))
  }

  // 本地 LRC 常见同时间戳双行：第一行原文，第二行翻译。
  // 将其合并成一条，避免把翻译误当作“下一句歌词”。
  const merged: Array<{ content: string; tran: string }> = []
  const sameTimeTolerance = 120

  for (let i = 0; i < raw.length; i++) {
    const cur = raw[i]
    const curContent = lineText(cur)
    const curTran = (cur.translatedLyric || '').trim()
    let tran = curTran

    const next = raw[i + 1]
    if (next) {
      const nextContent = lineText(next)
      const nextTran = (next.translatedLyric || '').trim()
      const sameTime = Math.abs((next.startTime || 0) - (cur.startTime || 0)) <= sameTimeTolerance
      const canPair =
        sameTime &&
        !curTran &&
        !nextTran &&
        !!curContent &&
        !!nextContent &&
        curContent !== nextContent

      if (canPair) {
        tran = nextContent
        i++
      }
    }

    merged.push({
      content: curContent,
      tran
    })
  }

  return merged
}

function computeLyricIndex(timeMs: number, lines: LyricLine[], leadMs = 0) {
  if (!lines || lines.length === 0) return -1
  const t = timeMs + leadMs
  const i = lines.findIndex((l) => t >= l.startTime && t < l.endTime)
  if (i !== -1) return i
  for (let j = lines.length - 1; j >= 0; j--) {
    if (t >= lines[j].startTime) return j
  }
  return -1
}

export function installDesktopLyricBridge() {
  if (installed) return
  installed = true

  const controlAudio = ControlAudioStore()
  const globalPlayStatus = useGlobalPlayStatusStore()
  const { player } = storeToRefs(globalPlayStatus)

  let lastIndex = -1

  // 监听歌词变化
  watch(
    () => player.value.lyrics.lines,
    (lines) => {
      lastIndex = -1
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-change', {
        index: -1,
        lyric: buildLyricPayload(lines, (player.value.songInfo as any)?.source)
      })
      // 提示前端进入准备态
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-index', -1)
    },
    { immediate: true }
  )

  // 监听歌曲信息变化（同步歌名）
  watch(
    () => player.value.songInfo,
    (song) => {
      try {
        const name = (song as any)?.name || ''
        const artist = (song as any)?.singer || ''
        const title = [name, artist].filter(Boolean).join(' - ')
        if (title) (window as any)?.electron?.ipcRenderer?.send?.('play-song-change', title)
      } catch {}
    },
    { immediate: true }
  )

  // 播放状态推送
  let lastPlayState: any = undefined
  playStateInterval = window.setInterval(() => {
    if (controlAudio.Audio.isPlay !== lastPlayState) {
      lastPlayState = controlAudio.Audio.isPlay
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-status-change', lastPlayState)
    }
  }, 300)

  // 时间推进与当前行/进度推送
  lyricProgressInterval = window.setInterval(() => {
    const a = controlAudio.Audio
    const ms = Math.round((a?.currentTime || 0) * 1000)
    const currentLines = player.value.lyrics.lines || []
    const adjustedMs = ms + DESKTOP_LYRIC_LEAD_MS
    const idx = computeLyricIndex(ms, currentLines, DESKTOP_LYRIC_LEAD_MS)

    // 计算当前行进度（0~1）
    let progress = 0
    if (idx >= 0 && currentLines[idx]) {
      const line = currentLines[idx]
      const dur = Math.max(1, (line.endTime ?? line.startTime + 1) - line.startTime)
      progress = Math.min(1, Math.max(0, (adjustedMs - line.startTime) / dur))
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
        lyric: buildLyricPayload(currentLines, (player.value.songInfo as any)?.source)
      })
    }
  }, 50)
}

// 导出清理函数，用于清除所有定时器
export function uninstallDesktopLyricBridge() {
  if (playStateInterval !== null) {
    clearInterval(playStateInterval)
    playStateInterval = null
  }
  if (lyricProgressInterval !== null) {
    clearInterval(lyricProgressInterval)
    lyricProgressInterval = null
  }
  installed = false
  console.log('Desktop lyric bridge uninstalled')
}
