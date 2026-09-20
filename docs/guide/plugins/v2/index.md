---
pageClass: plugin-v2-doc
title: 简介
description: 用一个可以搜索的小曲库，开始开发你的第一个澜音插件。
prev: false
next:
  text: 快速上手
  link: /guide/plugins/v2/quick-start
---

# 简介

你正在阅读**澜音插件 v2** 的开发指南，适用于澜音 **1.14.1 及以上版本**。旧插件的资料仍保留在 [v1 文档](/guide/CeruMusicPluginDev)中。

## 什么是澜音插件？

插件是一段用来扩展澜音功能的 JavaScript 程序。例如，你可以让澜音搜索自己的曲库，或者添加一个连接服务器的设置页面。

插件也可以带上自己的 Vue 页面：页面负责交互，后台代码负责登录、轮询和获取曲库。澜音作为宿主，提供显示容器、权限、存储和音乐能力。Vue 的运行代码随插件一起打包。

## 插件如何融入澜音？

插件环境由 SDK、Core 和 CLI 提供，澜音负责实现宿主接口。你可以先用脚手架独立开发、预览和打包，再把生成的 `dist/plugin.js` 安装到澜音。平台登录、接口请求、会员判断和账号存储都写在插件里。

可见内容也能直接接入软件原有功能。例如，一个音乐账号插件可以：

- 在账号胶囊菜单中显示子账号。未登录时显示默认头像和“未登录”，点击打开插件编写的扫码弹窗；登录成功后自动关闭，菜单更新为头像、昵称和可选会员标签，悬停可退出登录。
- 通过 <code>playlistSections</code> 把原生 Surface 放进现有“歌单”页，由澜音自己的 Vue 组件渲染歌单、歌曲和按钮。点击歌单进入原生详情，播放使用原有队列和播放器，导入使用原有对话框。
- 用打包进插件的 Vue 页面实现自定义登录交互，再通过通用接口调用弹窗、通知、存储和导航。

原生 Surface 的 render 动作返回界面数据；个人歌单与本地、云歌单并列出现在软件已有页面中，不需要套一个独立网页、抽屉或新侧边栏。自定义 Vue 页面使用 Web Surface，同一个插件可以组合两种方式。完整做法见[原生内容与账号菜单](./ui-native)。

账号是某个音源的连接方式。例如网易云账号插件仍然声明 `wy` 音源，与其他 `wy` 实现共用音源选择规则；账号入口通过菜单贡献添加，无需再加一个侧边栏入口。

## 看一个搜索例子

先看一个小例子。这里有三首演示歌曲，输入 `Rain`，点击“搜索”：

<PluginLearningDemo mode="search" />

这个过程里，你的插件负责**找到歌曲并返回结果**，澜音负责**提供搜索入口和显示结果**。在接下来的教程中，我们会写出负责搜索的那段代码。

## 先从一件小事开始

完整插件可以有很多能力，但你的第一个插件只需完成两件事：

1. 点击一个命令，显示“你好，澜音”。
2. 输入关键词，从本地演示数据中找到歌曲。

随后我们给它加上记忆功能，再把它打包成一个可以安装的文件。这个过程不需要音乐账号、API Key 或真实音乐服务器。

<div class="plugin-start-card">
  <strong>一起写一个小插件</strong>
  <p>创建工程 → 修改问候 → 理解搜索 → 保存数据 → 安装到澜音。</p>
  <a href="./quick-start">开始动手教程 →</a>
</div>

## 再完成三个真实项目

基础五节结束后，不需要从 API 目录猜下一步。选择一个能跑通的项目继续：

