---
pageClass: plugin-v2-doc
title: 1. 创建 Navidrome 插件
description: 从 Vue 模板创建工程，先声明连接页、动作和网络权限。
prev:
  text: HTTP 音源验证
  link: /guide/plugins/v2/tutorial-source/release
next:
  text: 连接与认证
  link: /guide/plugins/v2/tutorial-navidrome/connection
---

# 1. 创建 Navidrome 插件

这个项目会做一件完整的事：用户先在插件自己的 Vue 页面连接 Navidrome，随后澜音通过插件 Provider 搜索、播放并读取歌词。

本教程只使用插件自己的连接记录，不接入澜音账号系统。完成后的调用关系是：

<PluginDiagram src="/plugins/v2/navidrome-architecture.svg" alt="Vue 页面通过 Action 调用插件逻辑，插件逻辑访问 Navidrome，并通过 Provider 向澜音提供音乐能力" />

## 1. 创建 Vue 工程

新建工程：

```shell
npm create ceru-plugin@latest ceru-navidrome -- --template vue --lang ts
cd ceru-navidrome
npm install
```

后面四节始终修改这个工程，最终结构如下：

```text
ceru-navidrome/
├── ceru.plugin.json
├── mock-navidrome.mjs
└── src/
    ├── model.ts
    ├── api.ts
    ├── provider.ts
    ├── index.ts
    ├── view.ts
    └── App.vue
```

## 2. 声明连接页和动作

先用下面内容完整替换 `ceru.plugin.json`。这一阶段只声明连接页，Provider 会在第 4 节加入。

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.navidrome-vue",
    "name": "Navidrome 教程版",
    "version": "0.1.0",
    "description": "用 Vue 连接自己的 Navidrome，并提供搜索、播放与歌词",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "uiSchema": "^1.0.0"
    },
    "modules": {
      "logic": {
        "entry": "logic.main",
        "activation": ["onCommand:connection.open"]
      },
      "surfaces": [
        {
          "id": "connection",
          "kind": "web",
          "entry": "view.connection",
          "title": "连接 Navidrome",
          "presentation": { "kind": "drawer", "placement": "right", "size": 440 }
        }
      ]
    },
    "contributes": {
      "commands": [
        {
          "id": "connection.open",
          "title": "连接 Navidrome",
          "action": "connection.open",
          "view": "connection"
        },
        { "id": "connection.read", "title": "读取连接状态", "action": "connection.read" },
        { "id": "connection.save", "title": "保存连接", "action": "connection.save" },
        { "id": "connection.ping", "title": "测试连接", "action": "connection.ping" },
        { "id": "connection.logout", "title": "断开连接", "action": "connection.logout" }
      ],
      "settingsPages": [
        { "id": "connection", "title": "Navidrome 连接", "view": "connection" }
      ]
    },
    "permissions": [
      {
        "key": "navidrome.http",
        "name": "network.request",
        "reason": "访问你设置的 Navidrome 服务器"
      },
      {
        "key": "navidrome.private",
        "name": "network.private",
        "optional": true,
        "reason": "连接本机或局域网中的 Navidrome 服务器"
      }
    ],
    "dataSchemas": { "config": 1, "state": 1 }
  },
  "entries": {
    "logic.main": "src/index.ts",
    "view.connection": "src/view.ts"
  },
  "resources": {},
  "output": "dist/plugin.js",
  "framework": "vue"
}
```

这里声明了五个页面会调用的 Action。公网服务器需要 `network.request`；本机、NAS 和局域网地址还需要 `network.private`。插件只能请求清单中已有的权限。

页面没有后台定时器、Socket 或其他资源需要插件逻辑清理，因此不声明 `openAction` 和 `closeAction`。后面的 30 秒轮询属于 Vue 组件，组件卸载时自行停止。

## 3. 准备本机模拟服务

把教程提供的 <a href="/plugins/v2/tutorial/navidrome-vue/mock-navidrome.mjs">mock-navidrome.mjs</a> 放到工程根目录，然后给 `package.json` 增加命令：

```shell
npm pkg set scripts.mock="node mock-navidrome.mjs"
```

启动它：

```shell
npm run mock
```

看到以下地址和账号后保持终端运行：

```text
Mock Navidrome: http://127.0.0.1:4533
Username: demo  Password: demo
```

模拟服务只实现本教程需要的 `ping`、`search3`、`stream` 和 `getLyricsBySongId`，不需要真实 Navidrome 服务器。

## 本节结果

现在工程已经有连接页面、动作名称和最小权限边界。页面仍是模板内容，连接动作会在下一节完整实现；先不要尝试登录。

常见错误：

- `mock-navidrome.mjs` 必须位于 `package.json` 同级目录；
- 端口 4533 被占用时，先停止占用该端口的程序；
- 不要把真实账号或密码写进 `ceru.plugin.json`。

下一节：[实现连接、认证与 Storage →](./connection)
