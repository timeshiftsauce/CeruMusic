---
pageClass: plugin-v3-doc
title: PluginContext API、权限与服务
---

# PluginContext API、权限与服务

> **适用读者**　正在给 Logic 增加功能的作者。**前置条件**　能注册并从视图调用一个动作。**学习目标**　找到方法、读懂签名并处理失败。预计 12 分钟。

Logic 的默认导出用 `definePlugin((ctx) => { ... })`。`ctx` 由沙箱为当前插件创建。向宿主申请的能力都有边界，先检查可用性、再按对应权限键调用。视图走[视图桥接](./views)，业务函数放在 Logic。

需要先看一条真正执行的调用，可以从[桌面服务练习](./desktop-api)开始；所有 Logic 方法的参数表可以[按方法名搜索](./methods)。

## 按任务查 API

| 我想做什么 | 从这些接口开始 |
| --- | --- |
| 声明和处理 UI 动作 | `ctx.actions.register`，`ctx.ui.views.setState`，`ctx.ui.pages.open/close` |
| 得到配置和持久状态 | `ctx.config.get<T>()`、`ctx.storage.get/set/delete` |
| 使用宿主通知、对话框和进度 | `ctx.ui.notify`、`ctx.ui.dialogs`、`ctx.ui.progress` |
| 请求 HTTP 或建立实时连接 | `ctx.http.create/request`、`ctx.sockets` |
| 搜索、播放、加入队列 | `ctx.music` 聚合音源，`ctx.player` 和 `ctx.queue` 管播放状态与队列 |
| 提供音乐数据 | `ctx.providers.register`、`ctx.playlistImporters.register`、`ctx.lyricConverters.register` |
| 管理宿主曲库 | `ctx.library.playlists` 列出/读歌单、导入、移除曲目和清空；`ctx.app.call` 提供创建/删除歌单、添加/移除曲目的可拦截操作 |
| 注册自己的外部账号 | `ctx.accounts.register/current/reportExpired`、`ctx.credentials.get` |
| 读取澜音自身账号 | `ctx.account.getSession/getProfile/openLogin` |
| 提供或使用其他插件服务 | `ctx.services.register`、`ctx.plugins.use/list/on` |
| 观察、拦截或主动发起操作 | `ctx.events.on`、`ctx.hooks.on`、`ctx.app.operations.list`、`ctx.app.call` |
| 导航与生命周期 | `ctx.router`、`ctx.lifecycle`、`ctx.effects.add` |
| 使用桌面资源与服务 | `ctx.icons`、`ctx.assets`、`ctx.files`、`ctx.clipboard`、`ctx.downloads`、`ctx.settings`、`ctx.window`、`ctx.hotkeys`、`ctx.sharing`、`ctx.rooms`、`ctx.devices`、`ctx.ai`、`ctx.tasks` |
| 兼容子插件或处理音频流 | `ctx.guests`、`ctx.server`、`ctx.streams`、`ctx.wasm`、`ctx.crypto` |
| 查宿主或记录错误 | `ctx.capabilities.get/list`、`ctx.app.getInfo`、`ctx.log` |

[站内方法与参数](./methods)可直接搜索。原始签名从 [PluginContext](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/packages/sdk/src/index.ts) 和 [HostServices](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/packages/sdk/src/services.ts) 查。是否接入某个服务以目标宿主为准。例如调用 `ctx.capabilities.get('app')` 后，检查 `available` 及 `methods` 再选可用实现。授权仍需另外检查。

## 从声明到一次网络请求

先在 `manifest.uses.permissions` 数组添加以下对象：

```json
{ "key": "catalog-http", "name": "network.request", "reason": "查询用户所选曲库的歌曲" }
```

在 `definePlugin` 内使用这个键。示例假定 `provides.actions` 已声明 `catalog.search`，换成你实际控制的服务地址及返回格式：

```ts
const http = ctx.http.create({
  baseURL: 'https://music.example.org/',
  permissionKey: 'catalog-http',
  requestPermission: true,
})

ctx.actions.register('catalog.search', async (input, operation) => {
  const keyword = typeof input === 'string' ? input.trim() : ''
  if (!keyword) return []
  const data = await http.get<unknown>('api/search', {
    operation,
    query: { q: keyword, limit: 20 },
    timeoutMs: 8000,
  })
  if (!Array.isArray(data)) throw new Error('曲库返回了不支持的数据')
  return data.filter((title): title is string => typeof title === 'string')
})
```

