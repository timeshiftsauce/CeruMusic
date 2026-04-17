import path from 'node:path'
import fs from 'node:fs'
import { app } from 'electron'
import Database from 'better-sqlite3'
import type { SongList, Songs } from '@common/types/songList'

const DEFAULT_COVER = 'default-cover'

export interface PlaylistRow {
  id: string
  name: string
  description: string
  coverImgUrl: string
  source: string
  meta: string
  createTime: string
  updateTime: string
}

interface PlaylistSongRow {
  playlist_id: string
  songmid: string
  position: number
  data: string
  name: string
  singer: string
  albumName: string
  img: string
}

function rowToSongList(r: PlaylistRow): SongList {
  let meta: Record<string, any> = {}
  try {
    meta = r.meta ? JSON.parse(r.meta) : {}
  } catch {
    meta = {}
  }
  return {
    id: r.id,
    name: r.name,
    description: r.description || '',
    coverImgUrl: r.coverImgUrl || DEFAULT_COVER,
    source: r.source as SongList['source'],
    meta,
    createTime: r.createTime,
    updateTime: r.updateTime
  }
}

function songToRowFields(playlistId: string, song: Songs, position: number): PlaylistSongRow {
  return {
    playlist_id: playlistId,
    songmid: String(song.songmid),
    position,
    data: JSON.stringify(song),
    name: String(song.name ?? ''),
    singer: String(song.singer ?? ''),
    albumName: String(song.albumName ?? ''),
    img: String(song.img ?? '')
  }
}

export class PlaylistDatabase {
  private db: Database.Database

  private stmtGetPlaylists!: Database.Statement
  private stmtGetPlaylistById!: Database.Statement
  private stmtInsertPlaylist!: Database.Statement
  private stmtDeletePlaylist!: Database.Statement
  private stmtUpdatePlaylist!: Database.Statement
  private stmtUpdateCover!: Database.Statement
  private stmtPlaylistExists!: Database.Statement

  private stmtListSongs!: Database.Statement
  private stmtCountSongs!: Database.Statement
  private stmtHasSong!: Database.Statement
  private stmtGetSong!: Database.Statement
  private stmtMinPosition!: Database.Statement
  private stmtMaxPosition!: Database.Statement
  private stmtInsertSong!: Database.Statement
  private stmtDeleteSong!: Database.Statement
  private stmtClearSongs!: Database.Statement
  private stmtAggSinger!: Database.Statement
  private stmtAggAlbum!: Database.Statement

  constructor() {
    const userData = app.getPath('userData')
    if (!fs.existsSync(userData)) fs.mkdirSync(userData, { recursive: true })
    const dbPath = path.join(userData, 'playlists.db')
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.db.pragma('synchronous = NORMAL')
    this.db.pragma('foreign_keys = ON')
    this.migrate()
    this.prepareStatements()
    this.migrateFromJsonIfNeeded()
  }

