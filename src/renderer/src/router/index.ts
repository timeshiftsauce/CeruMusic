import { createWebHashHistory, createRouter } from 'vue-router'


const routes = [
  {
    path: '/',
    name: 'welcome',
    component: () => import('@renderer/views/welcome/index.vue'),
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})
export default router
