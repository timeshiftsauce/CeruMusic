import type { JsonObject, JsonValue } from '@shiqianjiang/ceru-plugin-sdk'

export const PROVIDER_ID = 'tutorial-account'
export const CONNECTION_ID = 'demo-user'
export const SESSION_KEY = 'tutorial.session.v1'
export const PAGE_SIZE = 2

export type DemoSession = {
  cookie: string
  displayName: string
  avatarUrl: string
  membership: 'FREE' | 'VIP' | 'SVIP'
}

export type TrackRecord = {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
}

export type PlaylistRecord = {
  id: string
  title: string
  description: string
  trackIds: string[]
}

export const tracks: TrackRecord[] = [
  {
    id: 'morning',
    title: 'Morning Light',
    artist: 'Tutorial Artist',
    album: 'First Steps',
    durationMs: 3200,
  },
  {
    id: 'rain',
    title: 'Soft Rain',
    artist: 'Tutorial Artist',
    album: 'First Steps',
    durationMs: 3600,
  },
  {
    id: 'night',
    title: 'Night Walk',
    artist: 'Ceru Demo',
    album: 'City Notes',
    durationMs: 4000,
  },
  {
    id: 'stars',
    title: 'Little Stars',
    artist: 'Ceru Demo',
    album: 'City Notes',
    durationMs: 3400,
  },
]

export const playlists: PlaylistRecord[] = [
  {
    id: 'demo-favorites',
    title: '我喜欢的演示音乐',
    description: '演示账号收藏的四首短音频',
    trackIds: ['morning', 'rain', 'night', 'stars'],
  },
  {
    id: 'demo-evening',
    title: '夜晚播放列表',
    description: '用来练习歌单详情与分页',
    trackIds: ['night', 'stars', 'rain'],
  },
]

export function asObject(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

export function readSession(value: JsonValue | null): DemoSession | null {
  const data = asObject(value ?? undefined)
  if (
    typeof data?.cookie !== 'string' ||
    typeof data.displayName !== 'string' ||
    typeof data.avatarUrl !== 'string' ||
    !['FREE', 'VIP', 'SVIP'].includes(String(data.membership))
  ) {
    return null
  }
  return data as unknown as DemoSession
}

export function cursorOffset(cursor: string | undefined) {
  const value = cursor === undefined ? 0 : Number(cursor)
  if (!Number.isSafeInteger(value) || value < 0) throw fault('分页游标无效', 'NOT_FOUND')
  return value
}

export function fault(message: string, code: string) {
  return Object.assign(new Error(message), { code })
}
