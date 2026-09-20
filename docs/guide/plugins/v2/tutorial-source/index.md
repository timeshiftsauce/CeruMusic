---
pageClass: plugin-v2-doc
title: 连通 HTTP 音源
prev:
  text: 安装到澜音
  link: /guide/plugins/v2/first-release
next:
  text: 搜索与分页
  link: /guide/plugins/v2/tutorial-source/provider
---

# 1. 连通 HTTP 音源

入门项目从代码里的数组搜索歌曲。这次改为请求一个 HTTP 服务，最终让澜音能搜索歌曲、播放音频、显示歌词。

本项目新建一个工程，不覆盖前面的 my-plugin。需要 Node.js **22.12+**；建议先完成[入门五节](../quick-start)，知道入口文件、清单和工作台分别在哪里。

| 章节                        | 做完后能看到什么                          |
| --------------------------- | ----------------------------------------- |
| 本节：连通 API              | 执行检查命令，返回服务中的歌曲数量        |
| [搜索与分页](./provider)    | 搜索 Morning 得到一首歌，分两页取完三首歌 |
| [播放与歌词](./playback)    | 获取可播放的 WAV 地址和两行同步歌词       |
| [安装与更换服务](./release) | 构建单文件插件，在澜音 2.0 中验证         |

<PluginDiagram src="/plugins/v2/source-request-flow.svg" alt="澜音调用插件的 Provider，插件通过 HTTP 客户端访问音乐服务并转换结果" />

## 创建工程并启动音乐服务

在终端执行：

```shell
npm create ceru-plugin@latest ceru-http-source -- --template source --lang ts
cd ceru-http-source
npm install
```

教程配有一个本机音乐服务，负责返回三首演示歌曲和一段 2.2 秒的合成音。它不需要账号或第三方接口。

下载 [mock-server.mjs](/plugins/v2/tutorial/http-source/mock-server.mjs)，放到工程根目录，与 package.json 同级。只需要这一个辅助文件；插件代码会在后面的步骤中编写。浏览器若直接显示源码，可将该文件另存为 mock-server.mjs。

在当前终端运行：

```shell
node mock-server.mjs
```

出现以下输出后，保持这个终端运行：

```text
Mock music API: http://127.0.0.1:43120/v1/health
Press Ctrl+C to stop
```

打开 [服务检查地址](http://127.0.0.1:43120/v1/health)，应看到：

```json
{ "ok": true, "tracks": 3 }
```

此时只证明音乐服务已经启动，插件还没有连接它。若浏览器打不开，先检查这个终端是否报错；端口被占用时会出现 EADDRINUSE。

## 声明地址和网络权限

将 **ceru.plugin.json 全部替换**为下面内容。本节先只保留一个检查命令。

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.http-source",
    "name": "本地 HTTP 音源",
    "version": "0.1.0",
    "description": "搜索、播放与歌词教学插件",
    "author": "Your Name",
    "license": "MIT",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1"
    },
    "config": {
      "apiOrigin": "http://127.0.0.1:43120"
    },
    "modules": {
      "logic": {
        "entry": "logic.main",
        "activation": ["onCommand:source.check"]
      }
    },
    "contributes": {
      "commands": [
        {
          "id": "source.check",
          "title": "检查演示音源",
          "action": "source.check"
        }
      ]
    },
    "permissions": [
      {
        "key": "source.http",
        "name": "network.request",
        "reason": "请求音乐服务的歌曲和歌词"
      },
      {
        "key": "source.private",
        "name": "network.private",
        "optional": true,
        "reason": "访问本机运行的教程音乐服务"
      }
    ],
    "dataSchemas": {
      "config": 1,
      "state": 1
    }
  },
  "entries": {
    "logic.main": "src/index.ts"
  },
  "resources": {},
  "output": "dist/plugin.js"
}
```

其中：

- manifest.config.apiOrigin 是音乐服务的根地址，代码通过 ctx.config.get() 读取它。
- source.http 是本插件的 HTTP 授权项，种类为 network.request。
- source.private 允许访问本机和局域网。因为服务在 127.0.0.1，两项权限都需要授予。
- optional 表示用户可以不授予这项权限就安装插件；依赖它的本机请求仍然不能执行。

## 建立 HTTP 客户端

新建 **src/network.ts**，写入完整内容：

```ts [src/network.ts]
import type { OperationContext, PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

export async function createApi(ctx: PluginContext) {
  const config = await ctx.config.get<{ apiOrigin: string }>()
  const baseURL = new URL('/v1/', config.apiOrigin).href
  const client = ctx.http.create({
    baseURL,
    permissionKey: 'source.http',
    requestPermission: true
  })

  async function allowLocal(operation: OperationContext) {
    operation.signal.throwIfAborted()
    let grant = await ctx.permissions.query({ key: 'source.private' })
    if (grant.status === 'prompt') {
      grant = await ctx.permissions.request({
        key: 'source.private',
        intent: operation.userIntent
      })
    }
    if (grant.status !== 'granted') throw new Error('请允许访问局域网与本机服务')
    operation.signal.throwIfAborted()
  }

  return { baseURL, client, allowLocal }
}

export type Api = Awaited<ReturnType<typeof createApi>>
```

createApi 把根地址补成 http://127.0.0.1:43120/v1/，后续请求只写 health 或 tracks。allowLocal 在每次操作前检查本机网络权限；HTTP 客户端用 source.http 检查另一项权限。

requestPermission: true 会在尚未决定时发起授权请求。用户已经拒绝时，请求会失败，需要用户自己修改授权。

这里始终检查本机权限，因为本教程固定连接本机服务。如何改成公网服务放在[最后一节](./release#换成自己的服务)。

## 添加检查命令

将 **src/index.ts 全部替换**为：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { createApi } from './network'

export default definePlugin(async (ctx) => {
  const api = await createApi(ctx)

  ctx.actions.register('source.check', async (_input, operation) => {
    await api.allowLocal(operation)
    return api.client.get<{ ok: boolean; tracks: number }>('health', { operation })
  })
})
```

执行 source.check 时，插件先检查权限，再请求 GET /v1/health，并把 JSON 返回给工作台。operation 由宿主传入，包含本次操作的取消信号和截止时间；后续每次 HTTP 请求都继续传入它。

## 在工作台验证

另开一个终端，进入同一个 ceru-http-source 目录，执行：

```shell
npm run typecheck
npm run dev
```

工作台加载后，在“能力注册”中点击 **source.check**。按提示授予“访问局域网与本机服务”和“访问公网服务”。后者是 HTTP 请求权限在界面中的名称，本例的请求地址仍然是 127.0.0.1。

在调用结果中，应看到 ok 为 true、tracks 为 3。本节尚未注册搜索来源，先不用搜索框。

| 现象                                | 检查                                              |
| ----------------------------------- | ------------------------------------------------- |
| 提示本机网络权限未授予              | 在工作台权限区域授予“访问局域网与本机服务”        |
| 提示 Network permission source.http | 检查“访问公网服务”的授权状态                      |
| 连接失败                            | mock 服务是否还在运行；浏览器能否打开 health 地址 |
| 仍显示模板的命令                    | 确认两个文件已完整替换，查看开发终端是否构建失败  |

**完成检查：** 工作台执行 source.check，返回三首歌。下一节开始把这三首歌接入搜索。
