import { watch } from 'vue'
import { isEqual, debounce } from 'lodash'
import { Request } from '@renderer/utils/request'
import { useSettingsStore } from '@renderer/store/Settings'
import { playSetting as usePlaySettingStore } from '@renderer/store/playSetting'
import { useAuthStore } from '@renderer/store/Auth'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'

const API_URL = 'https://api.ceru.shiqianjiang.cn/api'
const request = new Request(API_URL)

interface CloudSettings {
  appSettings: any
  playSettings: any
}

class SettingsSyncService {
  private isSyncing = false
  private isApplying = false
  private watchersInitialized = false

  // Initialize watchers (call this on app start or login)
  init() {
    if (this.watchersInitialized) return

    const settingsStore = useSettingsStore()
    const playSettingStore = usePlaySettingStore()
    const authStore = useAuthStore()

    // Watch for changes and sync to cloud if logged in
    const debouncedSync = debounce(() => {
      // Only sync if logged in and not currently processing a sync
      if (authStore.isAuthenticated && !this.isSyncing && !this.isApplying) {
        this.uploadSettings()
      }
    }, 5000) // Debounce 5 seconds

    watch(
      () => settingsStore.settings,
      () => {
        if (!this.isApplying) debouncedSync()
      },
      { deep: true }
    )

    watch(
      () => playSettingStore.$state,
      () => {
        if (!this.isApplying) debouncedSync()
      },
      { deep: true }
    )

    this.watchersInitialized = true
  }

  // Check sync status (call on login)
  /**
   * 检查并同步本地配置与云端配置
   * 该方法会对比本地和云端配置，如有差异则提示用户选择使用哪种配置
   */
  async checkSync() {
    const authStore = useAuthStore() // 获取认证状态存储
    // 如果用户未认证，直接返回
    if (!authStore.isAuthenticated) return

    try {
      this.isSyncing = true // 设置同步状态为进行中
      console.log('checkSync') // 输出同步检查日志
      // 获取云端配置
      const cloudSettings = await this.fetchCloudSettings()
      // 如果没有云端配置，则上传本地配置后返回
      if (!cloudSettings) {
        // No cloud settings, upload local
        return
      }

      // 获取本地配置
      const localSettings = this.getLocalSettings()

      // Deep compare settings
      const isDifferent = !isEqual(localSettings, cloudSettings)
      console.log('isDifferent', isDifferent)

      if (isDifferent) {
        // Show conflict dialog
        const confirm = await new Promise<string>((resolve) => {
          const dialog = DialogPlugin.confirm({
            header: '发现云端配置',
            body: '检测到云端配置与本地不一致，是否同步云端配置到本地？',
            confirmBtn: '使用云端配置',
            cancelBtn: '保留本地配置',
            onConfirm: () => {
              dialog.hide()
              resolve('cloud')
            },
            onClose: () => {
              dialog.hide()
              resolve('local')
            },
            onCancel: () => {
              dialog.hide()
              resolve('local')
            }
          })
        })

        if (confirm === 'cloud') {
          this.applySettings(cloudSettings)
          MessagePlugin.success('已同步云端配置')
        } else {
          // Keep local -> Upload to cloud
          await this.uploadSettings()
          MessagePlugin.success('已保留本地配置并更新至云端')
        }
      }
    } catch (error) {
      console.error('Sync check failed:', error)
    } finally {
      this.isSyncing = false
    }
  }

  private getLocalSettings() {
    const settingsStore = useSettingsStore()
    const playSettingStore = usePlaySettingStore()
    return {
      appSettings: settingsStore.settings,
      playSettings: playSettingStore.$state
    }
  }

  private async fetchCloudSettings(): Promise<CloudSettings | null> {
    try {
      const lastSyncTime = localStorage.getItem('settings_last-updated')
      const headers: Record<string, string> = {}
      if (lastSyncTime) {
        // Backend specifically checks 'Last-Updated' header
        headers['Last-Updated'] = lastSyncTime
      }

      // Use returnRaw=true to get the full response
      const res = await request.get(
        '/user-settings',
        {
          headers
        },
        true
      )
      console.log('res', res)

      if (res.status === 211) {
        console.log('SettingsSync: Cloud settings not modified (211)')
        return null
      }

      // Update last sync time from response header or current time
      // Backend sets 'Last-Updated' header, so we prioritize that.
      // Fallback to standard 'Last-Modified' or current time.
      const lastModified =
        res.headers['last-updated'] || res.headers['last-modified'] || new Date().toUTCString()
      localStorage.setItem('settings_last-updated', lastModified)
      if (res.status === 200 && !res.data.data.appSettings && !res.data.data.playSettings) {
        console.log('SettingsSync: Cloud settings not modified (200 with empty data)')
        await this.uploadSettings()
        return null
      }
      return res.data.data
    } catch (error: any) {
      if (error.response && error.response.status === 211) {
        console.log('SettingsSync: Cloud settings not modified (211 caught)')
        return null
      }
      // If 404 or other error, return null to imply no settings or failed to fetch
      return null
    }
  }

  private async uploadSettings() {
    try {
      const data = this.getLocalSettings()
      await request.post('/user-settings', data)
      localStorage.setItem('settings_last-updated', new Date().toUTCString())
      console.log('Settings uploaded to cloud')
    } catch (error) {
      console.error('Failed to upload settings:', error)
    }
  }

  private applySettings(cloudData: CloudSettings) {
    this.isApplying = true
    try {
      const settingsStore = useSettingsStore()
      const playSettingStore = usePlaySettingStore()

      if (cloudData.appSettings) {
        settingsStore.updateSettings(cloudData.appSettings)
      }

      if (cloudData.playSettings) {
        playSettingStore.$patch(cloudData.playSettings)
      }

      localStorage.setItem('settings_last-updated', new Date().toUTCString())
    } finally {
      // Use setTimeout to ensure watchers have fired and been ignored
      setTimeout(() => {
        this.isApplying = false
      }, 100)
    }
  }
}

export const settingsSyncService = new SettingsSyncService()
