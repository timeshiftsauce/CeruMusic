<template>
  <div class="theme-selector">
    <div class="theme-selector-trigger" @click="toggleDropdown">
      <div class="current-theme">
        <div class="theme-color-preview" :style="{ backgroundColor: currentThemeColor }"></div>
        <span class="theme-name">{{ currentThemeName }}</span>
      </div>
      <svg
        class="dropdown-icon"
        :class="{ rotated: isDropdownOpen }"
        viewBox="0 0 24 24"
        width="16"
        height="16"
      >
        <path d="M7 10l5 5 5-5z" fill="currentColor" />
      </svg>
    </div>

    <transition name="dropdown">
      <div v-if="isDropdownOpen" class="theme-dropdown">
        <div
          v-for="theme in themes"
          :key="theme.name"
          class="theme-option"
          :class="{ active: currentTheme === theme.name }"
          @click="selectTheme(theme.name)"
        >
          <div class="theme-color-dot" :style="{ backgroundColor: theme.color }"></div>
          <span class="theme-label">{{ theme.label }}</span>
          <svg
            v-if="currentTheme === theme.name"
            class="check-icon"
            viewBox="0 0 24 24"
            width="16"
            height="16"
          >
            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" fill="currentColor" />
          </svg>
        </div>
      </div>
    </transition>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const isDropdownOpen = ref(false)
const currentTheme = ref('default')

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
    currentTheme.value = savedTheme
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

const currentThemeColor = computed(() => {
  const theme = themes.find((t) => t.name === currentTheme.value)
  return theme ? theme.color : '#2ba55b'
})

const currentThemeName = computed(() => {
  const theme = themes.find((t) => t.name === currentTheme.value)
  return theme ? theme.label : '默认'
})

const toggleDropdown = () => {
  isDropdownOpen.value = !isDropdownOpen.value
}

const selectTheme = (themeName) => {
  if (themeName === currentTheme.value) {
    isDropdownOpen.value = false
    return
  }

  currentTheme.value = themeName
  applyTheme(themeName)
  isDropdownOpen.value = false
}

const handleClickOutside = (event) => {
  const themeSelector = event.target.closest('.theme-selector')
  if (!themeSelector) {
    isDropdownOpen.value = false
  }
}

onMounted(() => {
  loadSavedTheme()
  document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
  document.removeEventListener('click', handleClickOutside)
})
</script>

<style scoped>
.theme-selector {
  position: relative;
  display: inline-block;
  width: 200px;
}

.theme-selector-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--td-bg-color-container, #ffffff);
  border: 1px solid var(--td-component-border, #e2e8f0);
  border-radius: var(--td-radius-medium, 6px);
  cursor: pointer;
  transition: all 0.2s ease;
  min-width: 120px;
}

.theme-selector-trigger:hover {
  background: var(--td-bg-color-container-hover, #f8fafc);
  border-color: var(--td-brand-color-hover, #cbd5e1);
}

.current-theme {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}

.theme-color-preview {
  width: 16px;
  height: 16px;
  border-radius: 50%;
  border: 2px solid var(--td-bg-color-container, #ffffff);
  box-shadow: 0 0 0 1px var(--td-component-border, #e2e8f0);
}

.theme-name {
  font-size: 14px;
  color: var(--td-text-color-primary, #1e293b);
  font-weight: 500;
}

.dropdown-icon {
  color: var(--td-text-color-secondary, #64748b);
  transition: transform 0.2s ease;
}

.dropdown-icon.rotated {
  transform: rotate(180deg);
}

.theme-dropdown {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 4px;
  background: var(--td-bg-color-container, #ffffff);
  border: 1px solid var(--td-component-border, #e2e8f0);
  border-radius: var(--td-radius-medium, 6px);
  box-shadow: var(
    --td-shadow-2,
    0 4px 6px -1px rgba(0, 0, 0, 0.1),
    0 2px 4px -1px rgba(0, 0, 0, 0.06)
  );
  z-index: 1000;
  overflow: hidden;
}

.theme-option {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 16px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.theme-option:hover {
  background: var(--td-bg-color-container-hover, #f8fafc);
}

.theme-option.active {
  background: var(--td-brand-color-light, #eff6ff);
  color: var(--td-text-color-primary, #1e293b);
}

.theme-color-dot {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 2px solid var(--td-bg-color-container, #ffffff);
  box-shadow: 0 0 0 1px var(--td-component-border, #e2e8f0);
}

.theme-label {
  flex: 1;
  font-size: 14px;
  color: var(--td-text-color-primary, #1e293b);
}

.check-icon {
  color: var(--td-brand-color, #3b82f6);
}

/* 下拉动画 */
.dropdown-enter-active,
.dropdown-leave-active {
  transition: all 0.2s ease;
}

.dropdown-enter-from {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

.dropdown-leave-to {
  opacity: 0;
  transform: translateY(-8px) scale(0.95);
}

/* 响应式设计 */
@media (max-width: 640px) {
  .theme-selector-trigger {
    min-width: 100px;
    padding: 6px 10px;
  }

  .theme-name {
    font-size: 13px;
  }

  .theme-option {
    padding: 10px 14px;
  }
}
</style>
