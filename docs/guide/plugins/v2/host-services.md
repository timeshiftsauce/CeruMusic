---
pageClass: plugin-v2-doc
---

# 宿主服务与支持状态

::: tip 桌面扩展
SDK 0.3.5 契约包含 <code>playlistSections</code>、歌单区块定位和 Web Surface 自动内容高度，参见[0.3.5 工具链更新](./sdk-upgrade)。自建账号界面使用通用 Surface，详见[桌面扩展](./desktop-extensions)。
:::

**核对版本：桌面 1.14.1 起；账号与 native Surface 最低使用 0.3.3，同页歌单区块与自动高度使用 Core、SDK、CLI 0.3.5 同一协议线。**

下面的“已接入”指当前桌面代码实际提供了调用路径；“部分”需要阅读限制；“未接入”表示即使 TypeScript 编译通过，调用仍不能完成。表中列出每个方法，不以 SDK 类型代替运行验证。

## 先检查能力

```ts
const service = await ctx.capabilities.get('library')
if (!service.available) {
  await ctx.ui.toast({ message: '当前宿主没有连接歌单服务', level: 'warning' })
}
```

`list(): Promise<ServiceAvailability[]>` / `get(service: string): Promise<ServiceAvailability>` 返回 `service, version, available, reason?, permissionGroups`。reason 包含 host-not-connected、unsupported、not-logged-in、disabled。

当前桌面在 list 中报告 **account、library、player、queue**。其中 player 只列出 play，queue 只列出 replace；其他 get 返回 unsupported。HTTP、storage、UI 等需按本指南各章判断。工作台对正式软件业务服务返回 host-not-connected。

## 基础能力

| API                                                          | 桌面                                       | CLI 工作台                                                   |
| ------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------ |
| plugin、host、log.debug/info/warn/error                      | 已接入                                     | 已接入                                                       |
| providers/actions/playlistImporters/lyricConverters.register | 已接入，需 Manifest 声明                   | 注册及对应测试/预览                                          |
| effects.add                                                  | 已接入                                     | 已接入                                                       |
| config.get                                                   | 已接入，含桌面配置覆盖                     | 构建/发行配置                                                |
| storage.get/set/delete                                       | 持久化、10 MiB、结构化共享键               | 0.3.3 起持久化到 .ceru-dev/storage，10 MiB；不支持跨插件读取 |
| permissions.query/request/getGranted/requestGroup            | 按组授权；动态 scope 未完整实现            | 模拟授权；不等同于桌面授权持久化                             |
| http.create/request                                          | 已接入                                     | 已接入，限额较小                                             |
| sockets.connect、socket.on/emit/send/disconnect              | 已接入                                     | 已接入                                                       |
| icons.list/url、assets.list/url、utils.lodash                | 已接入受支持资源                           | 预览资源与计算工具                                           |
| credentials.get                                              | 未接入                                     | 未接入                                                       |
| modules.require                                              | 内建模块映射；模块存在不代表其每个服务可用 | 同类边界                                                     |

## 桌面业务方法

