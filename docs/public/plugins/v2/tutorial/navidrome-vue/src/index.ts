import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import type {
  CrLyric,
  JsonObject,
  JsonValue,
  OperationContext,
  ResourceRef,
} from '@shiqianjiang/ceru-plugin-sdk'

type Account = {
  id: string
  serverUrl: string
  username: string
  salt: string
  token: string
  remember: boolean
  allowLocal: boolean
}

type PublicState = {
  connected: boolean
  status: string
  serverUrl: string
  username: string
  remember: boolean
  allowLocal: boolean
}

type SubsonicResponse = {
  status?: string
  type?: string
  serverVersion?: string
  error?: { code?: number; message?: string }
  searchResult3?: { song?: Song[] }
  lyricsList?: { structuredLyrics?: StructuredLyrics[] }
}

type Song = {
  id?: string
  title?: string
  artist?: string
  album?: string
  albumId?: string
  duration?: number
}

type StructuredLyrics = {
  synced?: boolean
  offset?: number
  line?: { start?: number; value?: string }[]
}

const storageKey = 'connection.v1'
const providerId = 'navidrome'
const qualities = ['128k', '192k', '320k', 'original']
const asRecord = (value: JsonValue | undefined): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : {}
const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : value == null ? fallback : String(value)
const list = <T>(value: T[] | T | undefined): T[] =>
  Array.isArray(value) ? value : value == null ? [] : [value]

