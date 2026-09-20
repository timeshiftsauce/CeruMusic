---
pageClass: plugin-v2-doc
---

# 宿主服务与支持状态

::: tip 桌面扩展
:::

本页描述澜音 2.0 的 v2 插件服务及其与独立工作台的差异。桌面 Host 已接通 SDK 当前声明的通用业务服务；表中的限制是运行时边界，不只是类型约定。

## 先检查能力

```ts
const service = await ctx.capabilities.get('library')
if (!service.available) {
  await ctx.ui.toast({ message: '当前宿主没有连接歌单服务', level: 'warning' })
}
```

`list(): Promise<ServiceAvailability[]>` / `get(service: string): Promise<ServiceAvailability>` 返回 `service, version, available, reason?, permissionGroups`。reason 包含 host-not-connected、unsupported、not-logged-in、disabled。

桌面 Host 会报告 **account、app、library、player、queue、favorites、history、downloads、files、clipboard、localMusic、settings、window、hotkeys、sharing、rooms、devices、ai、tasks**，并在 `methods` 中给出当前可调用的方法。未知服务返回 `available: false, reason: 'unsupported'`。HTTP、storage、UI 等基础能力仍按本指南各章判断。

独立工作台只为少量只读方法提供确定性的空数据，用于让界面和分支逻辑可以调试；其他业务方法返回 `host-not-connected`。插件必须检查 `available` 和 `methods`，并在正式桌面 Host 中验证写操作、系统对话框和设备行为。

## 基础能力

| API                                                          | 桌面                                       | CLI 工作台                                           |
| ------------------------------------------------------------ | ------------------------------------------ | ---------------------------------------------------- |
| plugin、host、log.debug/info/warn/error                      | 已接入                                     | 已接入                                               |
| providers/actions/playlistImporters/lyricConverters.register | 已接入，需 Manifest 声明                   | 注册及对应测试/预览                                  |
| effects.add                                                  | 已接入                                     | 已接入                                               |
| config.get                                                   | 已接入，含桌面配置覆盖                     | 构建/发行配置                                        |
| storage.get/set/delete                                       | 持久化、10 MiB、结构化共享键               | 持久化到 .ceru-dev/storage，10 MiB；不支持跨插件读取 |
| permissions.query/request/getGranted/requestGroup            | 按组授权；动态 scope 未完整实现            | 模拟授权；不等同于桌面授权持久化                     |
| http.create/request                                          | 已接入                                     | 已接入，限额较小                                     |
| sockets.connect、socket.on/emit/send/disconnect              | 已接入                                     | 已接入                                               |
| icons.list/url、assets.list/url、utils.lodash                | 已接入受支持资源                           | 预览资源与计算工具                                   |
| credentials.get                                              | 未接入                                     | 未接入                                               |
| modules.require                                              | 内建模块映射；模块存在不代表其每个服务可用 | 同类边界                                             |

## 桌面业务方法