<div class="plugin-project-grid">
  <a class="plugin-project-card" href="./tutorial-source/">
    <span>项目一 · Provider</span>
    <strong>开发 HTTP 音源</strong>
    <p>本机模拟 API、分页、播放地址、音质和 CrLyric。</p>
  </a>
  <a class="plugin-project-card" href="./tutorial-navidrome/">
    <span>项目二 · Vue Surface</span>
    <strong>开发 Navidrome 插件</strong>
    <p>登录、令牌存储、轮询、搜索、播放和同步歌词。</p>
  </a>
  <a class="plugin-project-card" href="./tutorial-account-native/">
    <span>项目三 · 账号与原生界面</span>
    <strong>开发账号音乐插件</strong>
    <p>账号菜单、Vue 扫码、现有“歌单”页区块、详情分页、播放和导入。</p>
  </a>
</div>

## 需要先会什么？

你需要知道 JavaScript 中的变量、函数、数组和对象。遇到 `async / await` 时，只要先把它理解成“等待一个操作完成”，教程会结合实际代码解释。

教程使用 TypeScript 模板，但前几节主要是普通 JavaScript 写法。你不需要预先掌握 Electron、Vue 或 React，也不需要先理解整个插件架构。

如果你想做可见页面，学完基础后再选择熟悉的 [Vue、React 或普通网页模板](./templates)。

## 教程里会用到哪些文件？

开始时，只关注两个文件：

```text
my-plugin/
├── ceru.plugin.json   ← 告诉澜音：插件叫什么、有哪些功能
└── src/index.ts       ← 实现这些功能
```

第一个文件中的插件说明叫 **Manifest（清单）**。第二个文件中的函数是插件实际执行的代码。其余文件由脚手架准备好，暂时不用修改。

最终运行一次构建命令，就会得到 `dist/plugin.js`。用户安装这一个文件即可。

## 选择你的学习路径

| 你现在想做什么               | 建议从这里开始                                                              |
| ---------------------------- | --------------------------------------------------------------------------- |
| 第一次开发插件               | [快速上手](./quick-start)，按五节教程依次完成                               |
| 想接入自己的 HTTP 音乐服务   | [HTTP 音源项目](./tutorial-source/)                                         |
| 想做带登录和 Vue 页面        | [Navidrome 项目](./tutorial-navidrome/)                                     |
| 想做账号菜单与原生音乐界面   | [账号与原生音乐库项目](./tutorial-account-native/)                          |
| 已经会写插件，想增加一个功能 | [HTTP 请求](./http)、[设置抽屉](./ui-schema)、[歌单导入](./playlist-import) |
| 正在查参数或限制             | [Storage](./storage)、[Provider](./providers)、[宿主服务](./host-services)  |
| 已有 v1 插件                 | [迁移指南](./migration)                                                     |

参数表和类型声明留在 API 参考中。读教程时不必同时打开它们，完成每节末尾的小练习就可以继续。

<span id="兼容关系"></span>
<span id="六种版本号分别表示什么"></span>

## 版本与工具

当前教程统一使用正式发布的 **0.3.5** 工具链，包含 <code>playlistSections</code>、歌单区块定位和 Web Surface 自动内容高度。升级说明见[工具链更新](./sdk-upgrade)，原生歌单、账号胶囊菜单、扫码弹窗与自动关闭见[原生内容与账号菜单](./ui-native)。

详细的桌面、协议与工具版本关系见[版本与兼容](./compatibility)。完整参考文档按正式发布的 SDK 0.3.5 生成，运行能力仍以[宿主支持表](./host-services)为准。

<span id="插件、sdk、cli、core-和-host"></span>
<span id="插件开发知识地图"></span>

::: details 想先了解整体结构？
可以查阅[常用概念与架构图](./concepts)。它解释了 SDK、CLI、Provider、Surface 等名称，以及各自负责的事情。
:::

## 官方资源

- [工具链、SDK 与运行时源码](https://github.com/CeruMusic/CeruMusic-Plugin-Cli)
- [模板与社区插件](https://github.com/CeruMusic/CeruMusic-Plugin-Template)

准备好了，就从[运行第一个插件](./quick-start)开始。
