---
pageClass: plugin-v2-doc
title: 实现音源 Provider
description: 声明网络权限，实现搜索、播放解析和 CrLyric 歌词。
prev:
  text: HTTP 音源项目
  link: /guide/plugins/v2/tutorial-source/
next:
  text: 验证与替换真实服务
  link: /guide/plugins/v2/tutorial-source/release
---

# 实现音源 Provider

这一节只追踪一首歌的旅程：**远端 JSON → 搜索结果 → ResourceRef → 播放地址与歌词**。

## 1. 声明能力与权限

打开 `ceru.plugin.json`。Provider 声明告诉澜音它会搜索、解析和提供歌词；权限声明告诉用户为什么要访问网络。

```json
{
  "contributes": {
    "providers": [
      {
        "id": "tutorial-source",
        "name": "本地 HTTP 音源",
        "protocols": ["music.search@1", "music.resolve@1", "music.lyrics@1"],
        "qualities": ["128k", "320k", "lossless"],
        "connectionMode": "none"
      }
    ]
  },
  "permissions": [
    { "key": "source.http", "name": "network.request", "reason": "访问你配置的音乐服务" },
    {
      "key": "source.private",
      "name": "network.private",
      "optional": true,
      "reason": "在教程中访问本机模拟音乐服务"
    }
  ]
}
```

`network.request` 允许发 HTTP(S) 请求。目标是 `localhost`、`127.0.0.1` 或局域网地址时，还需要 `network.private`。可选权限仍要由用户明确授予。

::: warning 权限 key 要前后一致
Manifest 声明的是 `source.http`，代码中的 `permissionKey` 也必须是 `source.http`。权限名称 `network.request` 描述权限种类，key 则是本插件自己的授权项。
:::

## 2. 创建 HTTP 客户端

在 `src/index.ts` 的激活函数中读取静态配置，再创建客户端：

```ts
const config = await ctx.config.get<{ apiOrigin: string }>()
const origin = new URL(config.apiOrigin)
const baseURL = new URL('v1/', origin.href.endsWith('/') ? origin.href : `${origin.href}/`).href
const client = ctx.http.create({
  baseURL,
  permissionKey: 'source.http',
  requestPermission: true
})
```

`requestPermission: true` 只会在权限处于 `prompt` 时弹出请求；它不能绕过用户拒绝。访问本机服务前，完成版还会查询并请求 `source.private`。

## 3. 把搜索结果变成标准歌曲

上游返回的歌曲可能叫 `songName`、`artists` 或其他名字。先在 `src/api.ts` 定义本教程的响应，再集中转换：

```ts
export function toTrack(pluginId: string, raw: ApiTrack): ContentEntity {
  return {
    ref: {
      pluginId,
      providerId: 'tutorial-source',
      kind: 'track',
      id: raw.id
    },
    title: raw.title,
    subtitle: raw.artist,
    playable: true,
    metadata: {
      artists: [raw.artist],
      album: raw.album ? { title: raw.album } : undefined,
      durationMs: raw.durationMs,
      qualities: raw.qualities
    },
    capabilities: ['music.resolve@1', 'music.lyrics@1']
  }
}
```

`ResourceRef` 是后续操作的身份证。澜音保存它，用户点击播放时再原样交回插件。不要把临时播放 URL 塞进 ref；它可能过期，也可能带凭据。

注册搜索方法：

```ts
ctx.providers.register('tutorial-source', {
  tracks: {
    async search(request, operation) {
      const limit = Math.max(1, Math.min(request.limit, 50))
      const offset = readOffset(request.cursor)
      const result = await client.get<SearchResponse>('tracks', {
        operation,
        query: { q: request.query.trim(), limit, offset }
      })
      return {
        items: result.items.map((track) => toTrack(ctx.plugin.id, track)),
        nextCursor: result.nextOffset == null ? undefined : String(result.nextOffset)
      }
    }
  }
})
```

把 `operation` 原样传给 HTTP 客户端。用户取消搜索、页面切换或超过截止时间时，宿主才能中止请求。

## 4. 在播放时解析 URL

`resolve` 收到之前的 ref。先确认它确实属于当前插件和 Provider，再生成播放地址：

```ts
async resolve(resource, quality, operation) {
  try {
    await allowPrivateNetwork(operation)
    const id = readTrackId(resource, ctx.plugin.id)
    const selected = ['128k', '320k', 'lossless'].includes(quality ?? '')
      ? quality
      : '320k'
    return {
      ok: true,
      url: new URL(
        `tracks/${encodeURIComponent(id)}/stream?quality=${selected}`,
        baseURL,
      ).href,
    }
  } catch (error) {
    return ctx.playback.failure({
      code: 'NOT_FOUND',
      message: error instanceof Error ? error.message : '无法解析播放地址',
    })
  }
}
```

这里的 mock URL 不会过期。真实服务若返回短期签名链接，应同时填写 `expiresAt`，单位是 Unix 毫秒时间。若媒体 CDN 要求 `Referer`、`Origin`、`User-Agent` 或认证头，在成功结果中返回 `requestHeaders`；Host 会按完整 URL 注入，不会把这些值交给插件页面。

## 5. 转换歌词

澜音 v2 使用 `CrLyric`。所有时间单位都是毫秒；无时间歌词使用 `plainText`，不要伪造时间轴。

```ts
async lyrics(resource, operation) {
  const id = readTrackId(resource, ctx.plugin.id)
  const result = await client.get<LyricsResponse>(
    `tracks/${encodeURIComponent(id)}/lyrics`,
    { operation },
  )
  return toLyrics(resource, result)
}
```

完成版的 `toLyrics` 会过滤坏行、按 `startTimeMs` 排序并保留 `offsetMs`。完整代码可直接查看 [api.ts](/plugins/v2/tutorial/http-source/src/api.ts) 与 [index.ts](/plugins/v2/tutorial/http-source/src/index.ts)。

**完成标志：** 工作台搜索 `Rain` 后能解析播放地址，并返回两行按时间排序的歌词。

下一节：[构建、验证并换成自己的服务 →](./release)
