import path from 'node:path'
import fs from 'fs'
import { app } from 'electron'
import { md5, normPath } from '../utils/fileUtils'
import { getMusicDatabase, TrackRow } from './MusicDatabase'

export interface MusicItem {
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number | string
  img?: string
  hasCover?: boolean
  coverKey?: string
  year?: number
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
  url?: string
  path?: string
  bitrate?: number
  sampleRate?: number
  channels?: number
  duration?: number
}

function safeJsonParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback
  try {
    return JSON.parse(s) as T
  } catch {
    return fallback
  }
}

function rowToItem(row: TrackRow): MusicItem {
  return {
    songmid: row.songmid,
    path: row.path,
    url: row.url || undefined,
    singer: row.singer,
    name: row.name,
    albumName: row.albumName,
    albumId: row.albumId,
    source: row.source,
    interval: row.interval,
    img: '',
    hasCover: !!row.hasCover,
    coverKey: row.coverKey || undefined,
    year: row.year,
    lrc: row.lrc,
    types: safeJsonParse<string[]>(row.types, []),
    _types: safeJsonParse<Record<string, any>>(row._types, {}),
    typeUrl: safeJsonParse<Record<string, any>>(row.typeUrl, {}),
    bitrate: row.bitrate,
    sampleRate: row.sampleRate,
    channels: row.channels,
    duration: row.duration,
    hash: row.hash || undefined
  }
}

function itemToRow(
  item: MusicItem,
  size: number,
  mtimeMs: number,
  existing?: TrackRow | null
): TrackRow {
  const pick = <T>(a: T, b: T): T => (a !== undefined && a !== null && (a as any) !== '' ? a : b)
  const path = String(pick(item.path, existing?.path || '')) || ''
  const url = pick(item.url, existing?.url || `file://${path}`) || `file://${path}`
  return {
    songmid: String(item.songmid),
    path,
    url,
    singer: String(pick(item.singer, existing?.singer) || '未知艺术家'),
    name: String(pick(item.name, existing?.name) || '未知曲目'),
    albumName: String(pick(item.albumName, existing?.albumName) || '未知专辑'),
    albumId: Number(pick(item.albumId, existing?.albumId) || 0),
    source: String(pick(item.source, existing?.source) || 'local'),
    interval: String(pick(item.interval, existing?.interval) || ''),
    hasCover: (item.hasCover ?? (existing ? !!existing.hasCover : false)) ? 1 : 0,
    coverKey: (pick(item.coverKey, existing?.coverKey) as string) || null,
    year: Number(pick(item.year, existing?.year) || 0),
    lrc: (pick(item.lrc, existing?.lrc) as string | null) ?? null,
    types: JSON.stringify(
      (item.types && item.types.length ? item.types : safeJsonParse(existing?.types, [])) || []
    ),
    _types: JSON.stringify(
      (item._types && Object.keys(item._types).length
        ? item._types
        : safeJsonParse(existing?._types, {})) || {}
    ),
    typeUrl: JSON.stringify(
      (item.typeUrl && Object.keys(item.typeUrl).length
        ? item.typeUrl
        : safeJsonParse(existing?.typeUrl, {})) || {}
    ),
    bitrate: Number(pick(item.bitrate, existing?.bitrate) || 0),
    sampleRate: Number(pick(item.sampleRate, existing?.sampleRate) || 0),
    channels: Number(pick(item.channels, existing?.channels) || 0),
    duration: Number(pick(item.duration as any, existing?.duration) || 0),
    size: size || existing?.size || 0,
    mtime_ms: mtimeMs || existing?.mtime_ms || 0,
    hash: item.hash || existing?.hash || md5(`${item.name}-${item.singer}-${item.source}`),
    updated_at: Date.now()
  }
}

export class LocalMusicIndexService {
  private jsonMigrationPath: string

  constructor() {
    const userData = app.getPath('userData')
    this.jsonMigrationPath = path.join(userData, 'local-music-index.json')
    // Ensure DB is initialized before migration attempts.
    getMusicDatabase()
    this.migrateFromJsonIfNeeded()
  }

