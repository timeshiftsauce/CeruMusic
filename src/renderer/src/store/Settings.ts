import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TagWriteOptions {
  basicInfo: boolean // 基础信息（标题、艺术家、专辑）
  cover: boolean // 封面
  lyrics: boolean // 普通歌词
}

export interface SettingsState {
  showFloatBall: boolean
  autoCacheMusic?: boolean
  directories?: {
    cacheDir: string
    downloadDir: string
  }
  tagWriteOptions?: TagWriteOptions
}

export const useSettingsStore = defineStore(
  'settings',
  () => {
    // 默认设置
    const defaultSettings: SettingsState = {
      showFloatBall: true,
      autoCacheMusic: true,
      tagWriteOptions: {
        basicInfo: true,
        cover: true,
        lyrics: true
      }
    }

    // 从本地存储加载设置（与默认值深合并）
    const loadSettings = (): SettingsState => {
      try {
        const saved = localStorage.getItem('appSettings')
        if (saved) {
          const parsed = JSON.parse(saved) as SettingsState
          return {
            ...defaultSettings,
            ...parsed,
            tagWriteOptions: {
              basicInfo:
                parsed.tagWriteOptions?.basicInfo ??
                (defaultSettings.tagWriteOptions as TagWriteOptions).basicInfo,
              cover:
                parsed.tagWriteOptions?.cover ??
                (defaultSettings.tagWriteOptions as TagWriteOptions).cover,
              lyrics:
                parsed.tagWriteOptions?.lyrics ??
                (defaultSettings.tagWriteOptions as TagWriteOptions).lyrics
            }
          }
        }
      } catch (error) {
        console.error('加载设置失败:', error)
      }
      return { ...defaultSettings }
    }

    const settings = ref<SettingsState>(loadSettings())

    // 保存设置到本地存储
    const saveSettings = () => {
      // 兜底确保关键字段不会丢失
      if (typeof settings.value.autoCacheMusic === 'undefined') {
        settings.value.autoCacheMusic = true
      }
      if (!settings.value.tagWriteOptions) {
        settings.value.tagWriteOptions = { basicInfo: true, cover: true, lyrics: true }
      }
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
  },
  {
    persist: false
  }
)
