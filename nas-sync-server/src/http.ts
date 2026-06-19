import {createServer, type IncomingMessage, type ServerResponse} from 'node:http';
import {URL} from 'node:url';

import {createToken, hashPassword, verifyPassword} from './crypto.ts';
import {SyncDatabase} from './database.ts';
import type {AuthUser, RequestContext, UnknownRecord} from './types.ts';

const DEFAULT_SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30;
const DEFAULT_PAIR_CODE_TTL_MS = 1000 * 60 * 10;

export type ServerConfig = {
  port: number;
  host: string;
  database: SyncDatabase;
};

type RouteHandler = (ctx: {
  request: IncomingMessage;
  response: ServerResponse;
  url: URL;
  body: UnknownRecord;
  auth: RequestContext | null;
}) => Promise<unknown> | unknown;

const readBody = async (request: IncomingMessage): Promise<UnknownRecord> => {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (!chunks.length) return {};
  const buffer = Buffer.concat(chunks);
  const contentType = String(request.headers['content-type'] || '').toLowerCase();

  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(buffer.toString('utf8')) as UnknownRecord;
    } catch {
      return {};
    }
  }

  if (contentType.includes('application/x-www-form-urlencoded')) {
    return Object.fromEntries(new URLSearchParams(buffer.toString('utf8')).entries());
  }

  if (contentType.includes('multipart/form-data')) {
    return parseMultipartTextFields(buffer, contentType);
  }

  try {
    return JSON.parse(buffer.toString('utf8')) as UnknownRecord;
  } catch {
    return {};
  }
};

const parseMultipartTextFields = (buffer: Buffer, contentType: string): UnknownRecord => {
  const boundary = contentType.match(/boundary=([^;]+)/)?.[1]?.replace(/^"|"$/g, '');
  if (!boundary) return {};

  const result: UnknownRecord = {};
  const raw = buffer.toString('binary');
  const parts = raw.split(`--${boundary}`);

  for (const part of parts) {
    const [rawHeaders, ...rest] = part.split('\r\n\r\n');
    if (!rawHeaders || !rest.length) continue;

    const headers = rawHeaders.toLowerCase();
    const name = rawHeaders.match(/name="([^"]+)"/)?.[1];
    if (!name || headers.includes('filename=')) continue;

    const value = rest.join('\r\n\r\n').replace(/\r\n--$/, '').replace(/\r\n$/, '');
    result[name] = Buffer.from(value, 'binary').toString('utf8');
  }

  return result;
};

const sendJson = (response: ServerResponse, statusCode: number, payload: unknown) => {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(payload));
};

