// 基础样式
import './assets/base.css'
import 'animate.css'
// 引入iconfont图标样式
import './assets/icon_font/iconfont.css'
import './assets/icon_font/iconfont.js'
// vue

import App from './App.vue'
import { createApp } from 'vue'
import LogtoClient, { LogtoConfig, UserScope } from '@logto/browser'
import config from './config'
const { endpoint, appId, resources } = config
import { Request } from '@renderer/utils/request'
// router
import router from './router'
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
// router
app.use(router)
// app
app.mount('#app')
