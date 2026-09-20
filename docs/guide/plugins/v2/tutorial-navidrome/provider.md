---
pageClass: plugin-v2-doc
title: Navidrome Provider
description: 将 search3、stream 和 getLyricsBySongId 转成澜音标准音乐能力。
prev:
  text: Vue 连接页面
  link: /guide/plugins/v2/tutorial-navidrome/surface
next:
  text: 验证与实机安装
  link: /guide/plugins/v2/tutorial-navidrome/release
---

# Navidrome Provider

连接成功后，Provider 使用当前账号访问 OpenSubsonic API。本节完成搜索、播放和歌词三条链路。

## 搜索：search3

```ts
const response = await api(
  current,
  'search3',
  {
    query: request.query.trim(),
    artistCount: 0,
    albumCount: 0,
    songCount: size + 1,
    songOffset: page * size
  },
  operation
)
```

多取一条是为了判断是否还有下一页。返回给澜音时只保留 `size` 条，多出的那一条不重复返回：

```ts
return {
  items: songs.slice(0, size).map((song) => toTrack(current, song)),
  nextCursor: songs.length > size ? String(page + 1) : undefined
}
```

Navidrome 的 duration 是秒；标准数据的 `durationMs` 是毫秒：

```ts
durationMs: Math.max(0, Number(song.duration) || 0) * 1000
```

## 资源引用绑定账号

不同服务器可能有相同歌曲 ID。ref 同时编码连接指纹：

```ts
{
  pluginId: ctx.plugin.id,
  providerId: 'navidrome',
  connectionId: current.id,
  kind: 'track',
  id: `nd:${current.id}:${encodeURIComponent(song.id)}`,
}
```

解析时再次检查插件、Provider 和连接指纹。用户切换账号后，旧歌曲会提示重新选择，而不会误播新服务器上同 ID 的内容。

## 播放：stream

原始音质使用 `format=raw`；转码音质使用 `format=mp3` 和 `maxBitRate`：

```ts
const transcode =
  selected === 'original'
    ? { format: 'raw' }
    : { format: 'mp3', maxBitRate: Number.parseInt(selected, 10) }

return { ok: true, url: signedUrl(current, 'stream', { id, ...transcode }) }
```

播放 URL 含 Subsonic 认证参数。公网服务器必须使用 HTTPS，不要记录完整 URL，也不要把它存入 ref 或同步到云端。

认证失败时返回 `AUTH_REQUIRED`，并提供“去连接”恢复动作；404、限流、网络错误应映射成各自的 `MusicFault`。教程完成版保留了较短的错误分支，生产插件可参考社区 Navidrome 插件的完整映射。

## 歌词：getLyricsBySongId

OpenSubsonic 的同步歌词行已使用毫秒时间，可直接转换：

```ts
const document: CrLyric = {
  format: 'crlyric',
  version: 1,
  track: resource,
  offsetMs: Number(chosen?.offset) || 0,
  lines: chosen?.synced
    ? lines
        .map((line) => ({ startTimeMs: Number(line.start), text: String(line.value) }))
        .sort((a, b) => a.startTimeMs - b.startTimeMs)
    : []
}
```

若返回无时间歌词，将各行拼到 `plainText`。不要把第 1 行强行设成 0 ms、第 2 行设成 5 秒；错误时间轴比纯文本更难用。

## 这一版为什么没有歌单？

教程先建立账号、页面与播放主链路。真正的社区插件还实现了服务器歌单、专辑分类、收藏、分页、歌单导入和 LRC 导出；学完后可阅读 [CeruMusic-Plugin-Template 中的 Navidrome 实现](https://github.com/CeruMusic/CeruMusic-Plugin-Template/tree/main/plugins/ceru.navidrome)。

**完成标志：** 登录后搜索 `Rain`，能得到标准歌曲、解析 stream URL，并返回两行 CrLyric。

下一节：[连接真实服务器并安装 →](./release)
