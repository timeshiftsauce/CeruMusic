---
pageClass: plugin-v2-doc
title: PluginContext API
description: 插件后台入口 ctx 的完整使用总览。
---

# PluginContext API

`definePlugin` 的入口参数 `ctx` 就是 `PluginContext`。它是插件访问澜音宿主能力的唯一入口：配置、权限、HTTP、Provider、命令、歌词转换、界面通知、存储和日志都从这里开始。

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  const unregister = ctx.actions.register('hello', async (_input, operation) => {
    operation.signal.throwIfAborted()
    ctx.log.info('hello.complete', { operationId: operation.id })
    await ctx.ui.toast({ message: '你好，澜音！' })
  })

  ctx.effects.add(unregister)
})
```

完整类型以安装的 `@shiqianjiang/ceru-plugin-sdk` 为准；[完整类型参考](./reference)适合查具体字段，本页适合快速确定应该调用哪一组 API。

## 先记住三条边界

1. **类型不等于已连接。** `PluginContext` 描述宿主契约，但当前工作台或桌面版本可能没有接通某个服务。调用业务服务前先检查 `ctx.capabilities.get()`。
2. **能力必须声明。** `actions.register`、`providers.register`、`playlistImporters.register` 和 `lyricConverters.register` 的 ID 必须先写进 Manifest，否则运行时会拒绝注册。网络、账号、歌单等受保护 API 还需要对应权限声明。
3. **不要伪造操作上下文。** `OperationContext` 只由宿主在 Action/Provider 回调中提供。把收到的 `operation` 继续传给 HTTP 和其他服务，不要自行构造 `userIntent`。

## 顶层字段

| 字段 | 用途 |
| --- | --- |
| `ctx.plugin` | 当前插件的 `id`、`version` 和已校验 `manifest`。 |
| `ctx.host` | Host API 版本、共享库版本和 `development/production` 模式。 |
| `ctx.modules` | 兼容模块入口。新代码优先使用 `ctx.http`、`ctx.ui` 等直接 API。 |
| `ctx.utils.lodash` | 宿主提供的类型化 Lodash 子集，不会打进插件文件。 |
| `ctx.config.get<T>()` | 读取已合并配置。敏感配置由 Host 处理，不把主密钥直接交给插件。 |
| `ctx.icons` / `ctx.assets` | 列出或取得宿主资源 URL；不是任意文件路径访问。 |
| `ctx.storage` | 插件自己的 JSON 存储。缺失的本地键返回 `null`。 |
| `ctx.log` | 结构化诊断日志。详情对象不要手动 `JSON.stringify`。 |
| `ctx.effects` | 统一收集注销函数，在停用/重载时释放资源。 |

```ts
const config = await ctx.config.get<{ apiUrl: string }>()
const icons = ctx.icons.list()
const cover = await ctx.assets.url('placeholder.cover')
const saved = await ctx.storage.get<{ count: number }>('counter')
```

## 注册能力

所有注册函数都返回 `Disposable`，推荐交给 `ctx.effects.add`：

```ts
ctx.effects.add(ctx.actions.register('ping', async (input, operation) => {
  operation.signal.throwIfAborted()
  return { ok: true, value: input }
}))

ctx.effects.add(ctx.providers.register('my-source', {
  tracks: {
    async search(request, operation) {
      // 返回 Page<ContentEntity>
      return { items: [], nextCursor: undefined }
    },
    async resolve(resource, quality, operation) {
      return { ok: true, url: 'https://example.com/audio.mp3' }
    },
    async lyrics(resource, operation) {
      return { format: 'crlyric', version: 1, track: resource, lines: [] }
    }
  }
}))
```

### `actions.register`

```ts
actions.register<Input, Result>(
  id: string,
  handler: (input: Input, operation: OperationContext) => Result | Promise<Result>
): Disposable
```

Action 的输入和返回值必须是 JSON 值。命令 ID 必须在 `manifest.contributes.commands` 中声明。

### `providers.register`

Provider 的常用接口如下：

| 接口 | 签名 |
| --- | --- |
| `tracks.search` | `(request, operation) => Promise<Page<ContentEntity>>` |
| `tracks.resolve` | `(resource, quality, operation) => Promise<ResolveResult>` |
| `tracks.lyrics` | `(resource, operation) => Promise<LyricsDocument>` |
| `playlists.search` | `(request, operation) => Promise<Page<ContentEntity>>` |
| `playlists.list/get` | `(resource, cursor, operation) => Promise<Page<ContentEntity>>` |
| `charts.list/getTracks` | `(operation)` / `(resource, cursor, operation)` |
| `sharing.describe` | `(resource, policy, operation) => Promise<JsonObject>` |

Provider 返回标准数据，不要把平台接口的原始对象直接暴露给 Host。音频解析失败时返回 `playback.failure(...)`，并提供可判断的 `MusicFault`。

### 歌词转换和歌单导入

```ts
ctx.effects.add(ctx.lyricConverters.register('lyrics', {
  parse: async (request) => document,
  export: async (request) => ({
    format: request.format,
    mime: 'text/plain',
    extension: 'lrc',
    text: '[00:01.00]歌词'
  })
}))

