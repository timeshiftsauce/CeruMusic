import path from 'node:path'
import fs from 'fs'
import fsp from 'fs/promises'
import { app } from 'electron'
import { md5, normPath } from '../utils/fileUtils'

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
}

type IndexSchema = {
  songs: Record<string, MusicItem>
  dirs: string[]
  updatedAt: number
}

export class LocalMusicIndexService {
  private indexFile: string
  private data: IndexSchema = { songs: {}, dirs: [], updatedAt: Date.now() }

  constructor() {
    const userData = app.getPath('userData')
    this.indexFile = path.join(userData, 'local-music-index.json')
    this.load()
    this.migrateAndDedup().catch(() => {})
  }

  private load() {
    try {
      if (fs.existsSync(this.indexFile)) {
        const raw = fs.readFileSync(this.indexFile, 'utf-8')
        const obj = JSON.parse(raw)
        if (obj && typeof obj === 'object') this.data = obj as IndexSchema
      }
    } catch {
      this.data = { songs: {}, dirs: [], updatedAt: Date.now() }
    }
  }

  private async save() {
    try {
      const dir = path.dirname(this.indexFile)
      await fsp.mkdir(dir, { recursive: true })
      await fsp.writeFile(this.indexFile, JSON.stringify(this.data, null, 2))
    } catch {}
  }

  private mergePreferFilled(a: MusicItem, b: MusicItem): MusicItem {
    const pick = (x: any, y: any) => (x !== undefined && x !== null && x !== '' ? x : y)
    return {
      songmid: String(pick(a.songmid, b.songmid)),
      singer: pick(a.singer, b.singer) || '未知艺术家',
      name: pick(a.name, b.name) || '未知曲目',
      albumName: pick(a.albumName, b.albumName) || '未知专辑',
      albumId: pick(a.albumId, b.albumId) || 0,
      source: pick(a.source, b.source) || 'local',
      interval: pick(a.interval, b.interval) || '',
      img: '',
      hasCover: !!(a.hasCover || b.hasCover),
      coverKey: pick(a.coverKey, b.coverKey),
      year: (a as any).year ?? (b as any).year ?? 0,
      lrc: pick(a.lrc, b.lrc) ?? null,
      types: (a.types && a.types.length ? a.types : b.types) || [],
      _types: (a._types && Object.keys(a._types).length ? a._types : b._types) || {},
      typeUrl: (a.typeUrl && Object.keys(a.typeUrl).length ? a.typeUrl : b.typeUrl) || {},
      url: pick(a.url, b.url),
      path: pick(a.path, b.path),
      hash: pick(a.hash, b.hash),
      bitrate: pick(a.bitrate, b.bitrate) || 0,
      sampleRate: pick(a.sampleRate, b.sampleRate) || 0,
      channels: pick(a.channels, b.channels) || 0
    }
  }

  private async migrateAndDedup() {
    try {
      const changed = await this.dedupInMemory()
      if (changed) await this.save()
    } catch {}
  }

  private keyForItem(it: MusicItem, fallbackKey: string): string {
    const p = normPath(it.path || (typeof (it as any).url === 'string' ? (it as any).url : ''))
    if (p) return md5(p)
    return String(it.songmid ?? fallbackKey)
  }

  private async dedupInMemory(): Promise<boolean> {
    const input = this.data.songs || {}
    const out: Record<string, MusicItem> = {}
    let changed = false
    for (const k of Object.keys(input)) {
      const it = input[k]
      if (!it) continue
      const key = this.keyForItem(it, k)
      if (!out[key]) {
        out[key] = it
      } else {
        out[key] = this.mergePreferFilled(out[key], it)
      }
      if (key !== k) changed = true
      out[key].songmid = key
    }
    if (changed || Object.keys(out).length !== Object.keys(input).length) {
      this.data.songs = out
      this.data.updatedAt = Date.now()
      return true
    }
    return false
  }

