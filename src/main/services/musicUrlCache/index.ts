import path from 'node:path'
import { app } from 'electron'
import Database from 'better-sqlite3'

export class MusicUrlCache {
  private db: Database.Database
  private getStmt!: Database.Statement<[string]>
  private saveStmt!: Database.Statement<{ song_id: string; url: string; updated_at: number }>
  private deleteStmt!: Database.Statement<[string]>

  constructor() {
    const dbPath = path.join(app.getPath('userData'), 'url-cache.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS url_cache (
        song_id     TEXT PRIMARY KEY,
        url         TEXT NOT NULL,
        updated_at  INTEGER NOT NULL DEFAULT (unixepoch())
      )
    `)

    this.getStmt = this.db.prepare('SELECT url FROM url_cache WHERE song_id = ?')
    this.saveStmt = this.db.prepare(
      'INSERT INTO url_cache (song_id, url, updated_at) VALUES (@song_id, @url, @updated_at) ON CONFLICT(song_id) DO UPDATE SET url = @url, updated_at = @updated_at'
    )
    this.deleteStmt = this.db.prepare('DELETE FROM url_cache WHERE song_id = ?')
  }

  /** 获取缓存的 URL，未命中返回 null */
  getUrl(songId: string): string | null {
    try {
      const row = this.getStmt.get(songId) as { url: string } | undefined
      return row?.url ?? null
    } catch {
      return null
    }
  }

  /** 保存 URL 到缓存 */
  saveUrl(songId: string, url: string): void {
    try {
      this.saveStmt.run({ song_id: songId, url, updated_at: Math.floor(Date.now() / 1000) })
    } catch (e) {
      console.error('保存 URL 缓存失败:', e)
    }
  }

  /** 删除指定缓存（URL 失效时调用） */
  invalidateUrl(songId: string): void {
    try {
      this.deleteStmt.run(songId)
    } catch {}
  }

  /** 清理所有缓存 */
  clearAll(): void {
    try {
      this.db.exec('DELETE FROM url_cache')
    } catch (e) {
      console.error('清空 URL 缓存失败:', e)
    }
  }

  close(): void {
    this.db.close()
  }
}

// 单例导出
export const musicUrlCache = new MusicUrlCache()