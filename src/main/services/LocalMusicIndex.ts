import path from 'node:path'
import fs from 'fs'
import fsp from 'fs/promises'
import crypto from 'crypto'
// import { configManager } from './ConfigManager'

export interface MusicItem {
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number | string
  img: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
  url?: string
  path?: string
}

type IndexSchema = {
  songs: Record<string, MusicItem>
  dirs: string[]
  updatedAt: number
}

function md5(input: string) {
  return crypto.createHash('md5').update(input).digest('hex')
}

export class LocalMusicIndexService {
  private indexFile: string
  private data: IndexSchema = { songs: {}, dirs: [], updatedAt: Date.now() }

  constructor() {
    const userData = require('electron').app.getPath('userData')
    this.indexFile = path.join(userData, 'local-music-index.json')
    this.load()
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
    } catch { }
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
    return Object.values(this.data.songs)
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
    const key = String(item.songmid ?? md5(String(item.path || '')))
    item.songmid = key
    item.hash = md5(`${item.name}-${item.singer}-${item.source}`)
    this.data.songs[key] = item
    this.data.updatedAt = Date.now()
    await this.save()
  }

  async upsertSongs(items: MusicItem[]) {
    for (const it of items) {
      const key = String(it.songmid ?? md5(String(it.path || '')))
      it.songmid = key
      it.hash = md5(`${it.name}-${it.singer}-${it.source}`)
      this.data.songs[key] = it
    }
    this.data.updatedAt = Date.now()
    await this.save()
  }
}

export const localMusicIndexService = new LocalMusicIndexService()
