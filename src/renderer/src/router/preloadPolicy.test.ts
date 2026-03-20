import type { RouteRecordRaw } from 'vue-router'
import {
  DEFAULT_PRELOAD_ROUTE_NAMES,
  DEFAULT_ROUTE_PRELOAD_ENABLED,
  createRoutePreloadQueue,
  parseRoutePreloadEnabled
} from './preloadPolicy'

describe('route preload policy', () => {
  it('should default route preload to disabled when storage is empty or invalid', () => {
    expect(DEFAULT_ROUTE_PRELOAD_ENABLED).toBe(false)
    expect(parseRoutePreloadEnabled(null)).toBe(false)
    expect(parseRoutePreloadEnabled('{invalid')).toBe(false)
    expect(parseRoutePreloadEnabled(JSON.stringify({ routePreloadEnabled: 'yes' }))).toBe(false)
  })

  it('should only preload high-frequency route components', () => {
    const lazy = () => Promise.resolve({})
    const routes: RouteRecordRaw[] = [
      { path: '/', name: 'welcome', component: lazy },
      {
        path: '/home',
        name: 'home',
        children: [
          { path: 'find', name: 'find', component: lazy },
          { path: 'songlist', name: 'songlist', component: lazy },
          { path: 'search', name: 'search', component: lazy },
          { path: 'list/:id', name: 'list', component: lazy },
          { path: 'local', name: 'local', component: lazy }
        ]
      },
      { path: '/settings', name: 'settings', component: lazy }
    ]

    const queue = createRoutePreloadQueue(routes)
    const names = queue.map((route) => route.name)

    expect(names).toEqual(Array.from(DEFAULT_PRELOAD_ROUTE_NAMES))
  })
})
