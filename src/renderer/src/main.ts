import './assets/main.css'
import './assets/base.css';

// 引入组件库的少量全局样式变量
import 'tdesign-vue-next/es/style/index.css' //tdesign 组件样式
// 引入iconfont图标样式
import './assets/icon_font/iconfont.css'
import './assets/icon_font/iconfont.js'

import App from './App.vue'
import { createApp } from 'vue'
const app = createApp(App)
import { createPinia } from 'pinia'
import router from './router'

app.use(router)
app.use(createPinia())
app.mount('#app')
