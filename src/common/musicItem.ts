/** Durable app data. Plugin entities are transport objects, never the storage format. */
export interface TrackResource {
  pluginId?: string
  providerId: string
  connectionId?: string
  kind: string
  id: string
  scope?: 'provider'
  data?: Record<string, any>
}

export interface MusicQuality {
  type: string
  size?: string
  sizeBytes?: number
  hash?: string
}

export interface MusicItem {
  pluginResource?: TrackResource
  songmid: string | number
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: string | number
  source: string
  interval: string
  img: string
  lrc: string | null
  types?: Array<string | MusicQuality>
  _types?: Record<string, any>
  typeUrl?: Record<string, any>
  url?: string
  [key: string]: any
}

export const SONG_KEY_PREFIX = 'ceru-song:'
const object = (value: any): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export function isPublicTrackRef(ref: any): boolean {
  if (!object(ref) || ref.kind !== 'track' || ref.connectionId !== undefined) return false
  return (
    ref.scope === 'provider' ||
    (ref.pluginId === 'local.library' && !ref.data) ||
    (ref.pluginId === 'local.linglan-source' && object(ref.data?.song))
  )
}

export function songKey(song: any): string {
  const ref = song?.pluginResource ?? (song?.kind === 'track' ? song : undefined)
  const source = String(ref?.providerId ?? song?.source ?? '')
  const id = String(ref?.id ?? song?.songmid ?? '')
  return (
    SONG_KEY_PREFIX +
    JSON.stringify(
      ref && !isPublicTrackRef(ref)
        ? ['private', ref.pluginId ?? '', source, ref.connectionId ?? '', id]
        : ['public', source, id]
    )
  )
}

export function sameSong(a: any, b: any): boolean {
  return !!a && !!b && songKey(a) === songKey(b)
}

/** Legacy scalar selectors are accepted only when unambiguous. */
export function selectSong<T extends MusicItem>(
  songs: readonly T[],
  selector: string | number
): T | undefined {
  const key = String(selector)
  const found = songs.filter((song) =>
    key.startsWith(SONG_KEY_PREFIX) ? songKey(song) === key : String(song.songmid) === key
  )
  if (found.length > 1) throw new Error('歌曲 ID 存在多个来源，请使用完整歌曲身份')
  return found[0]
}

/** Restore old scalar selections using the saved snapshot to resolve ambiguity. */
export function restoredSong<T extends MusicItem>(
  songs: readonly T[],
  preferences: { lastPlaySongKey?: string; lastPlaySongId?: string | number | null },
  snapshot?: T
): T | undefined {
  let selected: T | undefined
  try {
    selected = selectSong(songs, preferences.lastPlaySongKey || preferences.lastPlaySongId || '')
  } catch {
    /* A legacy ID can be shared by several providers. */
  }
  if (selected) return selected
  if (snapshot?.songmid != null && snapshot.source)
    return songs.find((song) => sameSong(song, snapshot)) ?? snapshot
  return undefined
}

export function normalizeQualities(types: any, details: any = {}): MusicQuality[] {
  if (!Array.isArray(types)) return []
  const result: MusicQuality[] = []
  const seen = new Set<string>()
  for (const entry of types) {
    const type = typeof entry === 'string' ? entry : entry?.type
    if (typeof type !== 'string' || !type.trim() || seen.has(type)) continue
    seen.add(type)
    const info = {
      ...(object(details?.[type]) ? details[type] : {}),
      ...(object(entry) ? entry : {})
    }
    result.push({
      type,
      ...(typeof info.size === 'string' && info.size.trim() ? { size: info.size } : {}),
      ...(Number.isSafeInteger(info.sizeBytes) && info.sizeBytes > 0
        ? { sizeBytes: info.sizeBytes }
        : {}),
      ...(typeof info.hash === 'string' && info.hash ? { hash: info.hash } : {})
    })
  }
  return result
}

export function normalizeMusicItem(value: any): MusicItem {
  if (!object(value)) throw new Error('歌曲数据必须是对象')
  const ref = value.pluginResource
  if (ref?.scope === 'provider' && ref.connectionId !== undefined)
    throw new Error('公共歌曲引用不能包含私有连接')
  const original = isPublicTrackRef(ref) && object(ref.data?.song) ? ref.data.song : {}
  const song = { ...original, ...value }
  const source = song.source ?? ref?.providerId
  const songmid = song.songmid ?? ref?.id
  if (
    typeof source !== 'string' ||
    !source.trim() ||
    !['string', 'number'].includes(typeof songmid) ||
    !String(songmid).trim() ||
    (typeof songmid === 'number' && !Number.isFinite(songmid))
  )
    throw new Error('歌曲缺少有效来源或 ID')
  const types = normalizeQualities(song.types, song._types)
  const result: MusicItem = {
    ...song,
    source,
    songmid,
    name: String(song.name ?? ''),
    singer: String(song.singer ?? ''),
    albumName: String(song.albumName ?? ''),
    albumId: song.albumId ?? '',
    interval: String(song.interval ?? '00:00'),
    img: String(song.img ?? '').startsWith('blob:') ? '' : String(song.img ?? ''),
    lrc: typeof song.lrc === 'string' ? song.lrc : null,
    types,
    _types: {
      ...(object(song._types) ? song._types : {}),
      ...Object.fromEntries(
        types.map(({ type, ...info }) => [type, { ...song._types?.[type], ...info }])
      )
    }
  }
  if (typeof result.url === 'string' && result.url.startsWith('blob:')) delete result.url
  if (isPublicTrackRef(ref)) delete result.pluginResource
  else if (ref) {
    if (
      !object(ref) ||
      ref.kind !== 'track' ||
      typeof ref.pluginId !== 'string' ||
      !ref.pluginId ||
      typeof ref.providerId !== 'string' ||
      !ref.providerId ||
      typeof ref.id !== 'string' ||
      !ref.id ||
      (ref.connectionId !== undefined && typeof ref.connectionId !== 'string')
    )
      throw new Error('私有歌曲引用无效')
    result.pluginResource = { ...ref } as TrackResource
  }
  return result
}

export function normalizeMusicItems(values: any): MusicItem[] {
  if (!Array.isArray(values)) throw new Error('歌曲列表必须是数组')
  return values.map(normalizeMusicItem)
}

export function durationMilliseconds(interval: unknown): number {
  const parts = String(interval ?? '').split(':')
  if (
    !parts.length ||
    parts.some((part) => !part.trim() || !Number.isFinite(Number(part)) || Number(part) < 0)
  )
    return 0
  return Math.round(parts.reduce((seconds, part) => seconds * 60 + Number(part), 0) * 1000)
}
