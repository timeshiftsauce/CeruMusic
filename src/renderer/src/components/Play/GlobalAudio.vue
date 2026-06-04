<script setup lang="ts">
import {
  onMounted,
  onUnmounted,
  provide,
  ref,
  onActivated,
  onDeactivated,
  watch,
  nextTick
} from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useEqualizerStore } from '@renderer/store/Equalizer'
import { useAudioEffectsStore } from '@renderer/store/AudioEffects'
import { useAudioOutputStore } from '@renderer/store/audioOutput'
import { storeToRefs } from 'pinia'
import AudioManager from '@renderer/utils/audio/audioManager'
import { isPageIdle } from '@renderer/utils/idleSleep'
import { isAppWindowVisible } from '@renderer/utils/appWindowState'
import { crossfadeState } from '@renderer/utils/audio/crossfade'

type AudioSlot = 'A' | 'B'

const audioStore = ControlAudioStore()
const eqStore = useEqualizerStore()
const effectStore = useAudioEffectsStore()
const audioOutputStore = useAudioOutputStore()

// 双槽 audio 元素引用
const audioARef = ref<HTMLAudioElement>()
const audioBRef = ref<HTMLAudioElement>()

// 提供订阅方法给子组件使用
provide('audioSubscribe', audioStore.subscribe)

// 判断事件是否来自当前活跃槽
const isPrimarySlot = (slot: AudioSlot) => audioStore.Audio.primarySlot === slot

// 应用均衡器设置
const applyGlobalEQ = (el: HTMLAudioElement) => {
  AudioManager.getOrCreateAudioSource(el)
  const { enabled, gains } = storeToRefs(eqStore)
  const targetGains = enabled.value ? gains.value : new Array(10).fill(0)
  targetGains.forEach((gain, index) => {
    AudioManager.setEqualizerBand(el, index, gain)
  })
}

// Apply Audio Effects
const applyGlobalEffects = (el: HTMLAudioElement) => {
  const { bassBoost, surround, balance, loudness } = storeToRefs(effectStore)

  // Bass Boost
  const targetBass = bassBoost.value.enabled ? bassBoost.value.gain : 0
  AudioManager.setBassBoost(el, targetBass)

  // Surround
  const targetSurround = surround.value.enabled ? surround.value.mode : 'off'
  AudioManager.setSurroundMode(el, targetSurround)

  // Balance
  const targetBalance = balance.value.enabled ? balance.value.value : 0
  AudioManager.setBalance(el, targetBalance)

  // Loudness Normalization (响度均衡)
  // 仅作用于本应用音频链路,不影响系统其他声音(如游戏)。
  AudioManager.setLoudnessNormalization(el, {
    enabled: loudness.value.enabled,
    target: loudness.value.target
  })
}

// 对两个元素都应用 EQ / Effects
const applyToBoth = () => {
  if (audioARef.value) {
    applyGlobalEQ(audioARef.value)
    applyGlobalEffects(audioARef.value)
  }
  if (audioBRef.value) {
    applyGlobalEQ(audioBRef.value)
    applyGlobalEffects(audioBRef.value)
  }
}

// 记录组件被停用前的播放状态
let wasPlaying = false
let playbackPosition = 0

onMounted(() => {
  audioStore.init(audioARef.value || null, audioBRef.value || null)
  audioOutputStore.init()

  applyToBoth()

  document.addEventListener('visibilitychange', onVisibilityChange)
  window.addEventListener('ceru-window-state-change', onVisibilityChange)
  window.addEventListener('ceru-wake', onVisibilityChange)

  const activeEl = audioStore.Audio.audio
  if (activeEl) {
    // Apply saved audio output device
    if (audioOutputStore.currentDeviceId !== 'default') {
      AudioManager.setAudioOutputDevice(activeEl, audioOutputStore.currentDeviceId)
    }

    // Initial stats update
    const stats = AudioManager.getAudioContextStats(activeEl)
    if (stats) {
      audioOutputStore.deviceStats = {
        sampleRate: stats.sampleRate,
        channelCount: stats.channels,
        latency: stats.latency
      }
    }
  }
  console.log('音频组件初始化完成（双槽）')
})

