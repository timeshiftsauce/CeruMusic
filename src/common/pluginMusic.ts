import { formatQualitySize } from './utils/quality'
import {
  normalizeMusicItem,
  normalizeQualities,
  durationMilliseconds,
  isPublicTrackRef
} from './musicItem'
export { filterLyricInfo, sanitizeLyricText, toPlayerLyrics } from './pluginLyrics'

const legacyPublicTrackOwners = new Set(['local.linglan-source'])

/**
 * App songs keep public provider identity, not the plugin that happened to
 * discover them. This also upgrades Linglan's pre-scope track references so
 * existing imported playlists follow the user's current capability routing.
 */
export function normalizeAppTrackRef(ref: any): any {
  if (!ref || typeof ref !== 'object' || ref.kind !== 'track') return ref
  const legacyLinglanTrack =
    legacyPublicTrackOwners.has(String(ref.pluginId || '')) &&
    ref.connectionId === undefined &&
    ref.data?.song &&
    typeof ref.data.song === 'object'
  if (!isPublicTrackRef(ref) && !legacyLinglanTrack) return ref
  if (ref.providerId == null || ref.providerId === '' || ref.id == null || ref.id === '') return ref
  return {
    providerId: String(ref.providerId),
    kind: 'track',
    id: String(ref.id),
    scope: 'provider'
  }
}

export function isProviderTrackRef(ref: any): boolean {
  return (
    !!ref &&
    typeof ref === 'object' &&
    ref.scope === 'provider' &&
    ref.kind === 'track' &&
    ref.connectionId === undefined &&
    typeof ref.providerId === 'string' &&
    ref.providerId.length > 0 &&
    typeof ref.id === 'string' &&
    ref.id.length > 0
  )
}

/** Add the selected implementation only at the provider call boundary. */
export function targetAppTrackRef(ref: any, pluginId: string): any {
  const normalized = normalizeAppTrackRef(ref)
  if (!isProviderTrackRef(normalized)) return normalized
  return {
    pluginId,
    providerId: normalized.providerId,
    kind: 'track',
    id: normalized.id,
    scope: 'provider'
  }
}

/** Application adapters consume standard JSON only. Platform formats stay in plugins. */
export function toAppTrack(item: any): any {
  const ref = normalizeAppTrackRef(item.ref)
  if (!ref || ref.kind !== 'track' || !item.metadata) throw new Error('无效的标准歌曲')
  const original = item.ref?.data?.song ?? {}
  const duration = item.metadata.durationMs ?? item.durationMs
  const seconds = Math.round((duration ?? 0) / 1000)
  const originalQualities = normalizeQualities(original.types, original._types)
  const types = (item.metadata.qualities ?? originalQualities.map((q) => q.type)).map(
    (type: string) => {
      const sizeBytes = item.metadata.qualitySizes?.[type]
      const size = item.metadata.qualitySizeLabels?.[type]
      return {
        ...originalQualities.find((q) => q.type === type),
        type,
        ...(Number.isSafeInteger(sizeBytes) && sizeBytes > 0
          ? { size: size || formatQualitySize(sizeBytes), sizeBytes }
          : size
            ? { size }
            : {})
      }
    }
  )
  return normalizeMusicItem({
    ...original,
    songmid: ref.id,
    ...(item.metadata.hash ? { hash: item.metadata.hash } : {}),
    source: ref.providerId,
    name: item.title,
    singer: (item.metadata.artists ?? []).join('、'),
    albumName: item.metadata.album?.title || original.albumName || '',
    albumId: item.metadata.album?.id ?? original.albumId ?? '',
    img: item.metadata.artworkUrl || original.img || '',
    interval:
      duration == null && original.interval
        ? original.interval
        : `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`,
    types,
    _types: {
      ...original._types,
      ...Object.fromEntries(
        types.map(({ type, ...details }: any) => [type, { ...original._types?.[type], ...details }])
      )
    },
    lrc: original.lrc ?? null,
    pluginResource: ref
  })
}

export function toPluginTrack(value: any, _manifestId?: string): any {
  const song = normalizeMusicItem(value)
  const qualities = normalizeQualities(song.types, song._types)
  return {
    ref: song.pluginResource ?? {
      scope: 'provider',
      providerId: song.source || 'local',
      kind: 'track',
      id: String(song.songmid)
    },
    title: song.name ?? '',
    subtitle: song.singer ?? '',
    playable: true,
    capabilities: ['music.resolve@1', 'music.lyrics@1'],
    metadata: {
      durationMs: durationMilliseconds(song.interval),
      ...(song.hash ? { hash: song.hash } : {}),
      qualitySizeLabels: Object.fromEntries(
        qualities.filter((q) => q.size).map((q) => [q.type, q.size])
      ),
      artists: String(song.singer ?? '')
        .split('、')
        .filter(Boolean),
      album: { id: String(song.albumId ?? ''), title: song.albumName ?? '' },
      artworkUrl: song.img ?? '',
      qualities: (song.types ?? []).map((q: any) => (typeof q === 'string' ? q : q.type)),
      qualitySizes: Object.fromEntries(
        (song.types ?? []).flatMap((q: any) => {
          const type = typeof q === 'string' ? q : q.type
          const bytes = q.sizeBytes ?? song._types?.[type]?.sizeBytes
          return Number.isSafeInteger(bytes) && bytes > 0 ? [[type, bytes]] : []
        })
      )
    }
  }
}
