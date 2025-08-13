import './assets/main.css'

import App from './App.vue'
import { createApp } from 'vue'
const app = createApp(App)
import { createPinia } from 'pinia'
import router from './router'

app.use(router)
app.use(createPinia())
app.use(createPinia())
app.mount('#app')
