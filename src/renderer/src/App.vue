<script setup lang="ts">
import { onMounted } from 'vue'
import GlobalAudio from './components/Play/GlobalAudio.vue'

onMounted(() => {
  // 设置测试音频URL
})
</script>

<template>
  <router-view />
  <GlobalAudio />
</template>
