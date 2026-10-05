import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import Database from 'better-sqlite3'
import { sortByEvictionPriority } from './eviction'

/** 缓存条目类型：歌词 / 封面 */
export type MetaKind = 'lyric' | 'cover'

export interface MetaRow {
  key: string
  kind: MetaKind
  content: string
  size: number
  hits: number
  created_at: number
  last_access: number
}

/**
 * 缓存文本元数据（歌词对象 / 封面地址）。
 *
 * 音频本体仍以文件形式落在缓存目录（大文件不适合进 DB），
 * 这里只存小而多的结构化文本，用 SQLite 换掉原来的 JSON 索引，
 * 顺便获得 LRU 需要的 last_access 与原子写入。
 */
export class MusicMetaCache {
  private db: Database.Database
  private getStmt!: Database.Statement<[string, MetaKind]>
  private putStmt!: Database.Statement<[string, MetaKind, string, number, number, number]>
  private touchStmt!: Database.Statement<[number, string, MetaKind]>
  private deleteStmt!: Database.Statement<[string, MetaKind]>
  private listAllStmt!: Database.Statement<[MetaKind]>
  private totalStmt!: Database.Statement<[MetaKind]>
  private countStmt!: Database.Statement<[MetaKind]>
  private clearKindStmt!: Database.Statement<[MetaKind]>

  constructor(dbPath?: string) {
    const userData = app.getPath('userData')
    if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true })
    this.db = new Database(dbPath || path.join(userData, 'music-cache.db'))
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.migrate()
    this.prepareStatements()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS meta_cache (
        key         TEXT NOT NULL,
        kind        TEXT NOT NULL,
        content     TEXT NOT NULL,
        size        INTEGER NOT NULL DEFAULT 0,
        hits        INTEGER NOT NULL DEFAULT 0,
        created_at  INTEGER NOT NULL,
        last_access INTEGER NOT NULL,
        PRIMARY KEY (key, kind)
      );
      CREATE INDEX IF NOT EXISTS idx_meta_lru ON meta_cache(kind, last_access);
    `)
    // 旧库补列（hits 是后加的），已有库忽略 duplicate column 错误
    try {
      this.db.exec('ALTER TABLE meta_cache ADD COLUMN hits INTEGER NOT NULL DEFAULT 0')
    } catch {
      // 列已存在
    }
  }

  private prepareStatements() {
    this.getStmt = this.db.prepare('SELECT * FROM meta_cache WHERE key = ? AND kind = ?')
    this.putStmt = this.db.prepare(`
      INSERT INTO meta_cache (key, kind, content, size, hits, created_at, last_access)
      VALUES (?, ?, ?, ?, 1, ?, ?)
      ON CONFLICT(key, kind) DO UPDATE SET
        content     = excluded.content,
        size        = excluded.size,
        hits        = meta_cache.hits + 1,
        last_access = excluded.last_access
    `)
    this.touchStmt = this.db.prepare(
      'UPDATE meta_cache SET hits = hits + 1, last_access = ? WHERE key = ? AND kind = ?'
    )
    this.deleteStmt = this.db.prepare('DELETE FROM meta_cache WHERE key = ? AND kind = ?')
    this.listAllStmt = this.db.prepare('SELECT * FROM meta_cache WHERE kind = ?')
    this.totalStmt = this.db.prepare(
      'SELECT COALESCE(SUM(size), 0) AS total FROM meta_cache WHERE kind = ?'
    )
    this.countStmt = this.db.prepare('SELECT COUNT(*) AS count FROM meta_cache WHERE kind = ?')
    this.clearKindStmt = this.db.prepare('DELETE FROM meta_cache WHERE kind = ?')
  }

  /** 读取并刷新使用次数 + 最后访问时间 */
  get(kind: MetaKind, key: string): string | null {
    const row = this.getStmt.get(key, kind) as MetaRow | undefined
    if (!row) return null
    this.touchStmt.run(Date.now(), key, kind)
    return row.content
  }

  /** 读取但不刷新（用于统计/导出，不干扰 LRU 语义） */
  peek(kind: MetaKind, key: string): string | null {
    const row = this.getStmt.get(key, kind) as MetaRow | undefined
    return row?.content ?? null
  }

  put(kind: MetaKind, key: string, content: string): void {
    const now = Date.now()
    this.putStmt.run(key, kind, content, Buffer.byteLength(content, 'utf-8'), now, now)
  }
  has(kind: MetaKind, key: string): boolean {
    return !!this.getStmt.get(key, kind)
  }

  delete(kind: MetaKind, key: string): void {
    this.deleteStmt.run(key, kind)
  }

  /** 列出该类型的全部条目（排序由淘汰打分函数负责） */
  listAll(kind: MetaKind): MetaRow[] {
    return this.listAllStmt.all(kind) as MetaRow[]
  }

  totalSize(kind: MetaKind): number {
    const row = this.totalStmt.get(kind) as { total: number } | undefined
    return Number(row?.total) || 0
  }

  count(kind: MetaKind): number {
    const row = this.countStmt.get(kind) as { count: number } | undefined
    return Number(row?.count) || 0
  }

  /** 按「使用次数 + 最后访问时间」加权分淘汰，返回删除数量与释放字节数 */
  evictToLimit(kind: MetaKind, maxBytes: number): { evicted: number; freedBytes: number } {
    if (maxBytes <= 0) return { evicted: 0, freedBytes: 0 }
    let total = this.totalSize(kind)
    if (total <= maxBytes) return { evicted: 0, freedBytes: 0 }

    // 与音频缓存同一套淘汰口径：分低者先删
    const rows = sortByEvictionPriority(
      this.listAll(kind).map((row) => ({
        row,
        hits: row.hits,
        lastAccess: row.last_access
      }))
    ).map((item) => item.row)

    const tx = this.db.transaction((items: MetaRow[]) => {
      let evicted = 0
      let freedBytes = 0
      for (const row of items) {
        if (total <= maxBytes) break
        this.deleteStmt.run(row.key, kind)
        total -= row.size
        freedBytes += row.size
        evicted++
      }
      return { evicted, freedBytes }
    })
    return tx(rows)
  }

  clear(kind?: MetaKind): void {
    if (kind) {
      this.clearKindStmt.run(kind)
      return
    }
    this.db.exec('DELETE FROM meta_cache')
  }

  close(): void {
    try {
      this.db.close()
    } catch {
      // 忽略重复关闭
    }
  }
}

let instance: MusicMetaCache | null = null

export function getMusicMetaCache(): MusicMetaCache {
  if (!instance) instance = new MusicMetaCache()
  return instance
}
