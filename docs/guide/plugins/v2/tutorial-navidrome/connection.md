---
pageClass: plugin-v2-doc
title: 2. 连接、认证与保存
description: 连接模拟 Navidrome，验证账号，并安全保存登录令牌。
prev:
  text: 创建 Navidrome 插件
  link: /guide/plugins/v2/tutorial-navidrome/
next:
  text: Vue 连接页面
  link: /guide/plugins/v2/tutorial-navidrome/surface
---

# 2. 连接、认证与保存

本节接着上一节的 `ceru-navidrome` 工程，建立三份完整文件：数据类型、Navidrome API 客户端和插件后台入口。完成后，工作台可以直接运行连接 Action。

## 1. 建立数据模型

新建 `src/model.ts`：

```ts [src/model.ts]
import type { JsonObject } from '@shiqianjiang/ceru-plugin-sdk'

export type Account = {
  id: string
  serverUrl: string
  username: string
  salt: string
  token: string
  remember: boolean
  allowLocal: boolean
}

export type PublicState = {
  connected: boolean
  status: string
  serverUrl: string
  username: string
  remember: boolean
  allowLocal: boolean
}

export type Song = {
  id?: string
  title?: string
  artist?: string
  album?: string
  albumId?: string
  duration?: number
}

export type StructuredLyrics = {
  synced?: boolean
  offset?: number
  line?: { start?: number; value?: string }[]
}

export type SubsonicResponse = {
  status?: string
  serverVersion?: string
  error?: { code?: number; message?: string }
  searchResult3?: { song?: Song[] }
  lyricsList?: { structuredLyrics?: StructuredLyrics[] }
}

export const storageKey = 'connection.v1'
export const providerId = 'navidrome'
export const qualities = ['128k', '320k', 'original']

export const asRecord = (value: unknown): JsonObject =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonObject) : {}

export const text = (value: unknown, fallback = '') =>
  typeof value === 'string' ? value : value == null ? fallback : String(value)

export const list = <T>(value: T[] | T | undefined): T[] =>
  Array.isArray(value) ? value : value == null ? [] : [value]
```

`Account` 是插件内部凭据，包含 token；`PublicState` 是允许发给 Vue 页面的状态，故意没有 token 和 salt。`original` 是 Navidrome 特有的“保留原格式”，属于允许自定义的音质标识；通用码率仍使用推荐的 `128k` 和 `320k`。

## 2. 编写 API 客户端

新建 `src/api.ts`：

```ts [src/api.ts]
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
```

Navidrome 使用 Subsonic 认证：随机盐 `s` 加上 `md5(password + salt)` 得到 token `t`。原始密码只在 `createAccount()` 中短暂使用，不进入日志、Storage 或公开状态。盐和 token 仍能用于登录，必须按凭据保护。

`operation` 原样传给权限请求和 HTTP 请求，这样宿主取消操作时，请求也能停止。本机模拟地址需要同时允许两项网络权限。

## 3. 注册连接动作

用下面内容完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { api, createAccount, restoreAccount } from './api'
import { asRecord, storageKey, type Account, type PublicState } from './model'

export default definePlugin(async (ctx) => {
  let account: Account | null = null
  let status = '尚未连接'

  try {
    account = restoreAccount(await ctx.storage.get(storageKey))
    if (account) status = '已载入保存的连接，等待检查'
  } catch {
    status = '保存的连接无效，请重新登录'
  }

  const publicState = (): PublicState => ({
    connected: !!account,
    status,
    serverUrl: account?.serverUrl ?? '',
    username: account?.username ?? '',
    remember: account?.remember ?? false,
    allowLocal: account?.allowLocal ?? true
  })

  const publish = async () => {
    const state = publicState()
    await ctx.ui.setState('connection', state)
    return state
  }

  ctx.actions.register('connection.open', () => ctx.ui.openView('connection'))
  ctx.actions.register('connection.read', () => publicState())

  ctx.actions.register('connection.save', async (value, operation) => {
    const candidate = createAccount(ctx, asRecord(value))
    const response = await api(ctx, candidate, 'ping', {}, operation)
    account = candidate
    status = `已连接${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    if (candidate.remember) await ctx.storage.set(storageKey, candidate)
    else await ctx.storage.delete(storageKey)
    return publish()
  })

  ctx.actions.register('connection.ping', async (_input, operation) => {
    if (!account) throw new Error('请先连接 Navidrome')
    const response = await api(ctx, account, 'ping', {}, operation)
    status = `连接正常${response.serverVersion ? ` · ${response.serverVersion}` : ''}`
    return publish()
  })

  ctx.actions.register('connection.logout', async () => {
    await ctx.storage.delete(storageKey)
    account = null
    status = '已断开，保存的令牌已清除'
    return publish()
  })
})
```

`connection.save` 先用候选账号调用 `ping`，成功后才替换当前账号。错误密码不会破坏原来可用的连接。勾选“记住登录”才写 Storage；断开时同时清除内存和 Storage。

Action 的返回值只回答本次调用，`setState` 则把最新公开状态发布给已打开的连接页面。下一节会同时接上这两条通路。

## 4. 运行结果

保持 `npm run mock` 运行，在另一个终端执行：

```shell
npm run typecheck
npm run build
npm run dev
```

在工作台的 Action 面板运行 `connection.save`，输入：

```json
{
  "serverUrl": "http://127.0.0.1:4533",
  "username": "demo",
  "password": "demo",
  "remember": true,
  "allowLocal": true
}
```

允许两项网络权限后，返回状态应包含 `connected: true` 和模拟服务版本，但不含 password、token 或 salt。再运行 `connection.ping` 应显示“连接正常”。

常见错误：

- “请在连接页允许访问本机或局域网”：`allowLocal` 没有设为 `true`；
- “权限未授予”：在工作台权限区重新允许相应权限；
- “用户名、密码或令牌无效”：模拟账号和密码都应为 `demo`；
- “fetch failed”或超时：确认模拟服务终端仍在运行。

下一节：[让 Vue 页面调用这些 Action →](./surface)
