<!--
  - Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
  -
  - This software is the confidential and proprietary information of 时迁酱.
  - Unauthorized copying of this file, via any medium is strictly prohibited.
  -
  - @author 时迁酱，无聊的霜霜，Star
  - @since 2025-9-19
  - @version 1.0
  -->

<script setup lang="ts">
import { onMounted } from 'vue'
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
  setupSystemThemeListener()
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
  const savedDarkMode = localStorage.getItem('dark-mode')

  let themeName = 'default'
  let isDarkMode = false

  if (savedTheme && themes.some((t) => t.name === savedTheme)) {
    themeName = savedTheme
  }

  if (savedDarkMode !== null) {
    isDarkMode = savedDarkMode === 'true'
  } else {
    // 如果没有保存的设置，检测系统偏好
    isDarkMode = detectSystemTheme()
  }

  applyTheme(themeName, isDarkMode)
}

const applyTheme = (themeName, darkMode = false) => {
  const documentElement = document.documentElement

  // 移除之前的主题属性
  documentElement.removeAttribute('theme-mode')
  documentElement.removeAttribute('data-theme')

  // 应用主题色彩
  if (themeName !== 'default') {
    documentElement.setAttribute('theme-mode', themeName)
  }

  // 应用明暗模式
  if (darkMode) {
    documentElement.setAttribute('data-theme', 'dark')
  } else {
    documentElement.setAttribute('data-theme', 'light')
  }

  // 保存到本地存储
  localStorage.setItem('selected-theme', themeName)
  localStorage.setItem('dark-mode', darkMode.toString())
}

// 检测系统主题偏好
const detectSystemTheme = () => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true
  }
  return false
}

// 监听系统主题变化
const setupSystemThemeListener = () => {
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
      const savedDarkMode = localStorage.getItem('dark-mode')
      // 如果用户没有手动设置暗色模式，则跟随系统主题
      if (savedDarkMode === null) {
        const savedTheme = localStorage.getItem('selected-theme') || 'default'
        applyTheme(savedTheme, e.matches)
      }
    })
  }
}
</script>

<template>
  <div class="page">
    <router-view v-slot="{ Component }">
      <Transition
        :enter-active-class="`animate__animated animate__fadeIn  pagesApp`"
        :leave-active-class="`animate__animated animate__fadeOut pagesApp`"
      >
        <component :is="Component" />
      </Transition>
    </router-view>
    <GlobalAudio />
    <FloatBall />
    <PluginNoticeDialog />
    <UpdateProgress />
  </div>
</template>
<style>
.pagesApp {
  width: 100vw;
  position: fixed;
}
</style>
