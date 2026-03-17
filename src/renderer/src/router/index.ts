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
        path: 'recognize',
        name: 'recognize',
        component: () => import('@renderer/views/music/recognize.vue')
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
        path: 'local/edit-tag',
        name: 'local-tag-editor',
        component: () => import('@renderer/views/music/LocalTagEditorPage.vue')
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
  },
  {
    path: '/recognition-worker',
    name: 'recognition-worker',
    component: () => import('@renderer/views/music/RecognitionWorker.vue')
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

// 路由预加载优化
const preloadRoutes = (routes: RouteRecordRaw[]) => {
  for (const route of routes) {
    if (route.component && typeof route.component === 'function') {
      try {
        // 触发 import()，忽略结果，利用浏览器缓存机制实现预加载
        ;(route.component as () => Promise<any>)()
      } catch (e) {
        console.warn(`Failed to preload route: ${route.path}`, e)
      }
    }
    if (route.children) {
      preloadRoutes(route.children)
    }
  }
}

const flattenRoutes = (routes: RouteRecordRaw[], list: RouteRecordRaw[] = []) => {
  for (const route of routes) {
    list.push(route)
    if (route.children) {
      flattenRoutes(route.children, list)
    }
  }
  return list
}

const getRoutePreloadEnabled = () => {
  try {
    const saved = localStorage.getItem('appSettings')
    if (saved) {
      const parsed = JSON.parse(saved) as { routePreloadEnabled?: boolean }
      if (typeof parsed.routePreloadEnabled === 'boolean') {
        return parsed.routePreloadEnabled
      }
    }
  } catch {
    return true
  }
  return true
}

// 在浏览器空闲时进行预加载
const startPreload = () => {
  if (!getRoutePreloadEnabled()) return
  const idleCallback =
    window.requestIdleCallback || ((cb: IdleRequestCallback) => window.setTimeout(cb, 200))
  const queue = flattenRoutes(routes).filter(
    (route) => route.component && typeof route.component === 'function'
  )
  const runBatch = () => {
    if (!getRoutePreloadEnabled()) return
    const route = queue.shift()
    if (!route) return
    try {
      ;(route.component as () => Promise<any>)()
    } catch (e) {
      console.warn(`Failed to preload route: ${route.path}`, e)
    }
    idleCallback(runBatch)
  }
  const schedule = () => idleCallback(runBatch)
  if (document.readyState === 'complete') {
    setTimeout(schedule, 1500)
  } else {
    window.addEventListener(
      'load',
      () => {
        setTimeout(schedule, 1500)
      },
      { once: true }
    )
  }
}

// 启动预加载
startPreload()

export default router
