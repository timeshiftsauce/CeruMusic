---
pageClass: plugin-v2-doc
title: 播放与歌词
prev:
  text: 搜索与分页
  link: /guide/plugins/v2/tutorial-source/provider
next:
  text: 安装与更换服务
  link: /guide/plugins/v2/tutorial-source/release
---

# 3. 播放与歌词

继续上一节的工程。本节把搜索结果标成可播放，并实现 resolve 和 lyrics。src/network.ts 保持上一节的内容。

点击歌曲后，宿主用它的 ref 调用 resolve，取得 URL 后由播放器读取音频；歌词则通过 lyrics 单独请求。

## 转换歌词时间

模拟服务的 [Morning 歌词接口](http://127.0.0.1:43120/v1/tracks/morning/lyrics) 返回两行带毫秒时间的文本。澜音需要 CrLyric 格式，因此还要补上格式、版本和歌曲引用。

新建 **src/lyrics.ts**，写入完整内容：

```ts [src/lyrics.ts]
import type { CrLyric, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

export interface LyricsResponse {
  offsetMs?: number
  lines: { startTimeMs: number; endTimeMs?: number; text: string }[]
}

export function toLyrics(track: ResourceRef, raw: LyricsResponse): CrLyric {
  const lines = raw.lines
    .filter(
      (line) =>
        Number.isFinite(line.startTimeMs) &&
        line.startTimeMs >= 0 &&
        typeof line.text === 'string' &&
        (line.endTimeMs === undefined ||
          (Number.isFinite(line.endTimeMs) && line.endTimeMs >= line.startTimeMs))
    )
    .map((line) => ({
      startTimeMs: line.startTimeMs,
      endTimeMs: line.endTimeMs,
      text: line.text
    }))
    .sort((a, b) => a.startTimeMs - b.startTimeMs)

  return {
    format: 'crlyric',
    version: 1,
    track,
    offsetMs: Number.isFinite(raw.offsetMs) ? Number(raw.offsetMs) : 0,
    lines
  }
}
```

转换时过滤负数时间、结束早于开始的行，再按开始时间排序。offsetMs 是整份歌词的时间偏移；没有提供时使用 0。

本例有时间轴。若自己的服务只有整段文本，应使用 CrLyric 的 plainText 字段并令 lines 为空，见[歌词参考](../lyrics)。

## 接上播放和歌词方法

将 **src/catalog.ts 全部替换**为下面内容。search 的逻辑保留，新增引用检查、播放解析和歌词请求。

```ts [src/catalog.ts]
import type { PluginContext, ResourceRef, TrackProvider } from '@shiqianjiang/ceru-plugin-sdk'
import type { Api } from './network'
import { readOffset, toTrack, type SearchResponse } from './api'

import { toLyrics, type LyricsResponse } from './lyrics'

function readTrackId(ref: ResourceRef, pluginId: string): string {
  if (
    ref.pluginId !== pluginId ||
    ref.providerId !== 'tutorial-source' ||
    ref.kind !== 'track' ||
    !ref.id
  )
    throw new Error('这不是本音源创建的歌曲引用')
  return ref.id
}

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
    async resolve(resource, quality, operation) {
      let id: string
      try {
        id = readTrackId(resource, ctx.plugin.id)
      } catch {
        return ctx.playback.failure({ code: 'NOT_FOUND', message: '歌曲引用不属于本音源' })
      }
      if (quality && quality !== 'lossless') {
        return ctx.playback.failure({ code: 'UNSUPPORTED', message: '演示服务仅提供 WAV 音频' })
      }
      await api.allowLocal(operation)
      await api.client.authorize('source.http', new URL(api.baseURL).origin, operation)
      return {
        ok: true,
        url: new URL('tracks/' + encodeURIComponent(id) + '/stream', api.baseURL).href
      }
    },
    async lyrics(resource, operation) {
      const id = readTrackId(resource, ctx.plugin.id)
      await api.allowLocal(operation)
      const result = await api.client.get<LyricsResponse>(
        'tracks/' + encodeURIComponent(id) + '/lyrics',
        { operation }
      )
      return toLyrics(resource, result)
    }
  } satisfies TrackProvider

  ctx.providers.register('tutorial-source', { tracks })
  return tracks
}
```

readTrackId 确认引用属于本插件的 tutorial-source。播放只接受 lossless，对应模拟服务生成的未压缩 WAV；三首歌共用同一段演示音，并没有不同音质的多个文件。

resolve 在返回本机地址前检查两项网络权限。它只构造 URL，不下载音频，因此 **ok: true 只代表解析成功**。即使此时模拟服务停止了，URL 也能生成，播放器访问它时才会失败。

歌词通过 HTTP 获取，404、网络失败、拒绝授权或取消会作为调用错误返回。不要把这些错误一律改成“歌曲不存在”，否则很难定位问题。

## 把歌曲标记为可播放

将 **src/api.ts 全部替换**为以下内容。本次变化是 playable 改为 true，并声明这首歌支持播放解析和歌词。

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
    playable: true,
    durationMs: raw.durationMs,
    metadata: {
      artists: [raw.artist],
      album: { title: raw.album },
      durationMs: raw.durationMs,
      qualities: ['lossless']
    },
    capabilities: ['music.resolve@1', 'music.lyrics@1']
  }
}
```

将 **ceru.plugin.json 全部替换**为以下内容，为 Provider 增加 music.lyrics@1 声明：

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
          "protocols": ["music.search@1", "music.resolve@1", "music.lyrics@1"],
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

## 给检查命令增加歌词结果

工作台搜索结果提供“调用解析”，没有单独的歌词按钮。将 **src/index.ts 全部替换**为以下内容，让 source.test 在分页检查后继续取得第一首歌的歌词：

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
    const lyrics = await tracks.lyrics(first.items[0].ref, operation)
    return JSON.parse(JSON.stringify({ first, second, lyrics }))
  })
})
```

## 验证音频和歌词

执行 npm run typecheck，等待工作台重新加载。搜索 Rain，点击结果旁的“调用解析”；再执行 source.test，查看它返回的 lyrics：

- 解析结果应为 ok: true，URL 以 /v1/tracks/rain/stream 结尾。
- 歌词结果应为 format: "crlyric"、version: 1，track.id 为 morning（检查命令取第一页的第一首）。
- 两行歌词分别从 0 和 1000 毫秒开始，第二行为“这是本机模拟服务返回的歌词”。

再打开解析得到的 [Rain 音频地址](http://127.0.0.1:43120/v1/tracks/rain/stream)，点击浏览器播放器的播放按钮，应听到约 2.2 秒的提示音。音频很短，播放前可先调低音量。

**完成检查：** 能获取歌词，并且 URL 确实返回可播放的音频。下一节构建成品并在澜音中验证。
