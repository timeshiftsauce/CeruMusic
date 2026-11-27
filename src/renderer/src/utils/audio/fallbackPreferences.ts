export const fallbackStrategies = ['plugin', 'source', 'quality'] as const
export type FallbackStrategy = (typeof fallbackStrategies)[number]
export type LimitedFallbackStrategy = Exclude<FallbackStrategy, 'quality'>

export const DEFAULT_FALLBACK_ATTEMPTS = 3

export function normalizeFallbackAttempts(value: unknown): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0
    ? value
    : DEFAULT_FALLBACK_ATTEMPTS
}

export const fallbackStrategyLabels: Record<FallbackStrategy, string> = {
  plugin: '跨插件尝试',
  source: '跨音源换源',
  quality: '音质降级'
}

export interface FallbackPreferences {
  enabled: boolean
  strategies: Record<FallbackStrategy, boolean>
  order: FallbackStrategy[]
  sourceAttempts: number
  pluginAttempts: number
  autoNext: boolean
  preferPlatforms: boolean
  platformOrder: string[]
  pluginOrder: string[]
}

export function orderedIds<T extends string>(
  available: readonly T[],
  preferred: readonly string[]
) {
  return [
    ...new Set([...preferred.filter((id): id is T => available.includes(id as T)), ...available])
  ]
}

export function fallbackPreferences(saved?: Partial<FallbackPreferences>): FallbackPreferences {
  const ids = (value: unknown) =>
    Array.isArray(value)
      ? [...new Set(value.filter((id): id is string => typeof id === 'string'))]
      : []
  return {
    enabled: saved?.enabled ?? true,
    strategies: { plugin: true, source: true, quality: true, ...saved?.strategies },
    order: orderedIds(fallbackStrategies, ids(saved?.order)),
    sourceAttempts: normalizeFallbackAttempts(saved?.sourceAttempts),
    pluginAttempts: normalizeFallbackAttempts(saved?.pluginAttempts),
    autoNext: saved?.autoNext ?? true,
    preferPlatforms: saved?.preferPlatforms ?? false,
    platformOrder: ids(saved?.platformOrder),
    pluginOrder: ids(saved?.pluginOrder)
  }
}
