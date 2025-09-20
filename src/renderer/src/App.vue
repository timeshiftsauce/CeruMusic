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
  if (savedTheme && themes.some((t) => t.name === savedTheme)) {
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
