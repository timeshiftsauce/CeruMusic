import { normalizeMusicItem, songKey, selectSong } from '@common/musicItem'
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
  song_key: string
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
  song = normalizeMusicItem(song)
  return {
    playlist_id: playlistId,
    song_key: songKey(song),
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
  private get identityColumn(): string {
    return this.hasSongKeys() ? 'song_key' : 'songmid'
  }
  hasSongKeys(): boolean {
    return (this.db.pragma('table_info(playlist_songs)') as any[]).some(
      (c) => c.name === 'song_key'
    )
  }
  private resolveSelector(playlistId: string, selector: string | number): string {
    const song = selectSong(this.listSongs(playlistId), selector)
    return song ? (this.hasSongKeys() ? songKey(song) : String(song.songmid)) : '__missing__'
  }
  async backup(destination: string): Promise<void> {
    await this.db.backup(destination)
  }
  repairNeeded(): boolean {
    return !this.hasSongKeys() || Number(this.db.pragma('user_version', { simple: true })) < 2
  }

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
    const existing = this.db
      .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'playlist_songs'")
      .get()
    this.migrate()
    if (!existing) this.db.pragma('user_version = 2')
    this.prepareStatements()
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
        song_key     TEXT NOT NULL,
        position     INTEGER NOT NULL,
        data         TEXT NOT NULL,
        name         TEXT DEFAULT '',
        singer       TEXT DEFAULT '',
        albumName    TEXT DEFAULT '',
        img          TEXT DEFAULT '',
        PRIMARY KEY (playlist_id, song_key),
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
      `SELECT 1 FROM playlist_songs WHERE playlist_id = ? AND ${this.identityColumn} = ? LIMIT 1`
    )
    this.stmtGetSong = this.db.prepare(
      `SELECT data FROM playlist_songs WHERE playlist_id = ? AND ${this.identityColumn} = ?`
    )
    this.stmtMinPosition = this.db.prepare(
      'SELECT MIN(position) AS p FROM playlist_songs WHERE playlist_id = ?'
    )
    this.stmtMaxPosition = this.db.prepare(
      'SELECT MAX(position) AS p FROM playlist_songs WHERE playlist_id = ?'
    )
    this.stmtInsertSong = this.db.prepare(`
      INSERT OR IGNORE INTO playlist_songs
        (playlist_id, songmid, ${this.hasSongKeys() ? 'song_key,' : ''} position, data, name, singer, albumName, img)
      VALUES
        (@playlist_id, @songmid, ${this.hasSongKeys() ? '@song_key,' : ''} @position, @data, @name, @singer, @albumName, @img)
    `)
    this.stmtDeleteSong = this.db.prepare(
      `DELETE FROM playlist_songs WHERE playlist_id = ? AND ${this.identityColumn} = ?`
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
    const current = rows.map(rowToSongList)
    if (Number(this.db.pragma('user_version', { simple: true })) >= 3) return current
    try {
      const file = path.join(app.getPath('userData'), 'songList', 'index.json')
      const old = JSON.parse(fs.readFileSync(file, 'utf8'))
      return Array.isArray(old)
        ? [...current, ...old.filter((p) => !current.some((c) => c.id === p.id))]
        : current
    } catch {
      return current
    }
  }

  private assertWritablePlaylist(id: string): void {
    if (!this.stmtPlaylistExists.get(id)) throw new Error('请先修复旧版 JSON 歌单，再修改歌曲')
  }

  getPlaylist(id: string): SongList | null {
    const row = this.stmtGetPlaylistById.get(id) as PlaylistRow | undefined
    return row
      ? rowToSongList(row)
      : (this.listPlaylists().find((playlist) => playlist.id === id) ?? null)
  }

  playlistExists(id: string): boolean {
    return !!this.getPlaylist(id)
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
    this.assertWritablePlaylist(id)
    // cascade deletes songs via FK
    this.stmtDeletePlaylist.run(id)
  }

  updatePlaylist(id: string, updates: Partial<Omit<SongList, 'id' | 'createTime'>>): void {
    this.assertWritablePlaylist(id)
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
    this.assertWritablePlaylist(id)
    this.stmtUpdateCover.run(coverImgUrl || DEFAULT_COVER, new Date().toISOString(), id)
  }

  // ===== songs =====

  listSongs(playlistId: string): Songs[] {
    const rows = this.stmtListSongs.all(playlistId) as { data: string }[]
    const out: Songs[] = []
    if (!rows.length && !this.stmtPlaylistExists.get(playlistId) && this.getPlaylist(playlistId)) {
      try {
        const legacy = JSON.parse(
          fs.readFileSync(
            path.join(app.getPath('userData'), 'songList', `${playlistId}.json`),
            'utf8'
          )
        )
        if (Array.isArray(legacy))
          return legacy.flatMap((song) => {
            try {
              return [normalizeMusicItem(song)]
            } catch {
              return []
            }
          })
      } catch {
        /* Keep the legacy file untouched until the repair dialog is accepted. */
      }
    }
    for (const r of rows) {
      try {
        out.push(normalizeMusicItem(JSON.parse(r.data)))
      } catch {
        // skip corrupted row
      }
    }
    return out
  }

  countSongs(playlistId: string): number {
    if (!this.stmtPlaylistExists.get(playlistId)) return this.listSongs(playlistId).length
    const r = this.stmtCountSongs.get(playlistId) as { c: number }
    return r?.c ?? 0
  }

  hasSong(playlistId: string, songmid: string | number): boolean {
    if (!this.stmtPlaylistExists.get(playlistId))
      return !!selectSong(this.listSongs(playlistId), songmid)
    return !!this.stmtHasSong.get(playlistId, this.resolveSelector(playlistId, songmid))
  }

  getSong(playlistId: string, songmid: string | number): Songs | null {
    if (!this.stmtPlaylistExists.get(playlistId))
      return selectSong(this.listSongs(playlistId), songmid) ?? null
    const row = this.stmtGetSong.get(playlistId, this.resolveSelector(playlistId, songmid)) as
      | { data: string }
      | undefined
    if (!row) return null
    try {
      return normalizeMusicItem(JSON.parse(row.data))
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
    songs = songs.map(normalizeMusicItem)
    if (!this.stmtPlaylistExists.get(playlistId))
      throw new Error('请先修复旧版 JSON 歌单，再修改歌曲')
    if (!this.hasSongKeys()) {
      const seen = new Map<string, string>()
      for (const song of [...this.listSongs(playlistId), ...songs]) {
        const mid = String(song.songmid)
        if (seen.has(mid) && seen.get(mid) !== songKey(song))
          throw new Error('请先修复旧版音乐数据，再添加同 ID 的不同来源歌曲')
        seen.set(mid, songKey(song))
      }
    }
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
        const mid = songKey(song)
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
    songs = songs.map(normalizeMusicItem)
    if (!this.stmtPlaylistExists.get(playlistId))
      throw new Error('请先修复旧版 JSON 歌单，再修改歌曲')
    if (!this.hasSongKeys()) {
      const seen = new Map<string, string>()
      for (const song of [...this.listSongs(playlistId), ...songs]) {
        const mid = String(song.songmid)
        if (seen.has(mid) && seen.get(mid) !== songKey(song))
          throw new Error('请先修复旧版音乐数据，再添加同 ID 的不同来源歌曲')
        seen.set(mid, songKey(song))
      }
    }
    const maxRow = this.stmtMaxPosition.get(playlistId) as { p: number | null }
    let nextPos = (maxRow?.p ?? -1) + 1
    let inserted = 0
    const tx = this.db.transaction((items: Songs[]) => {
      const seen = new Set<string>()
      for (const song of items) {
        const mid = songKey(song)
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
    this.assertWritablePlaylist(playlistId)
    if (!songmids.length) return 0
    const ordered = songmids.map((id) => this.resolveSelector(playlistId, id))
    if (new Set(ordered).size !== ordered.length || ordered.includes('__missing__'))
      throw new Error('排序包含重复或不存在的歌曲')
    const remaining = this.listSongs(playlistId)
      .map((song) => (this.hasSongKeys() ? songKey(song) : String(song.songmid)))
      .filter((id) => !ordered.includes(id))
    const updateStmt = this.db.prepare(
      `UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND ${this.identityColumn} = ?`
    )
    let updated = 0
    const tx = this.db.transaction((ids: (string | number)[]) => {
      for (let i = 0; i < ids.length; i++) {
        const info = updateStmt.run(i, playlistId, ids[i])
        if (info.changes > 0) updated++
      }
    })
    tx([...ordered, ...remaining])
    return updated
  }

  /**
   * Move a single song to the target 0-based index. Only rows in the affected
   * range are updated — O(|Δ|) writes instead of O(n).
   */
  moveSong(playlistId: string, songmid: string | number, toIndex: number): boolean {
    this.assertWritablePlaylist(playlistId)
    const mid = this.resolveSelector(playlistId, songmid)
    const curRow = this.db
      .prepare(
        `SELECT position FROM playlist_songs WHERE playlist_id = ? AND ${this.identityColumn} = ?`
      )
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
      `UPDATE playlist_songs SET position = ? WHERE playlist_id = ? AND ${this.identityColumn} = ?`
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
    this.assertWritablePlaylist(playlistId)
    const info = this.stmtDeleteSong.run(playlistId, this.resolveSelector(playlistId, songmid))
    return info.changes > 0
  }

  removeSongs(playlistId: string, songmids: (string | number)[]): number {
    this.assertWritablePlaylist(playlistId)
    if (!songmids.length) return 0
    let removed = 0
    const tx = this.db.transaction((ids: (string | number)[]) => {
      for (const id of ids) {
        const info = this.stmtDeleteSong.run(playlistId, this.resolveSelector(playlistId, id))
        if (info.changes > 0) removed++
      }
    })
    tx(songmids)
    return removed
  }

  replaceSongs(playlistId: string, songs: Songs[]): void {
    songs = songs.map(normalizeMusicItem)
    this.db.transaction(() => {
      this.clearSongs(playlistId)
      this.appendSongs(playlistId, songs)
    })()
  }

  clearSongs(playlistId: string): void {
    this.assertWritablePlaylist(playlistId)
    this.stmtClearSongs.run(playlistId)
  }

  searchSongs(playlistId: string, keyword: string): Songs[] {
    if (!this.stmtPlaylistExists.get(playlistId))
      return this.listSongs(playlistId).filter((song) =>
        [song.name, song.singer, song.albumName].some((value) =>
          value.toLowerCase().includes(keyword.toLowerCase())
        )
      )
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
        out.push(normalizeMusicItem(JSON.parse(r.data)))
      } catch {
        // skip
      }
    }
    return out
  }

  aggregateBy(playlistId: string, field: 'singer' | 'albumName'): Record<string, number> {
    if (!this.stmtPlaylistExists.get(playlistId))
      return this.listSongs(playlistId).reduce(
        (result, song) => {
          if (song[field]) result[song[field]] = (result[song[field]] || 0) + 1
          return result
        },
        {} as Record<string, number>
      )
    const stmt = field === 'singer' ? this.stmtAggSinger : this.stmtAggAlbum
    const rows = stmt.all(playlistId) as { k: string; c: number }[]
    const out: Record<string, number> = {}
    for (const r of rows) out[r.k] = r.c
    return out
  }

  close(): void {
    this.db.close()
  }

  inspectRepair() {
    const rows = this.db.prepare('SELECT playlist_id, data FROM playlist_songs').all() as any[]
    const recoveryCandidates: { playlist: string; name: string; singer: string }[] = []
    const seen = new Set<string>()
    for (const name of fs
      .readdirSync(app.getPath('userData'))
      .filter((name) => name.startsWith('songList.backup.'))) {
      try {
        const dir = path.join(app.getPath('userData'), name)
        const playlists = JSON.parse(fs.readFileSync(path.join(dir, 'index.json'), 'utf8'))
        for (const playlist of playlists) {
          const songs = JSON.parse(fs.readFileSync(path.join(dir, `${playlist.id}.json`), 'utf8'))
          for (const raw of songs) {
            try {
              const song = normalizeMusicItem(raw)
              const key = `${playlist.id}:${songKey(song)}`
              if (!seen.has(key) && !this.getSong(playlist.id, songKey(song))) {
                seen.add(key)
                recoveryCandidates.push({
                  playlist: playlist.name || playlist.id,
                  name: song.name,
                  singer: song.singer
                })
              }
            } catch {
              /* Invalid originals remain in the backup. */
            }
          }
        }
      } catch {
        /* Detailed errors are reported by the consented import. */
      }
    }
    return {
      playlists: this.listPlaylists().length,
      songs: rows.length,
      needsRepair: this.repairNeeded(),
      recoveryCandidates
    }
  }

  repairSongs(): { fixed: number; issues: string[] } {
    const issues: string[] = []
    let fixed = 0
    this.db.transaction(() => {
      const rows = this.db.prepare('SELECT * FROM playlist_songs ORDER BY position').all() as any[]
      if (!this.hasSongKeys()) {
        this.db.exec('ALTER TABLE playlist_songs RENAME TO playlist_songs_old')
        this.db.exec(
          'DROP INDEX IF EXISTS idx_playlist_songs_position; DROP INDEX IF EXISTS idx_playlist_songs_name'
        )
        this.migrate()
      } else this.db.exec('DELETE FROM playlist_songs')
      const insert = this.db.prepare(`INSERT INTO playlist_songs
        (playlist_id, songmid, song_key, position, data, name, singer, albumName, img)
        VALUES (@playlist_id, @songmid, @song_key, @position, @data, @name, @singer, @albumName, @img)`)
      for (const [index, row] of rows.entries()) {
        try {
          const song = normalizeMusicItem(JSON.parse(row.data))
          insert.run(songToRowFields(row.playlist_id, song, row.position))
          fixed++
        } catch (error) {
          // Preserve the exact unreadable row instead of discarding a user's data.
          insert.run({ ...row, song_key: `unrepaired:${index}` })
          issues.push(`${row.playlist_id}/${row.songmid}: ${String(error)}`)
        }
      }
      this.db.exec('DROP TABLE IF EXISTS playlist_songs_old')
      this.db.pragma(
        `user_version = ${Math.max(2, Number(this.db.pragma('user_version', { simple: true })))}`
      )
    })()
    this.prepareStatements()
    return { fixed, issues }
  }

  restoreBackup(filename: string): void {
    this.db.prepare('ATTACH DATABASE ? AS repair_backup').run(filename)
    try {
      const schema = this.db
        .prepare(
          "SELECT name, sql FROM repair_backup.sqlite_master WHERE type = 'table' AND name IN ('playlists', 'playlist_songs') ORDER BY name DESC"
        )
        .all() as any[]
      this.db.transaction(() => {
        this.db.exec('DROP TABLE playlist_songs; DROP TABLE playlists')
        for (const name of ['playlists', 'playlist_songs']) {
          this.db.exec(schema.find((row) => row.name === name).sql)
          this.db.exec(`INSERT INTO ${name} SELECT * FROM repair_backup.${name}`)
        }
        const version = this.db.pragma('repair_backup.user_version', { simple: true })
        this.db.pragma(`user_version = ${Number(version) || 0}`)
      })()
    } finally {
      this.db.exec('DETACH DATABASE repair_backup')
    }
    this.migrate()
    this.prepareStatements()
  }

  importLegacyPlaylists(restoreMissing = false): { fixed: number; issues: string[] } {
    const firstImport = Number(this.db.pragma('user_version', { simple: true })) < 3
    const userData = app.getPath('userData')
    const directories = fs
      .readdirSync(userData)
      .filter((name) => name === 'songList' || name.startsWith('songList.backup.'))
    const issues: string[] = []
    let fixed = 0
    for (const directory of directories) {
      const dir = path.join(userData, directory)
      const indexPath = path.join(dir, 'index.json')
      if (!fs.existsSync(indexPath)) continue
      try {
        const playlists = JSON.parse(fs.readFileSync(indexPath, 'utf8'))
        for (const pl of playlists) {
          const existing = this.stmtPlaylistExists.get(String(pl.id))
          // A backup may contain deliberate deletions. Only restore missing entries by consent.
          if (!existing && !(directory === 'songList' && firstImport) && !restoreMissing) continue
          if (!existing) {
            const now = new Date().toISOString()
            this.insertPlaylist({
              ...pl,
              name: pl.name || pl.id,
              source: pl.source || 'local',
              description: pl.description || '',
              coverImgUrl: pl.coverImgUrl || DEFAULT_COVER,
              meta: pl.meta || {},
              createTime: pl.createTime || now,
              updateTime: pl.updateTime || now
            })
          }
          const file = path.join(dir, `${pl.id}.json`)
          if (!fs.existsSync(file)) continue
          const values = JSON.parse(fs.readFileSync(file, 'utf8'))
          for (const value of values) {
            try {
              const song = normalizeMusicItem(value)
              const current = this.getSong(pl.id, songKey(song))
              if (current) {
                const merged = { ...song, ...current }
                for (const field of ['interval', 'img', 'albumName', 'hash']) {
                  if (!current[field] || current[field] === '0:00' || current[field] === '00:00')
                    merged[field] = song[field]
                }
                merged.types = (current.types?.length ? current.types : song.types)?.map(
                  (quality: any) => {
                    const type = typeof quality === 'string' ? quality : quality.type
                    const old = song.types?.find(
                      (q: any) => (typeof q === 'string' ? q : q.type) === type
                    )
                    return {
                      ...(typeof old === 'object' ? old : {}),
                      ...(typeof quality === 'object' ? quality : { type })
                    }
                  }
                )
                this.db
                  .prepare(
                    'UPDATE playlist_songs SET data = ? WHERE playlist_id = ? AND song_key = ?'
                  )
                  .run(JSON.stringify(normalizeMusicItem(merged)), pl.id, songKey(song))
              } else if ((directory === 'songList' && firstImport) || restoreMissing)
                fixed += this.appendSongs(pl.id, [song])
            } catch (error) {
              issues.push(`${pl.id}: ${String(error)}`)
            }
          }
        }
      } catch (error) {
        issues.push(`${directory}: ${String(error)}`)
      }
    }
    // Retain raw JSON for backup/retry, but never resurrect it after a later deletion.
    this.db.pragma('user_version = 3')
    return { fixed, issues }
  }
}

let repairLocked = false
export const setPlaylistRepairLocked = (value: boolean) => {
  repairLocked = value
}
let instance: PlaylistDatabase | undefined
export function getPlaylistDatabase(): PlaylistDatabase {
  if (repairLocked) throw new Error('音乐数据正在修复，请稍后重试')
  return (instance ??= new PlaylistDatabase())
}
