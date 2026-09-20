import type { ContentEntity } from '@shiqianjiang/ceru-plugin-sdk'

export interface ApiTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
}

export interface SearchResponse {
  items: ApiTrack[]
  nextOffset?: number
}

export function readOffset(cursor?: string): number {
  if (cursor === undefined) return 0
  if (!/^\d{1,7}$/.test(cursor)) throw new Error('分页游标无效')
  return Number(cursor)
}

export function toTrack(pluginId: string, raw: ApiTrack): ContentEntity {
  return {
    ref: { pluginId, providerId: 'tutorial-source', kind: 'track', id: raw.id },
    title: raw.title,
    subtitle: raw.artist,
    playable: true,
    durationMs: raw.durationMs,
    metadata: {
      artists: [raw.artist],
      album: { title: raw.album },
      durationMs: raw.durationMs,
      qualities: ['lossless']
    },
    capabilities: ['music.resolve@1', 'music.lyrics@1']
  }
}
