// 基础样式
import './assets/base.css'
import 'animate.css'
// 引入iconfont图标样式
import './assets/icon_font/iconfont.css'
import './assets/icon_font/iconfont.js'
// vue
import App from './App.vue'
import { createApp } from 'vue'
const app = createApp(App)
// router
import router from './router'
// pinia
import { createPinia } from 'pinia'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'

// pinia
const pinia = createPinia()
pinia.use(piniaPluginPersistedstate)
app.use(pinia)
//router
app.use(router)

//app
app.mount('#app')
