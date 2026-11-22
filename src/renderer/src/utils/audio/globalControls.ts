import { desktopBridge } from '@renderer/services/desktopBridge'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import mediaSessionController from '@renderer/utils/audio/useSmtc'

let installed = false
let smtcTimer: any = null
let globalKeyDownHandler: ((e: KeyboardEvent) => void) | null = null
let removeMusicCtrlListener: (() => void) | null = null

function dispatch(name: string, val?: any) {
  window.dispatchEvent(new CustomEvent('global-music-control', { detail: { name, val } }))
}

export function installGlobalMusicControls() {
  if (installed) return
  installed = true

  const controlAudio = ControlAudioStore()

  // 初始化 SMTC，并在音频元素可用时同步一次播放状态与动作处理器
  const tryInitSmtc = () => {
    const el = controlAudio.Audio.audio
    if (!el) return
    mediaSessionController.init(el, {
      play: () => dispatch('play'),
      pause: () => dispatch('pause'),
      playPrevious: () => dispatch('playPrev'),
      playNext: () => dispatch('playNext')
    })
    // 初始同步状态
    mediaSessionController.updatePlaybackState(el.paused ? 'paused' : 'playing')
  }
  // 尝试立即初始化一次
  tryInitSmtc()
  // 若 URL 变化或 audio 初始化稍后完成，由组件/Store 负责赋值；这里轮询几次兜底初始化
  let smtcTries = 0
  if (smtcTimer) clearInterval(smtcTimer)
  smtcTimer = setInterval(() => {
    if (smtcTries > 20) {
      if (smtcTimer) {
        clearInterval(smtcTimer)
        smtcTimer = null
      }
      return
    }
    smtcTries++
    if (controlAudio.Audio.audio) {
      tryInitSmtc()
      if (smtcTimer) {
        clearInterval(smtcTimer)
        smtcTimer = null
      }
    }
  }, 150)

  globalKeyDownHandler = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const tag = (target?.tagName || '').toLowerCase()
    const isEditable =
      !!target?.closest('[contenteditable="true"], [contenteditable=""]') ||
      tag === 'input' ||
      tag === 'textarea' ||
      tag === 'select' ||
      (target as HTMLInputElement)?.type === 'text' ||
      (target as HTMLInputElement)?.type === 'search' ||
      (target as HTMLInputElement)?.type === 'password' ||
      (target as HTMLInputElement)?.type === 'email' ||
      (target as HTMLInputElement)?.type === 'url' ||
      (target as HTMLInputElement)?.type === 'number'

    if (isEditable || e.repeat || e.metaKey || e.ctrlKey || e.altKey) return

    let control: { name: string; val?: number } | undefined
    switch (e.code) {
      case 'Space':
        control = { name: 'toggle' }
        break
      case 'ArrowUp':
        control = { name: 'volumeDelta', val: 5 }
        break
      case 'ArrowDown':
        control = { name: 'volumeDelta', val: -5 }
        break
      case 'ArrowLeft':
        control = { name: 'seekDelta', val: -5 }
        break
      case 'ArrowRight':
        control = { name: 'seekDelta', val: 5 }
        break
      case 'KeyF':
        control = { name: 'toggleFullPlay' }
        break
      default:
        return
    }

    // Prevent the browser's default action synchronously. Doing this in a timer
    // is too late for Space and leaves the focused button/page reacting as well.
    e.preventDefault()
    dispatch(control.name, control.val)
  }

  document.addEventListener('keydown', globalKeyDownHandler)

  // 托盘或系统快捷键回调（若存在）
  try {
    removeMusicCtrlListener = (desktopBridge as any).api?.onMusicCtrl?.(() => {
      dispatch('toggle')
    })
  } catch {
    // ignore
  }
}

export function uninstallGlobalMusicControls() {
  if (!installed) return
  installed = false

  if (smtcTimer) {
    clearInterval(smtcTimer)
    smtcTimer = null
  }

  if (globalKeyDownHandler) {
    document.removeEventListener('keydown', globalKeyDownHandler)
    globalKeyDownHandler = null
  }

  if (removeMusicCtrlListener) {
    removeMusicCtrlListener()
    removeMusicCtrlListener = null
  }

  mediaSessionController.cleanup()
}
