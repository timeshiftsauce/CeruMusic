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
import { storeToRefs } from 'pinia'
import AudioManager from '@renderer/utils/audio/audioManager'

const audioStore = ControlAudioStore()
const eqStore = useEqualizerStore()
const effectStore = useAudioEffectsStore()
const audioMeta = ref<HTMLAudioElement>()
// 提供订阅方法给子组件使用
provide('audioSubscribe', audioStore.subscribe)

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
  const { bassBoost, surround, balance } = storeToRefs(effectStore)

  // Bass Boost
  const targetBass = bassBoost.value.enabled ? bassBoost.value.gain : 0
  AudioManager.setBassBoost(el, targetBass)

  // Surround
  const targetSurround = surround.value.enabled ? surround.value.mode : 'off'
  AudioManager.setSurroundMode(el, targetSurround)

  // Balance
  const targetBalance = balance.value.enabled ? balance.value.value : 0
  AudioManager.setBalance(el, targetBalance)
}

// 记录组件被停用前的播放状态
let wasPlaying = false
let playbackPosition = 0

onMounted(() => {
  audioStore.init(audioMeta.value)
  if (audioMeta.value) {
    applyGlobalEQ(audioMeta.value)
    applyGlobalEffects(audioMeta.value)
  }
  console.log('音频组件初始化完成')
  // window.api.ping(handleEnded)
})

watch(
  [() => eqStore.enabled, () => eqStore.gains],
  () => {
    if (audioMeta.value) {
      applyGlobalEQ(audioMeta.value)
    }
  },
  { deep: true }
)

watch(
  [() => effectStore.bassBoost, () => effectStore.surround, () => effectStore.balance],
  () => {
    if (audioMeta.value) {
      applyGlobalEffects(audioMeta.value)
    }
  },
  { deep: true }
)

/**
 * 监听 URL 变化，先重置旧音频再加载新音频，避免旧解码/缓冲滞留
 */
watch(
  () => audioStore.Audio.url,
  async (newUrl) => {
    const a = audioMeta.value
    if (!a) return
    try {
      a.pause()
    } catch {}
    a.removeAttribute('src')
    a.load()
    await nextTick()
    // 模板绑定会把 src 更新为 newUrl，这里再触发一次 load
    if (newUrl) {
      a.load()
    }
  }
)
// 组件被激活时（从缓存中恢复）
onActivated(() => {
  console.log('音频组件被激活')
  if (audioMeta.value) {
    // 重新初始化音频元素
    audioStore.init(audioMeta.value)

    // 如果之前正在播放，恢复播放
    if (wasPlaying && audioStore.Audio.url) {
      // 恢复播放位置
      if (audioMeta.value && playbackPosition > 0) {
        audioMeta.value.currentTime = playbackPosition
        audioStore.setCurrentTime(playbackPosition)
      }

      // 恢复播放
      audioStore.start().catch((error) => {
        console.error('恢复播放失败:', error)
      })
    }
  }
})

// 组件被停用时（缓存但不销毁）
onDeactivated(() => {
  console.log('音频组件被停用')
  // 保存当前播放状态
  wasPlaying = audioStore.Audio.isPlay
  playbackPosition = audioStore.Audio.currentTime
})

// 音频事件处理函数
// const handleTimeUpdate = (): void => {
//   if (audioMeta.value) {
//     audioStore.setCurrentTime(audioMeta.value.currentTime)
//     audioStore.Audio.duration = audioMeta.value.duration || 0
//   }
// }
const forward = (name: string, val?: any) => {
  console.log('forward', name, val)
  window.dispatchEvent(new CustomEvent('global-music-control', { detail: { name, val } }))
}

const handleEnded = (): void => {
  audioStore.Audio.isPlay = false
  audioStore.publish('ended')
  forward('playNext')
}

const handleSeeked = (): void => {
  audioStore.publish('seeked')
}

const handlePlay = (): void => {
  // 确保 AudioContext 处于运行状态（解决 Win11 等系统下的自动挂起问题）
  if (audioMeta.value) {
    AudioManager.resumeContext(audioMeta.value)
  }

  audioStore.Audio.isPlay = true
  startSetupInterval()
  audioStore.Audio.duration = audioMeta.value?.duration || 0
  audioStore.publish('play')
}

let rafId: number | null = null
const startSetupInterval = (): void => {
  if (rafId !== null) return
  const onFrame = () => {
    if (audioMeta.value && !audioMeta.value.paused) {
      audioStore.publish('timeupdate')
      audioStore.setCurrentTime((audioMeta.value && audioMeta.value.currentTime) || 0)
    }
    rafId = requestAnimationFrame(onFrame)
  }
  rafId = requestAnimationFrame(onFrame)
}

const handlePause = (): void => {
  audioStore.Audio.isPlay = false
  audioStore.publish('pause')
  // 停止单实例 rAF
  if (rafId !== null) {
    try {
      cancelAnimationFrame(rafId)
    } catch {}
    rafId = null
  }
}

const handleError = (event: Event): void => {
  const target = event.target as HTMLAudioElement
  console.error('音频加载错误:', target.error)
  audioStore.Audio.isPlay = false
  audioStore.publish('error')
  // window.api.pingService.stop()
}

const handleLoadedData = (): void => {
  if (audioMeta.value) {
    audioStore.setDuration(audioMeta.value.duration || 0)
    console.log('音频数据加载完成，时长:', audioMeta.value.duration)
  }
}

const handleCanPlay = (): void => {
  console.log('音频可以开始播放')
  audioStore.publish('canplay')
  // window.api.pingService.start()
}

onUnmounted(() => {
  // 组件卸载时清空所有订阅者
  try {
    window.api.pingService.stop()
  } catch {}
  // 停止 rAF
  if (rafId !== null) {
    try {
      cancelAnimationFrame(rafId)
    } catch {}
    rafId = null
  }
  if (audioMeta.value) {
    try {
      audioMeta.value.pause()
    } catch {}
    audioMeta.value.removeAttribute('src')
    audioMeta.value.load()
  }
  audioStore.clearAllSubscribers()
})
</script>

<template>
  <div>
    <audio
      id="globaAudio"
      ref="audioMeta"
      crossorigin="anonymous"
      preload="auto"
      :src="audioStore.Audio.url"
      @seeked="handleSeeked"
      @play="handlePlay"
      @pause="handlePause"
      @error="handleError"
      @loadeddata="handleLoadedData"
      @ended="handleEnded"
      @canplay="handleCanPlay"
    ></audio>
  </div>
</template>