  getDirs() {
    return [...(this.data.dirs || [])]
  }

  async setDirs(dirs: string[]) {
    this.data.dirs = Array.from(new Set(dirs.filter(Boolean)))
    this.data.updatedAt = Date.now()
    await this.save()
  }

  getAllSongs(): MusicItem[] {
    // 读取时也进行一次内存去重，保证返回前没有重复
    try {
      // 同步方式去重，但仅更新内存并返回，避免频繁写盘
      const input = this.data.songs || {}
      const out: Record<string, MusicItem> = {}
      for (const k of Object.keys(input)) {
        const it = input[k]
        const key = this.keyForItem(it, k)
        if (!out[key]) out[key] = it
        else out[key] = this.mergePreferFilled(out[key], it)
        out[key].songmid = key
      }
      this.data.songs = out
    } catch {}
    return Object.values(this.data.songs)
  }

  async pruneByScan(dirs: string[], keepPaths: string[]) {
    try {
      const dirSet = new Set(
        (dirs || []).map((d) => {
          const np = normPath(d)
          return np ? (np.endsWith('/') ? np : np + '/') : ''
        })
      )
      const keepSet = new Set((keepPaths || []).map((p) => normPath(p) || ''))
      let removed = false
      const out: Record<string, MusicItem> = {}
      for (const [k, it] of Object.entries(this.data.songs || {})) {
        const np = normPath(it.path || (it as any).url || '') || ''
        const underScannedDir = Array.from(dirSet).some((d) => np.startsWith(d))
        if (underScannedDir && !keepSet.has(np)) {
          removed = true
          continue
        }
        out[k] = it
      }
      if (removed) {
        this.data.songs = out
        this.data.updatedAt = Date.now()
        await this.save()
      }
    } catch {}
  }

  getSongById(id: string | number): MusicItem | null {
    const key = String(id)
    return this.data.songs[key] || null
  }

  getUrlById(id: string | number): string | null {
    const s = this.getSongById(id)
    if (!s) return null
    if (s.url && typeof s.url === 'string') return s.url
    if (s.path && typeof s.path === 'string') return 'file://' + s.path
    return null
  }

  async upsertSong(item: MusicItem) {
    const key = this.keyForItem(item, String(item.songmid ?? ''))
    item.songmid = key
    item.hash = md5(`${item.name}-${item.singer}-${item.source}`)
    const { img: _omitImg, ...rest } = item as any
    const exists = this.data.songs[key]
    this.data.songs[key] = exists
      ? this.mergePreferFilled(rest as any, exists as any)
      : (rest as MusicItem)
    this.data.updatedAt = Date.now()
    await this.save()
  }

  async upsertSongs(items: MusicItem[]) {
    for (const it of items) {
      const key = this.keyForItem(it, String(it.songmid ?? ''))
      it.songmid = key
      it.hash = md5(`${it.name}-${it.singer}-${it.source}`)
      const { img: _omitImg, ...rest } = it as any
      const exists = this.data.songs[key]
      this.data.songs[key] = exists
        ? this.mergePreferFilled(rest as any, exists as any)
        : (rest as MusicItem)
    }
    this.data.updatedAt = Date.now()
    await this.save()
  }

  async removeSongByPath(p: string) {
    try {
      const np = normPath(p) || ''
      if (!np) return
      const out: Record<string, MusicItem> = {}
      let removed = false
      for (const [k, it] of Object.entries(this.data.songs || {})) {
        const ip = normPath(it.path || (it as any).url || '') || ''
        if (ip === np) {
          removed = true
          continue
        }
        out[k] = it
      }
      if (removed) {
        this.data.songs = out
        this.data.updatedAt = Date.now()
        await this.save()
      }
    } catch {}
  }

  // Method to clear index (was accessed via any previously)
  async clearSongs() {
    this.data.songs = {}
    this.data.updatedAt = Date.now()
    await this.save()
  }
}

export const localMusicIndexService = new LocalMusicIndexService()
