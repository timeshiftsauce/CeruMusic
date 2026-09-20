---
pageClass: plugin-v2-doc
title: 开发 HTTP 音源插件
description: 从本机模拟 API 开始，做出可搜索、播放并显示歌词的澜音 v2 音源插件。
prev:
  text: 安装与交付
  link: /guide/plugins/v2/first-release
next:
  text: 实现 Provider
  link: /guide/plugins/v2/tutorial-source/provider
---

# 开发 HTTP 音源插件

这个项目会把一个普通 HTTP 音乐服务接入澜音。完成后，你能搜索三首演示歌曲、播放一段本地生成的音频，并看到两行同步歌词。

<div class="plugin-reading-flow" aria-label="本项目的三个阶段">
  <strong>本机 API</strong><span>→</span><strong>Provider</strong><span>→</span><strong>搜索、播放和歌词</strong>
</div>

<PluginDiagram src="/plugins/v2/source-request-flow.svg" alt="澜音经过 Provider、权限和 HTTP 客户端访问音乐服务，再接收标准音乐数据" />

::: tip 这是真正可播放的教学项目
音频由 `mock-server.mjs` 在内存中生成，不复制任何平台接口或受版权保护的音频。学会流程后，再将它换成你有权访问的服务。
:::

## 先运行完成版

下载 [HTTP 音源教程工程](/plugins/v2/tutorial/ceru-http-source.zip)，解压后打开项目目录。

你需要 Node.js **22.12+** 和完整的 0.3.5 工具链。五个包已发布到 npm registry，版本关系见[版本与兼容](../compatibility)。

```shell
npm install
```

打开两个终端。第一个终端启动模拟音乐服务：

```shell
npm run mock
```

看到下面两行，服务就准备好了：

```text
Mock music API: http://127.0.0.1:43120/v1/health
Press Ctrl+C to stop
```

第二个终端启动插件工作台：

```shell
npm run dev
```

在工作台依次授予“访问公网服务”和“访问局域网与本机服务”，再输入 `Morning` 调用搜索。你应该看到 **Morning Light**。接着测试解析和歌词；播放地址会指向本机模拟服务。

**完成标志：** 搜索有结果，解析结果为 `ok: true`，歌词包含“这是本机模拟服务返回的歌词”。

## 如果想从空工程开始

创建 source + TypeScript 工程：

```shell
npm create ceru-plugin@0.3.5 ceru-http-source -- --template source --lang ts
cd ceru-http-source
npm install
```

从完成版复制 `mock-server.mjs`，并在 `package.json` 的 scripts 中加入：

```json
{
  "mock": "node mock-server.mjs"
}
```

接下来只会修改两个位置：

```text
ceru-http-source/
├── ceru.plugin.json       # 声明 Provider、权限和 API 地址
├── mock-server.mjs        # 教程用音乐服务
└── src/
    ├── api.ts             # 平台数据 → 澜音标准数据
    └── index.ts           # HTTP 请求与 Provider
```

## 先认识模拟 API

在浏览器打开 `http://127.0.0.1:43120/v1/health`，应得到：

```json
{ "ok": true, "tracks": 3 }
```

本教程只用四个地址：

| 请求                        | 用途     | 返回内容                 |
| --------------------------- | -------- | ------------------------ |
| `GET /v1/health`            | 检查服务 | 是否可用、歌曲数量       |
| `GET /v1/tracks?q=Morning`  | 搜索     | 歌曲 JSON 与下一页偏移量 |
| `GET /v1/tracks/:id/stream` | 播放     | WAV 音频流               |
| `GET /v1/tracks/:id/lyrics` | 歌词     | 毫秒时间的歌词行         |

这和真实音源的结构相同：插件请求 JSON，但不会把上游 JSON 原样交给澜音；它要在中间完成数据转换。

下一节：[声明权限并实现 Provider →](./provider)
