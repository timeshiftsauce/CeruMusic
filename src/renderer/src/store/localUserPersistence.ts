import type { SongList } from '../types/audio'

export type PersistedSongSnapshot = {
  songmid: string | number
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: string | number
  source: string
  interval: string
  img: string
  lrc: null | string
  types: string[]
  url?: string
  path?: string
}

const isSongId = (value: unknown): value is string | number =>
  typeof value === 'string' || typeof value === 'number'

export const toPersistedSongSnapshot = (song: any): PersistedSongSnapshot | null => {
  if (!song || !isSongId(song.songmid)) return null

  return {
    songmid: song.songmid,
    hash: typeof song.hash === 'string' ? song.hash : undefined,
    singer: typeof song.singer === 'string' ? song.singer : '',
    name: typeof song.name === 'string' ? song.name : '',
    albumName: typeof song.albumName === 'string' ? song.albumName : '',
    albumId: isSongId(song.albumId) ? song.albumId : '',
    source: typeof song.source === 'string' ? song.source : '',
    interval: typeof song.interval === 'string' ? song.interval : '',
    img: typeof song.img === 'string' ? song.img : '',
    lrc: typeof song.lrc === 'string' || song.lrc === null ? song.lrc : null,
    types: Array.isArray(song.types) ? song.types.filter((item: unknown) => typeof item === 'string') : [],
    url: typeof song.url === 'string' ? song.url : undefined,
    path: typeof song.path === 'string' ? song.path : undefined
  }
}

export const fromPersistedSongSnapshot = (value: any): (SongList & { path?: string }) | null => {
  const snapshot = toPersistedSongSnapshot(value)
  if (!snapshot) return null

  return {
    songmid: snapshot.songmid,
    hash: snapshot.hash,
    singer: snapshot.singer,
    name: snapshot.name,
    albumName: snapshot.albumName,
    albumId: snapshot.albumId,
    source: snapshot.source,
    interval: snapshot.interval,
    img: snapshot.img,
    lrc: snapshot.lrc,
    types: snapshot.types,
    _types: {},
    typeUrl: {},
    url: snapshot.url,
    ...(snapshot.path ? { path: snapshot.path } : {})
  }
}

export const serializeSongListForStorage = (songs: SongList[]): PersistedSongSnapshot[] => {
  if (!Array.isArray(songs)) return []
  return songs
    .map((song) => toPersistedSongSnapshot(song))
    .filter((song): song is PersistedSongSnapshot => Boolean(song))
}

export const deserializeSongListFromStorage = (raw: string | null): (SongList & { path?: string })[] => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((song) => fromPersistedSongSnapshot(song))
      .filter((song): song is SongList & { path?: string } => Boolean(song))
  } catch {
    return []
  }
}
