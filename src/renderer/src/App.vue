<script setup lang="ts">
import { onMounted } from 'vue'
import GlobalAudio from './components/Play/GlobalAudio.vue'
import FloatBall from './components/AI/FloatBall.vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useAutoUpdate } from './composables/useAutoUpdate'

const userInfo = LocalUserDetailStore()
const { checkForUpdates } = useAutoUpdate()

import './assets/main.css'
import './assets/theme/blue.css'
import './assets/theme/pink.css'
import './assets/theme/orange.css'
import './assets/theme/cyan.css'

onMounted(() => {
  userInfo.init()
  loadSavedTheme()
  
  // 应用启动后延迟3秒检查更新，避免影响启动速度
  setTimeout(() => {
    checkForUpdates()
  }, 3000)
})

// 基于现有主题文件的配置
const themes = [
  { name: 'default', label: '默认', color: '#2ba55b' },
  { name: 'pink', label: '粉色', color: '#fc5e7e' },
  { name: 'blue', label: '蓝色', color: '#57b4ff' },
  { name: 'cyan', label: '青色', color: '#3ac2b8' },
  { name: 'orange', label: '橙色', color: '#fb9458' }
]

const loadSavedTheme = () => {
  const savedTheme = localStorage.getItem('selected-theme')
  if (savedTheme && themes.some(t => t.name === savedTheme)) {
    applyTheme(savedTheme)
  }
}

const applyTheme = (themeName) => {
  const documentElement = document.documentElement
  
  // 移除之前的主题
  documentElement.removeAttribute('theme-mode')
  
  // 应用新主题（如果不是默认主题）
  if (themeName !== 'default') {
    documentElement.setAttribute('theme-mode', themeName)
  }
  
  // 保存到本地存储
  localStorage.setItem('selected-theme', themeName)
}
</script>

<template>
  <router-view />
  <GlobalAudio />
  <FloatBall />
  <UpdateProgress />
</template>
