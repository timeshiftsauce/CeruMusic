---
pageClass: plugin-v2-doc
title: 导航、播放与导入
description: 把原生卡片动作接到澜音的歌单详情、队列、播放器、导入窗口和 Provider resolve。
prev:
  text: 原生歌单区块
  link: /guide/plugins/v2/tutorial-account-native/native-library
next:
  text: 替换真实接口并发布
  link: /guide/plugins/v2/tutorial-account-native/release
---

# 导航、播放与导入

Native View 只描述“按钮调用哪个动作”。动作真正执行时，再使用宿主服务。

| 用户操作     | 插件动作                             | 宿主 API                                                      | 可见结果                     |
| ------------ | ------------------------------------ | ------------------------------------------------------------- | ---------------------------- |
| 定位个人歌单 | <code>library.openSection</code>     | <code>ctx.ui.navigation.open</code>                           | 打开“歌单”页并滚动到插件区块 |
| 点击歌单     | <code>playlist.open</code>           | <code>ctx.ui.navigation.open</code>                           | 进入澜音原生歌单详情         |
| 点击播放     | <code>tracks.play</code>             | <code>ctx.queue.replace</code> + <code>ctx.player.play</code> | 更新队列并开始播放           |
| 点击导入     | <code>playlist.import</code>         | <code>ctx.ui.playlistImport.open</code>                       | 打开澜音已有导入窗口         |
| 播放器取地址 | Provider <code>tracks.resolve</code> | 返回 <code>ResolveResult</code>                               | 宿主加载实际音频             |

## 1. 打开“歌单”页并定位自己的区块

<code>playlistSections</code> 会自动出现在现有“歌单”页。若账号动作、命令或其他入口需要主动带用户过去，传声明过的 <code>sectionId</code>：

```ts
ctx.actions.register('library.openSection', async () => {
  await ctx.ui.navigation.open({
    page: 'playlist',
    sectionId: 'tutorial-library'
  })
  return null
})
```

该调用返回 <code>Promise&lt;void&gt;</code>，无需权限。Host 打开现有“歌单”页，并按调用插件的 ID 与 <code>sectionId</code> 找到区块后滚动定位。<code>sectionId</code> 只能与 <code>page: 'playlist'</code> 一起使用，并且必须出现在本插件的 <code>contributes.playlistSections</code> 中。

这个 API 是可选的定位能力。区块的正常显示不依赖它，也不需要 <code>openView('library')</code>。

## 2. 打开原生歌单详情

```ts
ctx.actions.register('playlist.open', async (input) => {
  const ref = ownedRef(input.ref, 'playlist')
  await ctx.ui.navigation.open({
    page: 'playlist',
    ref
  })
  return null
})
```

<code>navigation.open()</code> 输入：

| 字段              | 类型                     | 说明                                |
| ----------------- | ------------------------ | ----------------------------------- |
| <code>page</code> | <code>"playlist"</code>  | 打开已有歌单详情页面                |
| <code>ref</code>  | <code>ResourceRef</code> | 原样保留插件、Provider、连接与 data |

返回 <code>Promise&lt;void&gt;</code>，不需要权限。打开后，宿主使用同一个 ref 调用当前 Provider 的 <code>playlists.get</code>。

先验证 ref 属于自己：

```ts
function ownedRef(value: unknown, kind: 'track' | 'playlist') {
  assertResourceRef(value)
  if (
    value.pluginId !== ctx.plugin.id ||
    value.providerId !== PROVIDER_ID ||
    value.connectionId !== CONNECTION_ID ||
    value.kind !== kind
  ) {
    throw new Error('资源不属于当前插件与账号连接')
  }
  return value
}
```

这一步能阻止别的插件伪造 ID，让当前账号去读取或播放错误资源。

## 3. 替换队列并播放

先在 Manifest 声明：

```json
{
  "key": "playback",
  "name": "player.control",
  "reason": "点击原生歌曲时替换播放队列并开始播放"
}
```

动作获得 <code>OperationContext</code> 后，用同一次用户意图请求权限，再构造 <code>ServiceCall</code>：

```ts
ctx.actions.register('tracks.play', async (input, operation) => {
  const refs = readOwnedTrackRefs(input)
  const items = refs.map(findTrack).map(trackEntity)

  let grant = await ctx.permissions.query({ key: 'playback' })
  if (grant.status !== 'granted') {
    grant = await ctx.permissions.request({
      key: 'playback',
      intent: operation.userIntent
    })
  }
  if (grant.status !== 'granted') {
    throw new Error('请允许插件控制播放')
  }

  const call = { permissionKey: 'playback', operation }
  await ctx.queue.replace(items, call)
  await ctx.player.play(refs[0], call)
  return null
})
```

