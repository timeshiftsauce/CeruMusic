---
pageClass: plugin-v2-doc
title: 4. 原生歌单区块
description: 声明 playlists Provider，并把 Native View 挂到澜音现有“歌单”页。
prev:
  text: Vue 登录与账号
  link: /guide/plugins/v2/tutorial-account-native/login
next:
  text: 导航、播放与导入
  link: /guide/plugins/v2/tutorial-account-native/playback
---

# 4. 原生歌单区块

本节在已登录账号上增加两张歌单。它们进入澜音现有的“歌单”页：插件返回数据和动作名称，澜音负责渲染网格与详情页。

本节会新增 `data.ts`、`provider.ts`、`native.ts`，并替换 `account.ts`、`index.ts` 和 Manifest。播放与导入留到下一节。

```text
playlistSections
  └─ library (native Surface)
       └─ render.library (返回 NativeView)
            └─ playlist.open
                 └─ navigation.open({ ref })
                      └─ Provider playlists.get(ref, cursor)
```

## 1. 准备演示数据

新建 `src/data.ts`。文件包含四首歌曲、两张歌单、固定 Provider/连接 ID，以及分页游标校验。

<<< ../../../../public/plugins/v2/tutorial/account-native/src/data.ts

`PAGE_SIZE = 2` 是为了让四首歌在开发时一定经过两页。真实接口的游标可能不是数字，应该把上游返回值原样放进 `nextCursor`。

## 2. 让账号模块提供当前会话

完整替换 `src/account.ts`：

<<< ../../../../public/plugins/v2/tutorial/account-native/src/account.ts

与上一节相比，动作行为没有改变。新增的 `AccountController` 让歌单模块只能读取当前会话、公开摘要和登录检查；它拿不到页面组件。

## 3. 建立歌单 Provider

新建 `src/provider.ts`。本节只注册 `music.playlists@1` 所需的列表与详情方法。

<details>
<summary>src/provider.ts 本节完整内容</summary>

```ts [src/provider.ts]
import {
  assertResourceRef,
  type ContentEntity,
  type PluginContext,
  type ResourceRef
} from '@shiqianjiang/ceru-plugin-sdk'
import type { AccountController } from './account'
import {
  CONNECTION_ID,
  cursorOffset,
  fault,
  PAGE_SIZE,
  playlists,
  PROVIDER_ID,
  tracks,
  type PlaylistRecord,
  type TrackRecord
} from './data'

export type Catalog = {
  resource(kind: 'track' | 'playlist', id: string): ResourceRef
  trackEntity(track: TrackRecord): ContentEntity
  playlistEntity(playlist: PlaylistRecord): ContentEntity
  ownedRef(value: unknown, kind: 'track' | 'playlist'): ResourceRef
}

export function createCatalog(ctx: PluginContext, account: AccountController): Catalog {
  const resource = (kind: 'track' | 'playlist', id: string): ResourceRef => ({
    pluginId: ctx.plugin.id,
    providerId: PROVIDER_ID,
    connectionId: CONNECTION_ID,
    kind,
    id,
    data: { catalog: 'tutorial-v1' }
  })

  const trackEntity = (track: TrackRecord): ContentEntity => ({
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
  })

  const playlistEntity = (playlist: PlaylistRecord): ContentEntity => ({
    ref: resource('playlist', playlist.id),
    title: playlist.title,
    subtitle: playlist.description,
    capabilities: ['open'],
    playlist: {
      description: playlist.description,
      author: account.getSession()?.displayName ?? '演示账号',
      trackCount: playlist.trackIds.length
    }
  })

  const ownedRef = (value: unknown, kind: 'track' | 'playlist') => {
    assertResourceRef(value)
    if (
      value.pluginId !== ctx.plugin.id ||
      value.providerId !== PROVIDER_ID ||
      value.connectionId !== CONNECTION_ID ||
      value.kind !== kind
    ) throw fault('资源不属于当前插件与账号连接', 'NOT_FOUND')
    return value
  }

  return { resource, trackEntity, playlistEntity, ownedRef }
}

export function registerPlaylistProvider(
  ctx: PluginContext,
  account: AccountController,
  catalog: Catalog
) {
  ctx.effects.add(ctx.providers.register(PROVIDER_ID, {
    playlists: {
      async list(_resource, cursor, operation) {
        operation.signal.throwIfAborted()
        account.requireAccount()
        const offset = cursorOffset(cursor)
        const items = playlists.slice(offset, offset + PAGE_SIZE).map(catalog.playlistEntity)
        return {
          items,
          totalEstimate: playlists.length,
          ...(offset + items.length < playlists.length
            ? { nextCursor: String(offset + items.length) }
            : {})
        }
      },
      async get(ref, cursor, operation) {
        operation.signal.throwIfAborted()
        account.requireAccount()
        const id = catalog.ownedRef(ref, 'playlist').id
        const playlist = playlists.find((item) => item.id === id)
        if (!playlist) throw fault('歌单不存在', 'NOT_FOUND')

        const offset = cursorOffset(cursor)
        const items = playlist.trackIds
          .slice(offset, offset + PAGE_SIZE)
          .map((trackId) => tracks.find((item) => item.id === trackId))
          .filter((item): item is TrackRecord => !!item)
          .map(catalog.trackEntity)

        return {
          name: playlist.title,
          playlist: catalog.playlistEntity(playlist).playlist,
          items,
          totalEstimate: playlist.trackIds.length,
          ...(offset + items.length < playlist.trackIds.length
            ? { nextCursor: String(offset + items.length) }
            : {})
        }
      }
    }
  }))
}
```

