---
pageClass: plugin-v2-doc
title: 1. 创建账号插件
description: 从 Vue 工程开始，逐步完成账号入口、登录页、原生歌单、播放和导入。
prev:
  text: Navidrome 验证与安装
  link: /guide/plugins/v2/tutorial-navidrome/release
next:
  text: 最小账号入口
  link: /guide/plugins/v2/tutorial-account-native/manifest
---

# 1. 创建账号插件

这个项目会完成一个本地演示账号：登录后，账号菜单显示昵称和会员标签；澜音现有“歌单”页出现两张个人歌单；点击后使用原生详情、播放器和导入窗口。

演示登录完全在本机运行，不连接任何音乐平台。它的目的，是先把账号、Vue 页面、Native View 和 Provider 之间的调用关系走通。

![账号插件各部分和 API 的关系](/plugins/v2/account-native-map.svg)

## 1. 创建工程

```shell
npm create ceru-plugin@latest my-account-plugin -- --template vue --lang ts
cd my-account-plugin
npm install
```

后面五节始终修改这个工程：

```text
my-account-plugin/
├── ceru.plugin.json
├── mock-audio.mjs
└── src/
    ├── data.ts
    ├── account.ts
    ├── provider.ts
    ├── native.ts
    ├── index.ts
    ├── view.ts
    └── App.vue
```

文件会按章节逐个建立，不需要先下载完成版。

## 2. 先理解四个角色

| 角色 | 负责什么 | 本项目 |
| --- | --- | --- |
| Manifest | 声明宿主可以发现的入口 | 账号项、页面、原生区块、Provider |
| 插件后台 | 保存会话并提供业务动作 | 登录状态、歌单数据、播放解析 |
| Vue Surface | 处理自定义交互 | 演示登录页面 |
| Native Surface | 返回结构化数据，由澜音渲染 | 现有“歌单”页中的插件区块 |

Vue 页面通过 `context.invoke()` 调用后台动作，通过 `context.subscribe()` 接收公开状态。Cookie、令牌和原始接口响应只留在插件后台，不进入页面状态、账号摘要或歌曲 ref。

## 3. 学习顺序

1. [最小账号入口](./manifest)：先让账号菜单出现“演示音乐账号”；
2. [Vue 登录与账号状态](./login)：实现登录、状态订阅、关闭清理和退出；
3. [原生歌单区块](./native-library)：把歌单挂到澜音现有“歌单”页；
4. [导航、播放与导入](./playback)：接入原生详情、队列、播放器和导入窗口；
5. [验证并替换真实接口](./release)：完成构建检查，再说明真实凭据边界。

每一节都会说明替换哪个完整文件、从哪里运行、应该看到什么。完成版 ZIP 只在最后用于对照。

## 本节结果

此时仍是 Vue 模板工程。执行 `npm run dev`，确认工作台能打开模板的 `page · web`，然后停止开发服务，进入下一节替换 Manifest 和后台入口。

常见错误：

- 工程名可自定义，后续插件 ID 不要与已安装插件重复；
- 本教程需要 Vue 登录页，不要选 `connected-library` 模板；
- 澜音 2.0 使用 v2 插件，1.14.1 仍使用 v1 插件。

下一节：[建立最小账号入口 →](./manifest)
