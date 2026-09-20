import { createApp } from 'vue'
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'
import App from './App.vue'
export default defineSurface((ctx) => {
  const app = createApp(App, { context: ctx })
  app.mount(ctx.root)
  return () => app.unmount()
})
