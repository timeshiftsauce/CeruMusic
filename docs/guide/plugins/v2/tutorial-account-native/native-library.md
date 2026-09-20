---
pageClass: plugin-v2-doc
title: 原生歌单区块
description: 用 playlistSections 把 Native View 挂进澜音现有“歌单”页，并为详情提供分页数据。
prev:
  text: Vue 登录与账号状态
  link: /guide/plugins/v2/tutorial-account-native/login
next:
  text: 导航、播放与导入
  link: /guide/plugins/v2/tutorial-account-native/playback
---

# 原生歌单区块

<code>contributes.playlistSections</code> 把插件内容放进澜音现有侧边栏“歌单”页，与本地歌单、云歌单并列。它不会打开抽屉，也不会增加“我的歌单”侧边栏按钮。

区块引用一个 native Surface。native Surface 不提供 DOM，也不运行插件框架；后台动作返回 <code>NativeView</code>，澜音用自己的 Vue 组件渲染标题、按钮、歌单网格与歌曲列表。

```text
插件 render 动作          澜音原生组件
{                        ┌──────────────────────┐
  type: "page",    ───→  │ 我的音乐  [播放全部] │
  actions: [...],        │ □ 歌单  □ 歌单       │
  sections: [...]        │ ≡ 歌曲  ▶            │
}                        └──────────────────────┘
```

推荐和歌单因此不是 iframe 或 WebView。只有上一节的自定义登录页需要 Web Surface 和 Vue。

## 1. 让现有“歌单”页挂载 Native View

Manifest 中的连接关系如下：

```json
{
  "modules": {
    "surfaces": [{ "id": "library", "kind": "native", "entry": "render.library" }]
  },
  "contributes": {
    "playlistSections": [
      { "id": "tutorial-library", "title": "演示账号歌单", "view": "library", "order": 20 }
    ]
  }
}
```

调用链是 <code>playlistSections[].view → surfaces[].id → surfaces[].entry → commands[].action → actions.register()</code>。Host 进入“歌单”页时自动挂载该 Surface。<code>view</code> 必须指向 native Surface；若 ID 不匹配，区块不会显示。

## 2. 返回最小 NativeView

把 native Surface 的 <code>entry</code> 同名动作注册为：

```ts
import { defineNativeView } from '@shiqianjiang/ceru-plugin-sdk'

ctx.effects.add(
  ctx.actions.register(
    'render.library',
    defineNativeView(async () => ({
      type: 'page',
      title: '我的演示音乐',
      description: '内容由插件提供，界面由澜音渲染',
      actions: [],
      sections: []
    }))
  )
)
```

<code>defineNativeView</code> 会验证结果只含可克隆 JSON，并检查页、分区、动作和 <code>ContentEntity</code>。函数输入是当前 Surface 的 JSON 输入与 <code>OperationContext</code>，返回 <code>NativeView</code>。

| NativeView 字段          | 类型                             | 作用               |
| ------------------------ | -------------------------------- | ------------------ |
| <code>type</code>        | 固定 <code>"page"</code>         | 选择原生页面协议   |
| <code>title</code>       | 可选字符串                       | 页面标题           |
| <code>description</code> | 可选字符串                       | 标题下说明         |
| <code>actions</code>     | <code>NativeViewAction[]</code>  | 页面级按钮         |
| <code>sections</code>    | <code>NativeViewSection[]</code> | 一个或多个内容分区 |

## 3. 未登录时给出可行动的空区块

```ts
if (!session) {
  return {
    type: 'page',
    title: '演示音乐',
    description: '连接演示账号后查看原生歌单与歌曲。',
    actions: [{ label: '连接账号', action: 'account.open', primary: true }],
    sections: []
  }
}
```

宿主点击按钮后调用 <code>account.open</code>，后台执行 <code>ctx.ui.openView('account')</code> 打开登录 modal。这里打开的是账号 Web Surface；个人歌单 native Surface 始终由“歌单”页挂载，不调用 <code>openView('library')</code>。

## 4. 用 grid 和 list 组合区块

```ts
return {
  type: 'page',
  title: '我的演示音乐',
  actions: [
    {
      label: '播放推荐',
      action: 'tracks.play',
      input: { refs: recommendedRefs },
      primary: true
    },
    { label: '刷新', action: 'library.refresh' }
  ],
  sections: [
    {
      id: 'playlists',
      title: '我的歌单',
      layout: 'grid',
      items: playlistItems,
      onOpen: 'playlist.open',
      itemActions: [{ label: '导入歌单', action: 'playlist.import' }]
    },
    {
      id: 'tracks',
      title: '今日推荐',
      layout: 'list',
      items: trackItems,
      onPlay: 'tracks.play'
    }
  ]
}
```

