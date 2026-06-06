import { createWebHashHistory, createRouter, RouteRecordRaw, RouterOptions } from 'vue-router'
import { isPageIdle } from '@renderer/utils/idleSleep'
import { isAppWindowVisible } from '@renderer/utils/appWindowState'

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
        path: 'radio/:id',
        name: 'radio-detail',
        component: () => import('@renderer/views/music/radio.vue')
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

  // 当前路径下用户最可能跳转的路由优先,大体积/低频路由放最后
  const priorityOrder = [
    '/home/find',
    '/home/songlist',
    '/home/local',
    '/home/search',
    '/home/download',
    '/home/recent',
    '/home/profile',
    '/home/recognize',
    '/home/list/:id',
    '/home/radio/:id',
    '/home/local/edit-tag',
    '/settings',
    '/desktop-lyric',
    '/recognition-worker'
  ]
  const flat = flattenRoutes(routes).filter(
    (route) => route.component && typeof route.component === 'function'
  )
  const queue = flat.sort((a, b) => {
    const ai = priorityOrder.indexOf(a.path)
    const bi = priorityOrder.indexOf(b.path)
    return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
  })

  // 用户最近交互(滚动/点击/键入)时间戳;在交互期间暂停预加载
  let lastInteract = 0
  const markInteract = () => {
    lastInteract = performance.now()
  }
  window.addEventListener('scroll', markInteract, { passive: true, capture: true })
  window.addEventListener('pointerdown', markInteract, { passive: true, capture: true })
  window.addEventListener('keydown', markInteract, { passive: true, capture: true })
  window.addEventListener('wheel', markInteract, { passive: true, capture: true })

  const INTERACT_COOLDOWN_MS = 1500
  const GAP_BETWEEN_CHUNKS_MS = 400
  const shouldPausePreload = () => !isAppWindowVisible() || !isPageIdle()

  const runBatch = (deadline?: IdleDeadline) => {
    if (!getRoutePreloadEnabled()) return

    if (shouldPausePreload()) {
      setTimeout(() => idleCallback(runBatch), INTERACT_COOLDOWN_MS)
      return
    }

    // 用户刚交互过 → 推迟,避免和滚动重绘抢主线程/GPU
    if (performance.now() - lastInteract < INTERACT_COOLDOWN_MS) {
      setTimeout(() => idleCallback(runBatch), INTERACT_COOLDOWN_MS)
      return
    }
    // idle 时间窗口太小也跳过这一轮,避免在 deadline 临近时还硬塞 chunk 解析
    if (deadline && deadline.timeRemaining() < 8 && !deadline.didTimeout) {
      idleCallback(runBatch)
      return
    }

    const route = queue.shift()
    if (!route) {
      window.removeEventListener('scroll', markInteract, { capture: true } as any)
      window.removeEventListener('pointerdown', markInteract, { capture: true } as any)
      window.removeEventListener('keydown', markInteract, { capture: true } as any)
      window.removeEventListener('wheel', markInteract, { capture: true } as any)
      return
    }
    try {
      ;(route.component as () => Promise<any>)()
    } catch (e) {
      console.warn(`Failed to preload route: ${route.path}`, e)
    }
    // 每解析完一个 chunk,留出 400ms 间隔让浏览器处理输入/绘制
    setTimeout(() => idleCallback(runBatch), GAP_BETWEEN_CHUNKS_MS)
  }

  const schedule = () => idleCallback(runBatch)
  // 首屏加载完后多等一会再开预加载,给当前页一点呼吸时间
  if (document.readyState === 'complete') {
    setTimeout(schedule, 5000)
  } else {
    window.addEventListener(
      'load',
      () => {
        setTimeout(schedule, 5000)
      },
      { once: true }
    )
  }
}

// 启动预加载
startPreload()

export default router
