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
import { computed } from 'vue'
import { useSettingsStore } from '@renderer/store/Settings'
import {
  THEME_OPTIONS,
  normalizeThemeName,
  resolveThemeState
} from '@renderer/utils/theme/themeState'

const settingsStore = useSettingsStore()

const themes = THEME_OPTIONS

const currentTheme = computed(() =>
  resolveThemeState({
    theme: settingsStore.settings.theme,
    isDarkMode: settingsStore.hasStoredThemePreference
      ? settingsStore.settings.isDarkMode
      : undefined,
    systemDarkMode:
      typeof window !== 'undefined' &&
      !!window.matchMedia &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
  }).themeName
)
const isDarkMode = computed(
  () =>
    resolveThemeState({
      theme: settingsStore.settings.theme,
      isDarkMode: settingsStore.hasStoredThemePreference
        ? settingsStore.settings.isDarkMode
        : undefined,
      systemDarkMode:
        typeof window !== 'undefined' &&
        !!window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches
    }).isDarkMode
)

// 选择主题
const selectTheme = (themeName: string) => {
  settingsStore.updateSettings({
    theme: normalizeThemeName(themeName)
  })
}

// 切换暗色模式
const toggleDarkMode = () => {
  settingsStore.updateSettings({
    isDarkMode: !isDarkMode.value
  })
}
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
