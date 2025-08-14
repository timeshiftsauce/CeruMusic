<script setup lang="ts">
import { onMounted, onUnmounted, provide, ref } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
const Audio = ControlAudioStore()
provide('setAudioEnd', setEndCallback)
provide('setAudioSeeked', setSeekedCallback)
const timeupdate = () => {}
let endCallback: Function[] = []
let seekedCallback: Function[] = []
const audioMeta = ref<HTMLAudioElement>()

onMounted(() => {
  Audio.init(audioMeta.value)
  console.log('init', audioMeta, '1111')
})

function setEndCallback(fn: Function): void {
  if (typeof endCallback !== 'function') {
    endCallback.push(fn)
  } else {
    throw new Error('Callback must be a function')
  }
}
function setSeekedCallback(fn: Function): void {
  if (typeof seekedCallback !== 'function') {
    seekedCallback.push(fn)
  } else {
    throw new Error('Callback must be a function')
  }
}

const end = (): void => {
  endCallback?.forEach((fn) => fn)
}
const seeked = (): void => {
  seekedCallback?.forEach((fn) => fn)
}
onUnmounted(() => {
  endCallback = []
  seekedCallback = []
})
</script>

<template>
  <div>
    <audio
      ref="audioMeta"
      preload="auto"
      :src="Audio.Audio.url"
      @timeupdate="timeupdate"
      @ended="end"
      @seeked="seeked"
    />
  </div>
</template>
