---
pageClass: plugin-v2-doc
title: 搜索与分页
prev:
  text: 连通 HTTP 音源
  link: /guide/plugins/v2/tutorial-source/
next:
  text: 播放与歌词
  link: /guide/plugins/v2/tutorial-source/playback
---

# 2. 搜索与分页

继续上一节的 ceru-http-source 工程，保持模拟服务运行。本节新增两个文件，再更新清单和入口。做完后能搜索歌曲；播放会在下一节接上。

## 先看服务返回什么

打开 [Morning 的搜索结果](http://127.0.0.1:43120/v1/tracks?q=Morning)。items 中有一首 Morning Light，包含 id、title、artist、album 和 durationMs。

服务使用 offset 表示“跳过前几条”，limit 表示“本次取几条”。例如 [limit=2 的第一页](http://127.0.0.1:43120/v1/tracks?limit=2&offset=0) 返回两首歌，并附带 nextOffset: 2。

澜音需要的是标准歌曲对象和字符串游标 nextCursor。插件负责转换这两部分数据。

## 定义歌曲转换

新建 **src/api.ts**，写入完整内容：

```ts [src/api.ts]
import type { ContentEntity } from '@shiqianjiang/ceru-plugin-sdk'

export interface ApiTrack {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
}

export interface SearchResponse {
  items: ApiTrack[]
  nextOffset?: number
}

export function readOffset(cursor?: string): number {
  if (cursor === undefined) return 0
  if (!/^\d{1,7}$/.test(cursor)) throw new Error('分页游标无效')
  return Number(cursor)
}

export function toTrack(pluginId: string, raw: ApiTrack): ContentEntity {
  return {
    ref: { pluginId, providerId: 'tutorial-source', kind: 'track', id: raw.id },
    title: raw.title,
    subtitle: raw.artist,
    playable: false,
    durationMs: raw.durationMs,
    metadata: {
      artists: [raw.artist],
      album: { title: raw.album },
      durationMs: raw.durationMs,
      qualities: ['lossless']
    },
    capabilities: []
  }
}
```

每首歌的 ref 保存插件 ID、Provider ID 和服务里的歌曲 ID。播放、歌词等后续操作会把这个 ref 传回来，让插件知道用户选中了哪首歌。

metadata.artists 是歌手数组，durationMs 使用毫秒。本节先设置 playable: false，避免把尚未实现播放的搜索结果标成可播放。

## 注册搜索方法

新建 **src/catalog.ts**，写入完整内容：

```ts [src/catalog.ts]
import type { PluginContext, TrackProvider } from '@shiqianjiang/ceru-plugin-sdk'
import type { Api } from './network'
import { readOffset, toTrack, type SearchResponse } from './api'

export function registerCatalog(ctx: PluginContext, api: Api) {
  const tracks = {
    async search(request, operation) {
      const offset = readOffset(request.cursor)
      await api.allowLocal(operation)
      const result = await api.client.get<SearchResponse>('tracks', {
        operation,
        query: {
          q: request.query.trim(),
          limit: Math.max(1, Math.min(request.limit, 50)),
          offset
        }
      })
      return {
        items: result.items.map((track) => toTrack(ctx.plugin.id, track)),
        nextCursor: result.nextOffset == null ? undefined : String(result.nextOffset)
      }
    },
    async resolve() {
      return ctx.playback.failure({ code: 'UNSUPPORTED', message: '下一节再添加播放' })
    }
  } satisfies TrackProvider

  ctx.providers.register('tutorial-source', { tracks })
  return tracks
}
```

一次搜索依次做三件事：把游标转换为 offset，请求 HTTP 服务，把 items 转成澜音歌曲。第一次没有 cursor 时，从 0 开始；服务不再返回 nextOffset 时，插件也不再返回 nextCursor。

注册对象中的 tracks 是歌曲相关的方法。resolve 暂时返回“不支持”，下一节替换它。

## 更新清单和入口

将 **ceru.plugin.json 全部替换**为以下内容。相比上一节，新增 Provider 声明及 onProvider 激活入口，保留检查命令和网络权限。

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
        "activation": [
          "onCommand:source.check",
          "onProvider:tutorial-source",
          "onCommand:source.test"
        ]
      }
    },
    "contributes": {
      "commands": [
        {
          "id": "source.check",
          "title": "检查演示音源",
          "action": "source.check"
        },
        {
          "id": "source.test",
          "title": "检查分页与歌词",
          "action": "source.test"
        }
      ],
      "providers": [
        {
          "id": "tutorial-source",
          "name": "本地 HTTP 音源",
          "protocols": ["music.search@1", "music.resolve@1"],
          "qualities": ["lossless"],
          "connectionMode": "none"
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

将 **src/index.ts 全部替换**为以下内容。registerCatalog 注册并返回同一组方法；source.test 命令用它连续取两页，便于在工作台检查分页。

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { createApi } from './network'
import { registerCatalog } from './catalog'

export default definePlugin(async (ctx) => {
  const api = await createApi(ctx)

  ctx.actions.register('source.check', async (_input, operation) => {
    await api.allowLocal(operation)
    return api.client.get<{ ok: boolean; tracks: number }>('health', { operation })
  })

  const tracks = registerCatalog(ctx, api)
  ctx.actions.register('source.test', async (_input, operation) => {
    const request = { query: 'Ceru Tutorial', kinds: ['track'], filters: {}, limit: 2 }
    const first = await tracks.search(request, operation)
    const second = first.nextCursor
      ? await tracks.search({ ...request, cursor: first.nextCursor }, operation)
      : { items: [] }
    return JSON.parse(JSON.stringify({ first, second }))
  })
})
```

检查命令只返回 JSON 数据，所以返回前做一次序列化转换，去掉对象中值为 undefined 的字段。Provider 本身仍直接返回标准歌曲对象。

## 验证搜索和下一页

执行 npm run typecheck。若开发服务还在运行，等待自动重新构建；否则执行 npm run dev。

在工作台选中“本地 HTTP 音源”，先输入 Morning，再点击“调用搜索”，应看到 Morning Light。然后依次检查：

| 输入                 | 预期            |
| -------------------- | --------------- |
| Rain                 | Rainy Afternoon |
| 前后带空格的 morning | Morning Light   |
| 不存在的歌名         | 空结果，无异常  |
| Ceru Tutorial        | 三首演示歌曲    |

工作台的普通搜索固定请求 20 条，没有歌曲分页按钮。要检查分页，在“能力注册”中点击 **source.test**，查看调用结果：

- first.items 包含 Morning Light、Rainy Afternoon，first.nextCursor 为 "2"。
- second.items 只包含 Night Walk，且没有 nextCursor。

这个命令用固定关键词 Ceru Tutorial 和 limit: 2，调用的正是 Provider 注册的 search 方法。它拿到第一页游标后继续请求第二页。

不要用歌曲 ID 或页码自行拼出下一次 cursor；把上一次结果的 nextCursor 原样传回即可。在这个服务中它恰好是数字字符串，真实服务也可能返回一段不透明的令牌。

**完成检查：** 三首歌可以分两页取完，没有重复或遗漏。下一节让这些歌曲真正可播放。
