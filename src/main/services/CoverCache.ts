import fsp from 'fs/promises'
import path from 'node:path'
import crypto from 'crypto'
import { app } from 'electron'

type CacheEntry = { key: string; dataUrl: string; bytes: number }

export class MemoryLRU {
  private maxBytes: number
  private curBytes = 0
  private map = new Map<string, CacheEntry>()

  constructor(maxBytes: number) {
    this.maxBytes = maxBytes
  }

  get(key: string): string | null {
    const hit = this.map.get(key)
    if (!hit) return null
    this.map.delete(key)
    this.map.set(key, hit)
    return hit.dataUrl
  }

  set(key: string, dataUrl: string) {
    const bytes = Math.max(0, Buffer.byteLength(dataUrl, 'utf8'))
    if (this.map.has(key)) {
      const old = this.map.get(key)!
      this.curBytes -= old.bytes
      this.map.delete(key)
    }
    this.map.set(key, { key, dataUrl, bytes })
    this.curBytes += bytes
    this.evict()
  }

  private evict() {
    while (this.curBytes > this.maxBytes && this.map.size > 0) {
      const first = this.map.keys().next().value as string
      const e = this.map.get(first)
      if (!e) break
      this.curBytes -= e.bytes
      this.map.delete(first)
    }
  }
}

function md5(s: string) {
  return crypto.createHash('md5').update(s).digest('hex')
}

function coverDir() {
  const dir = path.join(app.getPath('userData'), 'covers-cache')
  return dir
}

async function ensureDir(p: string) {
  await fsp.mkdir(p, { recursive: true })
}

export class CoverCacheService {
  private lru = new MemoryLRU(50 * 1024 * 1024)

  async getCoverByFile(filePath: string, key: string): Promise<string> {
    const mem = this.lru.get(key)
    if (mem) return mem
    const diskKey = md5(key)
    const dir = coverDir()
    const file = path.join(dir, `${diskKey}.txt`)
    try {
      const txt = await fsp.readFile(file, 'utf8')
      this.lru.set(key, txt)
      return txt
    } catch {}

    const dataUrl = await this.extractCoverAsDataUrl(filePath)
    if (dataUrl) {
      try {
        await ensureDir(dir)
        await fsp.writeFile(file, dataUrl)
      } catch {}
      this.lru.set(key, dataUrl)
    }
    return dataUrl
  }

  async getCoversByFiles(pathsWithKey: Array<{ filePath: string; key: string }>) {
    const res: Record<string, string> = {}
    for (const { filePath, key } of pathsWithKey) {
      const v = await this.getCoverByFile(filePath, key)
      if (v) res[key] = v
    }
    return res
  }

  private async extractCoverAsDataUrl(filePath: string): Promise<string> {
    try {
      const taglib = require('node-taglib-sharp')
      const f = taglib.File.createFromPath(filePath)
      const tag = f.tag
      if (Array.isArray(tag.pictures) && tag.pictures.length > 0) {
        const buf = tag.pictures[0].data as Buffer
        const mime = tag.pictures[0].mimeType || 'image/jpeg'
        const dataUrl = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
        f.dispose()
        return dataUrl
      }
      f.dispose()
    } catch {}
    return ''
  }
}

export const coverCacheService = new CoverCacheService()