watch(
  () => audioOutputStore.currentDeviceId,
  async (newId) => {
    // 两个槽都切换输出设备
    if (audioARef.value) {
      await AudioManager.setAudioOutputDevice(audioARef.value, newId)
    }
    if (audioBRef.value) {
      await AudioManager.setAudioOutputDevice(audioBRef.value, newId)
    }
    const activeEl = audioStore.Audio.audio
    if (activeEl) {
      const stats = AudioManager.getAudioContextStats(activeEl)
      if (stats) {
        audioOutputStore.deviceStats = {
          sampleRate: stats.sampleRate,
          channelCount: stats.channels,
          latency: stats.latency
        }
      }
    }
  }
)

watch(
  [() => eqStore.enabled, () => eqStore.gains],
  () => {
    applyToBoth()
  },
  { deep: true }
)

watch(
  [
    () => effectStore.bassBoost,
    () => effectStore.surround,
    () => effectStore.balance,
    () => effectStore.loudness
  ],
  () => {
    applyToBoth()
  },
  { deep: true }
)

/**
 * 监听 srcA 变化：当 A 槽 URL 清空或更换时，先暂停并重置其解码状态
 */
watch(
  () => audioStore.Audio.srcA,
  async (newUrl) => {
    const a = audioARef.value
    if (!a) return
    // 当 src 被清空时：只在元素还带着 src 属性时才需要 removeAttribute + load 释放资源
    // 否则（crossfade completeCrossfade 已经清理过）会触发 MEDIA_ELEMENT_ERROR: Empty src
    if (!newUrl) {
      if (a.getAttribute('src')) {
        try {
          a.pause()
        } catch {}
        try {
          a.removeAttribute('src')
          a.load()
        } catch {}
      }
      return
    }
    // 如果元素刚被清空（readyState === HAVE_NOTHING）且已有有效 src，
    // 说明 playSong/setUrl 已启动加载，跳过避免干扰
    if (a.readyState === HTMLMediaElement.HAVE_NOTHING && a.src) {
      return
    }
    try {
      a.pause()
    } catch {}
    // 更换 URL 时先 load 触发加载
    await nextTick()
    try {
      a.load()
    } catch {}
  }
)

watch(
  () => audioStore.Audio.srcB,
  async (newUrl) => {
    const b = audioBRef.value
    if (!b) return
    if (!newUrl) {
      if (b.getAttribute('src')) {
        try {
          b.pause()
        } catch {}
        try {
          b.removeAttribute('src')
          b.load()
        } catch {}
      }
      return
    }
    // 如果元素刚被清空（readyState === HAVE_NOTHING）且已有有效 src，
    // 说明加载已在进行中，跳过避免干扰
    if (b.readyState === HTMLMediaElement.HAVE_NOTHING && b.src) {
      return
    }
    try {
      b.pause()
    } catch {}
    await nextTick()
    try {
      b.load()
    } catch {}
  }
)

// 新歌开始加载时重置初始缓冲标记，防止 handleWaiting 在初始缓冲阶段乱跳
watch(
  () => audioStore.Audio.url,
  () => {
    _initialBuffering = true
    _waitingSkipCount = 0
  }
)

// 组件被激活时（从缓存中恢复）
onActivated(() => {
  console.log('音频组件被激活')
  audioStore.init(audioARef.value || null, audioBRef.value || null)

  const activeEl = audioStore.Audio.audio
  // Re-apply output device
  if (activeEl && audioOutputStore.currentDeviceId !== 'default') {
    AudioManager.setAudioOutputDevice(activeEl, audioOutputStore.currentDeviceId)
  }

  // 如果之前正在播放，恢复播放
  if (wasPlaying && audioStore.Audio.url && activeEl) {
    if (playbackPosition > 0) {
      activeEl.currentTime = playbackPosition
      audioStore.setCurrentTime(playbackPosition)
    }
    audioStore.start().catch((error) => {
      console.error('恢复播放失败:', error)
    })
  }
})

// 组件被停用时（缓存但不销毁）
onDeactivated(() => {
  console.log('音频组件被停用')
  wasPlaying = audioStore.Audio.isPlay
  playbackPosition = audioStore.Audio.currentTime
})

