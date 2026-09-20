---
pageClass: plugin-v2-doc
title: 项目三：账号与原生音乐库
description: 从公开 Vue 脚手架开始，做出账号菜单、扫码弹窗、原生歌单和播放能力。
prev:
  text: Navidrome 验证与安装
  link: /guide/plugins/v2/tutorial-navidrome/release
next:
  text: 工程与 Manifest
  link: /guide/plugins/v2/tutorial-account-native/manifest
---

# 项目三：账号与原生音乐库

这一章做一个“小型账号音乐插件”。完成后，你会看到：

- 账号菜单中出现一个子账号；未登录时显示默认头像和“未登录”。
- 点击账号项，自动打开 Vue 登录 modal 并开始取码。
- 模拟扫码成功后，弹窗关闭，菜单变成昵称、头像与 <code>SVIP</code>。
- 软件现有侧边栏“歌单”页出现插件区块，与本地、云歌单并列。
- 点击歌单进入原生详情；播放、队列和导入继续使用澜音已有界面。

![账号插件各部分和 API 的关系](/plugins/v2/account-native-map.svg)

_Manifest 负责把入口接到宿主；Vue 只负责登录交互；后台保存会话并提供数据；Native View 只返回可渲染的数据。_

::: tip 先辨认“演示登录”
完成版不会请求网易云或其他平台，也没有可复用的登录绕过逻辑。“模拟手机扫码并确认”只让你观察生命周期、状态广播和自动关窗。最后一节再说明怎样替换成你有权调用的真实接口。
:::

## 先运行完成版

要求 Node.js **22.12+**。下载 [完整工程 ZIP](/plugins/v2/tutorial/ceru-account-native.zip)，解压后执行：

```shell
npm view @shiqianjiang/ceru-plugin-cli version
npm ci
npm run mock
```

保留模拟音频服务，再开一个终端：

```shell
npm run dev
```

第一条命令应返回 <code>0.3.5</code>。本项目使用正式发布的 0.3.5 契约；0.3.4 已修复旧版 CLI 横幅显示错误。用下面命令查看实际安装版本：

```shell
npm ls create-ceru-plugin @shiqianjiang/ceru-plugin-cli @shiqianjiang/ceru-plugin-sdk
```

在工作台中按顺序操作：

1. 点击左侧“账号 · 演示音乐账号”。
2. 登录页自动生成一次演示会话；点击“模拟手机扫码并确认”。
3. 等待动作返回，modal 自动关闭；账号按钮变为“澜音体验用户 · SVIP”。
4. 在 CLI 工作台点击 <code>library · native</code> 预览；安装到澜音后，从现有侧边栏进入“歌单”页查看“演示账号歌单”区块。
5. 给 <code>playback</code> 权限点击“授予”，再播放一首歌。
6. 关闭账号页后重新退出并打开，确认每次都会重新创建登录会话。

完成版来自公开脚手架，并已在空目录完成安装、类型检查、构建与静态校验。你也可以<a href="/plugins/v2/tutorial/account-native/README.md">直接查看工程说明</a>。

## 一次点击经过哪些地方？

![账号登录动作与状态流](/plugins/v2/account-login-flow.svg)

图中有两条方向不同的数据：

- <code>context.invoke()</code> 从 Vue 页面调用后台动作，等待明确的返回值。
- <code>ctx.ui.setState()</code> 从后台广播公开状态，页面通过 <code>subscribe()</code> 接收；原生页面也会重新 render。

Cookie、刷新令牌和接口原始响应不走这两条公开通道，只留在插件后台的私有 Storage。个人歌单区块由 <code>playlistSections</code> 挂到宿主现有页面，不调用 <code>openView('library')</code>，也不创建新的“我的歌单”按钮。

## 这个项目的文件

```text
account-native/
├─ ceru.plugin.json    # 声明账号项、两个 Surface、Provider、动作和权限
├─ src/
│  ├─ index.ts         # 登录状态、Native View、Provider 与宿主服务调用
│  ├─ view.ts          # defineSurface + createApp
│  └─ App.vue          # 登录 modal、轮询、订阅和自动关闭
├─ mock-audio.mjs      # 本地生成短 WAV，便于验证 resolve
└─ package.json
```

接下来从一条正式 registry 命令重新创建工程，再逐段解释 Manifest。

## 本项目学习路线

| 章节                             | 你会完成什么                               | 主要 API                                           |
| -------------------------------- | ------------------------------------------ | -------------------------------------------------- |
| [工程与 Manifest](./manifest)    | 把入口、动作、账号项、歌单区块和权限连起来 | entries、commands、accountItems、playlistSections  |
| [Vue 登录与账号状态](./login)    | 登录、轮询、广播、关窗、退出               | invoke、subscribe、setState、close                 |
| [原生歌单区块](./native-library) | 把页面数据接入现有“歌单”页                 | playlistSections、defineNativeView、playlists.get  |
| [导航、播放与导入](./playback)   | 调用澜音已有的音乐界面与服务               | navigation、queue、player、playlistImport、resolve |
| [替换真实接口并发布](./release)  | 守住凭据边界，构建并安装                   | http、storage、build、validate                     |

::: details 已经有真实项目？
可以跳到[替换真实接口并发布](./release)。网易云实现仍应使用 <code>providerId: "wy"</code>，账号入口使用 <code>accountItems</code>，无需增加网易云侧边栏。
:::
