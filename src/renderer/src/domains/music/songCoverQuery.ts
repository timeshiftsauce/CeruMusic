import { fillMissingSongCovers } from '../../utils/music/fillMissingSongCovers'

type SongCoverEntity = {
  songmid?: string | number
  id?: string | number
  name?: string
  singer?: string
  albumName?: string
  img?: string | null
}

type CreateSongCoverQueryOptions<T extends SongCoverEntity> = {
  fetchCover: (source: string, song: T) => Promise<string>
  getCacheKey?: (source: string, song: T) => string
  defaultConcurrency?: number
  maxEntries?: number
}

type FillSongCoverQueryOptions<T extends SongCoverEntity> = {
  songs: T[]
  source: string
  offset?: number
  concurrency?: number
  fallback?: string
}

const DEFAULT_CONCURRENCY = 6
const DEFAULT_MAX_ENTRIES = 300

const touchCache = (cache: Map<string, string>, key: string, value: string, maxEntries: number) => {
  if (cache.has(key)) cache.delete(key)
  cache.set(key, value)
  while (cache.size > maxEntries) {
    const firstKey = cache.keys().next().value
    if (firstKey === undefined) break
    cache.delete(firstKey)
  }
}

const defaultCacheKey = <T extends SongCoverEntity>(source: string, song: T) => {
  const stableKey = song.songmid ?? song.id ?? [song.name, song.singer, song.albumName].join(':')
  return `${source}:${String(stableKey)}`
}

export const createSongCoverQuery = <T extends SongCoverEntity>({
  fetchCover,
  getCacheKey = defaultCacheKey,
  defaultConcurrency = DEFAULT_CONCURRENCY,
  maxEntries = DEFAULT_MAX_ENTRIES
}: CreateSongCoverQueryOptions<T>) => {
  const resolved = new Map<string, string>()
  const inflight = new Map<string, Promise<string>>()
  let requestVersion = 0

  const resolveCover = async (source: string, song: T) => {
    const key = getCacheKey(source, song)
    const cached = resolved.get(key)
    if (cached !== undefined) {
      touchCache(resolved, key, cached, maxEntries)
      return cached
    }

    const pending = inflight.get(key)
    if (pending) return pending

    const request = fetchCover(source, song)
      .then((url) => {
        const normalized = url || ''
        touchCache(resolved, key, normalized, maxEntries)
        return normalized
      })
      .finally(() => {
        inflight.delete(key)
      })

    inflight.set(key, request)
    return request
  }

  return {
    reset: () => {
      requestVersion += 1
    },
    clearCache: () => {
      resolved.clear()
      inflight.clear()
    },
    fill: async ({ songs, source, offset = 0, concurrency, fallback }: FillSongCoverQueryOptions<T>) => {
      const currentVersion = requestVersion
      await fillMissingSongCovers({
        songs,
        source,
        offset,
        concurrency: concurrency ?? defaultConcurrency,
        fallback,
        isStale: () => currentVersion !== requestVersion,
        fetchCover: resolveCover
      })
    }
  }
}
