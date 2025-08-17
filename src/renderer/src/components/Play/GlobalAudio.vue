<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'

const audioStore = ControlAudioStore()
const audioMeta = ref<HTMLAudioElement>()

// 提供订阅方法给子组件使用
provide('audioSubscribe', audioStore.subscribe)

onMounted(() => {
  audioStore.init(audioMeta.value)
  console.log('音频组件初始化完成')
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
const loaded = (): void => {
  audioStore.setDuration((audioMeta.value && (audioMeta.value.duration as number)) || 0)
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
