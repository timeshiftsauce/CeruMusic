---
pageClass: plugin-v2-doc
---

# 工程配置与 Manifest

::: tip 桌面扩展
:::

`ceru.plugin.json` 是构建配置，其中的 `manifest` 会进入发行文件。安装器读取 `exports.manifest` 来了解插件，不先执行后台业务代码。

## 先找到你要改的位置

想改插件名称，找 `manifest.name`；想增加一个命令，找 `manifest.contributes.commands`；想换源码入口，找顶层 `entries`。

还没创建工程时，先运行[快速上手](./quick-start)。本页是配置参考，不需要在第一次开发前把所有字段记住。

## 最小工程

下面的完整配置与[快速开始](./quick-start)中的问候动作配套：

```json
{
  "manifest": {
    "manifestVersion": 2,
    "id": "example.hello",
    "name": "问候插件",
    "version": "0.1.0",
    "description": "一个最小的澜音 v2 插件",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1"
    },
    "modules": {
      "logic": { "entry": "logic.main" }
    },
    "contributes": {
      "commands": [{ "id": "hello", "title": "问候", "action": "hello" }]
    },
    "permissions": []
  },
  "config": { "displayName": "Ceru Demo" },
  "entries": { "logic.main": "src/index.ts" },
  "resources": {},
  "output": "dist/plugin.js"
}
```

## 构建配置字段

| 字段              | 类型 / 默认                     | 说明                                       |
| ----------------- | ------------------------------- | ------------------------------------------ |
| `manifest`        | PluginManifest，必需            | 将被静态校验的插件清单                     |
| `config`          | JSON 对象，可选                 | 插件默认配置，构建后进入 manifest.config   |
| `entries`         | `Record<string, string>`，必需  | 逻辑入口标识到源码相对路径                 |
| `resources`       | 资源映射，可选                  | 资源 ID → `{ path, type, mime? }`          |
| `output`          | 字符串；模板为 `dist/plugin.js` | 单文件输出路径，可被 `--out` 覆盖          |
| `framework`       | `vanilla / vue / react`         | 框架编译方式，优先沿用相应模板             |
| `webDist`         | ID → 目录                       | 将静态网页构建产物纳入 Surface             |
| `sharedLibraries` | 旧配置                          | 迁移兼容项；新项目不依赖宿主提供 Vue/React |

资源类型是 `json`、`text` 或 `base64`。图片应填写实际 MIME；JSON 资源直接使用 JSON 文件。构建后的资源是嵌入值，不再引用作者电脑的文件路径。

```json
{
  "resources": {
    "schema.settings": { "path": "ui/settings.json", "type": "json" },
    "style.page": { "path": "ui/page.css", "type": "text", "mime": "text/css" }
  }
}
```

## Manifest 基础字段

| 字段                                   | 必需 | 说明                                                    |
| -------------------------------------- | ---- | ------------------------------------------------------- |
| `manifestVersion`                      | 是   | 固定数字 `2`                                            |
| `id`                                   | 是   | 稳定标识，如 `example.author.plugin`；更新保持不变      |
| `name` / `version`                     | 是   | 用户可见名称 / 语义化插件版本                           |
| `description` / `author` / `publisher` | 否   | 功能、作者和发行者信息                                  |
| `license` / `homepage`                 | 否   | 插件许可证与项目主页                                    |
| `engines`                              | 是   | Host API、逻辑运行时、可选 UI Schema 要求               |
| `modules`                              | 是   | 逻辑、Surface、可选服务端分享入口                       |
| `contributes`                          | 否   | 要向宿主公开的能力                                      |
| `permissions`                          | 否   | 权限声明数组，见[权限](./permissions)                   |
| `dataSchemas`                          | 否   | `{ config: number, state: number }`；作者维护的数据版本 |
| `guestPolicy`                          | 否   | 外部脚本运行边界，见[Guest](./guests)                   |

`dataSchemas` 不会自动替你迁移 storage。数据结构改变时，应在读取后根据自己保存的版本执行迁移。

## 模块与激活

`modules.logic.entry` 引用 `entries` 中的键。`activation` 可声明如 `onCommand:hello`、`onProvider:catalog` 的触发意图；不要依赖它保证桌面一定延迟执行：当前桌面启用插件时会加载后台逻辑。激活函数应快速完成注册，把联网放入具体操作。