export default definePlugin(async (ctx) => {
  const crypto = ctx.modules.require('@ceru/crypto')
  let account: Account | null = null
  let status = '尚未连接'

  function normalizeServer(value: unknown) {
    const url = new URL(text(value).trim())
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search) {
      throw new Error('地址只支持 HTTP(S)，不能包含账号、密码或查询参数')
    }
    const pathname = url.pathname.replace(/\/+$/, '').replace(/\/rest$/, '')
    return url.origin + pathname
  }

  function isPrivateServer(serverUrl: string) {
    const host = new URL(serverUrl).hostname.toLowerCase()
    if (['localhost', '127.0.0.1', '::1'].includes(host)) return true
    if (/^10\./.test(host) || /^192\.168\./.test(host)) return true
    const match = /^172\.(\d+)\./.exec(host)
    return !!match && Number(match[1]) >= 16 && Number(match[1]) <= 31
  }

  function publicState(): PublicState {
    return {
      connected: !!account,
      status,
      serverUrl: account?.serverUrl ?? '',
      username: account?.username ?? '',
      remember: account?.remember ?? false,
      allowLocal: account?.allowLocal ?? true,
    }
  }

  async function publishState() {
    await ctx.ui.setState('connection', publicState())
  }

  function signedUrl(current: Account, endpoint: string, params: Record<string, unknown> = {}) {
    const url = new URL(`${current.serverUrl}/rest/${endpoint}.view`)
    const query = {
      u: current.username,
      t: current.token,
      s: current.salt,
      v: '1.16.1',
      c: 'CeruMusicTutorial',
      f: 'json',
      ...params,
    }
    for (const [key, value] of Object.entries(query)) {
      if (value != null) url.searchParams.set(key, String(value))
    }
    return url.href
  }

  async function authorize(current: Account, operation: OperationContext) {
    const keys = ['navidrome.http']
    if (isPrivateServer(current.serverUrl)) {
      if (!current.allowLocal) throw new Error('请在连接页允许访问本机或局域网')
      keys.push('navidrome.private')
    }
    for (const key of keys) {
      let grant = await ctx.permissions.query({ key })
      if (grant.status === 'prompt') {
        grant = await ctx.permissions.request({ key, intent: operation.userIntent })
      }
      if (grant.status !== 'granted') throw new Error(`权限未授予：${key}`)
    }
  }

  async function api(
    current: Account,
    endpoint: string,
    params: Record<string, unknown>,
    operation: OperationContext,
  ): Promise<SubsonicResponse> {
    await authorize(current, operation)
    operation.signal.throwIfAborted()
    const result = await ctx.http.request({
      permissionKey: 'navidrome.http',
      url: signedUrl(current, endpoint, params),
      method: 'GET',
      timeoutMs: 15_000,
      operation,
    })
    if (result.status < 200 || result.status >= 300) {
      throw new Error(`Navidrome 返回 HTTP ${result.status}`)
    }
    const body = typeof result.body === 'string' ? JSON.parse(result.body) : result.body
    const response = asRecord(body)['subsonic-response'] as SubsonicResponse | undefined
    if (!response || !['ok', 'failed'].includes(response.status ?? '')) {
      throw new Error('服务器没有返回有效的 Subsonic JSON')
    }
    if (response.status === 'failed') {
      const code = Number(response.error?.code)
      if ([40, 41, 42, 43, 44].includes(code)) throw new Error('用户名、密码或令牌无效')
      throw new Error(response.error?.message || `Subsonic 错误 ${code || 0}`)
    }
    return response
  }

  function currentAccount() {
    if (!account) throw new Error('请先打开 Navidrome 连接页并登录')
    return account
  }

  function makeRef(current: Account, songId: string): ResourceRef {
    return {
      pluginId: ctx.plugin.id,
      providerId,
      connectionId: current.id,
      kind: 'track',
      id: `nd:${current.id}:${encodeURIComponent(songId)}`,
    }
  }

  function songId(current: Account, resource: ResourceRef) {
    if (resource.pluginId !== ctx.plugin.id || resource.providerId !== providerId) {
      throw new Error('这不是本插件创建的歌曲')
    }
    const match = /^nd:([a-f0-9]{24}):(.+)$/.exec(resource.id)
    if (!match || match[1] !== current.id) throw new Error('歌曲属于另一个服务器或账号')
    return decodeURIComponent(match[2])
  }

  function toTrack(current: Account, song: Song) {
    const id = text(song.id)
    const artist = text(song.artist, '未知歌手')
    if (!id) throw new Error('Navidrome 返回的歌曲缺少 id')
    return {
      ref: makeRef(current, id),
      title: text(song.title, '未知歌曲'),
      subtitle: artist,
      playable: true,
      durationMs: Math.max(0, Number(song.duration) || 0) * 1000,
      capabilities: ['music.resolve@1', 'music.lyrics@1'],
      metadata: {
        artists: [artist],
        album: song.album ? { id: text(song.albumId), title: song.album } : undefined,
        durationMs: Math.max(0, Number(song.duration) || 0) * 1000,
        qualities,
      },
    }
  }

  const saved = await ctx.storage.get(storageKey)
  const stored = asRecord(saved ?? undefined)
  if (
    stored.remember === true &&
    typeof stored.serverUrl === 'string' &&
    typeof stored.username === 'string' &&
    typeof stored.salt === 'string' &&
    typeof stored.token === 'string'
  ) {
    try {
      account = {
        id: text(stored.id),
        serverUrl: normalizeServer(stored.serverUrl),
        username: stored.username,
        salt: stored.salt,
        token: stored.token,
        remember: true,
        allowLocal: stored.allowLocal === true,
      }
      status = '已载入保存的连接，等待检查'
    } catch {
      status = '保存的连接无效，请重新登录'
    }
  }

  ctx.actions.register('connection.open', () => ctx.ui.openView('connection'))
  ctx.actions.register('connection.read', () => publicState())
  ctx.actions.register('connection.surface-open', async () => {
    await publishState()
    return publicState()
  })
  ctx.actions.register('connection.surface-close', () => ({ closed: true }))

  ctx.actions.register('connection.save', async (value, operation) => {
    const input = asRecord(value)
    const serverUrl = normalizeServer(input.serverUrl)
    const username = text(input.username).trim()
    const password = text(input.password)
    if (!username || !password) throw new Error('请输入用户名和密码')
    const salt = crypto.randomBytes(16).toString('hex')
    const token = crypto.createHash('md5').update(password + salt).digest('hex')
    const id = crypto
      .createHash('sha256')
      .update(JSON.stringify([serverUrl, username]))
      .digest('hex')
      .slice(0, 24)
    const candidate: Account = {
      id,
      serverUrl,
      username,
      salt,
      token,
      remember: input.remember === true,
      allowLocal: input.allowLocal === true,
    }
    const response = await api(candidate, 'ping', {}, operation)
    account = candidate
    status = `已连接${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    if (candidate.remember) await ctx.storage.set(storageKey, candidate)
    else await ctx.storage.delete(storageKey)
    await publishState()
    return publicState()
  })

  ctx.actions.register('connection.ping', async (_input, operation) => {
    const response = await api(currentAccount(), 'ping', {}, operation)
    status = `连接正常${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    await publishState()
    return publicState()
  })

  ctx.actions.register('connection.logout', async () => {
    await ctx.storage.delete(storageKey)
    account = null
    status = '已断开，保存的令牌已清除'
    await publishState()
    return publicState()
  })

  ctx.providers.register(providerId, {
    tracks: {
      async search(request, operation) {
        const current = currentAccount()
        const page = request.cursor ? Number(request.cursor) : 0
        if (!Number.isInteger(page) || page < 0) throw new Error('分页游标无效')
        const size = Math.max(1, Math.min(request.limit, 100))
        const response = await api(
          current,
          'search3',
          {
            query: request.query.trim(),
            artistCount: 0,
            albumCount: 0,
            songCount: size + 1,
            songOffset: page * size,
          },
          operation,
        )
        const songs = list(response.searchResult3?.song)
        return {
          items: songs.slice(0, size).map((song) => toTrack(current, song)),
          nextCursor: songs.length > size ? String(page + 1) : undefined,
        }
      },

      async resolve(resource, quality, operation) {
        try {
          const current = currentAccount()
          const id = songId(current, resource)
          await authorize(current, operation)
          const selected = qualities.includes(quality ?? '') ? quality : 'original'
          const transcode =
            selected === 'original'
              ? { format: 'raw' }
              : { format: 'mp3', maxBitRate: Number.parseInt(selected ?? '320', 10) }
          return { ok: true, url: signedUrl(current, 'stream', { id, ...transcode }) }
        } catch (error) {
          const message = error instanceof Error ? error.message : '无法生成播放地址'
          const code = !account
            ? 'AUTH_REQUIRED'
            : message.includes('权限')
              ? 'PERMISSION_DENIED'
              : 'NOT_FOUND'
          return ctx.playback.failure({
            code,
            message,
            recovery: account
              ? undefined
              : {
                  mode: 'await-user',
                  actions: [
                    { kind: 'plugin-command', commandId: 'connection.open', label: '去连接' },
                  ],
                },
          })
        }
      },

      async lyrics(resource, operation) {
        const current = currentAccount()
        const id = songId(current, resource)
        const response = await api(current, 'getLyricsBySongId', { id }, operation)
        const entries = list(response.lyricsList?.structuredLyrics)
        const chosen = entries.find((entry) => entry.synced) ?? entries[0]
        const document: CrLyric = {
          format: 'crlyric',
          version: 1,
          track: resource,
          offsetMs: Number(chosen?.offset) || 0,
          lines: chosen?.synced
            ? list(chosen.line)
                .filter((line) => Number.isFinite(line.start) && typeof line.value === 'string')
                .map((line) => ({ startTimeMs: Number(line.start), text: text(line.value) }))
                .sort((a, b) => a.startTimeMs - b.startTimeMs)
            : [],
        }
        if (!chosen?.synced) {
          document.plainText = list(chosen?.line)
            .map((line) => text(line.value))
            .join('\n')
        }
        return document
      },
    },
  })
})