`ServiceCall` 为 `{ operation: OperationContext, permissionKey: string }`。其余完整参数与返回类型可在[类型参考](./reference#宿主服务完整签名)展开查阅。

| API                                                                           | 桌面状态与结果                                                                           | 权限 / 使用条件                                             |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| capabilities.list / get                                                       | 返回每项服务的精确 `methods`；未知服务为 unsupported                                     | 无业务权限                                                  |
| account.getSession / getProfile / openLogin                                   | 返回登录状态和插件作用域账号 ID，或打开软件登录流程                                      | account.profile；不返回 token、邮箱、电话                   |
| app.getInfo / openSettings / openExternal                                     | 返回版本、平台、语言和主题；打开设置或 HTTP(S) 外链                                      | openExternal 需要 external.open                             |
| library.playlists.list / getTracks / import                                   | 读写本地或云端歌单，详见[歌单](./playlist-import)                                        | library.read / library.write；云端需要登录                  |
| player.getState / play / pause / next / previous / seek / setVolume / setMode | 读取和控制当前播放器；指定歌曲播放时，歌曲必须已在队列中                                 | player.read / player.control                                |
| queue.get / append / replace / remove / reorder                               | 返回带 revision 的完整队列；排序必须提交当前全部歌曲和匹配的 revision                    | player.read / player.control；一起听中拒绝修改              |
| favorites.contains / add / remove                                             | 操作本地“我喜欢”歌单；add 的歌曲必须能从当前队列解析                                     | library.read / library.write                                |
| history.list                                                                  | 返回持久化的本机播放历史；按资源去重，最多 200 条，每页最多 50 条                        | player.read                                                 |
| downloads.list / create / pause / resume / cancel / retry / reveal            | 创建 1 至 100 个任务并管理下载；歌曲从当前队列、本地音乐或历史中解析                     | downloads.create / downloads.manage                         |
| files.pick / pickDirectory / readText / readBase64 / saveText / writeText     | 使用系统选择器和不透明句柄；读取和文本写入上限为 16 MiB                                  | readText/readBase64 需 files.read；writeText 需 files.write |
| clipboard.readText / writeText                                                | 读写系统文本剪贴板                                                                       | clipboard.read / clipboard.write                            |
| localMusic.list / scan / getTags / writeTags                                  | 分页读取、扫描已选择目录、读取或修改标签；结构化歌词写为 LRC                             | localMusic.read / localMusic.write                          |
| settings.get / update                                                         | 只读写公开设置白名单；get 最多 50 个键，update JSON 上限 32 KiB                          | settings.read / settings.write                              |
| window.control                                                                | 支持 show、minimize、maximize、restore；mini-player 当前不可用                           | window.control                                              |
| hotkeys.register                                                              | 注册已声明 command 的全局快捷键并返回 disposer；替换失败会恢复旧绑定，插件停止时自动清理 | hotkeys.register                                            |
| sharing.create / revoke / resolve                                             | 创建和解析数据型应用链接；revoke 当前为幂等兼容操作，不会使已生成的数据型链接失效        | create 需 sharing.publish；revoke 需 sharing.revoke         |
| rooms.getState / join / leave / requestTrack                                  | 读取、加入、退出一起听房间，或请求播放当前队列中的歌曲                                   | rooms.read / rooms.control                                  |
| devices.list / select                                                         | 枚举和选择本地输出或 DLNA 设备                                                           | devices.control                                             |
| ai.generate                                                                   | 调用软件 AI 服务；提示词最多 20000 字符，输出上限最多 50000 字符                         | ai.use；取决于软件 AI 服务是否可用                          |
| tasks.schedule / cancel                                                       | 按 ID 安排或取消已声明 command；周期限制为 1 分钟至 24 小时                              | background.run                                              |
| events.on                                                                     | 已连接 SDK 声明的 11 个宿主事件，具体见下文                                              | 监听本身不额外请求权限                                      |

下载目录只能来自 `files.pickDirectory()` 返回的 `DirectoryHandle`。文件与目录句柄不会暴露真实路径，只属于创建它的插件实例，并在插件停止或重载后失效。下载状态事件只发送给创建该任务的插件。

`settings` 与插件自己的 `config`、`storage` 不同：它操作的是软件公开偏好。目前白名单为 `showFloatBall`、`autoCacheMusic`、`filenameTemplate`、`autoImportPlaylistOnOpen`、`suppressImportPrompt`、`lyricFontFamily`、`lyricFontSize`、`FullPlayLyricFontRate`、`lyricFontWeight`、`theme`、`isDarkMode`、`followSystemTheme`、`springFestivalDisabled`、`routePreloadEnabled`、`macStatusBarLyricEnabled`。白名单外的读取不会返回值，写入会被拒绝。

### 宿主事件

`events.on()` 可监听 `account.changed`、`library.changed`、`player.changed`、`queue.changed`、`lyrics.changed`、`downloads.changed`、`settings.changed`、`theme.changed`、`rooms.changed`、`devices.changed`、`permissions.changed`。播放器的状态变化会立即发布；播放期间还会每 5 秒发布一次位置更新。队列、歌词、设置、主题、房间和设备事件跟随对应状态变化，权限事件由桌面权限管理发送。

事件值与[类型参考](./reference#宿主服务完整签名)中的 `HostServiceEvents` 一致。`account.changed` 中的账号 ID 会按插件单独散列；`downloads.changed` 不会向其他插件广播任务。

### 独立工作台

工作台当前提供以下只读模拟：`account.getSession/getProfile`、`app.getInfo`、`player.getState`、`queue.get`、`history.list`、`downloads.list`、`localMusic.list`、`settings.get`、`rooms.getState`、`devices.list`。它们返回稳定的未登录、空列表或空闲状态。歌单、收藏、下载创建、文件选择、窗口、快捷键、分享、房间写操作、设备选择、AI 和后台任务等不会在工作台伪造成功。

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

Web Surface 会自动报告自然内容高度，Host 的 modal 按内容调整并限制在当前视口内。插件页面不要设置 <code>height/min-height: 100vh</code>，也不需要自行发送尺寸消息。

### 账号读取

这里查询的是**澜音账号**的基本状态，不是网易云、哔哩哔哩等服务的登录状态。插件自己的账号登录、二维码和轮询应放在插件中实现，使用 [Vue/Web 页面](./surfaces)显示。

在 Manifest 声明 `account.profile` 后，先为它取一个插件内稳定的 key，再在命令回调中传入同一个 key：

```json
{
  "key": "accountAccess",
  "name": "account.profile",
  "reason": "读取澜音账号登录状态"
}
```

```ts
const session = await ctx.account.getSession({
  permissionKey: 'accountAccess',
  operation
})
if (!session.loggedIn) {
  await ctx.ui.toast({ message: '请先登录澜音' })
}
```

`permissionKey` 必须对应 Manifest 中声明的 `key`，不是权限名，也不是随意填写的服务名。不能用授权结果获取邮箱、电话、Cookie 或认证提供商 token。

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

## 能力不可用时如何设计

让功能显式不可用或引导到已有界面，不伪造成功返回，也不要通过直接访问主窗口或内部 IPC 绕过服务边界。能力只在 `capabilities.get()` 的 `methods` 中出现时才调用；在工作台不可用的流程应留到桌面 Host 验证。
