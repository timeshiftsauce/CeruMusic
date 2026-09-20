import DefaultTheme from 'vitepress/theme'
import './style.scss'
import './dark.css'
import MyLayout from './MyLayout.vue'
import PluginDiagram from './components/PluginDiagram.vue'
import PluginLearningDemo from './components/PluginLearningDemo.vue'
import PluginLessonNav from './components/PluginLessonNav.vue'
// history.scrollRestoration = 'manual'

export default {
  extends: DefaultTheme,
  Layout: MyLayout,
  enhanceApp({ app, router, siteData }) {
    app.component('PluginDiagram', PluginDiagram)
    app.component('PluginLearningDemo', PluginLearningDemo)
    app.component('PluginLessonNav', PluginLessonNav)
    // ...
  }
}