权限的 `key` 由插件定义，`name` 是宿主识别的授权项。低层 `ctx.http.request` 返回 `{ status, headers, body }`；`http.get<T>` / `post<T>` 返回响应数据，`http.request<T>` 返回包含 `data` 的完整响应。默认对非 2xx 抛出 `HttpError`，需要自己处理登录失效时可在单次请求设置 `throwHttpErrors: false`。

`ctx.permissions.query({ key })` 可读取状态；请求授权时传递用户操作的 `operation.userIntent`。HTTP 帮助方法只会在 `prompt` 状态按配置请求，拒绝后应给出可操作的提示。网络公开访问、私网连接、凭据使用是不同的权限。不要把账号凭据放进 URL、日志或动作返回值。

`operation` 还包含 `signal` 和截止时间。在分页或多阶段工作中检查取消信号。尽量沿用宿主传给当前动作、Provider 或登录轮询的 `operation`，不要复用上一轮用户的操作对象。细节见 [HTTP、WebSocket、权限与 RPC 参考](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/docs/HOST-SERVICES.md)。

## 精读一个调用：以播放器跳转为例

```ts
ctx.player.seek(positionMs, call)
```

| 参数 | 类型 | 必填 | 传什么 |
| --- | --- | --- | --- |
| `positionMs` | `number` | 是 | 目标播放位置，单位是毫秒；10 秒写成 `10000` |
| `call` | `ServiceCall` | 是 | `permissionKey` 对应本插件声明并获准的 `player.control`，`operation` 使用这次用户动作传来的上下文 |

返回值是 `Promise<void>`。调用会改变当前播放进度，并进入播放器的对应操作流程。先在工程清单声明权限，再声明按钮使用的动作。首先把下列对象追加到 `manifest.uses.permissions`：

```json
{ "key": "playback", "name": "player.control", "reason": "根据用户点击跳转到当前歌曲的第十秒" }
```

再追加到 `manifest.provides.actions`：

```json
{ "id": "jump.ten", "title": "跳到第十秒" }
```

在 Logic 的 `definePlugin` 回调中登记处理器：

```ts
ctx.actions.register('jump.ten', async (_input, operation) => {
  const key = 'playback'
  let { status } = await ctx.permissions.query({ key })
  if (status === 'prompt') {
    const grant = await ctx.permissions.request({ key, intent: operation.userIntent })
    status = grant.status
  }
  if (status !== 'granted') throw new Error('请允许此插件控制播放进度')
  await ctx.player.seek(10_000, { permissionKey: key, operation })
})
```

在 Vue 组件的 setup 中用 `const jump = useAction('jump.ten')` 取得动作，点击按钮时调用并捕获错误。用超过十秒的本地歌曲验证进度变化，再撤销授权重试。第二次调用应进入权限提示或错误分支。协议允许的操作、权限键和运行时可用性都需要核对；空队列、宿主拒绝和用户撤权也可能导致预期动作未发生。

## 从错误回到对应文档

| 现象 | 接下来查什么 |
| --- | --- |
| 调用返回 Promise，页面一片空白 | 等待并处理错误；区分 `http.get` 的数据与低层 `http.request` 的响应体。[网络请求](./network) |
| 注册的动作从未运行 | 核对清单声明、Logic 注册、View 调用的三个 ID；启动、更新和退出见[生命周期](./lifecycle) |
| 权限被允许过，这次仍失败 | 重新检查当前键、来源范围、操作上下文和对象归属。[权限申请与撤销](./permissions) |
| 调用另一个插件后得到空值 | 检查可选依赖是否在线、服务 ID 与 semver 范围。[双插件完整练习](./services) |
| 需要改写点播或观察结束事件 | 对照[Hook 教程](./hooks)及[操作与权限表](./operations)选择注册位置 |

直接操作名为 `playlist.create`、`playlist.delete`、`playlist.addTracks` 和 `playlist.removeTracks`，需要分别获准 `library.write` / `library.delete`。歌单创建、删除是宿主操作，不在 `ctx.library.playlists` 的方法下。完整参数、目标位置和创建后取得 ID 的做法见[桌面服务与歌单操作](./desktop-api)。

完整能力可以先看[完整 API 目录](./api-reference)，它覆盖全部 PluginContext 方法以及 define* 入口。查具体方法时，打开[可筛选的方法和参数表](./methods)，需要返回对象的字段时查[完整 SDK 类型](./reference)。