// --- 缓冲卡顿跳跃恢复（落雪风格） ---
// 当音频卡在 waiting 状态（buffer underrun）时，尝试向前跳 3-6 秒绕过卡顿区
let _waitingSkipCount = 0
let _initialBuffering = true // 初始缓冲阶段不做跳跃，避免切歌后从 0 跳到 6-8 秒
const MAX_WAITING_SKIPS = 3
const handleWaiting = (slot: AudioSlot): void => {
  if (!isPrimarySlot(slot)) return
  // 初始缓冲阶段（新歌刚加载还没真正开始播）不做跳跃，让浏览器自然缓冲
  if (_initialBuffering) {
    console.log('Buffer underrun during initial buffering, waiting for playback to start naturally')
    return
  }
  const el = slot === 'A' ? audioARef.value : audioBRef.value
  if (!el || el.paused) return
  if (_waitingSkipCount >= MAX_WAITING_SKIPS) {
    _waitingSkipCount = 0
    // 跳了多次还卡着，触发 ended 走自动切歌
    console.warn(`Buffer underrun recovery failed after ${MAX_WAITING_SKIPS} skips, auto advance`)
    handleEnded(slot)
    return
  }
  _waitingSkipCount++
  // 随机向前跳 3-6 秒，跳过卡顿区域
  const skipAmount = 3 + Math.floor(Math.random() * 4) // 3-6 秒
  const targetTime = Math.min(el.currentTime + skipAmount, (el.duration || Infinity) - 1)
  console.log(`Buffer underrun: skipping forward ${skipAmount}s to ${targetTime.toFixed(1)}s`)
  el.currentTime = targetTime
  audioStore.setCurrentTime(targetTime)
}
// 播放正常恢复时重置 waiting 计数器
const resetWaitingSkip = (slot: AudioSlot): void => {
  if (!isPrimarySlot(slot)) return
  _waitingSkipCount = 0
  // 收到 playing 事件说明初始缓冲已完成，允许后续 buffer underrun 跳跃
  if (_initialBuffering) {
    _initialBuffering = false
  }
}

const forward = (name: string, val?: any) => {
  console.log('forward', name, val)
  window.dispatchEvent(new CustomEvent('global-music-control', { detail: { name, val } }))
}

const handleEnded = (slot: AudioSlot): void => {
  // 非活跃槽的 ended 事件忽略（过渡完成会由 crossfade 管理器推进）
  if (!isPrimarySlot(slot)) return
  // 若正在完成交叉淡化，ended 事件会由 crossfade 的 completeCrossfade 处理
  if (crossfadeState.active) return
  audioStore.Audio.isPlay = false
  audioStore.publish('ended')
  forward('autoNext')
}

const handleSeeked = (slot: AudioSlot): void => {
  if (!isPrimarySlot(slot)) return
  audioStore.publish('seeked')
}

const handlePlay = (slot: AudioSlot): void => {
  const el = slot === 'A' ? audioARef.value : audioBRef.value
  // 确保 AudioContext 处于运行状态
  if (el) {
    AudioManager.resumeContext(el)
  }

  // 非活跃槽在过渡期间也会 play，但不应更新 isPlay 状态（它本来就是 true）
  if (!isPrimarySlot(slot)) {
    return
  }

  audioStore.Audio.isPlay = true
  if (isAppWindowVisible()) {
    startSetupInterval()
  }
  const activeEl = audioStore.Audio.audio
  audioStore.Audio.duration = activeEl?.duration || 0
  audioStore.publish('play')
}

let rafId: number | null = null

/** 页面可见性变化或闲置结束时重启 rAF */
const onVisibilityChange = () => {
  if (!isAppWindowVisible()) {
    safeCancelRaf(rafId)
    rafId = null
    return
  }
  const activeEl = audioStore.Audio.audio
  if (activeEl) {
    updateProgress(activeEl, true)
  }
  if (!isPageIdle() && audioStore.Audio.isPlay && rafId === null) {
    startSetupInterval()
  }
}

const isRenderedDynamicElement = (selector: string): boolean => {
  const element = document.querySelector(selector)
  if (!(element instanceof HTMLElement)) return false
  return element.offsetParent !== null && element.getClientRects().length > 0
}

/** 检测是否有活跃的动态内容（频谱Canvas、WebGL着色器），决定是否使用高帧率 */
const hasDynamicContent = (): boolean => {
  return isRenderedDynamicElement('.visualizer-canvas') || isRenderedDynamicElement('.shader-background')
}

/** 安全取消 rAF / setTimeout */
const safeCancelRaf = (id: number | null) => {
  if (id === null) return
  try { cancelAnimationFrame(id) } catch {}
  try { clearTimeout(id) } catch {}
}

/** 进展更新节流：rAF 路径下也最多 100ms 刷新一次进度条 */
let _lastProgressUpdate = 0
const updateProgress = (el: HTMLAudioElement, force = false) => {
  const now = performance.now()
  if (!force && now - _lastProgressUpdate < 100) return
  _lastProgressUpdate = now
  audioStore.publish('timeupdate')
  audioStore.setCurrentTime(el.currentTime || 0)
}

