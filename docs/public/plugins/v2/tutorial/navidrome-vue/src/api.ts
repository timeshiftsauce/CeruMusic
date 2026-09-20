import type { OperationContext, PluginContext } from '@shiqianjiang/ceru-plugin-sdk'
import { asRecord, text, type Account, type SubsonicResponse } from './model'

export function normalizeServer(value: unknown) {
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

export function createAccount(
  ctx: PluginContext,
  input: ReturnType<typeof asRecord>
): Account {
  const crypto = ctx.modules.require('@ceru/crypto')
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
  return {
    id,
    serverUrl,
    username,
    salt,
    token,
    remember: input.remember === true,
    allowLocal: input.allowLocal === true
  }
}

export function restoreAccount(value: unknown): Account | null {
  const stored = asRecord(value)
  if (
    stored.remember !== true ||
    typeof stored.id !== 'string' ||
    typeof stored.serverUrl !== 'string' ||
    typeof stored.username !== 'string' ||
    typeof stored.salt !== 'string' ||
    typeof stored.token !== 'string'
  ) {
    return null
  }
  return {
    id: stored.id,
    serverUrl: normalizeServer(stored.serverUrl),
    username: stored.username,
    salt: stored.salt,
    token: stored.token,
    remember: true,
    allowLocal: stored.allowLocal === true
  }
}

export function signedUrl(current: Account, endpoint: string, params: Record<string, unknown> = {}) {
  const url = new URL(`${current.serverUrl}/rest/${endpoint}.view`)
  const query = {
    u: current.username,
    t: current.token,
    s: current.salt,
    v: '1.16.1',
    c: 'CeruMusicTutorial',
    f: 'json',
    ...params
  }
  for (const [key, value] of Object.entries(query)) {
    if (value != null) url.searchParams.set(key, String(value))
  }
  return url.href
}

async function authorize(ctx: PluginContext, current: Account, operation: OperationContext) {
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

export async function api(
  ctx: PluginContext,
  current: Account,
  endpoint: string,
  params: Record<string, unknown>,
  operation: OperationContext
): Promise<SubsonicResponse> {
  await authorize(ctx, current, operation)
  operation.signal.throwIfAborted()
  const result = await ctx.http.request({
    permissionKey: 'navidrome.http',
    url: signedUrl(current, endpoint, params),
    method: 'GET',
    timeoutMs: 15_000,
    operation
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
