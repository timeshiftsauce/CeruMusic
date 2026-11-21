---
pageClass: plugin-v3-doc
title: Manifest 与页面入口
---

# Manifest 与页面入口

> **适用读者**　正在添加入口或排查显隐的作者。**前置条件**　能打开计数器示例的清单。**学习目标**　从页面 ID 追到源码并添加侧栏图标。预计 8 分钟。

`ceru.plugin.json` 是 CLI 的工程配置。顶层的 `manifest` 描述成品在宿主中的行为；`entries`、`resources`、`output`、`framework`、`sharedLibraries`、`webDist` 指导构建。成品校验时读的是独立的 `exports.manifest`、逻辑和视图模块等内容。

## 用计数器理解声明与注册

| ID | 从哪里声明 | 用在哪 |
| --- | --- | --- |
| `tutorial.counter` | `manifest.id` | 插件身份、升级与数据隔离 |
| `counter-page` | `ui.pages[].id` | `ctx.ui.pages.open('counter-page')` 打开的页面 |
| `counter-view` | `entry.views[].id` | `ui.pages[].view`，以及给视图推状态 |
| `view.counter` | `entry.views[].module` | 顶层 `entries` 的键，映射到 Vue 文件 |
| `counter.increment` | `provides.actions[].id` | `ctx.actions.register` 与 `useAction` |
| `catalog` / `listen` | 搜索模板的 `uses.permissions[].key` | 相应宿主调用传入的 `permissionKey` |
| `search` | 搜索模板的宿主图标名称 | `icon: { "kind": "host", "name": "search" }` |

## 字段地图

| 路径 | 怎么填 |
| --- | --- |
| `manifestVersion` | 固定数字 `3`。它和 npm 包版本、桌面版本、插件自己的版本是不同概念。 |
| `engines.hostApi`、`engines.logicRuntime` | 起步使用 `^3.0.0`、`ceru-js@1`；构建前可比对目标宿主。 |
| `entry.logic`、`entry.views` | 逻辑和视图模块。视图类型为 `component`、`web` 或 `native`，可定义标题、弹窗展示与打开/关闭动作。 |
| `entry.share` | 独立分享解析入口，可用 `configKeys` 指定可读配置。 |
| `entry.server`、`entry.native` | 沙箱服务或完全信任运行时，以及平台原生模块。普通页面、音源和请求不需要这些能力。 |
| `provides` | 插件提供的 actions、providers、accounts、importers、lyricConverters、services、guestAdapters。每项 ID 须对应实际逻辑。 |
| `uses.permissions`、`uses.plugins` | 模块要使用的权限和服务依赖。声明后仍需满足宿主授权与版本要求。 |
| `ui.pages`、`ui.homeSections` | 自定义页面和原生区块。首页歌单或榜单数据用 homeSections，完整页面用 pages。 |
| `ui.slots`、`ui.menus`、`ui.styles` | 在受支持的宿主位置加内容、菜单或样式，按范围声明。 |
| `ui.regions`、`ui.skins` | 绑定播放器区域视图，或把多个区域组合为皮肤。 |
| `dataSchemas`、`config` | 配置/状态版本与构建后的配置。数据形状改变时自行处理旧值。 |
| `guestPolicy` | 父插件的兼容子插件约束，最多一层。 |

## 选挂载点

`ui.pages[].mount` 有 `sidebar`、`settings`、`playlist-section`、`home-tab`。同一视图可在多个页面入口复用；共享状态按视图 ID 推送，页面动作通过 `ctx.ui.pages.open(pageId)` 打开具体入口。想在原有歌单头部放按钮，可以参考 `page-extension` 的 `playlist.header.actions` Slot。

侧栏图标可用宿主图标或本地资源。要加自己的图片，先把图片放在工程的 `assets/catalog.svg`，在**顶层** `resources` 下登记：

```json
{
  "catalog.icon": { "path": "assets/catalog.svg", "type": "base64", "mime": "image/svg+xml" }
}
```

再把页面的 `icon` 写成 `{ "kind": "asset", "resource": "catalog.icon" }`。这里填写资源 ID。文件缺失时先查构建，文件有效但宿主取不到时会回退为默认图标。

## 按音源显示页面

例如首页页签仅在选中指定平台时显示，可以在页面对象添加 `"when": { "selectedSource": "catalog" }`。该值对应平台 ID，与正在播放的歌曲、提供该平台的插件安装 ID 分开。还可声明 `loggedIn`（澜音自身账号）或 `predicate`（本插件已声明并注册的判断动作）。判断动作收到 `{ pageId, selectedSource, selectedProvider }`，应尽量只读和快速，返回布尔值，或显式返回 `'force-show'` / `'force-hide'`。未确定或出错时保持隐藏。若要因为第三方账号未登录而提示用户，应在实际业务入口再次验证账号状态。

完整定义可查 [v3 Manifest 类型](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/packages/sdk/src/manifest.ts)和[构建配置](https://github.com/CeruMusic/CeruMusic-Plugin-Cli/blob/v3.0.0/packages/cli/src/project.ts)。

## 独立验证侧栏和设置页

以 `page-extension` 为完整起点。先只改侧栏页面的 `title`，保留 `id`、`view` 和模块映射，观察热重载后是否仍能打开同一视图。然后只替换页面 `icon`，确认侧栏文字排版和选中状态正常。最后从「设置」打开复用该视图的入口，检查两个页面收到的状态是否符合预期。

若侧栏出现但点击空白，从 `view` 顺着 `entry.views[].id`、`module`、`entries` 依次排查；若条件项始终不出现，用满足条件的当前音源复测，并确认在权限或账号变化后按需刷新入口。[具名导航](./routing) · [页面、视图与存储的完整例子](./first-plugin)