const toPublicAuthUser = (user: AuthUser) => ({
  id: user.id,
  username: user.username,
  nickname: user.nickname || user.username,
  email: user.email || undefined,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

const getBearerToken = (request: IncomingMessage) => {
  const authorization = request.headers.authorization || '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || '';
};

const requireAuth = (auth: RequestContext | null) => {
  if (!auth) {
    const error = new Error('请先登录 NAS 同步服务');
    Object.assign(error, {statusCode: 401});
    throw error;
  }
  return auth;
};

const requireAdmin = (request: IncomingMessage) => {
  const adminToken = process.env.CERU_SYNC_ADMIN_TOKEN || '';
  const provided = String(request.headers['x-admin-token'] || '');
  if (!adminToken || provided !== adminToken) {
    const error = new Error('管理员 token 无效或未配置');
    Object.assign(error, {statusCode: 403});
    throw error;
  }
};

const getString = (value: unknown) => (typeof value === 'string' ? value.trim() : '');

const getBodyOrQueryId = (body: UnknownRecord, url: URL, names: string[]) => {
  for (const name of names) {
    const fromBody = getString(body[name]);
    if (fromBody) return fromBody;
    const fromQuery = getString(url.searchParams.get(name));
    if (fromQuery) return fromQuery;
  }
  return '';
};

const createRouter = (database: SyncDatabase): Record<string, Partial<Record<string, RouteHandler>>> => ({
  '/health': {
    GET: () => ({status: 'ok', service: 'ceru-nas-sync-server'}),
  },
  '/version': {
    GET: () => ({name: '@ceru/nas-sync-server', version: '0.1.0'}),
  },
  '/auth/register': {
    POST: async ({body}) => {
      const username = getString(body.username || body.email);
      const password = getString(body.password);
      if (!username || !password) {
        const error = new Error('username 和 password 不能为空');
        Object.assign(error, {statusCode: 400});
        throw error;
      }

      const user = database.createUser({
        username,
        email: getString(body.email) || undefined,
        nickname: getString(body.nickname) || undefined,
        passwordHash: await hashPassword(password),
      });
      const token = createToken();
      const expiresAt = database.createSession(user.id, token, DEFAULT_SESSION_TTL_MS);
      return {accessToken: token, expiresAt, user: toPublicAuthUser(user)};
    },
  },
  '/auth/login': {
    POST: async ({body}) => {
      const username = getString(body.username || body.email);
      const password = getString(body.password);
      const account = username ? database.findUserWithPassword(username) : null;
      if (!account || !(await verifyPassword(password, account.passwordHash))) {
        const error = new Error('账号或密码错误');
        Object.assign(error, {statusCode: 401});
        throw error;
      }

      const token = createToken();
      const expiresAt = database.createSession(account.user.id, token, DEFAULT_SESSION_TTL_MS);
      return {accessToken: token, expiresAt, user: toPublicAuthUser(account.user)};
    },
  },
  '/auth/pair': {
    POST: ({body}) => {
      const pairCode = getString(body.pairCode || body.code || body.bindingCode);
      if (!pairCode) {
        const error = new Error('pairCode 不能为空');
        Object.assign(error, {statusCode: 400});
        throw error;
      }

      const user = database.consumePairCode(pairCode);
      if (!user) {
        const error = new Error('配对码无效或已过期');
        Object.assign(error, {statusCode: 401});
        throw error;
      }

      const token = createToken();
      const expiresAt = database.createSession(user.id, token, DEFAULT_SESSION_TTL_MS);
      return {accessToken: token, expiresAt, user: toPublicAuthUser(user)};
    },
  },
  '/admin/users': {
    GET: ({request}) => {
      requireAdmin(request);
      return {items: database.listUsers()};
    },
    POST: async ({request, body}) => {
      requireAdmin(request);
      const username = getString(body.username || body.email);
      if (!username) {
        const error = new Error('username 不能为空');
        Object.assign(error, {statusCode: 400});
        throw error;
      }

      const tempPassword = getString(body.password) || createToken();
      const user = database.createUser({
        username,
        email: getString(body.email) || undefined,
        nickname: getString(body.nickname) || undefined,
        passwordHash: await hashPassword(tempPassword),
      });
      return {user: toPublicAuthUser(user), tempPassword: getString(body.password) ? undefined : tempPassword};
    },
  },
  '/admin/pair-codes': {
    POST: ({request, body}) => {
      requireAdmin(request);
      const username = getString(body.username || body.email);
      const userId = getString(body.userId);
      const account = userId ? database.findUserById(userId) : username ? database.findUserWithPassword(username)?.user : null;
      if (!account) {
        const error = new Error('用户不存在');
        Object.assign(error, {statusCode: 404});
        throw error;
      }

      const ttlMs = Number(body.ttlMs || DEFAULT_PAIR_CODE_TTL_MS);
      const pair = database.createPairCode({userId: account.id, ttlMs: Number.isFinite(ttlMs) ? ttlMs : DEFAULT_PAIR_CODE_TTL_MS});
      if (!pair) {
        const error = new Error('创建配对码失败');
        Object.assign(error, {statusCode: 500});
        throw error;
      }
      return {pairCode: pair.code, expiresAt: pair.expiresAt, user: toPublicAuthUser(pair.user)};
    },
  },
  '/auth/refresh': {
    POST: ({auth}) => {
      const session = requireAuth(auth);
      const token = createToken();
      const expiresAt = database.createSession(session.user.id, token, DEFAULT_SESSION_TTL_MS);
      return {accessToken: token, expiresAt, user: toPublicAuthUser(session.user)};
    },
  },
  '/me': {
    GET: ({auth}) => toPublicAuthUser(requireAuth(auth).user),
  },
  '/sync': {
    GET: ({auth, url}) => {
      const session = requireAuth(auth);
      const sinceRevision = Number(url.searchParams.get('sinceRevision') || 0);
      return database.getSyncEvents(session.user.id, Number.isFinite(sinceRevision) ? sinceRevision : 0);
    },
  },
  '/user-songlist': {
    GET: ({auth}) => database.listPlaylists(requireAuth(auth).user.id),
    POST: ({auth, body}) => database.createPlaylist(requireAuth(auth).user.id, body),
    PATCH: ({auth, body}) => database.updatePlaylist(requireAuth(auth).user.id, body),
    DELETE: ({auth, body, url}) => {
      const playlistId = getBodyOrQueryId(body, url, ['playlistId', 'listId', 'id']);
      if (!playlistId) {
        const error = new Error('playlistId 不能为空');
        Object.assign(error, {statusCode: 400});
        throw error;
      }
      return database.deletePlaylist(requireAuth(auth).user.id, playlistId);
    },
  },
  '/playlists': {
    GET: ({auth}) => database.listPlaylists(requireAuth(auth).user.id),
    POST: ({auth, body}) => database.createPlaylist(requireAuth(auth).user.id, body),
  },
  '/user-songlist/list': {
    GET: ({auth, url}) => {
      const playlistId = getBodyOrQueryId({}, url, ['playlistId', 'listId', 'id']);
      const detail = database.getPlaylistSongs(
        requireAuth(auth).user.id,
        playlistId,
        url.searchParams.get('sort') === 'desc' ? 'desc' : 'asc',
        Number(url.searchParams.get('limit') || 5000),
        Number(url.searchParams.get('pos') || 0),
      );
      if (!detail) {
        const error = new Error('歌单不存在');
        Object.assign(error, {statusCode: 404});
        throw error;
      }
      return detail;
    },
    PATCH: ({auth, body}) => database.addSongs(requireAuth(auth).user.id, body),
    POST: ({auth, body}) => database.addSongs(requireAuth(auth).user.id, body),
    DELETE: ({auth, body}) => database.removeSongs(requireAuth(auth).user.id, body),
  },
  '/playlist-favorites': {
    GET: ({auth}) => ({items: database.listFavorites(requireAuth(auth).user.id, 'playlist')}),
    POST: ({auth, body}) => database.upsertFavorite(requireAuth(auth).user.id, {...body, entityType: 'playlist'}),
    DELETE: ({auth, body, url}) => {
      const playlistId = getBodyOrQueryId(body, url, ['playlistId', 'entityId', 'id']);
      return database.deleteFavorite(requireAuth(auth).user.id, {entityType: 'playlist', playlistId});
    },
  },
  '/favorites': {
    GET: ({auth, url}) => ({items: database.listFavorites(requireAuth(auth).user.id, url.searchParams.get('entityType') || undefined)}),
    POST: ({auth, body}) => database.upsertFavorite(requireAuth(auth).user.id, body),
  },
});

type DynamicRoute =
  | {type: 'playlist'; id: string}
  | {type: 'playlistSongs'; playlistId: string; songId?: string}
  | {type: 'favoriteDelete'; entityType: string; entityId: string};

const findDynamicRoute = (pathname: string): DynamicRoute | null => {
  const playlistPatch = pathname.match(/^\/playlists\/([^/]+)$/);
  if (playlistPatch?.[1]) return {type: 'playlist', id: decodeURIComponent(playlistPatch[1])};

  const playlistSongs = pathname.match(/^\/playlists\/([^/]+)\/songs(?:\/([^/]+))?$/);
  if (playlistSongs?.[1]) {
    return {
      type: 'playlistSongs',
      playlistId: decodeURIComponent(playlistSongs[1]),
      songId: playlistSongs[2] ? decodeURIComponent(playlistSongs[2]) : undefined,
    };
  }

  const favoriteDelete = pathname.match(/^\/favorites\/([^/]+)\/([^/]+)$/);
  if (favoriteDelete?.[1] && favoriteDelete[2]) {
    return {type: 'favoriteDelete', entityType: decodeURIComponent(favoriteDelete[1]), entityId: decodeURIComponent(favoriteDelete[2])};
  }

  return null;
};

const handleDynamicRoute = (database: SyncDatabase, dynamic: DynamicRoute | null, method: string, auth: RequestContext | null, body: UnknownRecord) => {
  if (!dynamic) return undefined;
  const session = requireAuth(auth);

  if (dynamic.type === 'playlist') {
    if (method === 'GET') return database.getPlaylistSongs(session.user.id, dynamic.id);
    if (method === 'PATCH') return database.updatePlaylist(session.user.id, {...body, playlistId: dynamic.id});
    if (method === 'DELETE') return database.deletePlaylist(session.user.id, dynamic.id);
  }

  if (dynamic.type === 'playlistSongs') {
    if (method === 'GET') return database.getPlaylistSongs(session.user.id, dynamic.playlistId);
    if (method === 'POST') return database.addSongs(session.user.id, {...body, playlistId: dynamic.playlistId});
    if (method === 'DELETE') {
      const ids = dynamic.songId ? [dynamic.songId] : [];
      return database.removeSongs(session.user.id, {...body, playlistId: dynamic.playlistId, songIds: ids});
    }
  }

  if (dynamic.type === 'favoriteDelete' && method === 'DELETE') {
    return database.deleteFavorite(session.user.id, {entityType: dynamic.entityType, entityId: dynamic.entityId});
  }

  return undefined;
};

export const createSyncServer = ({database}: ServerConfig) => {
  const router = createRouter(database);

  return createServer(async (request, response) => {
    if (request.method === 'OPTIONS') {
      sendJson(response, 204, null);
      return;
    }

    const url = new URL(request.url || '/', 'http://localhost');
    const method = request.method || 'GET';

    try {
      const token = getBearerToken(request);
      const auth = token ? database.authenticateBearerToken(token) : null;
      const body = await readBody(request);
      const dynamic = findDynamicRoute(url.pathname);
      const route = router[url.pathname]?.[method];
      const result = route
        ? await route({request, response, url, body, auth})
        : handleDynamicRoute(database, dynamic, method, auth, body);

      if (result === undefined) {
        sendJson(response, 404, {success: false, error: '接口不存在', code: 'NOT_FOUND'});
        return;
      }

      sendJson(response, 200, result);
    } catch (error) {
      const statusCode = typeof error === 'object' && error && 'statusCode' in error ? Number(error.statusCode) : 500;
      sendJson(response, Number.isFinite(statusCode) ? statusCode : 500, {
        success: false,
        error: error instanceof Error ? error.message : '服务端错误',
        code: String(Number.isFinite(statusCode) ? statusCode : 500),
      });
    }
  });
};