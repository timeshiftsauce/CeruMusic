import type { JsonObject } from '@shiqianjiang/ceru-plugin-sdk'

export type Account = {
  id: string
  serverUrl: string
  username: string
  salt: string
  token: string
  remember: boolean
  allowLocal: boolean
}

export type PublicState = {
  connected: boolean
  status: string
  serverUrl: string
  username: string
  remember: boolean
  allowLocal: boolean
}

export type Song = {
  id?: string
  title?: string
  artist?: string
  album?: string
  albumId?: string
  duration?: number
}

export type StructuredLyrics = {
  synced?: boolean
  offset?: number
  line?: { start?: number; value?: string }[]
}

export type SubsonicResponse = {
  status?: string
  serverVersion?: string
  error?: { code?: number; message?: string }
  searchResult3?: { song?: Song[] }
  lyricsList?: { structuredLyrics?: StructuredLyrics[] }
}

export const storageKey = 'connection.v1'
export const providerId = 'navidrome'
export const qualities = ['128k', '320k', 'original']

export const asRecord = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}

export const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : value == null ? fallback : String(value)

export const list = <T>(value: T[] | T | undefined): T[] =>
  Array.isArray(value) ? value : value == null ? [] : [value]