`ServiceCall` 为 `{ operation: OperationContext, permissionKey: string }`。其余完整参数与返回类型可在[类型参考](./reference#宿主服务完整签名)展开查阅。

| API                                                                       | 桌面状态与结果                                                   | 权限 / 使用条件                                    |
| ------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------- |
| capabilities.list / get                                                   | 已接入，粗粒度状态见上                                           | 无业务权限                                         |
| account.getSession                                                        | `{ loggedIn, profile }`                                          | account.profile                                    |
| account.getProfile                                                        | 未登录为 null；登录返回插件作用域 ID、displayName、identityScope | account.profile；不返回主账号 token                |
| account.openLogin                                                         | 打开软件登录流程                                                 | 用户完成登录                                       |
| app.openSettings                                                          | 打开设置；当前忽略细分 section                                   | 无业务权限                                         |
| app.getInfo / openExternal                                                | 未接入                                                           | SDK 声明不代表可调用                               |
| library.playlists.list / getTracks / import                               | 已接入，详见[歌单](./playlist-import)                            | library.read / library.write；云端需要登录         |
| player.play                                                               | 已接入；传完整歌曲 ResourceRef，歌曲须先在插件队列中             | player.control                                     |
| player.getState / pause / next / previous / seek / setVolume / setMode    | 未接入通用插件服务                                               | SDK 声明不代表可调用                               |
| queue.replace                                                             | 已接入；接收标准 ContentEntity[]，保留完整资源身份               | player.control；一起听中拒绝替换                   |
| queue.get / append / remove / reorder                                     | 未接入                                                           | SDK 声明不代表可调用                               |
| favorites.contains / add / remove                                         | 未接入                                                           | SDK 契约                                           |
| history.list                                                              | 未接入                                                           | SDK 契约                                           |
| downloads.list / create / pause / resume / cancel / retry / reveal        | 未接入                                                           | SDK 契约                                           |
| files.pick / pickDirectory / readText / readBase64 / saveText / writeText | 未接入                                                           | SDK 契约；不能替换为直接 fs                        |
| clipboard.readText / writeText                                            | 未接入                                                           | SDK 契约                                           |
| localMusic.list / scan / getTags / writeTags                              | 未接入                                                           | SDK 契约                                           |
| settings.get / update                                                     | 未接入                                                           | 与插件自己的 config/storage 区分                   |
| window.control                                                            | 未接入                                                           | SDK 契约                                           |
| hotkeys.register                                                          | 未接入                                                           | SDK 契约                                           |
| sharing.create / revoke / resolve                                         | 未接入通用服务                                                   | 与 Provider 的 sharing.describe 和专用分享工厂区分 |
| rooms.getState / join / leave / requestTrack                              | 未接入                                                           | SDK 契约                                           |
| devices.list / select                                                     | 未接入                                                           | SDK 契约                                           |
| ai.generate                                                               | 未接入                                                           | SDK 契约                                           |
| tasks.schedule / cancel                                                   | 未接入                                                           | SDK 契约                                           |
| events.on                                                                 | 部分：有事件传输，桌面明确发送 permissions.changed               | 不承诺 player/queue/theme 等所有声明事件已接线     |

工作台可以模拟账号摘要、Native View、queue.replace 与 player.play 的调用，但不等于桌面的真实队列和音频设备。最终仍需在澜音中验证。

## UI 方法与差异

| API                                | 桌面行为                                                                                                                      |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| ui.openView / closeView / setState | 已接入 Schema、Web 与 native Surface；个人歌单区块由 playlistSections 自动挂载，不调用 openView                               |
| ui.notify / toast                  | 消息通知；不是系统通知权限接口                                                                                                |
| ui.playlistImport.open             | 打开软件既有导入窗口                                                                                                          |
| ui.pluginUpdate.request            | 校验 HTTPS 地址，排入更新通知；返回 `{ accepted: false, updated: false, queued: true }`                                       |
| ui.dialogs.confirm                 | 显示确认框，返回 boolean                                                                                                      |
| ui.dialogs.prompt                  | 返回 string 或 null；当前对 secret 等字段没有完整保障，敏感输入使用 password 抽屉控件                                         |
| ui.dialogs.pickPlaylist            | 部分：当前选择/创建本地歌单，返回 target 引用或 null；与 SDK LibraryPlaylist 返回声明不同                                     |
| ui.navigation.open                 | 支持 search/playlist/charts/downloads/account/settings；playlist 可用完整 ref 打开详情，或用本插件 sectionId 定位“歌单”页区块 |
| ui.progress.create                 | 显示持续加载提示，返回 `{ id }`                                                                                               |
| ui.progress.update                 | 当前是空操作，不显示数值进度                                                                                                  |
| ui.progress.close                  | 关闭对应提示                                                                                                                  |
| ui.notifications.show              | 未接入系统通知                                                                                                                |

工作台支持其自身通知、Schema/Web 预览和导入预览，不提供与桌面一致的上述通用业务弹窗、设置路由和插件更新流程。

0.3.5 Web Surface 会自动报告自然内容高度，Host 的 modal 按内容调整并限制在当前视口内。插件页面不要设置 <code>height/min-height: 100vh</code>，也不需要自行发送尺寸消息。

### 账号读取

这里查询的是**澜音账号**的基本状态，不是网易云、哔哩哔哩等服务的登录状态。插件自己的账号登录、二维码和轮询应放在插件中实现，使用 [Vue/Web 页面](./surfaces)显示。

在 Manifest 声明 account.profile 后，在命令回调中：

```ts
const session = await ctx.account.getSession({
  permissionKey: 'account',
  operation
})
if (!session.loggedIn) {
  await ctx.ui.toast({ message: '请先登录澜音' })
}
```

以上 permissionKey 应对应清单 key，不能用授权结果获取邮箱、电话、Cookie 或认证提供商 token。

### 请求插件更新

```ts
const result = await ctx.ui.pluginUpdate.request({
  version: '0.2.0',
  url: 'https://example.com/releases/plugin-0.2.0.js',
  notes: '新增连接设置'
})
if (result.queued) ctx.log.info('更新提示已加入通知')
```

地址是示例，不应照抄成真实发布地址。返回 queued 表示已通知，不能显示“安装成功”；用户还需在宿主界面完成后续流程。

## 尚未接入时如何设计

让功能显式不可用或引导到已有界面，不伪造成功返回，也不要通过直接访问主窗口或内部 IPC 绕过服务边界。通用服务接入前，应将示例标为契约参考，避免放入必做的入门步骤。
