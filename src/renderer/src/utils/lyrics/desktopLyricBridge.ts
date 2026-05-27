import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { storeToRefs } from 'pinia'
import { watch } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { isPageIdle } from '@renderer/utils/idleSleep'

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
// 桌面歌词窗口是否开启
let isLyricWindowOpen = false
// visibilitychange 处理器引用，用于卸载时清理
let visibilityHandler: (() => void) | null = null

function buildLyricPayload(lines: LyricLine[]) {
  return JSON.parse(JSON.stringify(lines || []))
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

export function installDesktopLyricBridge() {
  if (installed) return
  installed = true

  const controlAudio = ControlAudioStore()
  const globalPlayStatus = useGlobalPlayStatusStore()
  const { player } = storeToRefs(globalPlayStatus)
  const localUserStore = LocalUserDetailStore()
  const { userInfo } = storeToRefs(localUserStore)

  let lastIndex = -1

  // 监听歌词变化
  watch(
    () => player.value.lyrics.lines,
    (lines) => {
      lastIndex = -1
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-change', buildLyricPayload(lines))
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
        if (name || artist) {
          ;(window as any)?.electron?.ipcRenderer?.send?.('play-song-change', { name, artist })
        }
      } catch {}
    },
    { immediate: true }
  )

  // 播放状态推送
  let lastPlayState: any = undefined
  const checkPlayState = () => {
    if (controlAudio.Audio.isPlay !== lastPlayState) {
      lastPlayState = controlAudio.Audio.isPlay
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-status-change', lastPlayState)
    }
  }
  // 立即检查一次
  watch(() => controlAudio.Audio.isPlay, checkPlayState, { immediate: true })

  // 快照推送函数：在窗口准备就绪或切换显示时调用，保证首屏不空
  const pushSnapshot = () => {
    try {
      const currentSong = player.value.songInfo as any
      const name = currentSong?.name || ''
      const artist = currentSong?.singer || ''
      if (name || artist) {
        ;(window as any)?.electron?.ipcRenderer?.send?.('play-song-change', { name, artist })
      }
      const currentLines = (player.value.lyrics?.lines as any[]) || []
      ;(window as any)?.electron?.ipcRenderer?.send?.(
        'play-lyric-change',
        buildLyricPayload(currentLines)
      )
      const a = controlAudio.Audio
      let ms = Math.round((a?.currentTime || 0) * 1000)
      if (ms <= 0) {
        const lastId = userInfo.value?.lastPlaySongId
        const songId = currentSong?.songmid
        const restoreMs = Math.round(Number(userInfo.value?.currentTime || 0) * 1000)
        if (lastId && songId && lastId === songId && restoreMs > 0) {
          ms = restoreMs
        }
      }
      const idx = computeLyricIndex(ms, currentLines as any)
      lastIndex = idx
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-index', idx)
      let progress = 0
      if (idx >= 0 && currentLines[idx]) {
        const line = currentLines[idx] as any
        const dur = Math.max(1, (line.endTime ?? line.startTime + 1) - line.startTime)
        progress = Math.min(1, Math.max(0, (ms - line.startTime) / dur))
      }
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-progress', {
        index: idx,
        progress,
        currentMs: ms,
        timestamp: performance.now()
      })
      ;(window as any)?.electron?.ipcRenderer?.send?.(
        'play-status-change',
        !!controlAudio.Audio.isPlay
      )
    } catch {}
  }

  // 首次安装时主动推送一次当前状态
  pushSnapshot()

  // 当桌面歌词窗口声明“准备就绪”时，再次推送快照，避免页面未加载时丢包
  ;(window as any)?.electron?.ipcRenderer?.on?.('lyric-window-ready', () => {
    pushSnapshot()
  })
  // 当切换显示为开启时，补一次快照
  ;(window as any)?.electron?.ipcRenderer?.on?.(
    'desktop-lyric-open-change',
    (_: any, open: boolean) => {
      isLyricWindowOpen = open
      if (open) pushSnapshot()
    }
  )

  // ---- 低功耗调度器 ----
  // 根据上下文决定间隔与推送量
  function scheduleNext() {
    if (!installed) {
      playStateInterval = null
      return
    }

    // 停止条件：页面同时处于隐藏 且 闲置（用户走开了）
    if (document.hidden && isPageIdle()) {
      playStateInterval = null
      return
    }

    const hidden = document.hidden
    const idle = isPageIdle()

    // 取音频时间
    const a = controlAudio.Audio
    let ms = Math.round((a?.currentTime || 0) * 1000)
    if (ms <= 0) {
      const currentSong = player.value.songInfo as any
      const lastId = userInfo.value?.lastPlaySongId
      const songId = currentSong?.songmid
      const restoreMs = Math.round(Number(userInfo.value?.currentTime || 0) * 1000)
      if (lastId && songId && lastId === songId && restoreMs > 0) {
        ms = restoreMs
      }
    }
    const currentLines = player.value.lyrics.lines || []
    const idx = computeLyricIndex(ms, currentLines)

    if (!hidden) {
      // ---- 窗口可见 ----
      // 计算进度（桌面歌词 30% 判定需要）
      let progress = 0
      if (idx >= 0 && currentLines[idx]) {
        const line = currentLines[idx]
        const dur = Math.max(1, (line.endTime ?? line.startTime + 1) - line.startTime)
        progress = Math.min(1, Math.max(0, (ms - line.startTime) / dur))
      }
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-progress', {
        index: idx,
        progress,
        currentMs: ms,
        timestamp: performance.now()
      })
    }

    // 行变化时始终推送 index（无论是否隐藏，菜单栏需要）
    if (idx !== lastIndex) {
      lastIndex = idx
      ;(window as any)?.electron?.ipcRenderer?.send?.('play-lyric-index', idx)
    }

    // ---- 三档自适应 ----
    let interval: number
    if (hidden || idle) {
      interval = 1200          // 隐藏/闲置：极低频，仅保活菜单栏
    } else if (isLyricWindowOpen) {
      interval = 50            // 桌面歌词开：高频
    } else {
      interval = 200           // 仅菜单栏：中频
    }

    playStateInterval = window.setTimeout(scheduleNext, interval) as unknown as number
  }

  // 首次启动（用中频，防空窗）
  playStateInterval = window.setTimeout(scheduleNext, 200) as unknown as number

  // 页面可见性变化 / 闲置唤醒时重新调度
  visibilityHandler = () => {
    if (playStateInterval === null && !(document.hidden && isPageIdle())) {
      playStateInterval = window.setTimeout(scheduleNext, 200) as unknown as number
    }
  }
  document.addEventListener('visibilitychange', visibilityHandler)
  window.addEventListener('ceru-wake', visibilityHandler)
}

// 导出清理函数，用于清除所有定时器
export function uninstallDesktopLyricBridge() {
  if (playStateInterval !== null) {
    clearTimeout(playStateInterval)
    playStateInterval = null
  }

  if (visibilityHandler) {
    document.removeEventListener('visibilitychange', visibilityHandler)
    window.removeEventListener('ceru-wake', visibilityHandler)
    visibilityHandler = null
  }

  installed = false
  console.log('Desktop lyric bridge uninstalled')
}
