type RouteLike = {
  matched?: Array<{ name?: string | symbol | null }>
}

const ROOT_KEEP_ALIVE_NAMES = new Set(['home'])

export const shouldKeepAliveAtRoot = (route: RouteLike): boolean => {
  return Array.isArray(route.matched)
    ? route.matched.some(
        (record) => typeof record?.name === 'string' && ROOT_KEEP_ALIVE_NAMES.has(record.name)
      )
    : false
}
