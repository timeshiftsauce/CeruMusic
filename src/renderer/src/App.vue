<script setup lang="ts">
import { onMounted } from 'vue'
import GlobalAudio from './components/Play/GlobalAudio.vue'
import FloatBall from './components/AI/FloatBall.vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
const userInfo = LocalUserDetailStore()

onMounted(() => {
  userInfo.init()
  // 设置测试音频URL
})
</script>

<template>
  <router-view />
  <GlobalAudio />
  <FloatBall />
</template>
