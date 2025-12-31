import { ControlAudioStore } from '@renderer/store/ControlAudio'
import mediaSessionController from '@renderer/utils/audio/useSmtc'

let installed = false

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
  const smtcTimer = setInterval(() => {
    if (smtcTries > 20) {
      clearInterval(smtcTimer)
      return
    }
    smtcTries++
    if (controlAudio.Audio.audio) {
      tryInitSmtc()
      clearInterval(smtcTimer)
    }
  }, 150)

  let keyThrottle = false
  const throttle = (cb: () => void, delay: number) => {
    if (keyThrottle) return
    keyThrottle = true
    setTimeout(() => {
      try {
        cb()
      } finally {
        keyThrottle = false
      }
    }, delay)
  }

  const onKeyDown = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null
    const tag = (target?.tagName || '').toLowerCase()
    const isEditable =
      target?.hasAttribute('contenteditable') ||
      tag === 'input' ||
      tag === 'textarea' ||
      (target as HTMLInputElement)?.type === 'text' ||
      (target as HTMLInputElement)?.type === 'search' ||
      (target as HTMLInputElement)?.type === 'password' ||
      (target as HTMLInputElement)?.type === 'email' ||
      (target as HTMLInputElement)?.type === 'url' ||
      (target as HTMLInputElement)?.type === 'number'

    throttle(() => {
      if (isEditable) return
      if (e.code === 'Space') {
        e.preventDefault()
        dispatch('toggle')
      } else if (e.code === 'ArrowUp') {
        e.preventDefault()
        dispatch('volumeDelta', 5)
      } else if (e.code === 'ArrowDown') {
        e.preventDefault()
        dispatch('volumeDelta', -5)
      } else if (e.code === 'ArrowLeft') {
        dispatch('seekDelta', -5)
      } else if (e.code === 'ArrowRight') {
        dispatch('seekDelta', 5)
      } else if (e.code === 'KeyF') {
        e.preventDefault()
        dispatch('toggleFullPlay')
      }
    }, 100)
  }

  document.addEventListener('keydown', onKeyDown)

  // // 监听音频结束事件，根据播放模式播放下一首
  // controlAudio.subscribe('ended', () => {
  //   window.requestAnimationFrame(() => {
  //     console.log('播放结束')
  //     dispatch('playNext')
  //   })
  // })
  // 托盘或系统快捷键回调（若存在）
  try {
    const removeMusicCtrlListener = (window as any).api?.onMusicCtrl?.(() => {
      dispatch('toggle')
    })
    void removeMusicCtrlListener
  } catch {
    // ignore
  }
}