  private migrateFromJsonIfNeeded() {
    try {
      if (!fs.existsSync(this.jsonMigrationPath)) return
      const raw = fs.readFileSync(this.jsonMigrationPath, 'utf-8')
      const obj = JSON.parse(raw)
      if (!obj || typeof obj !== 'object') return
      const db = getMusicDatabase()

      if (Array.isArray(obj.dirs) && obj.dirs.length > 0) {
        const existing = new Set(db.getDirs())
        const merged = Array.from(new Set([...existing, ...obj.dirs.filter(Boolean)]))
        db.setDirs(merged)
      }

      const songs = obj.songs || {}
      const rows: TrackRow[] = []
      let missing = 0
      for (const k of Object.keys(songs)) {
        const it = songs[k] as MusicItem
        if (!it || !it.path) continue

        // 已存在则交给 upsert 的 merge 逻辑,不会回退已填充字段。
        const existing = db.getTrackByPath(it.path)

        let size = 0
        let mtimeMs = 0
        try {
          const st = fs.statSync(it.path)
          size = st.size
          mtimeMs = Math.floor(st.mtimeMs)
        } catch {
          // 文件已不存在;旧记录保留入库,下一次 scan 触发 pruneByScan 清理。
          missing++
        }

        rows.push(itemToRow(it, size, mtimeMs, existing))
      }

      if (rows.length) db.upsertTracks(rows)

      const backup = this.jsonMigrationPath + '.migrated'
      try {
        if (fs.existsSync(backup)) fs.unlinkSync(backup)
      } catch {}
      try {
        fs.renameSync(this.jsonMigrationPath, backup)
      } catch {}

      console.log(
        `[LocalMusicIndex] migrated ${rows.length} tracks from JSON (missing files: ${missing})`
      )
    } catch (err) {
      console.error('[LocalMusicIndex] JSON migration failed:', err)
    }
  }

  private keyForPath(p: string): string {
    const np = normPath(p) || p
    return md5(np)
  }

  getDirs(): string[] {
    return getMusicDatabase().getDirs()
  }

  async setDirs(dirs: string[]) {
    getMusicDatabase().setDirs(Array.isArray(dirs) ? dirs : [])
  }

  getAllSongs(): MusicItem[] {
    return getMusicDatabase().getAllTracks().map(rowToItem)
  }

  getSongById(id: string | number): MusicItem | null {
    const row = getMusicDatabase().getTrackById(String(id))
    return row ? rowToItem(row) : null
  }

  getUrlById(id: string | number): string | null {
    const s = this.getSongById(id)
    if (!s) return null
    if (s.url && typeof s.url === 'string') return s.url
    if (s.path && typeof s.path === 'string') return 'file://' + s.path
    return null
  }

  getStatByPath(p: string): { songmid: string; size: number; mtime_ms: number } | null {
    const row = getMusicDatabase().getStatByPath(p)
    if (!row) return null
    return { songmid: row.songmid, size: row.size, mtime_ms: row.mtime_ms }
  }

  getAllStats(): Map<string, { size: number; mtime_ms: number; songmid: string }> {
    return getMusicDatabase().getAllStats()
  }

  async upsertSong(item: MusicItem, size = 0, mtimeMs = 0) {
    const db = getMusicDatabase()
    const p = item.path || ''
    const key = p ? this.keyForPath(p) : String(item.songmid ?? '')
    if (!key) return
    item.songmid = key
    const existing = p ? db.getTrackByPath(p) : db.getTrackById(key)
    const row = itemToRow(item, size, mtimeMs, existing)
    db.upsertTrack(row)
  }

  async upsertSongs(items: Array<MusicItem & { _size?: number; _mtime_ms?: number }>) {
    const db = getMusicDatabase()
    const rows: TrackRow[] = []
    for (const it of items) {
      const p = it.path || ''
      const key = p ? this.keyForPath(p) : String(it.songmid ?? '')
      if (!key) continue
      it.songmid = key
      const existing = p ? db.getTrackByPath(p) : db.getTrackById(key)
      rows.push(itemToRow(it, Number(it._size || 0), Number(it._mtime_ms || 0), existing))
    }
    if (rows.length) db.upsertTracks(rows)
  }

  async removeSongByPath(p: string) {
    const db = getMusicDatabase()
    // Try both original and normalized path for compatibility with older entries.
    db.deleteByPath(p)
    const np = normPath(p)
    if (np && np !== p) db.deleteByPath(np)
  }

  async pruneByScan(dirs: string[], keepPaths: string[]) {
    const prefixes = (dirs || [])
      .map((d) => normPath(d) || '')
      .filter(Boolean)
      .map((d) => (d.endsWith('/') ? d : d + '/'))
    const keeps = (keepPaths || []).map((p) => p || '')
    getMusicDatabase().pruneOutsideKeep(prefixes, keeps)
  }

  async clearSongs() {
    getMusicDatabase().clearTracks()
  }
}

export const localMusicIndexService = new LocalMusicIndexService()
