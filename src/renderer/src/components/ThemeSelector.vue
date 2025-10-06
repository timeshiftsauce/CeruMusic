<!--
  主题选择器组件 - 支持暗色模式切换
-->
<template>
  <div class="theme-selector">
    <div class="theme-options">
      <div
        v-for="theme in themes"
        :key="theme.name"
        class="theme-option"
        :class="{ active: currentTheme === theme.name }"
        @click="selectTheme(theme.name)"
      >
        <div class="theme-preview" :style="{ backgroundColor: theme.color }"></div>
        <span class="theme-label">{{ theme.label }}</span>
      </div>
    </div>

    <div class="dark-mode-toggle">
      <label class="toggle-switch">
        <input type="checkbox" :checked="isDarkMode" @change="toggleDarkMode" />
        <span class="slider"></span>
        <span class="toggle-label">暗色模式</span>
      </label>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'

// 主题配置
const themes = [
  { name: 'default', label: '默认', color: '#2ba55b' },
  { name: 'pink', label: '粉色', color: '#fc5e7e' },
  { name: 'blue', label: '蓝色', color: '#57b4ff' },
  { name: 'cyan', label: '青色', color: '#3ac2b8' },
  { name: 'orange', label: '橙色', color: '#fb9458' }
]

const currentTheme = ref('default')
const isDarkMode = ref(false)

// 应用主题
const applyTheme = (themeName: string, darkMode: boolean = false) => {
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

  // 通知全局（App.vue）同步 Naive UI 主题
  window.dispatchEvent(new CustomEvent('theme-changed'))
}

// 选择主题
const selectTheme = (themeName: string) => {
  currentTheme.value = themeName
  applyTheme(themeName, isDarkMode.value)
}

// 切换暗色模式
const toggleDarkMode = () => {
  isDarkMode.value = !isDarkMode.value
  applyTheme(currentTheme.value, isDarkMode.value)
}

// 检测系统主题偏好
const detectSystemTheme = () => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true
  }
  return false
}

// 加载保存的设置
const loadSavedSettings = () => {
  const savedTheme = localStorage.getItem('selected-theme')
  const savedDarkMode = localStorage.getItem('dark-mode')

  if (savedTheme && themes.some((t) => t.name === savedTheme)) {
    currentTheme.value = savedTheme
  }

  if (savedDarkMode !== null) {
    isDarkMode.value = savedDarkMode === 'true'
  } else {
    // 如果没有保存的设置，检测系统偏好
    isDarkMode.value = detectSystemTheme()
  }

  applyTheme(currentTheme.value, isDarkMode.value)
}

// 监听系统主题变化
const setupSystemThemeListener = () => {
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaQuery.addEventListener('change', (e) => {
      const savedDarkMode = localStorage.getItem('dark-mode')
      // 如果用户没有手动设置暗色模式，则跟随系统主题
      if (savedDarkMode === null) {
        isDarkMode.value = e.matches
        applyTheme(currentTheme.value, isDarkMode.value)
      }
    })
  }
}

onMounted(() => {
  setupSystemThemeListener()
  loadSavedSettings()
})
</script>

<style scoped>
.theme-selector {
  padding: 16px;
  background: var(--td-bg-color-container);
  border-radius: var(--td-radius-medium);
  border: 1px solid var(--td-border-level-1-color);
}

.theme-options {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
  flex-wrap: wrap;
}

.theme-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: var(--td-radius-medium);
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid transparent;
}

.theme-option:hover {
  background: var(--td-bg-color-container-hover);
}

.theme-option.active {
  border-color: var(--td-brand-color);
  background: var(--td-brand-color-light);
}

.theme-preview {
  width: 32px;
  height: 32px;
  border-radius: var(--td-radius-circle);
  border: 2px solid var(--td-border-level-1-color);
}

.theme-label {
  font-size: var(--td-font-size-body-small);
  color: var(--td-text-color-primary);
  font-weight: 500;
}

.dark-mode-toggle {
  padding-top: 16px;
  border-top: 1px solid var(--td-border-level-1-color);
}

.toggle-switch {
  display: flex;
  align-items: center;
  gap: 12px;
  cursor: pointer;
}

.toggle-switch input {
  display: none;
}

.slider {
  position: relative;
  width: 44px;
  height: 24px;
  background: var(--td-bg-color-component);
  border-radius: 12px;
  transition: background-color 0.2s ease;
  border: 1px solid var(--td-border-level-1-color);
}

.slider::before {
  content: '';
  position: absolute;
  top: 2px;
  left: 2px;
  width: 18px;
  height: 18px;
  background: var(--td-bg-color-container);
  border-radius: 50%;
  transition: transform 0.2s ease;
  box-shadow: var(--td-shadow-1);
}

.toggle-switch input:checked + .slider {
  background: var(--td-brand-color);
}

.toggle-switch input:checked + .slider::before {
  transform: translateX(20px);
}

.toggle-label {
  font-size: var(--td-font-size-body-medium);
  color: var(--td-text-color-primary);
  font-weight: 500;
}

/* 暗色模式下的特殊样式 */
:root[theme-mode='dark'] .theme-selector {
  background: var(--td-bg-color-container);
  border-color: var(--td-border-level-1-color);
}

:root[theme-mode='dark'] .theme-preview {
  border-color: var(--td-border-level-2-color);
}
</style>
