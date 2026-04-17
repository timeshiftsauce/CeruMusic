import path from 'node:path'
import fs from 'fs'
import { app } from 'electron'
import Database from 'better-sqlite3'

export interface TrackRow {
  songmid: string
  path: string
  url: string | null
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  hasCover: number
  coverKey: string | null
  year: number
  lrc: string | null
  types: string
  _types: string
  typeUrl: string
  bitrate: number
  sampleRate: number
  channels: number
  duration: number
  size: number
  mtime_ms: number
  hash: string | null
  updated_at: number
}

export interface StatRow {
  songmid: string
  path: string
  size: number
  mtime_ms: number
}

export class MusicDatabase {
  private db: Database.Database
  private upsertStmt!: Database.Statement<[TrackRow]>

  constructor() {
    const userData = app.getPath('userData')
    if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true })
    const dbPath = path.join(userData, 'local-music.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = OFF')
    this.migrate()
    this.prepareStatements()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS tracks (
        songmid      TEXT PRIMARY KEY,
        path         TEXT NOT NULL UNIQUE,
        url          TEXT,
        singer       TEXT DEFAULT '',
        name         TEXT DEFAULT '',
        albumName    TEXT DEFAULT '',
        albumId      INTEGER DEFAULT 0,
        source       TEXT DEFAULT 'local',
        interval     TEXT DEFAULT '',
        hasCover     INTEGER DEFAULT 0,
        coverKey     TEXT,
        year         INTEGER DEFAULT 0,
        lrc          TEXT,
        types        TEXT DEFAULT '[]',
        _types       TEXT DEFAULT '{}',
        typeUrl      TEXT DEFAULT '{}',
        bitrate      INTEGER DEFAULT 0,
        sampleRate   INTEGER DEFAULT 0,
        channels     INTEGER DEFAULT 0,
        duration     REAL DEFAULT 0,
        size         INTEGER DEFAULT 0,
        mtime_ms     INTEGER DEFAULT 0,
        hash         TEXT,
        updated_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_tracks_path ON tracks(path);
      CREATE TABLE IF NOT EXISTS dirs (
        path TEXT PRIMARY KEY
      );
    `)
  }

  private prepareStatements() {
    this.upsertStmt = this.db.prepare(`
      INSERT INTO tracks (
        songmid, path, url, singer, name, albumName, albumId, source, interval,
        hasCover, coverKey, year, lrc, types, _types, typeUrl,
        bitrate, sampleRate, channels, duration, size, mtime_ms, hash, updated_at
      ) VALUES (
        @songmid, @path, @url, @singer, @name, @albumName, @albumId, @source, @interval,
        @hasCover, @coverKey, @year, @lrc, @types, @_types, @typeUrl,
        @bitrate, @sampleRate, @channels, @duration, @size, @mtime_ms, @hash, @updated_at
      )
      ON CONFLICT(songmid) DO UPDATE SET
        path=excluded.path,
        url=excluded.url,
        singer=excluded.singer,
        name=excluded.name,
        albumName=excluded.albumName,
        albumId=excluded.albumId,
        source=excluded.source,
        interval=excluded.interval,
        hasCover=excluded.hasCover,
        coverKey=excluded.coverKey,
        year=excluded.year,
        lrc=excluded.lrc,
        types=excluded.types,
        _types=excluded._types,
        typeUrl=excluded.typeUrl,
        bitrate=excluded.bitrate,
        sampleRate=excluded.sampleRate,
        channels=excluded.channels,
        duration=excluded.duration,
        size=excluded.size,
        mtime_ms=excluded.mtime_ms,
        hash=excluded.hash,
        updated_at=excluded.updated_at
    `)
  }

  getAllTracks(): TrackRow[] {
    return this.db.prepare('SELECT * FROM tracks').all() as TrackRow[]
  }

  getTrackById(songmid: string): TrackRow | null {
    const row = this.db.prepare('SELECT * FROM tracks WHERE songmid = ?').get(songmid) as
      | TrackRow
      | undefined
    return row || null
  }

  getTrackByPath(path: string): TrackRow | null {
    const row = this.db.prepare('SELECT * FROM tracks WHERE path = ?').get(path) as
      | TrackRow
      | undefined
    return row || null
  }

  getStatByPath(path: string): StatRow | null {
    const row = this.db
      .prepare('SELECT songmid, path, size, mtime_ms FROM tracks WHERE path = ?')
      .get(path) as StatRow | undefined
    return row || null
  }

  /** Bulk-load all (path -> {size, mtime_ms}) in one query. Avoids N sync DB calls during scan. */
  getAllStats(): Map<string, { size: number; mtime_ms: number; songmid: string }> {
    const rows = this.db
      .prepare('SELECT songmid, path, size, mtime_ms FROM tracks')
      .all() as Array<{ songmid: string; path: string; size: number; mtime_ms: number }>
    const map = new Map<string, { size: number; mtime_ms: number; songmid: string }>()
    for (const r of rows) {
      map.set(r.path, { size: r.size, mtime_ms: r.mtime_ms, songmid: r.songmid })
    }
    return map
  }

  upsertTrack(row: TrackRow) {
    this.upsertStmt.run(row)
  }

  upsertTracks(rows: TrackRow[]) {
    const stmt = this.upsertStmt
    const tx = this.db.transaction((items: TrackRow[]) => {
      for (const it of items) stmt.run(it)
    })
    tx(rows)
  }

  deleteByPath(p: string) {
    this.db.prepare('DELETE FROM tracks WHERE path = ?').run(p)
  }

  deleteBySongmid(songmid: string) {
    this.db.prepare('DELETE FROM tracks WHERE songmid = ?').run(songmid)
  }

  clearTracks() {
    this.db.prepare('DELETE FROM tracks').run()
  }

  pruneOutsideKeep(dirPrefixes: string[], keepPaths: string[]): number {
    if (!dirPrefixes.length) return 0
    const keepSet = new Set(keepPaths)
    const removeIds: string[] = []
    const stmt = this.db.prepare('SELECT songmid, path FROM tracks')
    for (const r of stmt.iterate() as IterableIterator<{ songmid: string; path: string }>) {
      const np = r.path.replace(/\\/g, '/').toLowerCase()
      const underScanned = dirPrefixes.some((d) => np.startsWith(d))
      const keep = keepSet.has(r.path) || keepSet.has(np)
      if (underScanned && !keep) removeIds.push(r.songmid)
    }
    if (!removeIds.length) return 0
    const del = this.db.prepare('DELETE FROM tracks WHERE songmid = ?')
    const tx = this.db.transaction((ids: string[]) => {
      for (const id of ids) del.run(id)
    })
    tx(removeIds)
    return removeIds.length
  }

  getDirs(): string[] {
    const rows = this.db.prepare('SELECT path FROM dirs').all() as { path: string }[]
    return rows.map((r) => r.path)
  }

  setDirs(dirs: string[]) {
    const list = Array.from(new Set(dirs.filter(Boolean)))
    const tx = this.db.transaction((items: string[]) => {
      this.db.prepare('DELETE FROM dirs').run()
      const ins = this.db.prepare('INSERT OR IGNORE INTO dirs(path) VALUES (?)')
      for (const d of items) ins.run(d)
    })
    tx(list)
  }
}

let instance: MusicDatabase | null = null
export function getMusicDatabase(): MusicDatabase {
  if (!instance) instance = new MusicDatabase()
  return instance
}
