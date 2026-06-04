import { toRaw } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import type { SongList } from '@renderer/types/audio'
import { buildQualityFormats, compareQuality } from '@common/utils/quality'

export type QualityFormat = { type: string; size?: string }

const availabilityCache = new Map<string, boolean>()
const downloadabilityCache = new Map<string, boolean>()

const songIdentity = (song: any): string =>
  String(song.songmid || song.hash || `${song.name || ''}_${song.singer || ''}`)

const cacheKey = (song: any, quality: string): string =>
  `${song.source || ''}:${songIdentity(song)}:${quality}`

export const getDeclaredQualityFormats = (song: any): QualityFormat[] => {
  if (!song?.source) return []
  const sourceTypes = Array.isArray(song?.types) && song.types.length > 0 ? song.types : ['128k']
  const seen = new Set<string>()
  return buildQualityFormats(sourceTypes)
    .filter((item) => {
      if (!item.type || seen.has(item.type)) return false
      seen.add(item.type)
      return true
    })
    .sort((a, b) => compareQuality(a.type, b.type))
}

export const isQualityPlayable = async (song: SongList | any, quality: string): Promise<boolean> => {
  if (!song || !quality) return false
  if (song.source === 'local') return false
  if (song.url && typeof song.url === 'string') return true

  const key = cacheKey(song, quality)
  if (availabilityCache.has(key)) return availabilityCache.get(key) === true

  try {
    const localUserStore = LocalUserDetailStore()
    if (!localUserStore.userSource.pluginId) {
      availabilityCache.set(key, false)
      return false
    }

    const urlData = await window.api.music.requestSdk('getMusicUrl', {
      pluginId: localUserStore.userSource.pluginId,
      source: song.source,
      songInfo: toRaw(song) as any,
      quality,
      isCache: false
    })

    const ok = typeof urlData === 'string' && !!urlData && !urlData.includes('error')
    availabilityCache.set(key, ok)
    return ok
  } catch {
    availabilityCache.set(key, false)
    return false
  }
}

export const isQualityDownloadable = async (song: SongList | any, quality: string): Promise<boolean> => {
  if (!song || !quality) return false
  if (song.source === 'local') return false
  if (song.url && typeof song.url === 'string') return true

  const key = cacheKey(song, quality)
  if (downloadabilityCache.has(key)) return downloadabilityCache.get(key) === true

  try {
    const localUserStore = LocalUserDetailStore()
    if (!localUserStore.userSource.pluginId) {
      downloadabilityCache.set(key, false)
      return false
    }

    const result = await window.api.music.requestSdk('checkDownloadable', {
      pluginId: localUserStore.userSource.pluginId,
      source: song.source,
      songInfo: toRaw(song) as any,
      quality,
      isCache: false
    })

    const ok = !!result?.ok
    downloadabilityCache.set(key, ok)
    return ok
  } catch {
    downloadabilityCache.set(key, false)
    return false
  }
}

export const getDownloadableQualityFormats = async (song: SongList | any): Promise<QualityFormat[]> => {
  const declared = getDeclaredQualityFormats(song)
  if (declared.length === 0) return []

  const checked = await Promise.all(
    declared.map(async (quality) => ({
      quality,
      ok: await isQualityDownloadable(song, quality.type)
    }))
  )

  return checked.filter((item) => item.ok).map((item) => item.quality)
}

export const getVerifiedQualityFormats = async (song: SongList | any): Promise<QualityFormat[]> => {
  const declared = getDeclaredQualityFormats(song)
  if (declared.length === 0) return []

  const checked = await Promise.all(
    declared.map(async (quality) => ({
      quality,
      ok: await isQualityPlayable(song, quality.type)
    }))
  )

  return checked.filter((item) => item.ok).map((item) => item.quality)
}