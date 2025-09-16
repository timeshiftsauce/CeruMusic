import DefaultTheme from 'vitepress/theme'
import './style.scss'
import './dark.css'
import MyLayout from './MyLayout.vue'
// history.scrollRestoration = 'manual'

export default {
  extends: DefaultTheme,
  Layout: MyLayout,
  enhanceApp({ app, router, siteData }) {
    // ...
  }
}
