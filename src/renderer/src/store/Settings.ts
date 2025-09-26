import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TagWriteOptions {
  basicInfo: boolean // 基础信息（标题、艺术家、专辑）
  cover: boolean // 封面
  lyrics: boolean // 普通歌词
}

export interface SettingsState {
  showFloatBall: boolean
  directories?: {
    cacheDir: string
    downloadDir: string
  }
  tagWriteOptions?: TagWriteOptions
}

export const useSettingsStore = defineStore('settings', () => {
  // 从本地存储加载设置，如果没有则使用默认值
  const loadSettings = (): SettingsState => {
    try {
      const savedSettings = localStorage.getItem('appSettings')
      if (savedSettings) {
        return JSON.parse(savedSettings)
      }
    } catch (error) {
      console.error('加载设置失败:', error)
    }

    // 默认设置
    return {
      showFloatBall: true,
      tagWriteOptions: {
        basicInfo: true,
        cover: true,
        lyrics: true
      }
    }
  }

  const settings = ref<SettingsState>(loadSettings())

  // 保存设置到本地存储
  const saveSettings = () => {
    localStorage.setItem('appSettings', JSON.stringify(settings.value))
  }

  // 更新设置
  const updateSettings = (newSettings: Partial<SettingsState>) => {
    settings.value = { ...settings.value, ...newSettings }
    saveSettings()
  }

  // 切换悬浮球显示状态
  const toggleFloatBall = () => {
    settings.value.showFloatBall = !settings.value.showFloatBall
    saveSettings()
  }

  return {
    settings,
    updateSettings,
    toggleFloatBall
  }
})