</details>

每个 `ResourceRef` 都保留 `pluginId/providerId/connectionId/kind/id`。`ownedRef()` 在查数据前验证归属，避免把别的插件或别的账号连接的 ID 当成本插件资源。Cookie、播放 URL 和平台原始响应不能放进 `ResourceRef.data`。

## 4. 返回 Native View

新建 `src/native.ts`：

```ts [src/native.ts]
import { defineNativeView, type PluginContext } from '@shiqianjiang/ceru-plugin-sdk'
import type { AccountController } from './account'
import { playlists } from './data'
import type { Catalog } from './provider'

export function registerLibrary(
  ctx: PluginContext,
  account: AccountController,
  catalog: Catalog
) {
  ctx.effects.add(ctx.actions.register('render.library', defineNativeView(async () => {
    const session = account.getSession()
    if (!session) {
      return {
        type: 'page',
        title: '演示音乐',
        description: '连接演示账号后查看原生歌单。',
        actions: [{ label: '连接账号', action: 'account.open', primary: true }],
        sections: []
      }
    }

    return {
      type: 'page',
      title: '我的演示音乐',
      description: session.displayName,
      actions: [{ label: '刷新', action: 'library.refresh' }],
      sections: [{
        id: 'playlists',
        title: '我的歌单',
        layout: 'grid',
        items: playlists.map(catalog.playlistEntity),
        onOpen: 'playlist.open'
      }]
    }
  })))

  ctx.effects.add(ctx.actions.register('library.refresh', async () => {
    await ctx.ui.setState('library', {
      account: account.publicAccount(),
      changedAt: Date.now()
    })
    return null
  }))

  ctx.effects.add(ctx.actions.register('playlist.open', async (input) => {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : undefined
    const ref = catalog.ownedRef(value?.ref, 'playlist')
    await ctx.ui.navigation.open({ page: 'playlist', ref })
    return null
  }))
}
```

Native Surface 没有自己的 DOM。`render.library` 返回普通 JSON，宿主点击 `onOpen` 对应的歌单时，把 `{ ref }` 传给 `playlist.open`；导航打开详情页后，再用同一个 ref 调用 `playlists.get()`。

完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { createAccount } from './account'
import { registerLibrary } from './native'
import { createCatalog, registerPlaylistProvider } from './provider'

export default definePlugin(async (ctx) => {
  const account = await createAccount(ctx)
  const catalog = createCatalog(ctx, account)
  registerPlaylistProvider(ctx, account, catalog)
  registerLibrary(ctx, account, catalog)
})
```

## 5. 声明 Provider 和区块

在 Manifest 中做三处修改。

给 `modules.logic.activation` 加上 Provider 激活条件，并在 `surfaces` 末尾加入 native Surface：

```json
"activation": ["onCommand:account.open", "onProvider:tutorial-account"]
```

```json
{
  "id": "library",
  "kind": "native",
  "entry": "render.library",
  "title": "我的演示音乐"
}
```

在 `contributes` 中加入 Provider、三个命令和歌单区块：

```json
"providers": [
  {
    "id": "tutorial-account",
    "name": "演示账号音乐",
    "protocols": ["music.playlists@1"],
    "qualities": ["128k", "320k"],
    "icon": { "kind": "host", "name": "music-note" },
    "connectionMode": "single"
  }
],
"playlistSections": [
  {
    "id": "tutorial-library",
    "title": "演示账号歌单",
    "view": "library",
    "order": 20
  }
]
```

把下列命令追加到原有 `commands` 数组：

```json
{ "id": "render.library", "title": "渲染原生音乐页", "action": "render.library" },
{ "id": "library.refresh", "title": "刷新原生音乐页", "action": "library.refresh" },
{ "id": "playlist.open", "title": "打开原生歌单详情", "action": "playlist.open" }
```

这里的两条引用必须一致：

```text
playlistSections[].view = "library" → surfaces[].id = "library"
surfaces[].entry = "render.library" → commands[].action → actions.register()
```

## 6. 运行本节

```shell
npm run typecheck
npm run build
npm run dev
```

先按上一节登录，再打开工作台的 `library · native`。应看到两张歌单；点击一张歌单会发起原生导航；详情请求第一页返回两首歌和 `nextCursor: "2"`，第二页不再返回游标。

安装到澜音 2.0 后，区块位于软件已有的“歌单”页。插件不需要新增侧边栏按钮，也不要对 native Surface 调用 `openView('library')`。

常见错误：

- 区块不显示：检查 `playlistSections[].view` 是否指向 `kind: "native"` 的 Surface；
- 点击歌单提示动作不存在：`onOpen`、Manifest 命令和后台注册必须同名；
- 详情第二页重复第一页：必须使用传入的 `cursor`，不要固定从 0 开始；
- `DataCloneError`：返回值只能包含普通 JSON，不要放函数、类实例或 Vue 响应式对象；
- 未登录仍能读歌单：在 Provider 的入口调用 `account.requireAccount()`。

下一节：[加入播放、搜索与歌单导入 →](./playback)