| API                              | 输入                                      | 返回                    | 权限           |
| -------------------------------- | ----------------------------------------- | ----------------------- | -------------- |
| <code>permissions.query</code>   | <code>{ key }</code>                      | 当前授权状态            | 无             |
| <code>permissions.request</code> | key 与可选 userIntent                     | 新授权状态              | 触发宿主授权   |
| <code>queue.replace</code>       | <code>ContentEntity[]</code>、ServiceCall | <code>QueueState</code> | player.control |
| <code>player.play</code>         | 首曲 ref、ServiceCall                     | <code>void</code>       | player.control |

只把 ref 塞进队列不够。<code>queue.replace</code> 需要完整 <code>ContentEntity[]</code>，这样队列能立即显示标题、歌手和时长；<code>player.play</code> 再指定从哪一首开始。

## 4. 实现 resolve

播放器需要音频时调用：

```ts
tracks: {
  async resolve(ref, quality, operation) {
    operation.signal.throwIfAborted()
    requireAccount()
    const track = findOwnedTrack(ref)

    return {
      ok: true,
      url: 'http://127.0.0.1:43130/audio/' +
        encodeURIComponent(track.id) + '.wav',
      expiresAt: Date.now() + 60_000,
    }
  },
}
```

| 参数                   | 说明                                           |
| ---------------------- | ---------------------------------------------- |
| <code>ref</code>       | 播放动作留下的完整资源引用                     |
| <code>quality</code>   | 用户选择的音质；顺序来自 Manifest 的 qualities |
| <code>operation</code> | 取消信号与截止时间                             |

成功返回 <code>{ ok: true, url, expiresAt?, requestHeaders? }</code>。需要 Cookie 或 Referer 才能读取临时媒体时，使用 <code>requestHeaders</code>；不要把这些头写入 ResourceRef。失败返回：

```ts
return ctx.playback.failure({
  code: 'ENTITLEMENT_EXPIRED',
  message: '当前账号无权播放该音质',
  retryable: false
})
```

完成版的 <code>npm run mock</code> 在本机生成四秒 WAV，只用于验证调用链。真实平台应返回当前账号有权访问的短期 URL，并准确处理 401、403、404、429、地域限制和会员过期。

## 5. 打开澜音的导入窗口

Native View 给歌单卡片声明：

```ts
itemActions: [{ label: '导入歌单', action: 'playlist.import' }]
```

宿主会把当前卡片的 <code>ref</code> 合入动作输入。后台打开已有导入窗口：

```ts
ctx.actions.register('playlist.import', async (input) => {
  const ref = ownedRef(input.ref, 'playlist')
  await ctx.ui.playlistImport.open({
    importerId: 'tutorial-playlist',
    initialValue: ref.id,
    title: '导入演示歌单'
  })
  return null
})
```

<code>playlistImport.open</code> 返回 <code>Promise&lt;void&gt;</code>。它只打开窗口；真正取歌由已注册的 importer 完成：

```ts
ctx.playlistImporters.register('tutorial-playlist', {
  async getTracks(request, operation) {
    operation.signal.throwIfAborted()
    const playlist = findPlaylist(request.value)
    const offset = Number(request.cursor ?? 0)
    const items = playlist.trackIds
      .slice(offset, offset + request.limit)
      .map(findTrack)
      .map(trackEntity)

    return {
      name: playlist.title,
      items,
      totalEstimate: playlist.trackIds.length,
      ...(offset + items.length < playlist.trackIds.length
        ? { nextCursor: String(offset + items.length) }
        : {})
    }
  }
})
```

宿主负责选择目标歌单、去重、持久化和云同步。插件负责把输入链接或 ID 转换成分页的标准歌曲。

## 6. 工作台和桌面分别验证什么？

| 环境       | 能验证                                                        | 仍需在澜音实机检查                                       |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------- |
| CLI 工作台 | 注册、Native View、动作输入、Provider 返回、Surface、权限模拟 | “歌单”页区块定位、真实路由、实际播放器、账号胶囊悬停菜单 |
| 澜音桌面   | 现有“歌单”页区块、原生详情、真实队列、播放、导入、账号菜单    | 上游平台本身的稳定性                                     |

::: tip 完成标志
Native View 点击歌单能进入详情；详情自动分页；播放先更新队列再开始；导入按钮打开指定 importer；resolve 返回短期 URL 或结构化错误。
:::
