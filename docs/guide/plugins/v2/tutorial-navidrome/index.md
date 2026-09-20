---
pageClass: plugin-v2-doc
title: 开发 Navidrome 插件
description: 用 Vue Surface、Action、Storage 和 Provider 接入自己的 Navidrome 音乐库。
prev:
  text: HTTP 音源验证
  link: /guide/plugins/v2/tutorial-source/release
next:
  text: 连接与认证
  link: /guide/plugins/v2/tutorial-navidrome/connection
---

# 开发 Navidrome 插件

这个项目比普通音源多一层：用户要先在插件自己的 Vue 页面登录，然后澜音才能通过 Provider 搜索、播放和读取歌词。

<PluginDiagram src="/plugins/v2/navidrome-architecture.svg" alt="Vue Surface 通过 Action 调用插件逻辑，逻辑使用隔离 Storage 和 Navidrome API，并通过 Provider 为澜音提供音乐能力" />

## 完成后是什么样子？

![Navidrome 教程插件在工作台中连接成功](/plugins/v2/navidrome-connected.png)

_实测截图：Vue Surface 已用 demo 账号连接本机 Navidrome 模拟服务。左侧仍是通用工作台，右侧页面完全由插件拥有。_

这个教程版包含：

| 能力                             | 谁负责             |
| -------------------------------- | ------------------ |
| 连接表单、错误提示、30 秒轮询    | 插件的 Vue Surface |
| 认证签名、令牌保存、退出登录     | 插件逻辑           |
| 权限弹窗、隔离 Storage、页面容器 | 澜音 Host          |
| 搜索、播放 URL、同步歌词         | Navidrome Provider |

它没有使用澜音账号系统，也没有 `ceru.integrations`、`accounts` 或平台专用页面协议。插件账号完全属于插件。

## 先运行完成版

下载 [Navidrome Vue 教程工程](/plugins/v2/tutorial/ceru-navidrome-vue.zip)，解压后执行：

```shell
npm install
```

终端 A 启动模拟 Navidrome：

```shell
npm run mock
```

终端 B 启动工作台：

```shell
npm run dev
```

在工作台授予两项网络权限，打开 `connection · web` 页面，使用：

```text
地址：http://127.0.0.1:4533
用户名：demo
密码：demo
```

点击“验证并保存”。出现 `已连接 · 0.54.5-mock` 后，搜索 `Morning`。

::: tip 没有 Navidrome 服务器也能完成
模拟服务实现了本教程使用的 `ping`、`search3`、`stream` 和 `getLyricsBySongId`。最后一节再切换到你的真实服务器。
:::

## 从 Vue 模板开始

如果想逐步手写：

```shell
npm create ceru-plugin@0.3.5 ceru-navidrome -- --template vue --lang ts
cd ceru-navidrome
npm install
```

项目最后会形成这个结构：

```text
ceru-navidrome/
├── ceru.plugin.json       # Surface、Action、Provider 与权限
├── mock-navidrome.mjs     # 可选的本机练习服务器
└── src/
    ├── index.ts           # 登录、Storage、HTTP、Provider
    ├── view.ts            # 挂载 Vue
    ├── App.vue            # 插件自己的连接页面
    └── env.d.ts
```

## 学习路线

<div class="plugin-reading-flow" aria-label="Navidrome 项目学习路线">
  <a href="./connection">1. 连接与认证</a><span>→</span><a href="./surface">2. Vue 连接页</a><span>→</span><a href="./provider">3. 搜索播放歌词</a><span>→</span><a href="./release">4. 实机安装</a>
</div>

每章只解决一个问题。你可以先用完成版看到效果，再回到对应文件逐段修改。

下一节：[连接、认证与 Storage →](./connection)
