import { createWebHashHistory, createRouter, RouteRecordRaw, RouterOptions } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'welcome',
    component: () => import('@renderer/views/welcome/index.vue')
  },
  {
    path: '/home',
    redirect: '/home/find',
    component: () => import('@renderer/views/home/index.vue'),
    children: [
      {
        path: '',
        redirect: '/home/find'
      },
      {
        path: 'find',
        name: 'find',
        component: () => import('@renderer/views/music/find.vue')
      },
      {
        path: 'local',
        name: 'local',
        component: () => import('@renderer/views/music/local.vue')
      },
      {
        path: 'recent',
        name: 'recent',
        component: () => import('@renderer/views/music/recent.vue')
      },
      {
        path: 'search',
        name: 'search',
        component: () => import('@renderer/views/music/search.vue')
      }
    ]
  },
  {
    path: '/settings',
    name: 'settings',
    component: () => import('@renderer/views/settings/index.vue')
  },
  {
    path: '/plugins',
    name: 'plugins',
    component: () => import('@renderer/views/settings/plugins.vue')
  }
]
const option: RouterOptions = {
  history: createWebHashHistory(),
  routes
}

const router = createRouter(option)

export default router