const startSetupInterval = (): void => {
  if (rafId !== null) return
  const onFrame = () => {
    // 窗口隐藏时彻底停止 UI 刷新，音频播放链路不受影响
    if (!isAppWindowVisible()) {
      rafId = null
      return
    }
    const activeEl = audioStore.Audio.audio
    if (activeEl && !activeEl.paused) {
      updateProgress(activeEl)
    }
    // 帧率策略：
    // - 有真实可见的频谱/WebGL → requestAnimationFrame
    // - 普通页/设置页播放 → 4fps，降低截图这类静态界面的 CPU/GPU 压力
    // - 闲置状态 → 2fps，只保留低频进度同步
    if (hasDynamicContent()) {
      rafId = requestAnimationFrame(onFrame)
    } else if (isPageIdle()) {
      rafId = window.setTimeout(() => {
        rafId = requestAnimationFrame(onFrame)
      }, 500) as unknown as number
    } else {
      rafId = window.setTimeout(() => {
        rafId = requestAnimationFrame(onFrame)
      }, 250) as unknown as number
    }
  }
  rafId = requestAnimationFrame(onFrame)
}

const handlePause = (slot: AudioSlot): void => {
  if (!isPrimarySlot(slot)) return
  // 早期翻转后，老歌在 secondary 槽被 isPrimarySlot 过滤；此处的 primary pause
  // 只可能是用户主动暂停新歌，应正常更新 UI
  audioStore.Audio.isPlay = false
  audioStore.publish('pause')
  safeCancelRaf(rafId)
  rafId = null
}

const handleError = (slot: AudioSlot, event: Event): void => {
  const target = event.target as HTMLAudioElement
  // 非活跃槽的错误（如清空 src 时的 MEDIA_ELEMENT_ERROR / Empty src）不进入错误流程
  // 这是 crossfade 结束清理时的正常情况
  if (!isPrimarySlot(slot)) return
  console.error(`音频加载错误 slot=${slot}:`, target.error)
  audioStore.Audio.isPlay = false
  audioStore.publish('error')
}

const handleLoadedData = (slot: AudioSlot): void => {
  const el = slot === 'A' ? audioARef.value : audioBRef.value
  if (!el) return
  if (!isPrimarySlot(slot)) return
  audioStore.setDuration(el.duration || 0)
  console.log('音频数据加载完成 slot=', slot, 'duration:', el.duration)
}

const handleCanPlay = (slot: AudioSlot): void => {
  console.log('音频可以开始播放 slot=', slot)
  if (!isPrimarySlot(slot)) return
  audioStore.publish('canplay')
}

onUnmounted(() => {
  try {
    window.api.pingService.stop()
  } catch {}
  document.removeEventListener('visibilitychange', onVisibilityChange)
  window.removeEventListener('ceru-window-state-change', onVisibilityChange)
  window.removeEventListener('ceru-wake', onVisibilityChange)
  safeCancelRaf(rafId)
  rafId = null
  for (const el of [audioARef.value, audioBRef.value]) {
    if (!el) continue
    try {
      el.pause()
    } catch {}
    try {
      el.removeAttribute('src')
      el.load()
    } catch {}
  }
  audioStore.clearAllSubscribers()
})
</script>

<template>
  <div>
    <audio
      id="globaAudio"
      ref="audioARef"
      crossorigin="anonymous"
      preload="auto"
      :src="audioStore.Audio.srcA"
      @seeked="handleSeeked('A')"
      @waiting="handleWaiting('A')"
      @playing="resetWaitingSkip('A')"
      @play="handlePlay('A')"
      @pause="handlePause('A')"
      @error="handleError('A', $event)"
      @loadeddata="handleLoadedData('A')"
      @ended="handleEnded('A')"
      @canplay="handleCanPlay('A')"
    ></audio>
    <audio
      id="globaAudioB"
      ref="audioBRef"
      crossorigin="anonymous"
      preload="auto"
      :src="audioStore.Audio.srcB"
      @seeked="handleSeeked('B')"
      @waiting="handleWaiting('B')"
      @playing="resetWaitingSkip('B')"
      @play="handlePlay('B')"
      @pause="handlePause('B')"
      @error="handleError('B', $event)"
      @loadeddata="handleLoadedData('B')"
      @ended="handleEnded('B')"
      @canplay="handleCanPlay('B')"
    ></audio>
  </div>
</template>
