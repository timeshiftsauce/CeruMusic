import { createWebHashHistory, createRouter, RouteRecordRaw, RouterOptions } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'welcome',
    component: () => import('@renderer/views/welcome/index.vue')
  },
  {
    path: '/home',
    name: 'home',
    component: () => import('@renderer/views/home/index.vue'),
    children: [
      {
        path: '',
        name: 'music',
        component: () => import('@renderer/views/music/list.vue')
      }
    ]
  }
]
const option: RouterOptions = {
  history: createWebHashHistory(),
  routes
}

const router = createRouter(option)

export default router
