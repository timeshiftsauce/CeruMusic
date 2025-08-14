<script setup lang="ts">
// const ipcHandle = (): void => window.electron.ipcRenderer.send('ping')
import { ControlAudioStore } from '@renderer/store/ControlAudio'
const Audio = ControlAudioStore()
Audio.Audio.url =
  'https://m801.music.126.net/20250814224734/9822eac7d8f043a33883fe30796fa0c6/jdymusic/obj/wo3DlMOGwrbDjj7DisKw/32407718767/f58f/b1e1/cf73/d70b39ba746ca874e3d1bd0466ec1227.mp3'
</script>

<template>
  <router-view />
  <t-button @click="Audio.Audio.isPlay ? Audio.stop() : Audio.start()">play</t-button>
  <GlobalAudio />
</template>
