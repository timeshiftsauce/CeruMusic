export interface CoverAnalysisResult {
  dominantColor: {
    r: number
    g: number
    b: number
  }
  useBlackText: boolean
}

type CoverAnalyzer = (imageSrc: string) => Promise<CoverAnalysisResult>

export const resolvePlayerCoverSrc = (coverSrc?: string | null, fallbackCover = '') => {
  if (typeof coverSrc !== 'string') return fallbackCover
  const trimmed = coverSrc.trim()
  return trimmed || fallbackCover
}

export const createCoverAnalysisCache = (analyzer: CoverAnalyzer, maxEntries = 32) => {
  const resolved = new Map<string, CoverAnalysisResult>()
  const inflight = new Map<string, Promise<CoverAnalysisResult>>()

  const touch = (key: string, value: CoverAnalysisResult) => {
    resolved.delete(key)
    resolved.set(key, value)
    if (resolved.size > maxEntries) {
      const oldestKey = resolved.keys().next().value
      if (oldestKey) {
        resolved.delete(oldestKey)
      }
    }
  }

  return {
    async get(coverSrc?: string | null) {
      const key = resolvePlayerCoverSrc(coverSrc)
      const cached = resolved.get(key)
      if (cached) {
        touch(key, cached)
        return cached
      }

      const pending = inflight.get(key)
      if (pending) {
        return pending
      }

      const promise = analyzer(key)
        .then((result) => {
          touch(key, result)
          inflight.delete(key)
          return result
        })
        .catch((error) => {
          inflight.delete(key)
          throw error
        })

      inflight.set(key, promise)
      return promise
    },
    clear() {
      inflight.clear()
      resolved.clear()
    }
  }
}
