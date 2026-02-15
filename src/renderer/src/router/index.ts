import { createWebHashHistory, createRouter, RouteRecordRaw, RouterOptions } from 'vue-router'

const appRouter: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'welcome',
    component: () => import('@renderer/views/welcome/index.vue')
  },
  {
    path: '/home',
    name: 'home',
    redirect: '/home/find',
    component: () => import('@renderer/views/home/index.vue'),
    children: [
      {
        path: 'find',
        name: 'find',
        component: () => import('@renderer/views/music/find.vue')
      },
      {
        path: 'songlist',
        name: 'songlist',
        component: () => import('@renderer/views/music/songlist.vue')
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
      },
      {
        path: 'list/:id',
        name: 'list',
        component: () => import('@renderer/views/music/list.vue')
      },
      {
        path: 'download',
        name: 'download',
        component: () => import('@renderer/views/download/index.vue')
      },
      {
        path: 'profile',
        name: 'profile',
        component: () => import('@renderer/views/user/Profile.vue')
      }
    ]
  },
  {
    path: '/settings',
    name: 'settings',
    meta: {
      transitionIn: 'animate__fadeIn',
      transitionOut: 'animate__fadeOut'
    },
    component: () => import('@renderer/views/settings/index.vue')
  }
]
const routes: RouteRecordRaw[] = [
  {
    path: '/',
    children: appRouter
  },
  {
    path: '/desktop-lyric',
    name: 'desktop-lyric',
    component: () => import('@renderer/views/DeskTopLyric/DeskTopLyric.vue')
  }
]

function setAnimate(routerObj: RouteRecordRaw[]) {
  for (let i = 0; i < routerObj.length; i++) {
    const item = routerObj[i]
    if (item.children && item.children.length > 0) {
      setAnimate(item.children)
    } else {
      if (item.meta) continue
      item.meta = item.meta || {}
      item.meta.transitionIn = 'animate__fadeInRight'
      item.meta.transitionOut = 'animate__fadeOutLeft'
    }
  }
}
setAnimate(routes)

const option: RouterOptions = {
  history: createWebHashHistory(),
  routes
}

const router = createRouter(option)
export default router
