---
pageClass: plugin-v2-doc
title: 工程与 Manifest
description: 用 0.3.5 Vue 脚手架创建工程，并把账号、歌单区块、动作和权限完整声明出来。
prev:
  text: 账号与原生音乐库
  link: /guide/plugins/v2/tutorial-account-native/
next:
  text: Vue 登录与账号状态
  link: /guide/plugins/v2/tutorial-account-native/login
---

# 工程与 Manifest

## 1. 从公开脚手架开始

在空目录的上一级运行：

```shell
npm create ceru-plugin@0.3.5 my-account-plugin -- --template vue --lang ts
cd my-account-plugin
npm install
```

五个 0.3.5 工具包均已发布到 npm。<code>vue</code> 模板已经准备好 <code>defineSurface()</code>、<code>createApp()</code>、Vue 类型和单文件构建。

只想先做原生列表时，可以把模板换为：

```shell
npm create ceru-plugin@0.3.5 my-library -- --template connected-library --lang ts
```

本教程同时需要 Vue 登录页，所以从 <code>vue</code> 模板开始，再增加 native Surface。

## 2. 先看四条连接

```text
entries["logic.main"] ─────→ src/index.ts
entries["view.account"] ───→ src/view.ts
Surface entry "render.library" ─→ 后台同名 action
command action ─────────────→ ctx.actions.register("同一个名字", handler)
```

<code>entry</code> 有两种含义：

| 所在位置                                | 值指向哪里            | 谁加载          |
| --------------------------------------- | --------------------- | --------------- |
| 根级 <code>entries</code>               | 工程源码文件          | CLI 构建器      |
| logic/web Surface 的 <code>entry</code> | 根级 entries 的键     | Core 模块加载器 |
| native Surface 的 <code>entry</code>    | 已声明并注册的 action | 澜音原生页面    |

## 3. 使用完整 Manifest

把 <code>ceru.plugin.json</code> 替换为下面的结构。完成版原文件也可[直接打开](/plugins/v2/tutorial/account-native/ceru.plugin.json)。

::: details 展开完整 ceru.plugin.json

```json
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.account-native",
    "name": "账号与原生歌单教程",
    "version": "0.1.0",
    "description": "演示账号菜单、Vue 登录弹窗、原生歌单与宿主播放能力",
    "author": "Your Name",
    "license": "MIT",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "libraries": { "vue": "^3.5.0" }
    },
    "modules": {
      "logic": {
        "entry": "logic.main",
        "activation": ["onCommand:account.open", "onProvider:tutorial-account"]
      },
      "surfaces": [
        {
          "id": "account",
          "kind": "web",
          "entry": "view.account",
          "title": "连接演示账号",
          "presentation": { "kind": "modal", "size": 360 },
          "lifecycle": { "closeAction": "account.cancel" }
        },
        {
          "id": "library",
          "kind": "native",
          "entry": "render.library",
          "title": "我的演示音乐"
        }
      ]
    },
    "contributes": {
      "providers": [
        {
          "id": "tutorial-account",
          "name": "演示账号音乐",
          "protocols": ["music.search@1", "music.resolve@1", "music.playlists@1"],
          "qualities": ["128k", "320k"],
          "icon": { "kind": "host", "name": "music-note" },
          "connectionMode": "single"
        }
      ],
      "commands": [
        {
          "id": "account.open",
          "title": "连接演示账号",
          "action": "account.open",
          "view": "account"
        },
        { "id": "account.summary", "title": "读取账号摘要", "action": "account.summary" },
        { "id": "account.session", "title": "读取公开账号状态", "action": "account.session" },
        { "id": "account.start", "title": "开始演示登录", "action": "account.start" },
        { "id": "account.approve", "title": "模拟手机确认", "action": "account.approve" },
        { "id": "account.poll", "title": "检查演示登录", "action": "account.poll" },
        { "id": "account.cancel", "title": "取消演示登录", "action": "account.cancel" },
        { "id": "account.logout", "title": "退出演示账号", "action": "account.logout" },
        { "id": "render.library", "title": "渲染原生音乐页", "action": "render.library" },
        { "id": "library.refresh", "title": "刷新原生音乐页", "action": "library.refresh" },
        {
          "id": "library.openSection",
          "title": "定位演示歌单区块",
          "action": "library.openSection"
        },
        { "id": "playlist.open", "title": "打开原生歌单详情", "action": "playlist.open" },
        { "id": "playlist.import", "title": "导入演示歌单", "action": "playlist.import" },
        { "id": "tracks.play", "title": "播放演示歌曲", "action": "tracks.play" }
      ],
      "accountItems": [
        {
          "id": "demo-account",
          "title": "演示音乐账号",
          "view": "account",
          "action": "account.summary",
          "logoutAction": "account.logout"
        }
      ],
      "playlistSections": [
        {
          "id": "tutorial-library",
          "title": "演示账号歌单",
          "view": "library",
          "order": 20
        }
      ],
      "playlistImporters": [
        {
          "id": "tutorial-playlist",
          "title": "演示账号歌单",
          "providerId": "tutorial-account",
          "description": "输入 demo-favorites 或 demo-evening",
          "placeholder": "demo-favorites"
        }
      ]
    },
    "permissions": [
      {
        "key": "playback",
        "name": "player.control",
        "reason": "点击原生歌曲时替换播放队列并开始播放"
      },
      {
        "key": "account.network",
        "name": "network.request",
        "optional": true,
        "reason": "换成真实平台接口后请求登录、账号与音乐数据"
      },
      {
        "key": "account.private-network",
        "name": "network.private",
        "optional": true,
        "reason": "开发时连接本机模拟音频服务"
      }
    ],
    "dataSchemas": { "config": 1, "state": 1 }
  },
  "entries": {
    "logic.main": "src/index.ts",
    "view.account": "src/view.ts"
  },
  "resources": {},
  "output": "dist/plugin.js",
  "framework": "vue"
}
```

