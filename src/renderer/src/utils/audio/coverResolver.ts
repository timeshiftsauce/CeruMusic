import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { parseInterval, strSim } from './audioHelpers'

const SEARCHABLE_SOURCE_ORDER = ['wy', 'tx', 'kg', 'kw', 'mg', 'bd', 'git']
const NON_SEARCHABLE_SOURCES = new Set(['local', 'share', 'all'])
const coverCache = new Map<string, string | null>()
const pending = new Map<string, Promise<string | null>>()

const normalize = (value?: string | number | null): string =>
  String(value || '')
    .toLowerCase()
    .replace(/\s+/g, '')
    .trim()

const uniq = <T>(items: T[]): T[] => [...new Set(items)]

const getCacheKey = (song: Partial<SongList>): string =>
  `${normalize(song.name)}::${normalize(song.singer)}`

const hasUsableCover = (img?: string | null): img is string => {
  if (!img || typeof img !== 'string') return false
  const value = img.trim()
  if (!value) return false
  if (/^(https?:|data:image\/|blob:|file:)/i.test(value)) return true
  return false
}

const getSources = (originalSource?: string, userInfo?: any): string[] => {
  const supportedSources = userInfo?.supportedSources || {}
  const qualityMap = userInfo?.sourceQualityMap || {}
  const configuredSources = uniq([...Object.keys(supportedSources), ...Object.keys(qualityMap)])
  const sources = configuredSources.length > 0 ? configuredSources : SEARCHABLE_SOURCE_ORDER
  return sources
    .filter((source) => source !== originalSource)
    .filter((source) => !NON_SEARCHABLE_SOURCES.has(source))
    .sort((a, b) => {
      const ai = SEARCHABLE_SOURCE_ORDER.indexOf(a)
      const bi = SEARCHABLE_SOURCE_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })
}

const getSearchKeywords = (song: Partial<SongList>): string[] =>
  uniq(
    [
      `${song.name || ''} ${song.singer || ''}`.trim(),
      song.name || '',
      `${song.name || ''} ${song.albumName || ''}`.trim()
    ].filter(Boolean)
  )

const scoreCandidate = (candidate: any, original: Partial<SongList>): number => {
  const nameScore = strSim(candidate?.name || '', original.name || '')
  const singerScore = strSim(candidate?.singer || '', original.singer || '')
  let score = nameScore * 0.65 + singerScore * 0.35

  const originalDuration = parseInterval(String(original.interval || ''))
  const candidateDuration = parseInterval(String(candidate?.interval || ''))
  if (originalDuration > 0 && candidateDuration > 0) {
    const diff = Math.abs(originalDuration - candidateDuration)
    if (diff <= 8) score += 0.2
    else if (diff > 45) score -= 0.35
  }

  return score
}

export async function resolveSongCover(
  song: Partial<SongList>,
  options: { signal?: AbortSignal; userInfo?: any } = {}
): Promise<string | null> {
  if (hasUsableCover(song.img)) return song.img
  if (!song.name || !song.singer) return null

  const cacheKey = getCacheKey(song)
  if (coverCache.has(cacheKey)) return coverCache.get(cacheKey) || null
  const existing = pending.get(cacheKey)
  if (existing) return existing

  const task = (async () => {
    const sources = getSources(song.source, options.userInfo || LocalUserDetailStore().userInfo)
    const keywords = getSearchKeywords(song)
    const requests = sources.flatMap((source) =>
      keywords.map(async (keyword) => {
        if (options.signal?.aborted) return []
        try {
          const res = await (window as any).api.music.requestSdk('search', {
            source,
            keyword,
            page: 1,
            limit: 20
          })
          return (res?.list || []).map((item: any) => ({ ...item, source }))
        } catch {
          return []
        }
      })
    )

    const results = (await Promise.all(requests)).flat()
    if (options.signal?.aborted) return null

    const matched = results
      .filter((item) => hasUsableCover(item?.img))
      .map((item) => ({ item, score: scoreCandidate(item, song) }))
      .filter((entry) => entry.score >= 0.55)
      .sort((a, b) => b.score - a.score)

    const img = matched[0]?.item?.img || null
    coverCache.set(cacheKey, img)
    return img
  })()

  pending.set(cacheKey, task)
  try {
    return await task
  } finally {
    pending.delete(cacheKey)
  }
}