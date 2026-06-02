// 基础样式
import './assets/base.css'
import 'animate.css'
import 'uno.css'
import '@unocss/reset/tailwind-compat.css'
// 引入iconfont图标样式
import './assets/icon_font/iconfont.css'
import './assets/icon_font/iconfont.js'
// vue

import App from './App.vue'
import { createApp, watch } from 'vue'
import LogtoClient, { LogtoConfig, UserScope } from '@logto/browser'
import config from './config'
const { endpoint, appId, resources } = config
import { Request } from '@renderer/utils/request'
// router
import router from './router'
import { useSettingsStore } from '@renderer/store/Settings'
// pinia
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
const appConfig: LogtoConfig = {
  endpoint,
  appId,
  resources,
  scopes: [
    UserScope.Email,
    UserScope.Phone,
    UserScope.CustomData,
    UserScope.Identities,
    UserScope.Profile
  ]
}
const logtoClient = new LogtoClient(appConfig)
Request.setLogtoClient(logtoClient)
config.instance = logtoClient

// 挂载
const app = createApp(App)
// pinia
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)

// macOS 状态栏歌词：watch 设置变化并通知主进程
const settingsStore = useSettingsStore(pinia)
watch(
  () => settingsStore.settings.macStatusBarLyricEnabled,
  (enabled) => {
    ;(window as any).electron?.ipcRenderer?.send?.('set-mac-status-bar-lyric-enabled', !!enabled)
  },
  { immediate: true }
)
// router
app.use(router)
// app
app.mount('#app')
