import type { ContentEntity, CrLyric, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

export interface ApiTrack {
  id: string
  title: string
  artist: string
  album?: string
  durationMs?: number
  qualities?: string[]
}

export interface SearchResponse {
  items: ApiTrack[]
  nextOffset?: number
}

export interface LyricsResponse {
  offsetMs?: number
  lines: { startTimeMs: number; endTimeMs?: number; text: string }[]
}

export function readOffset(cursor?: string): number {
  if (!cursor) return 0
  if (!/^\d{1,7}$/.test(cursor)) throw new Error('分页游标无效')
  return Number(cursor)
}

export function toTrack(pluginId: string, raw: ApiTrack): ContentEntity {
  if (!raw.id || !raw.title || !raw.artist) throw new Error('音源返回的歌曲字段不完整')
  return {
    ref: {
      pluginId,
      providerId: 'tutorial-source',
      kind: 'track',
      id: raw.id,
    },
    title: raw.title,
    subtitle: raw.artist,
    playable: true,
    durationMs: raw.durationMs,
    metadata: {
      artists: [raw.artist],
      album: raw.album ? { title: raw.album } : undefined,
      durationMs: raw.durationMs,
      qualities: raw.qualities,
    },
    capabilities: ['music.resolve@1', 'music.lyrics@1'],
  }
}

export function readTrackId(ref: ResourceRef, pluginId: string): string {
  if (
    ref.pluginId !== pluginId ||
    ref.providerId !== 'tutorial-source' ||
    ref.kind !== 'track' ||
    !ref.id
  ) {
    throw new Error('这不是本音源创建的歌曲引用')
  }
  return ref.id
}

export function toLyrics(track: ResourceRef, raw: LyricsResponse): CrLyric {
  return {
    format: 'crlyric',
    version: 1,
    track,
    offsetMs: Number.isFinite(raw.offsetMs) ? Number(raw.offsetMs) : 0,
    lines: raw.lines
      .filter((line) => Number.isFinite(line.startTimeMs) && typeof line.text === 'string')
      .sort((a, b) => a.startTimeMs - b.startTimeMs),
  }
}
