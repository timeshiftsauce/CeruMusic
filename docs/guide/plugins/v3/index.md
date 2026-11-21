---
pageClass: plugin-v3-doc
title: 澜音插件 v3 开发指南
description: 用官方 CLI 从零构建澜音插件，学习 Vue 组件、宿主 API、操作钩子和发行。
prev: false
---

# 澜音插件 v3 开发指南

从一个能出现在侧栏的计数器开始。你会用官方 CLI 创建工程、写 Vue 界面、通过动作调用插件逻辑、保存数据，最后把同一个工程打包安装。会写基本 JavaScript 就可以开始，教程会解释用到的 TypeScript 和 Vue。

::: info 先确认版本
本文以 **CLI / SDK 3.0.0** 和支持 v3 的 **澜音 2.5.0** 为基准。工具链已可从 npm 安装。桌面 2.5.0 正式版待发布，需要实际打开界面时请使用支持 v3 的 2.5.0 测试构建。使用 2.0–2.4 的用户请看 [v2 文档](/guide/plugins/v2/)。对版本关系有疑问时，先看[兼容与迁移](./migration)。
:::

## 从零做完一个插件

| 按顺序读 | 这一节的结果 |
| --- | --- |
| [1. 用十分钟跑起第一个插件](./quick-start) | 从侧栏打开搜索模板，改一句文案并验证热重载 |
| [2. 接通 Manifest、Logic 和 Vue](./first-plugin) | 点击「加一」即更新 UI，重启也能读回次数 |
| [3. 构建、校验并安装](./publishing) | 拿到可分发的单文件，用普通插件管理复验 |

准备做自己的插件时，可以直接使用 [CLI 与模板](./cli) 选择起点。想接入音乐业务，请按[搜索与播放实战](./music)从本地曲库跑通，再做自己的 Provider。要改变点播或队列行为，使用[播放 Hook 实战](./hooks)，先跑离线场景，再验证桌面权限。想做登录和账号页面，则从[账号、登录与原生音乐库](./accounts)开始。

## 写代码前先分清四个位置

| 位置 | 负责什么 |
| --- | --- |
| `ceru.plugin.json` | 构建入口、插件 ID、公开动作、页面挂载点、权限说明 |
| Logic（`src/index.ts`） | 运行在插件沙箱，持有 `PluginContext`，负责存储、请求、音乐服务、权限、操作钩子 |
| View（例如 `src/Counter.vue`） | 显示界面，通过 `useAction` 调用逻辑，通过 `useViewState` 接收显示数据 |
| 桌面宿主 | 决定插件何时运行，展示权限与页面，执行播放器、账号和系统操作 |

一次按钮点击从 **View → action ID → Logic**，再经 **`ctx.ui.views.setState(viewId, data)` → View** 更新页面。用这个顺序排查时，可以逐段判断是入口没挂上、动作没注册、权限没授予，还是视图读错了状态。

## 选你现在要解决的问题

| 你遇到的问题 | 建议的学习顺序 |
| --- | --- |
| 不知道从哪个文件开始改 | [运行模板](./quick-start) → [读懂工程](./project-files) → [做一个计数器](./first-plugin) |
| 希望启动、停用或更新时做事 | [区分安装与运行](./lifecycle#installation) → [观察桌面变化](./lifecycle#desktop) → [用旧数据验证迁移](./storage) |
| 想拦截或观察播放器动作 | [写第一条 Hook](./hooks) → [核对操作权限与时限](./operations) → 在真实桌面分别测允许和拒绝 |
| 已经知道功能，想查某个方法 | [按任务找 API](./api) → [逐项查参数与返回值](./methods) → [展开返回对象类型](./reference) |
| 想提供自己的音乐库和界面 | [注册音源](./provider) → [处理账号](./accounts) → [渲染宿主原生歌单](./native) |
| 准备交给用户安装 | [成品校验与试装](./publishing) → [覆盖升级](./migration) → [按现象排错](./troubleshooting) |

## 随用随查

- [Manifest 与页面入口](./manifest)对应所有声明字段、页面 ID、视图 ID、模块 ID。
- [PluginContext API](./api)按任务查存储、生命周期、HTTP、服务、宿主能力和权限。
- [Vue hooks 与宿主组件](./views)查 Vue 页面和播放器区域；[操作 Hook 与事件](./hooks)查如何接入宿主动作。
- [兼容与迁移](./migration)说明 v2 如何继续维护，以及怎样在 v3 中保留旧用户数据。