ctx.effects.add(ctx.playlistImporters.register('my-importer', {
  getTracks: async ({ value, cursor, limit }, operation) => ({
    items: [],
    nextCursor: undefined
  })
}))
```

两个 ID 都必须在 Manifest 对应贡献中声明。歌词逐字时间、翻译和音译应使用 `LyricsDocument` 的结构化字段，不要把时间标签拼进纯文本摘要。

## HTTP、权限和操作上下文

推荐使用 `ctx.http.create()`：

```ts
const api = ctx.http.create({
  baseURL: 'https://api.example.com',
  permissionKey: 'networkAccess',
  requestPermission: true
})

const result = await api.get<{ items: unknown[] }>('/search', {
  operation,
  query: { q: '晨光' }
})
```

直接请求时必须显式传 `permissionKey` 和 `operation`：

```ts
const response = await ctx.http.request({
  permissionKey: 'networkAccess',
  url: 'https://api.example.com/ping',
  method: 'GET',
  timeoutMs: 15000,
  operation
})
```

权限 key 是 Manifest 中声明的**插件自定义 key**，不是直接填写权限名。需要用户决定时可请求权限组：

```ts
const grant = await ctx.permissions.requestGroup({
  group: 'network',
  keys: ['networkAccess'],
  intent: operation.userIntent
})
if (grant.status !== 'granted') return { ok: false }
```

```ts
interface OperationContext {
  id: string
  deadlineAt: number
  signal: AbortSignal
  connectionId?: string
  userIntent?: UserIntentHandle
}
```

`signal` 被取消时应尽快停止工作。HTTP 只接受 `http/https`，不能在 URL 中放用户名、密码或令牌；JSON、form、body 三者只能选一个。默认情况下非 2xx 会抛错，需要检查错误响应时再使用客户端提供的关闭自动抛错选项。

## 宿主服务

`PluginContext` 继承 `HostServices`，常用分组如下：

| 分组 | 典型方法 | 说明 |
| --- | --- | --- |
| `capabilities` | `list/get` | 查询当前 Host 是否接通某项服务。 |
| `account` | `getSession/getProfile/openLogin` | 只能取得受限账号资料，插件不接触登录令牌。 |
| `player` / `queue` | `getState/play/pause/seek`、`get/append/replace` | 播放和队列控制通常需要 `ServiceCall`。 |
| `library` | `playlists.list/getTracks/import` | 使用澜音现有歌单，不创建插件私有数据库。 |
| `downloads` | `list/create/pause/resume/cancel/retry` | 下载能力按权限和 Host 支持情况开放。 |
| `files` / `clipboard` | 文件选择、读写文本、剪贴板 | 只能操作用户明确选择的文件或权限允许的剪贴板。 |
| `settings` / `window` / `hotkeys` | 读取设置、窗口控制、快捷键 | 每项都有独立权限边界。 |
| `sharing` / `rooms` / `devices` | 分享、一起听、设备投放 | 先检查 `capabilities`，不同 Host 连接情况可能不同。 |
| `events` | `events.on('player.changed', listener)` | 返回注销函数，记得交给 `ctx.effects.add`。 |

需要 `ServiceCall` 的方法接收：

```ts
interface ServiceCall {
  operation: OperationContext
  permissionKey: string
}
```

例如：

```ts
const state = await ctx.player.getState({
  operation,
  permissionKey: 'playerAccess'
})
```

## UI、存储、日志和 Guest

```ts
await ctx.ui.toast({ message: '已完成', level: 'success' })
await ctx.ui.navigation.open({ page: 'search', query: '晨光' })
const confirmed = await ctx.ui.dialogs.confirm({ title: '确认', message: '继续吗？' })

ctx.effects.add(ctx.events.on('player.changed', (state) => {
  ctx.log.debug('player.changed', { status: state.status })
}))

ctx.log.info('request.complete', { status: 200, count: 3 })
```

日志详情直接传 JSON 对象，不要写成 `JSON.stringify(data)`；CLI 和桌面 Host 会统一脱敏、格式化，过长内容保留首尾并标记截断。`ctx.guests.import/select/remove/invoke` 是当前 Guest 管理入口，`prepareInstall/requestInstall` 仅用于旧兼容流程。

## 不同入口的 Context

`PluginContext` 只提供给后台逻辑入口：

```ts
export default definePlugin((ctx) => { /* PluginContext */ })
```

Web/Native Surface 使用更小的 `SurfaceContext`，只有 `host`、`utils`、`icons`、`assets`、`root`、`mount`、`invoke`、`close` 和 `subscribe`；它不能直接访问网络、配置、Provider 或文件。Guest 使用 `GuestContext`，只能访问 Guest bootstrap 能力。不要把后台入口的 `ctx` API 复制到页面代码中。

下一步可按功能继续阅读：[运行时与生命周期](./runtime)、[权限](./permissions)、[HTTP 请求](./http)、[Provider](./providers)、[歌词](./lyrics)和[完整类型参考](./reference)。
