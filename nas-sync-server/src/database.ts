import {mkdirSync} from 'node:fs';
import {dirname} from 'node:path';

import Database from 'better-sqlite3';

import {createId, createPairCode, hashToken, nowIso} from './crypto.ts';
import {encodeSongForLegacyClient, getText, normalizeFavoriteEntityType, normalizeSong, parseJsonArray} from './normalize.ts';
import type {
  AuthUser,
  FavoriteInput,
  PlaylistInput,
  PlaylistPatchInput,
  PlaylistSongMutationInput,
  RequestContext,
  SyncEvent,
  UnknownRecord,
} from './types.ts';

const json = (value: unknown) => JSON.stringify(value ?? null);
const parseJson = <T>(value: unknown, fallback: T): T => {
  if (typeof value !== 'string' || !value.trim()) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
};

type UserRow = {
  id: string;
  username: string;
  email: string | null;
  nickname: string | null;
  password_hash: string;
  created_at: string;
  updated_at: string;
};

type PairCodeRow = {
  id: string;
  user_id: string;
  code_hash: string;
  expires_at: number;
  used_at: string | null;
  created_at: string;
};

type PlaylistRow = {
  id: string;
  user_id: string;
  local_id: string | null;
  title: string;
  description: string | null;
  cover_url: string | null;
  semantic_type: string | null;
  source: string | null;
  source_playlist_id: string | null;
  revision: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type PlaylistSongRow = {
  id: string;
  user_id: string;
  playlist_id: string;
  track_key: string;
  track_json: string;
  sort_order: number;
  revision: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type FavoriteRow = {
  id: string;
  user_id: string;
  entity_type: string;
  entity_id: string;
  source_entity_id: string | null;
  title: string | null;
  description: string | null;
  cover_url: string | null;
  source: string | null;
  owner_name: string | null;
  metadata_json: string | null;
  revision: number;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type SyncEventRow = {
  revision: number;
  entity_type: string;
  entity_id: string;
  action: string;
  payload_json: string;
  deleted_at: string | null;
  created_at: string;
};

const toUser = (row: UserRow): AuthUser => ({
  id: row.id,
  username: row.username,
  email: row.email,
  nickname: row.nickname,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPlaylist = (row: PlaylistRow, total = 0) => ({
  id: row.id,
  localId: row.local_id || undefined,
  title: row.title,
  name: row.title,
  description: row.description || '',
  describe: row.description || '',
  coverUrl: row.cover_url || undefined,
  cover: row.cover_url || undefined,
  filePath: row.cover_url || undefined,
  semanticType: row.semantic_type || undefined,
  source: row.source || undefined,
  sourcePlaylistId: row.source_playlist_id || undefined,
  total,
  revision: row.revision,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toPlaylistSong = (row: PlaylistSongRow) => {
  const song = parseJson<Record<string, unknown>>(row.track_json, {});
  return {
    ...encodeSongForLegacyClient(song as never),
    ...song,
    position: row.sort_order,
    pos: row.sort_order,
    trackKey: row.track_key,
    revision: row.revision,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
};

const toFavorite = (row: FavoriteRow) => ({
  id: row.id,
  entityType: row.entity_type,
  entityId: row.entity_id,
  playlistId: row.entity_type === 'playlist' ? row.entity_id : undefined,
  sourcePlaylistId: row.source_entity_id || undefined,
  source: row.source || undefined,
  title: row.title || '未命名收藏',
  name: row.title || '未命名收藏',
  description: row.description || '',
  describe: row.description || '',
  coverUrl: row.cover_url || undefined,
  cover: row.cover_url || undefined,
  filePath: row.cover_url || undefined,
  ownerName: row.owner_name || undefined,
  metadata: parseJson<Record<string, unknown> | null>(row.metadata_json, null) || undefined,
  revision: row.revision,
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const toSyncEvent = (row: SyncEventRow): SyncEvent => ({
  revision: row.revision,
  entityType: row.entity_type,
  entityId: row.entity_id,
  action: row.action,
  payload: parseJson(row.payload_json, null),
  deletedAt: row.deleted_at,
  createdAt: row.created_at,
});

export class SyncDatabase {
  private readonly db: Database.Database;

  constructor(dbPath: string) {
    mkdirSync(dirname(dbPath), {recursive: true});
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');
    this.initSchema();
  }

  close() {
    this.db.close();
  }

  createUser(input: {username: string; email?: string; nickname?: string; passwordHash: string}) {
    const at = nowIso();
    const user = {
      id: createId('usr'),
      username: input.username.trim(),
      email: input.email?.trim() || null,
      nickname: input.nickname?.trim() || null,
      password_hash: input.passwordHash,
      created_at: at,
      updated_at: at,
    };

    this.db
      .prepare(
        `INSERT INTO users (id, username, email, nickname, password_hash, created_at, updated_at)
         VALUES (@id, @username, @email, @nickname, @password_hash, @created_at, @updated_at)`,
      )
      .run(user);
    this.db.prepare(`INSERT INTO user_revision (user_id, current_revision) VALUES (?, 0)`).run(user.id);

    return toUser(user);
  }

  findUserWithPassword(username: string) {
    const row = this.db
      .prepare(`SELECT * FROM users WHERE username = ? OR email = ?`)
      .get(username, username) as UserRow | undefined;
    if (!row) return null;
    return {user: toUser(row), passwordHash: row.password_hash};
  }

  findUserById(userId: string) {
    const row = this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId) as UserRow | undefined;
    return row ? toUser(row) : null;
  }

  listUsers() {
    const rows = this.db.prepare(`SELECT * FROM users ORDER BY created_at ASC`).all() as UserRow[];
    return rows.map(toUser);
  }

  createPairCode(input: {userId: string; ttlMs: number}) {
    const user = this.findUserById(input.userId);
    if (!user) return null;

    const code = createPairCode();
    const at = nowIso();
    const row: PairCodeRow = {
      id: createId('pair'),
      user_id: input.userId,
      code_hash: hashToken(code),
      expires_at: Date.now() + input.ttlMs,
      used_at: null,
      created_at: at,
    };

    this.db
      .prepare(
        `INSERT INTO pair_codes (id, user_id, code_hash, expires_at, used_at, created_at)
         VALUES (@id, @user_id, @code_hash, @expires_at, @used_at, @created_at)`,
      )
      .run(row);

    return {code, expiresAt: row.expires_at, user};
  }

  consumePairCode(code: string) {
    const codeHash = hashToken(code.trim().toUpperCase());
    const at = nowIso();
    return this.db.transaction(() => {
      const row = this.db
        .prepare(
          `SELECT pc.*
           FROM pair_codes pc
           WHERE pc.code_hash = ? AND pc.used_at IS NULL AND pc.expires_at > ?`,
        )
        .get(codeHash, Date.now()) as PairCodeRow | undefined;
      if (!row) return null;

      this.db.prepare(`UPDATE pair_codes SET used_at = ? WHERE id = ? AND used_at IS NULL`).run(at, row.id);
      return this.findUserById(row.user_id);
    })();
  }

  createSession(userId: string, token: string, ttlMs: number) {
    const at = nowIso();
    const expiresAt = Date.now() + ttlMs;
    this.db
      .prepare(
        `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(hashToken(token), userId, expiresAt, at);
    return expiresAt;
  }

  authenticateBearerToken(token: string): RequestContext | null {
    const tokenHash = hashToken(token);
    const row = this.db
      .prepare(
        `SELECT u.*
         FROM sessions s
         INNER JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.revoked_at IS NULL AND s.expires_at > ?`,
      )
      .get(tokenHash, Date.now()) as UserRow | undefined;

    if (!row) return null;
    return {user: toUser(row), tokenHash};
  }

  getCurrentRevision(userId: string) {
    const row = this.db
      .prepare(`SELECT current_revision FROM user_revision WHERE user_id = ?`)
      .get(userId) as {current_revision: number} | undefined;
    return row?.current_revision ?? 0;
  }

  listPlaylists(userId: string) {
    const rows = this.db
      .prepare(`SELECT * FROM playlists WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`)
      .all(userId) as PlaylistRow[];
    const count = this.db.prepare(
      `SELECT COUNT(*) AS total FROM playlist_songs WHERE user_id = ? AND playlist_id = ? AND deleted_at IS NULL`,
    );
    return rows.map((row) => toPlaylist(row, Number((count.get(userId, row.id) as {total: number}).total || 0)));
  }

  getPlaylistSongs(userId: string, playlistId: string, sort: 'asc' | 'desc' = 'asc', limit?: number, pos?: number) {
    const playlist = this.db
      .prepare(`SELECT * FROM playlists WHERE user_id = ? AND id = ? AND deleted_at IS NULL`)
      .get(userId, playlistId) as PlaylistRow | undefined;
    if (!playlist) return null;

    const order = sort === 'desc' ? 'DESC' : 'ASC';
    const offset = Math.max(0, pos ?? 0);
    const max = Math.max(0, limit ?? 5000);
    const rows = this.db
      .prepare(
        `SELECT * FROM playlist_songs
         WHERE user_id = ? AND playlist_id = ? AND deleted_at IS NULL
         ORDER BY sort_order ${order}, created_at ${order}
         LIMIT ? OFFSET ?`,
      )
      .all(userId, playlistId, max, offset) as PlaylistSongRow[];
    const total = this.db
      .prepare(`SELECT COUNT(*) AS total FROM playlist_songs WHERE user_id = ? AND playlist_id = ? AND deleted_at IS NULL`)
      .get(userId, playlistId) as {total: number};

    return {playlist: toPlaylist(playlist, total.total), list: rows.map(toPlaylistSong), songs: rows.map(toPlaylistSong), total: total.total};
  }

  createPlaylist(userId: string, input: PlaylistInput) {
    return this.writeTransaction(userId, (revision, at) => {
      const playlist = {
        id: createId('pl'),
        user_id: userId,
        local_id: getText(input.localId) || null,
        title: getText(input.title) || getText(input.name) || '未命名歌单',
        description: getText(input.description) || getText(input.describe) || '',
        cover_url: getText(input.coverUrl) || getText(input.cover) || getText(input.filePath) || null,
        semantic_type: getText(input.semanticType) || null,
        source: getText(input.source) || null,
        source_playlist_id: getText(input.sourcePlaylistId) || null,
        revision,
        deleted_at: null,
        created_at: at,
        updated_at: at,
      };

      this.db
        .prepare(
          `INSERT INTO playlists
           (id, user_id, local_id, title, description, cover_url, semantic_type, source, source_playlist_id, revision, deleted_at, created_at, updated_at)
           VALUES (@id, @user_id, @local_id, @title, @description, @cover_url, @semantic_type, @source, @source_playlist_id, @revision, @deleted_at, @created_at, @updated_at)`,
        )
        .run(playlist);

      const songs = parseJsonArray(input.songlist || input.songs);
      this.upsertSongs(userId, playlist.id, songs, revision, at);
      this.recordEvent(userId, revision, 'playlist', playlist.id, 'upsert', toPlaylist(playlist, songs.length), null, at);
      return {...toPlaylist(playlist, songs.length), revision, updatedAt: at};
    });
  }

  updatePlaylist(userId: string, input: PlaylistPatchInput) {
    const playlistId = getText(input.playlistId) || getText(input.listId) || getText(input.id);
    if (!playlistId) return null;

    return this.writeTransaction(userId, (revision, at) => {
      const existing = this.getPlaylistRow(userId, playlistId);
      if (!existing) return null;

      const next = {
        ...existing,
        local_id: getText(input.localId) || existing.local_id,
        title: getText(input.title) || getText(input.name) || existing.title,
        description: getText(input.description) || getText(input.describe) || existing.description,
        cover_url: getText(input.coverUrl) || getText(input.cover) || getText(input.filePath) || existing.cover_url,
        semantic_type: getText(input.semanticType) || existing.semantic_type,
        source: getText(input.source) || existing.source,
        source_playlist_id: getText(input.sourcePlaylistId) || existing.source_playlist_id,
        revision,
        deleted_at: null,
        updated_at: at,
      };

      this.db
        .prepare(
          `UPDATE playlists
           SET local_id = @local_id,
               title = @title,
               description = @description,
               cover_url = @cover_url,
               semantic_type = @semantic_type,
               source = @source,
               source_playlist_id = @source_playlist_id,
               revision = @revision,
               deleted_at = @deleted_at,
               updated_at = @updated_at
           WHERE user_id = @user_id AND id = @id`,
        )
        .run(next);

      if (input.songlist || input.songs) {
        this.replacePlaylistSongs(userId, playlistId, parseJsonArray(input.songlist || input.songs), revision, at);
      }

      const total = this.countSongs(userId, playlistId);
      this.recordEvent(userId, revision, 'playlist', playlistId, 'upsert', toPlaylist(next, total), null, at);
      return {...toPlaylist(next, total), revision, updatedAt: at};
    });
  }

  deletePlaylist(userId: string, playlistId: string) {
    return this.writeTransaction(userId, (revision, at) => {
      const existing = this.getPlaylistRow(userId, playlistId);
      if (!existing) return null;

      this.db
        .prepare(`UPDATE playlists SET revision = ?, deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?`)
        .run(revision, at, at, userId, playlistId);
      this.db
        .prepare(
          `UPDATE playlist_songs SET revision = ?, deleted_at = ?, updated_at = ?
           WHERE user_id = ? AND playlist_id = ? AND deleted_at IS NULL`,
        )
        .run(revision, at, at, userId, playlistId);

      this.recordEvent(userId, revision, 'playlist', playlistId, 'delete', {id: playlistId}, at, at);
      return {id: playlistId, playlistId, revision, deletedAt: at, updatedAt: at};
    });
  }

  addSongs(userId: string, input: PlaylistSongMutationInput) {
    const playlistId = getText(input.playlistId) || getText(input.listId) || getText(input.id);
    if (!playlistId) return null;

    return this.writeTransaction(userId, (revision, at) => {
      if (!this.getPlaylistRow(userId, playlistId)) return null;
      const songs = parseJsonArray(input.songlist || input.songs);
      this.upsertSongs(userId, playlistId, songs, revision, at);
      this.touchPlaylist(userId, playlistId, revision, at);
      this.recordEvent(userId, revision, 'playlistSongs', playlistId, 'upsert', {playlistId, songs: songs.map(normalizeSong)}, null, at);
      return {id: playlistId, playlistId, revision, updatedAt: at};
    });
  }

  removeSongs(userId: string, input: PlaylistSongMutationInput) {
    const playlistId = getText(input.playlistId) || getText(input.listId) || getText(input.id);
    if (!playlistId) return null;
    const ids = [...(input.songIds || []), ...(input.songmids || []), ...(input.trackKeys || [])].map(String).filter(Boolean);

    return this.writeTransaction(userId, (revision, at) => {
      if (!this.getPlaylistRow(userId, playlistId)) return null;
      const rows = this.db
        .prepare(`SELECT * FROM playlist_songs WHERE user_id = ? AND playlist_id = ? AND deleted_at IS NULL`)
        .all(userId, playlistId) as PlaylistSongRow[];
      const remove = rows.filter((row) => {
        const song = parseJson<UnknownRecord>(row.track_json, {});
        return ids.some((id) => id === row.track_key || row.track_key.endsWith(`:${id}`) || id === song.id || id === song.songmid || id === song.hash);
      });

      for (const row of remove) {
        this.db
          .prepare(`UPDATE playlist_songs SET revision = ?, deleted_at = ?, updated_at = ? WHERE id = ? AND user_id = ?`)
          .run(revision, at, at, row.id, userId);
      }

      this.touchPlaylist(userId, playlistId, revision, at);
      this.recordEvent(userId, revision, 'playlistSongs', playlistId, 'delete', {playlistId, songIds: ids}, at, at);
      return {id: playlistId, playlistId, revision, deletedAt: at, updatedAt: at};
    });
  }

  listFavorites(userId: string, entityType?: string) {
    const type = entityType ? normalizeFavoriteEntityType(entityType) : null;
    const rows = type
      ? (this.db
          .prepare(`SELECT * FROM favorites WHERE user_id = ? AND entity_type = ? AND deleted_at IS NULL ORDER BY updated_at DESC`)
          .all(userId, type) as FavoriteRow[])
      : (this.db
          .prepare(`SELECT * FROM favorites WHERE user_id = ? AND deleted_at IS NULL ORDER BY updated_at DESC`)
          .all(userId) as FavoriteRow[]);
    return rows.map(toFavorite);
  }

  upsertFavorite(userId: string, input: FavoriteInput) {
    return this.writeTransaction(userId, (revision, at) => {
      const entityType = normalizeFavoriteEntityType(input.entityType);
      const entityId = getText(input.entityId) || getText(input.playlistId) || getText(input.sourcePlaylistId);
      if (!entityId) return null;

      const existing = this.db
        .prepare(`SELECT * FROM favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ?`)
        .get(userId, entityType, entityId) as FavoriteRow | undefined;
      const row = {
        id: existing?.id || createId('fav'),
        user_id: userId,
        entity_type: entityType,
        entity_id: entityId,
        source_entity_id: getText(input.sourcePlaylistId) || existing?.source_entity_id || null,
        title: getText(input.title) || getText(input.name) || existing?.title || '未命名收藏',
        description: getText(input.description) || getText(input.describe) || existing?.description || '',
        cover_url: getText(input.coverUrl) || getText(input.cover) || getText(input.filePath) || existing?.cover_url || null,
        source: getText(input.source) || existing?.source || null,
        owner_name: getText(input.ownerName) || existing?.owner_name || null,
        metadata_json: input.metadata ? json(input.metadata) : existing?.metadata_json || null,
        revision,
        deleted_at: null,
        created_at: existing?.created_at || at,
        updated_at: at,
      };

      this.db
        .prepare(
          `INSERT INTO favorites
           (id, user_id, entity_type, entity_id, source_entity_id, title, description, cover_url, source, owner_name, metadata_json, revision, deleted_at, created_at, updated_at)
           VALUES (@id, @user_id, @entity_type, @entity_id, @source_entity_id, @title, @description, @cover_url, @source, @owner_name, @metadata_json, @revision, @deleted_at, @created_at, @updated_at)
           ON CONFLICT(user_id, entity_type, entity_id) DO UPDATE SET
             source_entity_id = excluded.source_entity_id,
             title = excluded.title,
             description = excluded.description,
             cover_url = excluded.cover_url,
             source = excluded.source,
             owner_name = excluded.owner_name,
             metadata_json = excluded.metadata_json,
             revision = excluded.revision,
             deleted_at = NULL,
             updated_at = excluded.updated_at`,
        )
        .run(row);

      this.recordEvent(userId, revision, 'favorite', row.id, 'upsert', toFavorite(row), null, at);
      return toFavorite(row);
    });
  }

  deleteFavorite(userId: string, input: {entityType?: string; entityId?: string; playlistId?: string}) {
    return this.writeTransaction(userId, (revision, at) => {
      const entityType = normalizeFavoriteEntityType(input.entityType);
      const entityId = getText(input.entityId) || getText(input.playlistId);
      if (!entityId) return null;

      const row = this.db
        .prepare(`SELECT * FROM favorites WHERE user_id = ? AND entity_type = ? AND entity_id = ? AND deleted_at IS NULL`)
        .get(userId, entityType, entityId) as FavoriteRow | undefined;
      if (!row) return {playlistId: entityId, entityId, revision, deletedAt: at, updatedAt: at};

      this.db
        .prepare(`UPDATE favorites SET revision = ?, deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?`)
        .run(revision, at, at, userId, row.id);
      this.recordEvent(userId, revision, 'favorite', row.id, 'delete', {...toFavorite(row), deletedAt: at}, at, at);
      return {id: row.id, playlistId: entityType === 'playlist' ? entityId : undefined, entityId, revision, deletedAt: at, updatedAt: at};
    });
  }

  getSyncEvents(userId: string, sinceRevision: number) {
    const rows = this.db
      .prepare(
        `SELECT revision, entity_type, entity_id, action, payload_json, deleted_at, created_at
         FROM sync_events
         WHERE user_id = ? AND revision > ?
         ORDER BY revision ASC`,
      )
      .all(userId, sinceRevision) as SyncEventRow[];
    return {revision: this.getCurrentRevision(userId), events: rows.map(toSyncEvent)};
  }

  private initSchema() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        email TEXT UNIQUE,
        nickname TEXT,
        password_hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS pair_codes (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        code_hash TEXT NOT NULL UNIQUE,
        expires_at INTEGER NOT NULL,
        used_at TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS user_revision (
        user_id TEXT PRIMARY KEY,
        current_revision INTEGER NOT NULL DEFAULT 0,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS playlists (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        local_id TEXT,
        title TEXT NOT NULL,
        description TEXT,
        cover_url TEXT,
        semantic_type TEXT,
        source TEXT,
        source_playlist_id TEXT,
        revision INTEGER NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS playlist_songs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        playlist_id TEXT NOT NULL,
        track_key TEXT NOT NULL,
        track_json TEXT NOT NULL,
        sort_order INTEGER NOT NULL,
        revision INTEGER NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, playlist_id, track_key),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY(playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS favorites (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        source_entity_id TEXT,
        title TEXT,
        description TEXT,
        cover_url TEXT,
        source TEXT,
        owner_name TEXT,
        metadata_json TEXT,
        revision INTEGER NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(user_id, entity_type, entity_id),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE TABLE IF NOT EXISTS sync_events (
        revision INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        entity_type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        action TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        deleted_at TEXT,
        created_at TEXT NOT NULL,
        PRIMARY KEY(user_id, revision),
        FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_playlists_user_revision ON playlists(user_id, revision);
      CREATE INDEX IF NOT EXISTS idx_playlist_songs_user_revision ON playlist_songs(user_id, revision);
      CREATE INDEX IF NOT EXISTS idx_favorites_user_revision ON favorites(user_id, revision);
      CREATE INDEX IF NOT EXISTS idx_sync_events_user_revision ON sync_events(user_id, revision);
      CREATE INDEX IF NOT EXISTS idx_pair_codes_hash ON pair_codes(code_hash, expires_at, used_at);
    `);
  }

  private writeTransaction<T>(userId: string, callback: (revision: number, at: string) => T) {
    return this.db.transaction(() => {
      const revision = this.nextRevision(userId);
      return callback(revision, nowIso());
    })();
  }

  private nextRevision(userId: string) {
    this.db.prepare(`INSERT OR IGNORE INTO user_revision (user_id, current_revision) VALUES (?, 0)`).run(userId);
    this.db.prepare(`UPDATE user_revision SET current_revision = current_revision + 1 WHERE user_id = ?`).run(userId);
    const row = this.db.prepare(`SELECT current_revision FROM user_revision WHERE user_id = ?`).get(userId) as {current_revision: number};
    return row.current_revision;
  }

  private recordEvent(
    userId: string,
    revision: number,
    entityType: string,
    entityId: string,
    action: string,
    payload: unknown,
    deletedAt: string | null,
    at: string,
  ) {
    this.db
      .prepare(
        `INSERT INTO sync_events (revision, user_id, entity_type, entity_id, action, payload_json, deleted_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(revision, userId, entityType, entityId, action, json(payload), deletedAt, at);
  }

  private getPlaylistRow(userId: string, playlistId: string) {
    return this.db
      .prepare(`SELECT * FROM playlists WHERE user_id = ? AND id = ? AND deleted_at IS NULL`)
      .get(userId, playlistId) as PlaylistRow | undefined;
  }

  private countSongs(userId: string, playlistId: string) {
    const row = this.db
      .prepare(`SELECT COUNT(*) AS total FROM playlist_songs WHERE user_id = ? AND playlist_id = ? AND deleted_at IS NULL`)
      .get(userId, playlistId) as {total: number};
    return row.total;
  }

  private touchPlaylist(userId: string, playlistId: string, revision: number, at: string) {
    this.db
      .prepare(`UPDATE playlists SET revision = ?, updated_at = ?, deleted_at = NULL WHERE user_id = ? AND id = ?`)
      .run(revision, at, userId, playlistId);
  }

  private upsertSongs(userId: string, playlistId: string, songs: UnknownRecord[], revision: number, at: string) {
    const max = this.db
      .prepare(
        `SELECT COALESCE(MAX(sort_order), -1) AS sort_order
         FROM playlist_songs WHERE user_id = ? AND playlist_id = ?`,
      )
      .get(userId, playlistId) as {sort_order: number};

    songs.map(normalizeSong).forEach((song, index) => {
      const row = {
        id: createId('trk'),
        user_id: userId,
        playlist_id: playlistId,
        track_key: song.trackKey,
        track_json: json({
          id: song.id,
          source: song.source,
          title: song.title,
          artist: song.artist,
          album: song.album,
          albumId: song.albumId,
          durationText: song.durationText,
          artworkUrl: song.artworkUrl,
          qualities: song.qualities,
          position: song.position ?? max.sort_order + index + 1,
        }),
        sort_order: song.position ?? max.sort_order + index + 1,
        revision,
        deleted_at: null,
        created_at: at,
        updated_at: at,
      };

      this.db
        .prepare(
          `INSERT INTO playlist_songs
           (id, user_id, playlist_id, track_key, track_json, sort_order, revision, deleted_at, created_at, updated_at)
           VALUES (@id, @user_id, @playlist_id, @track_key, @track_json, @sort_order, @revision, @deleted_at, @created_at, @updated_at)
           ON CONFLICT(user_id, playlist_id, track_key) DO UPDATE SET
             track_json = excluded.track_json,
             sort_order = excluded.sort_order,
             revision = excluded.revision,
             deleted_at = NULL,
             updated_at = excluded.updated_at`,
        )
        .run(row);
    });
  }

  private replacePlaylistSongs(userId: string, playlistId: string, songs: UnknownRecord[], revision: number, at: string) {
    const normalized = songs.map(normalizeSong);
    const nextKeys = new Set(normalized.map((song) => song.trackKey));
    const currentRows = this.db
      .prepare(`SELECT * FROM playlist_songs WHERE user_id = ? AND playlist_id = ? AND deleted_at IS NULL`)
      .all(userId, playlistId) as PlaylistSongRow[];

    currentRows
      .filter((row) => !nextKeys.has(row.track_key))
      .forEach((row) => {
        this.db
          .prepare(`UPDATE playlist_songs SET revision = ?, deleted_at = ?, updated_at = ? WHERE user_id = ? AND id = ?`)
          .run(revision, at, at, userId, row.id);
      });

    this.upsertSongs(userId, playlistId, songs, revision, at);
  }
}