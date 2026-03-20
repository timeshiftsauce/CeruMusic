import type { RouteRecordRaw } from 'vue-router'

export const DEFAULT_ROUTE_PRELOAD_ENABLED = false
export const DEFAULT_PRELOAD_ROUTE_NAMES = ['find', 'songlist', 'search', 'list'] as const

type RoutePreloadSettings = {
  routePreloadEnabled?: boolean
}

export const parseRoutePreloadEnabled = (
  saved: string | null,
  fallback = DEFAULT_ROUTE_PRELOAD_ENABLED
) => {
  if (!saved) return fallback

  try {
    const parsed = JSON.parse(saved) as RoutePreloadSettings
    return typeof parsed.routePreloadEnabled === 'boolean' ? parsed.routePreloadEnabled : fallback
  } catch {
    return fallback
  }
}

export const getRoutePreloadEnabled = (
  storage?: Pick<Storage, 'getItem'> | null,
  fallback = DEFAULT_ROUTE_PRELOAD_ENABLED
) => {
  try {
    return parseRoutePreloadEnabled(storage?.getItem('appSettings') ?? null, fallback)
  } catch {
    return fallback
  }
}

export const flattenRoutes = (routes: RouteRecordRaw[], list: RouteRecordRaw[] = []) => {
  for (const route of routes) {
    list.push(route)
    if (route.children) {
      flattenRoutes(route.children, list)
    }
  }
  return list
}

export const createRoutePreloadQueue = (
  routes: RouteRecordRaw[],
  allowNames = DEFAULT_PRELOAD_ROUTE_NAMES
) => {
  const allowSet = new Set<string>(allowNames)
  return flattenRoutes(routes).filter(
    (route) =>
      typeof route.name === 'string' &&
      allowSet.has(route.name) &&
      route.component &&
      typeof route.component === 'function'
  )
}