`modules.surfaces` 中每项至少包含 `{ id, kind: 'schema' | 'web' | 'native', entry }`。Schema entry 指向 JSON 资源；Web entry 指向页面入口；native entry 指向已声明的 render 动作，由宿主原生组件显示结果。Surface 本身没有完整 PluginContext。参见[原生内容与账号菜单](./ui-native)。

Web Surface 还可在这里声明 `title`、`presentation` 和 `lifecycle`。presentation 描述抽屉或 modal 的位置/宽度，lifecycle 指定打开和关闭时调用的动作。容器会跟随 Web 内容高度；页面根元素不要设置 100vh。完整配置与示例见[页面教程](./surfaces#配套清单)。

`modules.share` 定义可导出的服务端解析工厂及允许导出的配置键，是高级能力；不能直接把后台完整上下文送到服务端。

## 贡献字段

`accountItems: { id, title, view, action, logoutAction? }[]` 在宿主账号胶囊菜单展示插件子账号。action 返回 `AccountSummary`，点击打开 view，已登录项可通过 logoutAction 提供悬停退出菜单。完整项目见[账号与原生音乐库](./tutorial-account-native/)。

| 字段                | 关键字段                                                                       | 对应章节 / 桌面行为                                    |
| ------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `commands`          | `id, title, action, description?, view?`                                       | 声明动作，注册时匹配 action                            |
| `providers`         | `id, name, protocols, qualities?, icon?, connectionMode?`                      | [Provider](./providers)                                |
| `playlistImporters` | `id, title, providerId?, examples?, instructions?, description?, placeholder?` | [歌单导入](./playlist-import)                          |
| `lyricConverters`   | `id, title, formats`                                                           | [歌词转换](./lyrics)                                   |
| `homeSections`      | `id, title, kind, providerIds?, view?, icon?, order?`                          | 内置 playlists / charts 页面贡献                       |
| `playlistSections`  | `id, title, view, order?`                                                      | 现有“歌单”页中的 native Surface 区块                   |
| `sidebarItems`      | `id, group, title, view`                                                       | 桌面侧栏入口打开 Surface                               |
| `settingsPages`     | `id, title, view`                                                              | 插件管理中的设置入口                                   |
| `guestAdapters`     | `id, format, compatibilityProfile, bootstrap, runtime, projectableProtocols`   | [Guest](./guests)                                      |
| `menus`             | `id, slot, title, commandId, description?, icon?, when?`                       | SDK 声明；不要假定桌面已挂接全部菜单                   |
| `uiExtensions`      | `id, slot, mode, view, order?, when?`                                          | SDK/工作台能力；桌面 2.0 未接入通用 Slot 组合       |
| `styles`            | `id, resource, scope, slots?, order?`                                          | `surface / slot / application`；桌面通用样式贡献未接入 |

`homeSections.kind` 为 `playlists / charts / custom`。歌单和排行榜页面使用对应 Provider；新版宿主的 custom 页签用 view 引用插件自己的 Surface。页面内部的内容仍由插件编写，未接入的通用 UI Slot 不因此变成可用。

个人账号歌单使用 <code>playlistSections</code>。<code>view</code> 必须引用 <code>modules.surfaces</code> 中的 native Surface；Host 会自动把它放在现有“歌单”页，与本地、云歌单并列。<code>order</code> 默认 0。若要从命令定位该区块，调用 <code>ctx.ui.navigation.open({ page: 'playlist', sectionId: '区块 id' })</code>。不要为此创建侧边栏项、抽屉或额外“我的歌单”按钮。

## 常见配置错误

- 把源码路径写进 `modules.logic.entry`，却没有同名 entries 键。
- 动作在 Manifest 中叫 `save`，实际注册成 `settings.save`。
- 新增资源后忘记 resources 映射，或 Schema entry 指向 JS 入口。
- 只声明 Provider 协议，没有注册其业务方法。
- 把 v1 的 `pluginInfo / musicUrl` 放进 v2 清单，误以为修改版本即可转换。

用 `npm run build` 和 `npm run validate` 尽早检查；运行支持还需看[宿主支持表](./host-services)。