  private migrate() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS playlists (
        id           TEXT PRIMARY KEY,
        name         TEXT NOT NULL,
        description  TEXT DEFAULT '',
        coverImgUrl  TEXT DEFAULT '${DEFAULT_COVER}',
        source       TEXT NOT NULL,
        meta         TEXT DEFAULT '{}',
        createTime   TEXT NOT NULL,
        updateTime   TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS playlist_songs (
        playlist_id  TEXT NOT NULL,
        songmid      TEXT NOT NULL,
        position     INTEGER NOT NULL,
        data         TEXT NOT NULL,
        name         TEXT DEFAULT '',
        singer       TEXT DEFAULT '',
        albumName    TEXT DEFAULT '',
        img          TEXT DEFAULT '',
        PRIMARY KEY (playlist_id, songmid),
        FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_playlist_songs_position
        ON playlist_songs(playlist_id, position);
      CREATE INDEX IF NOT EXISTS idx_playlist_songs_name
        ON playlist_songs(playlist_id, name);
    `)
  }

  private prepareStatements() {
    this.stmtGetPlaylists = this.db.prepare('SELECT * FROM playlists ORDER BY createTime ASC')
    this.stmtGetPlaylistById = this.db.prepare('SELECT * FROM playlists WHERE id = ?')
    this.stmtInsertPlaylist = this.db.prepare(`
      INSERT INTO playlists (id, name, description, coverImgUrl, source, meta, createTime, updateTime)
      VALUES (@id, @name, @description, @coverImgUrl, @source, @meta, @createTime, @updateTime)
    `)
    this.stmtDeletePlaylist = this.db.prepare('DELETE FROM playlists WHERE id = ?')
    this.stmtUpdatePlaylist = this.db.prepare(`
      UPDATE playlists SET
        name = COALESCE(@name, name),
        description = COALESCE(@description, description),
        coverImgUrl = COALESCE(@coverImgUrl, coverImgUrl),
        source = COALESCE(@source, source),
        meta = COALESCE(@meta, meta),
        updateTime = @updateTime
      WHERE id = @id
    `)
    this.stmtUpdateCover = this.db.prepare(
      'UPDATE playlists SET coverImgUrl = ?, updateTime = ? WHERE id = ?'
    )
    this.stmtPlaylistExists = this.db.prepare('SELECT 1 FROM playlists WHERE id = ? LIMIT 1')

    this.stmtListSongs = this.db.prepare(
      'SELECT data FROM playlist_songs WHERE playlist_id = ? ORDER BY position ASC'
    )
    this.stmtCountSongs = this.db.prepare(
      'SELECT COUNT(*) AS c FROM playlist_songs WHERE playlist_id = ?'
    )
    this.stmtHasSong = this.db.prepare(
      'SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND songmid = ? LIMIT 1'
    )
    this.stmtGetSong = this.db.prepare(
      'SELECT data FROM playlist_songs WHERE playlist_id = ? AND songmid = ?'
    )
    this.stmtMinPosition = this.db.prepare(
      'SELECT MIN(position) AS p FROM playlist_songs WHERE playlist_id = ?'
    )
    this.stmtMaxPosition = this.db.prepare(
      'SELECT MAX(position) AS p FROM playlist_songs WHERE playlist_id = ?'
    )
    this.stmtInsertSong = this.db.prepare(`
      INSERT OR IGNORE INTO playlist_songs
        (playlist_id, songmid, position, data, name, singer, albumName, img)
      VALUES
        (@playlist_id, @songmid, @position, @data, @name, @singer, @albumName, @img)
    `)
    this.stmtDeleteSong = this.db.prepare(
      'DELETE FROM playlist_songs WHERE playlist_id = ? AND songmid = ?'
    )
    this.stmtClearSongs = this.db.prepare('DELETE FROM playlist_songs WHERE playlist_id = ?')
    this.stmtAggSinger = this.db.prepare(`
      SELECT singer AS k, COUNT(*) AS c FROM playlist_songs
      WHERE playlist_id = ? AND singer <> '' GROUP BY singer
    `)
    this.stmtAggAlbum = this.db.prepare(`
      SELECT albumName AS k, COUNT(*) AS c FROM playlist_songs
      WHERE playlist_id = ? AND albumName <> '' GROUP BY albumName
    `)
  }

  // ===== playlists =====

  listPlaylists(): SongList[] {
    const rows = this.stmtGetPlaylists.all() as PlaylistRow[]
    return rows.map(rowToSongList)
  }

  getPlaylist(id: string): SongList | null {
    const row = this.stmtGetPlaylistById.get(id) as PlaylistRow | undefined
    return row ? rowToSongList(row) : null
  }

  playlistExists(id: string): boolean {
    return !!this.stmtPlaylistExists.get(id)
  }

  insertPlaylist(p: SongList): void {
    this.stmtInsertPlaylist.run({
      id: p.id,
      name: p.name,
      description: p.description || '',
      coverImgUrl: p.coverImgUrl || DEFAULT_COVER,
      source: p.source,
      meta: JSON.stringify(p.meta || {}),
      createTime: p.createTime,
      updateTime: p.updateTime
    })
  }

  deletePlaylist(id: string): void {
    // cascade deletes songs via FK
    this.stmtDeletePlaylist.run(id)
  }

  updatePlaylist(id: string, updates: Partial<Omit<SongList, 'id' | 'createTime'>>): void {
    this.stmtUpdatePlaylist.run({
      id,
      name: updates.name ?? null,
      description: updates.description ?? null,
      coverImgUrl: updates.coverImgUrl ?? null,
      source: updates.source ?? null,
      meta: updates.meta !== undefined ? JSON.stringify(updates.meta) : null,
      updateTime: new Date().toISOString()
    })
  }

  updateCover(id: string, coverImgUrl: string): void {
    this.stmtUpdateCover.run(coverImgUrl || DEFAULT_COVER, new Date().toISOString(), id)
  }

  // ===== songs =====

  listSongs(playlistId: string): Songs[] {
    const rows = this.stmtListSongs.all(playlistId) as { data: string }[]
    const out: Songs[] = []
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.data) as Songs)
      } catch {
        // skip corrupted row
      }
    }
    return out
  }

  countSongs(playlistId: string): number {
    const r = this.stmtCountSongs.get(playlistId) as { c: number }
    return r?.c ?? 0
  }

  hasSong(playlistId: string, songmid: string | number): boolean {
    return !!this.stmtHasSong.get(playlistId, String(songmid))
  }

  getSong(playlistId: string, songmid: string | number): Songs | null {
    const row = this.stmtGetSong.get(playlistId, String(songmid)) as { data: string } | undefined
    if (!row) return null
    try {
      return JSON.parse(row.data) as Songs
    } catch {
      return null
    }
  }

  /**
   * Insert songs at the head (matches original unshift behaviour) with monotonic position.
   * Returns the number of songs actually inserted (ignoring duplicates by primary key).
   */
  addSongsHead(playlistId: string, songs: Songs[], desc: boolean): number {
    if (!songs.length) return 0
    const minRow = this.stmtMinPosition.get(playlistId) as { p: number | null }
    const minPos = minRow?.p ?? 0
    const ordered = desc ? [...songs].reverse() : songs
    // Preserve array order: first item ends up at smallest position.
    // If we want ordered[0] at the front, positions must be ascending from
    // (minPos - ordered.length) to (minPos - 1).
    let inserted = 0
    const tx = this.db.transaction((items: Songs[]) => {
      const startPos = minPos - items.length
      const seen = new Set<string>()
      for (let i = 0; i < items.length; i++) {
        const song = items[i]
        const mid = String(song?.songmid ?? '')
        if (!mid || seen.has(mid)) continue
        seen.add(mid)
        const info = this.stmtInsertSong.run(songToRowFields(playlistId, song, startPos + i))
        if (info.changes > 0) inserted++
      }
    })
    tx(ordered)
    return inserted
  }

  /**
   * Append songs at the tail (used by initial JSON migration to preserve the
   * original array order).
   */
  appendSongs(playlistId: string, songs: Songs[]): number {
    if (!songs.length) return 0
    const maxRow = this.stmtMaxPosition.get(playlistId) as { p: number | null }
    let nextPos = (maxRow?.p ?? -1) + 1
    let inserted = 0
    const tx = this.db.transaction((items: Songs[]) => {
      const seen = new Set<string>()
      for (const song of items) {
        const mid = String(song?.songmid ?? '')
        if (!mid || seen.has(mid)) continue
        seen.add(mid)
        const info = this.stmtInsertSong.run(songToRowFields(playlistId, song, nextPos))
        if (info.changes > 0) {
          inserted++
          nextPos++
        }
      }
    })
    tx(songs)
    return inserted
  }

  /**
   * Rewrite positions so that the given songmids reflect the final order.
   * Songmids not provided are left untouched at positions past the newly assigned range.
   */
  reorderSongs(playlistId: string, songmids: (string | number)[]): number {
    if (!songmids.length) return 0
    const updateStmt = this.db.prepare(
      'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND songmid = ?'
    )
    let updated = 0
    const tx = this.db.transaction((ids: (string | number)[]) => {
      for (let i = 0; i < ids.length; i++) {
        const info = updateStmt.run(i, playlistId, String(ids[i]))
        if (info.changes > 0) updated++
      }
    })
    tx(songmids)
    return updated
  }

  /**
   * Move a single song to the target 0-based index. Only rows in the affected
   * range are updated — O(|Δ|) writes instead of O(n).
   */
  moveSong(playlistId: string, songmid: string | number, toIndex: number): boolean {
    const mid = String(songmid)
    const curRow = this.db
      .prepare('SELECT position FROM playlist_songs WHERE playlist_id = ? AND songmid = ?')
      .get(playlistId, mid) as { position: number } | undefined
    if (!curRow) return false

    const total = this.countSongs(playlistId)
    const clamped = Math.max(0, Math.min(toIndex | 0, total - 1))

    const targetRow = this.db
      .prepare(
        'SELECT position FROM playlist_songs WHERE playlist_id = ? ORDER BY position ASC LIMIT 1 OFFSET ?'
      )
      .get(playlistId, clamped) as { position: number } | undefined
    if (!targetRow) return false

    const curPos = curRow.position
    const targetPos = targetRow.position
    if (curPos === targetPos) return false

    const shiftDown = this.db.prepare(
      `UPDATE playlist_songs SET position = position - 1
       WHERE playlist_id = ? AND position > ? AND position <= ?`
    )
    const shiftUp = this.db.prepare(
      `UPDATE playlist_songs SET position = position + 1
       WHERE playlist_id = ? AND position >= ? AND position < ?`
    )
    const setPos = this.db.prepare(
      'UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND songmid = ?'
    )

    const tx = this.db.transaction(() => {
      if (curPos < targetPos) {
        shiftDown.run(playlistId, curPos, targetPos)
      } else {
        shiftUp.run(playlistId, targetPos, curPos)
      }
      setPos.run(targetPos, playlistId, mid)
    })
    tx()
    return true
  }

  removeSong(playlistId: string, songmid: string | number): boolean {
    const info = this.stmtDeleteSong.run(playlistId, String(songmid))
    return info.changes > 0
  }

  removeSongs(playlistId: string, songmids: (string | number)[]): number {
    if (!songmids.length) return 0
    let removed = 0
    const tx = this.db.transaction((ids: (string | number)[]) => {
      for (const id of ids) {
        const info = this.stmtDeleteSong.run(playlistId, String(id))
        if (info.changes > 0) removed++
      }
    })
    tx(songmids)
    return removed
  }

  clearSongs(playlistId: string): void {
    this.stmtClearSongs.run(playlistId)
  }

  searchSongs(playlistId: string, keyword: string): Songs[] {
    const kw = `%${keyword.replace(/[%_]/g, (m) => '\\' + m)}%`
    const rows = this.db
      .prepare(
        `SELECT data FROM playlist_songs
         WHERE playlist_id = ?
           AND (name LIKE ? ESCAPE '\\'
             OR singer LIKE ? ESCAPE '\\'
             OR albumName LIKE ? ESCAPE '\\')
         ORDER BY position ASC`
      )
      .all(playlistId, kw, kw, kw) as { data: string }[]
    const out: Songs[] = []
    for (const r of rows) {
      try {
        out.push(JSON.parse(r.data) as Songs)
      } catch {
        // skip
      }
    }
    return out
  }

  aggregateBy(playlistId: string, field: 'singer' | 'albumName'): Record<string, number> {
    const stmt = field === 'singer' ? this.stmtAggSinger : this.stmtAggAlbum
    const rows = stmt.all(playlistId) as { k: string; c: number }[]
    const out: Record<string, number> = {}
    for (const r of rows) out[r.k] = r.c
    return out
  }

  // ===== one-shot JSON migration =====

  private migrateFromJsonIfNeeded(): void {
    try {
      const userData = app.getPath('userData')
      const dir = path.join(userData, 'songList')
      const indexPath = path.join(dir, 'index.json')
      if (!fs.existsSync(indexPath)) return

      // Only migrate if DB is empty to avoid re-import after user work.
      const cnt = this.db.prepare('SELECT COUNT(*) AS c FROM playlists').get() as {
        c: number
      }
      if (cnt.c > 0) return

      const raw = fs.readFileSync(indexPath, 'utf-8')
      const parsed = JSON.parse(raw)
      if (!Array.isArray(parsed)) return

      const tx = this.db.transaction((playlists: SongList[]) => {
        for (const pl of playlists) {
          if (!pl || !pl.id) continue
          const nowIso = new Date().toISOString()
          const normalized: SongList = {
            id: pl.id,
            name: pl.name ?? pl.id,
            description: pl.description ?? '',
            coverImgUrl: pl.coverImgUrl || DEFAULT_COVER,
            source: pl.source ?? 'local',
            meta: pl.meta ?? {},
            createTime: pl.createTime || nowIso,
            updateTime: pl.updateTime || nowIso
          }
          this.insertPlaylist(normalized)

          const songsFile = path.join(dir, `${pl.id}.json`)
          if (fs.existsSync(songsFile)) {
            try {
              const sraw = fs.readFileSync(songsFile, 'utf-8')
              const sarr = JSON.parse(sraw)
              if (Array.isArray(sarr) && sarr.length > 0) {
                this.appendSongs(pl.id, sarr as Songs[])
              }
            } catch (e) {
              console.warn(`迁移歌单 ${pl.id} 的歌曲失败:`, e)
            }
          }
        }
      })
      tx(parsed as SongList[])

      try {
        const backup = path.join(userData, `songList.backup.${Date.now()}`)
        fs.renameSync(dir, backup)
        console.log(`[playlist] JSON 歌单已迁移到 SQLite，旧数据保留在: ${backup}`)
      } catch (e) {
        console.warn('[playlist] 重命名旧 songList 目录失败（不影响迁移结果）:', e)
      }
    } catch (e) {
      console.error('[playlist] JSON → SQLite 迁移失败，将保留旧 JSON 数据:', e)
    }
  }
}

let instance: PlaylistDatabase | null = null
export function getPlaylistDatabase(): PlaylistDatabase {
  if (!instance) instance = new PlaylistDatabase()
  return instance
}
