<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref, onActivated, onDeactivated } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'

const audioStore = ControlAudioStore()
const audioMeta = ref<HTMLAudioElement>()

// 提供订阅方法给子组件使用
provide('audioSubscribe', audioStore.subscribe)

// 记录组件被停用前的播放状态
let wasPlaying = false
let playbackPosition = 0

onMounted(() => {
  audioStore.init(audioMeta.value)
  console.log('音频组件初始化完成')
})

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

const handleEnded = (): void => {
  audioStore.Audio.isPlay = false
  audioStore.publish('ended')
}

const handleSeeked = (): void => {
  audioStore.publish('seeked')
}

const handlePlay = (): void => {
  audioStore.Audio.isPlay = true
  startSetupInterval()
  audioStore.Audio.duration = audioMeta.value?.duration || 0
  audioStore.publish('play')
}

const startSetupInterval = (): void => {
  const onFrame = () => {
    if (audioMeta.value && !audioMeta.value.paused) {
      audioStore.publish('timeupdate')

      audioStore.setCurrentTime((audioMeta.value && audioMeta.value.currentTime) || 0)

      requestAnimationFrame(onFrame)
    }
  }
  requestAnimationFrame(onFrame)
}

const handlePause = (): void => {
  audioStore.Audio.isPlay = false
  audioStore.publish('pause')
}

const handleError = (event: Event): void => {
  const target = event.target as HTMLAudioElement
  console.error('音频加载错误:', target.error)
  audioStore.Audio.isPlay = false
  audioStore.publish('error')
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
}

onUnmounted(() => {
  // 组件卸载时清空所有订阅者
  audioStore.clearAllSubscribers()
})
</script>

<template>
  <div>
    <audio
      ref="audioMeta"
      preload="auto"
      :src="audioStore.Audio.url"
      @ended="handleEnded"
      @seeked="handleSeeked"
      @play="handlePlay"
      @pause="handlePause"
      @error="handleError"
      @loadeddata="handleLoadedData"
      @canplay="handleCanPlay"
    ></audio>
  </div>
</template>
