---
pageClass: plugin-v2-doc
---

# 运行时、生命周期与模块

后台逻辑在隔离环境执行，没有正式应用的 DOM、Node 文件系统或 Electron API。Web Surface 有自己的 DOM，通过动作通信调用后台。

## 生命周期与清理

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  const unregister = ctx.actions.register('hello', async (_input, operation) => {
    operation.signal.throwIfAborted()
    ctx.log.info('Hello', { operationId: operation.id })
  })
  ctx.effects.add(unregister)
  return () => {
    ctx.log.debug('清理插件资源')
  }
})
```

Manifest 需声明 `hello`，见[最小工程](./manifest#最小工程)。激活函数可同步或异步返回清理函数 `Disposable = () => void | Promise<void>`；`effects.add` 收集其他清理函数。停用、重载或卸载后，旧环境和资源不可继续使用。

| API                  | 签名与返回                                         | 用法                                         |
| -------------------- | -------------------------------------------------- | -------------------------------------------- |
| `definePlugin`       | `(LogicEntry) => LogicEntry`                       | 后台入口；不自动注册能力                     |
| `defineSurface`      | `(SurfaceEntry) => SurfaceEntry`                   | Web 页面入口                                 |
| `defineGuestAdapter` | `(GuestEntry) => GuestEntry`                       | Guest bootstrap 入口                         |
| `defineManifest`     | `(PluginManifest) => PluginManifest`               | 编写清单时获得类型提示                       |
| `definePluginConfig` | `<T extends JsonObject>(T) => T`                   | 保留配置字段推断                             |
| `actions.register`   | `(id, (input, operation) => result) => Disposable` | 输入/结果须可 JSON 序列化；无结果可返回 void |
| `providers.register` | `(id, implementation) => Disposable`               | 必须先在清单声明                             |
| `effects.add`        | `(Disposable) => void`                             | 注册释放函数                                 |

Core 默认最多注册 **128 个 Provider、256 个 Action、128 个 Importer**；当前桌面沿用这些默认值。重用同 ID 是替换注册，不是创建独立实例。

## 操作上下文

```ts
interface OperationContext {
  id: string
  deadlineAt: number
  signal: AbortSignal
  connectionId?: string
  userIntent?: UserIntentHandle
}
```

操作由宿主调用回调时提供。把收到的 `operation` 继续传给 HTTP、Socket、歌单等 API；不要手工制造可信的 `userIntent`。`deadlineAt` 是毫秒时间戳，`signal` 用于取消。

桌面普通后台启动等待上限为 30 秒，Guest 启动可到 120 秒；后台调用和 UI 桥还有各自超时。不要把这些当成业务可以固定阻塞的时长，也不要在激活阶段等待用户登录或长时间联网。

当前 Node Worker 设置 V8 老生代 128 MiB、新生代 32 MiB、栈 4 MiB 的资源限制。这些是运行器参数，不是 storage 的额度，也不是可随意分配同等大小 JSON 的保证。

## 上下文中的只读信息

| 字段                      | 内容                                                      |
| ------------------------- | --------------------------------------------------------- |
| `ctx.plugin.id / version` | Manifest 身份和版本                                       |
| `ctx.plugin.manifest`     | 校验后的安装清单                                          |
| `ctx.host.apiVersion`     | 当前 Host API 版本                                        |
| `ctx.host.mode`           | `development / production`                                |
| `ctx.host.libraries`      | 宿主资源与库标识；不是 Vue/React 可从主窗口直接访问的承诺 |

## 日志

`ctx.log.debug/info/warn/error(message: string, data?: JsonValue): void` 写入插件日志。工作台可查看日志，桌面通过日志目录排查。日志使用结构化小对象，不记录密码、Cookie、token 或完整私人响应。

## 直接 API 与兼容模块

```ts
const unregister = ctx.actions.register('ping', async (_input, operation) => {
  const response = await ctx.http.request({
    permissionKey: 'api',
    url: 'https://example.com/ping',
    operation
  })
  await ctx.ui.toast({ message: `状态码：${response.status}` })
})
ctx.effects.add(unregister)
const names = ctx.utils.lodash.uniq(['Morning', 'Morning', 'Night'])
```

这个例子假定 Manifest 中已经声明了 `key: "api"`、`name: "network.request"` 的权限。

新代码优先使用 `ctx.http`、`ctx.ui`、`ctx.sockets`、`ctx.library`、`ctx.account` 和 `ctx.player` 等直接 API。它们有明确的类型和权限边界，也更容易在工作台和桌面之间排查。

`ctx.modules.require()` 只用于兼容层或特殊内建模块。需要兼容模块时，必须确认该模块在当前 Host 可用，不能因为能加载模块就假设对应业务服务已经接通。

| 模块                                               | 对应能力                     |
| -------------------------------------------------- | ---------------------------- |
| `ceru`                                             | PluginContext                |
| `@ceru/http`                                       | `ctx.http`                   |
| `@ceru/ui`                                         | `ctx.ui`                     |
| `@ceru/socket`                                     | `ctx.sockets`                |
| `@ceru/library` / `@ceru/account` / `@ceru/player` | 对应宿主服务；可用性仍需检查 |
| `@ceru/tools` / `lodash`                           | 类型化 Lodash 子集           |
| `@ceru/crypto`                                     | 加密/编码兼容工具            |
| `@ceru/compression`                                | 压缩兼容工具                 |
| `@ceru/encoding`                                   | 字节与字符编码兼容工具       |
| `@ceru/legacy-http`                                | 旧 HTTP 风格适配辅助函数     |

这些名字是宿主内建模块。普通 npm 依赖和本地源码由 CLI 打入最终文件；动态 require、未知内建模块、残留 import、依赖 Node 原生能力的包可能构建失败。Core 不读取作者的 node_modules。

SDK 兼容工具的精确导出见[类型参考](./reference#工具与模块类型)。密码学工具不授予网络或凭据权限；不要自行实现长期密钥保护方案。

## 图标、资源与工具函数

```ts
const availableIcons = ctx.icons.list()
const iconUrl = await ctx.icons.url('music-note')
const availableAssets = ctx.assets.list()
const coverUrl = await ctx.assets.url('placeholder.cover')
```

- `icons.list(): readonly HostIconName[]` / `url(name): Promise<string>`：读取宿主图标。
- `assets.list(): readonly HostAssetName[]` / `url(name | AssetHandle): Promise<string>`：取得受支持资源的 URL。
- `hostIcon(name)`：构造声明中的宿主图标引用；静态资源通过 assets.url 读取。
- `ctx.utils.lodash`：宿主提供的类型化子集，并非所有 Lodash 方法；无模板执行、mixin 或任意上下文构造。

资源 API 不接受任意磁盘路径。完整名称和方法列在[类型参考](./reference#资源目录)中。

## 手写单文件

可下载[完整问候示例](/plugins/v2/examples/hello.js)，或按下面代码编写。

不使用 CLI 也可编写以下可安装文件。将其保存为 `hello.js`，通过 v2 Host 安装：

```js
exports.manifest = {
  manifestVersion: 2,
  id: 'example.handwritten',
  name: '手写问候插件',
  version: '0.1.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: {
    commands: [{ id: 'hello', title: '问候', action: 'hello' }]
  },
  permissions: []
}

exports.activate = function (ctx) {
  ctx.actions.register('hello', async () => {
    await ctx.ui.toast({ message: '你好，澜音！' })
  })
}
```

`exports.manifest` 必须能静态读取，不要动态拼装它。可选 `exports.surfaces` 和 `exports.resources` 承载页面和资源。使用第三方包时仍需预先打包进同一个 JS。