:::

## 4. 每一项最终出现在哪里？

| 声明                                 | 调用方                                  | 可见结果                               |
| ------------------------------------ | --------------------------------------- | -------------------------------------- |
| <code>accountItems</code>            | 宿主账号胶囊                            | 子账号、头像、昵称、会员标签、退出菜单 |
| <code>surface: account/web</code>    | 账号项的 view                           | 插件自己的 Vue modal                   |
| <code>surface: library/native</code> | <code>playlistSections[].view</code>    | 现有“歌单”页里的原生插件区块           |
| <code>providers</code>               | 搜索、歌单详情、播放解析                | 标准音乐数据流                         |
| <code>commands</code>                | 宿主按钮或 Surface invoke               | 只能调用已声明的 action                |
| <code>permissions</code>             | <code>ctx.permissions</code> 与宿主服务 | 用户能看懂的授权理由                   |

<code>accountItems</code> 的字段各有单一职责：

| 字段                      | 必填 | 作用                                    |
| ------------------------- | ---- | --------------------------------------- |
| <code>id</code>           | 是   | 插件内稳定标识                          |
| <code>title</code>        | 是   | 未登录时的账号名称                      |
| <code>view</code>         | 是   | 点击账号项时打开的 Surface ID           |
| <code>action</code>       | 是   | 返回 <code>AccountSummary</code> 的动作 |
| <code>logoutAction</code> | 否   | 已登录时悬停二级菜单调用的退出动作      |

::: warning 不要声明网易云侧边栏
如果你的插件是网易云账号实现，Provider ID 仍写 <code>wy</code>。账号入口放在 <code>accountItems</code>，个人歌单放在 <code>playlistSections</code>；不要再添加“网易云账号”侧边栏或“我的歌单”按钮。多个 <code>wy</code> 实现由澜音按同音源选择规则互斥。
:::

<code>playlistSections</code> 每一项都由宿主读取：

| 字段               | 必填 | 作用                                                         |
| ------------------ | ---- | ------------------------------------------------------------ |
| <code>id</code>    | 是   | 插件内稳定区块 ID，也是 navigation 的 <code>sectionId</code> |
| <code>title</code> | 是   | 区块的可访问名称                                             |
| <code>view</code>  | 是   | 指向 <code>modules.surfaces</code> 中的 native Surface ID    |
| <code>order</code> | 否   | 与其他插件区块排序；默认 0                                   |

启用插件后，Host 自动把区块挂到现有“歌单”页。不要为它声明 drawer presentation，也不要调用 <code>ctx.ui.openView('library')</code>。需要从某个命令跳到该区块时，使用 <code>ctx.ui.navigation.open({ page: 'playlist', sectionId: 'tutorial-library' })</code>。

## 5. 注册与声明必须成对

Manifest 允许某个动作被界面调用，后台还要真正注册：

```ts
ctx.effects.add(
  ctx.actions.register('account.summary', () => ({
    signedIn: false,
    displayName: '演示音乐账号'
  }))
)
```

只注册、不声明，宿主不会把它当作公开命令；只声明、不注册，点击后会得到“动作不存在”。下一节开始实现这些账号动作。
