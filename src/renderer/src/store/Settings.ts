import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface TagWriteOptions {
  basicInfo: boolean // 基础信息（标题、艺术家、专辑）
  cover: boolean // 封面
  lyrics: boolean // 普通歌词
  downloadLyrics: boolean // 单独下载歌词文件
  lyricFormat: 'lrc' | 'word-by-word' // 歌词格式
}

export interface SettingsState {
  showFloatBall: boolean
  autoCacheMusic?: boolean
  directories?: {
    cacheDir: string
    downloadDir: string
  }
  filenameTemplate?: string
  tagWriteOptions?: TagWriteOptions
  autoUpdate?: boolean
  autoImportPlaylistOnOpen?: boolean
  suppressImportPrompt?: boolean
  lyricFontFamily?: string
  closeToTray?: boolean
  hasConfiguredCloseBehavior?: boolean
  theme?: string // 主题
  isDarkMode?: boolean // 暗色模式
  springFestivalDisabled?: boolean
}

export const useSettingsStore = defineStore(
  'settings',
  () => {
    // 默认设置
    const defaultSettings: SettingsState = {
      showFloatBall: true,
      autoCacheMusic: true,
      filenameTemplate: '%t - %s',
      tagWriteOptions: {
        basicInfo: true,
        cover: true,
        lyrics: true,
        downloadLyrics: false,
        lyricFormat: 'word-by-word'
      },
      autoUpdate: true,
      autoImportPlaylistOnOpen: false,
      suppressImportPrompt: false,
      lyricFontFamily: 'PingFangSC-Semibold',
      closeToTray: true,
      hasConfiguredCloseBehavior: false,
      theme: 'default',
      isDarkMode: false,
      springFestivalDisabled: false
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
                (defaultSettings.tagWriteOptions as TagWriteOptions).lyrics,
              downloadLyrics:
                parsed.tagWriteOptions?.downloadLyrics ??
                (defaultSettings.tagWriteOptions as TagWriteOptions).downloadLyrics,
              lyricFormat:
                parsed.tagWriteOptions?.lyricFormat ??
                (defaultSettings.tagWriteOptions as TagWriteOptions).lyricFormat
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
      if (!settings.value.lyricFontFamily) {
        settings.value.lyricFontFamily = 'PingFangSC-Semibold'
      }
      if (typeof settings.value.closeToTray === 'undefined') {
        settings.value.closeToTray = true
      }
      if (typeof settings.value.hasConfiguredCloseBehavior === 'undefined') {
        settings.value.hasConfiguredCloseBehavior = false
      }
      if (!settings.value.theme) {
        settings.value.theme = 'default'
      }
      if (typeof settings.value.isDarkMode === 'undefined') {
        settings.value.isDarkMode = false
      }
      if (typeof settings.value.springFestivalDisabled === 'undefined') {
        settings.value.springFestivalDisabled = false
      }
      if (!settings.value.tagWriteOptions) {
        settings.value.tagWriteOptions = {
          basicInfo: true,
          cover: true,
          lyrics: true,
          downloadLyrics: false,
          lyricFormat: 'word-by-word'
        }
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

    const isSpringFestivalWindow = () => {
      const now = new Date()
      const today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
      return today >= 20260217 && today <= 20260223
    }

    const shouldUseSpringFestivalTheme = () => {
      const preview = localStorage.getItem('ceru_welcome_newyear_preview')
      if (preview === '1') return true
      return isSpringFestivalWindow() && !settings.value.springFestivalDisabled
    }

    const disableSpringFestivalTheme = () => {
      settings.value.springFestivalDisabled = true
      saveSettings()
    }

    const enableSpringFestivalTheme = () => {
      settings.value.springFestivalDisabled = false
      saveSettings()
    }

    return {
      settings,
      updateSettings,
      toggleFloatBall,
      isSpringFestivalWindow,
      shouldUseSpringFestivalTheme,
      disableSpringFestivalTheme,
      enableSpringFestivalTheme
    }
  },
  {
    // @ts-ignore
    persist: true
  }
)