| 字段                      | 宿主何时调用       | 动作输入                                |
| ------------------------- | ------------------ | --------------------------------------- |
| 页面 <code>actions</code> | 点击顶部按钮       | 固定 <code>input</code>                 |
| <code>onOpen</code>       | 点击歌单或内容卡片 | <code>{ ref }</code>                    |
| <code>onPlay</code>       | 点击单曲播放       | <code>{ ref, refs }</code>              |
| <code>itemActions</code>  | 点击卡片更多操作   | 固定 input 与当前 <code>ref</code> 合并 |

这些 action 都要出现在 <code>contributes.commands</code>，并由后台注册。

## 5. ContentEntity 是宿主看得懂的音乐数据

歌曲至少需要：

```ts
const item: ContentEntity = {
  ref: resource('track', track.id),
  title: track.title,
  subtitle: track.artist,
  playable: true,
  durationMs: track.durationMs,
  capabilities: ['play'],
  metadata: {
    artists: [track.artist],
    album: { title: track.album },
    durationMs: track.durationMs,
    qualities: ['128k', '320k']
  }
}
```

歌单使用 <code>playlist</code>：

```ts
const item: ContentEntity = {
  ref: resource('playlist', playlist.id),
  title: playlist.title,
  capabilities: ['open', 'import'],
  playlist: {
    description: playlist.description,
    author: session.displayName,
    trackCount: playlist.trackIds.length
  }
}
```

时长统一使用毫秒。<code>capabilities</code> 是字符串数组；它不自动注册动作，动作仍由 Native View 显式连接。

## 6. ResourceRef 必须保持完整

```ts
const resource = (kind: 'track' | 'playlist', id: string): ResourceRef => ({
  pluginId: ctx.plugin.id,
  providerId: 'tutorial-account',
  connectionId: 'demo-user',
  kind,
  id,
  data: { catalog: 'tutorial-v1' }
})
```

| 字段                                | 用途                                  |
| ----------------------------------- | ------------------------------------- |
| <code>pluginId</code>               | 找回提供这个资源的插件                |
| <code>providerId</code>             | 找回音源实现                          |
| <code>connectionId</code>           | 区分同一插件中的账号或连接            |
| <code>kind</code> / <code>id</code> | 说明资源类型与平台 ID                 |
| <code>data</code>                   | 可选、插件自有、可持久化的非敏感 JSON |

不要只把 <code>id</code> 传给导航或播放。也不要把 Cookie、临时播放 URL、整个上游响应放进 <code>data</code>。

::: info JSON 类型边界
<code>ResourceRef</code> 在运行时是合法 JSON，但 TypeScript 接口没有 JSON 索引签名。把 <code>ResourceRef[]</code> 放进 <code>NativeViewAction.input</code> 时，需要在这一处转换为 <code>JsonValue</code>。不要用 <code>any</code> 扩散到整个 Provider。
:::

```ts
input: {
  refs: recommendedRefs,
} as unknown as JsonValue
```

## 7. 给原生歌单详情实现 playlists.get

点击歌单进入原生详情后，宿主会调用 Provider 的 <code>playlists.get(ref, cursor, operation)</code>：

```ts
ctx.effects.add(
  ctx.providers.register('tutorial-account', {
    playlists: {
      async get(ref, cursor, operation) {
        operation.signal.throwIfAborted()
        requireAccount()
        const playlist = findOwnedPlaylist(ref)
        const offset = cursor === undefined ? 0 : Number(cursor)
        const items = playlist.trackIds
          .slice(offset, offset + 2)
          .map(findTrack)
          .map(trackEntity)

        return {
          name: playlist.title,
          playlist: playlistEntity(playlist).playlist,
          items,
          totalEstimate: playlist.trackIds.length,
          ...(offset + items.length < playlist.trackIds.length
            ? { nextCursor: String(offset + items.length) }
            : {})
        }
      }
    }
  })
)
```

| 参数                   | 含义                         | 本例                                 |
| ---------------------- | ---------------------------- | ------------------------------------ |
| <code>ref</code>       | 用户打开的完整歌单引用       | 验证 plugin/provider/connection/kind |
| <code>cursor</code>    | 上一页返回的不透明游标       | 用字符串保存下一条 offset            |
| <code>operation</code> | 取消信号、截止时间、用户意图 | 请求前后检查 <code>signal</code>     |

返回 <code>items</code> 和可选 <code>nextCursor</code>。没有下一页时省略 <code>nextCursor</code>，不要返回空字符串。真实平台游标无需转成页码，原样保存和传回即可。

## 8. 刷新原生区块

Native View 本身没有组件 state。刷新动作更新公开 Surface state，已挂载区块随后再次执行 render：

```ts
ctx.actions.register('library.refresh', async () => {
  await ctx.ui.setState('library', {
    account: publicAccount(),
    changedAt: Date.now()
  })
  return null
})
```

render 应只读取缓存或状态并返回页面。不要在每次 render 中无条件调用 <code>setState</code>，否则会形成刷新循环。

::: tip 完成标志
未登录时“歌单”页中的插件区块只有“连接账号”；登录后显示歌单网格和歌曲列表；打开歌单时 Provider 分两页返回歌曲；刷新按钮不会产生循环 render。
:::
