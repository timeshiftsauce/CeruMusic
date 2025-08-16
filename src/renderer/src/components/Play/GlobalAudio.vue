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
const handleTimeUpdate = (): void => {
  if (audioMeta.value) {
    audioStore.setCurrentTime(audioMeta.value.currentTime)
    audioStore.Audio.duration = audioMeta.value.duration || 0
  }
  audioStore.publish('timeupdate')
}

const handleEnded = (): void => {
  audioStore.Audio.isPlay = false
  audioStore.publish('ended')
}

const handleSeeked = (): void => {
  audioStore.publish('seeked')
}

const handlePlay = (): void => {
  audioStore.Audio.isPlay = true
  audioStore.publish('play')
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
  audioStore.setDuration(
    audioMeta.value && (audioMeta.value.duration as number)||0
  )
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
      @timeupdate="handleTimeUpdate"
      @ended="handleEnded"
      @seeked="handleSeeked"
      @play="handlePlay"
      @pause="handlePause"
      @error="handleError"
      @load="loaded"
    />
  </div>
</template>
