---
pageClass: plugin-v3-doc
title: 管理本地歌单和歌曲
---

# 管理本地歌单和歌曲

> 适用读者：需要创建、读取、添加、移除或删除宿主本地歌单的作者。前置条件：已完成 [PluginContext API 入门](./api)。预计 12 分钟。

v3 把歌单能力分成查询类 API 和操作类 API。查询类方法位于 ctx.library.playlists，创建、删除和修改歌曲属于宿主操作，通过 ctx.app.call 进入统一的操作 Hook 和权限流程。

## 先声明三组权限

在 ceru.plugin.json 的 manifest.uses.permissions 中写清用途。key 是插件自己定义的标识，name 是宿主识别的权限名。

~~~json
{
  "uses": {
    "permissions": [
      { "key": "playlist-read", "name": "library.read", "reason": "读取用户选择的本地歌单和歌曲" },
      { "key": "playlist-write", "name": "library.write", "reason": "创建歌单或添加用户选择的歌曲" },
      { "key": "playlist-delete", "name": "library.delete", "reason": "移除歌曲、清空或删除用户选择的歌单" }
    ]
  }
}
~~~

调用前检查 ctx.permissions.query。来自按钮时，使用按钮动作的 operation.userIntent 请求授权。后台自动创建或删除歌单不应绕过用户意图。

## 查询歌单和歌曲

~~~ts
const page = await ctx.library.playlists.list({
  location: 'local',
  permissionKey: 'playlist-read',
  operation,
})

const target = page.items.find(item => item.writable)
if (!target) throw new Error('没有可修改的本地歌单')

const tracks = await ctx.library.playlists.getTracks({
  target: target.ref,
  permissionKey: 'playlist-read',
  operation,
})
~~~

list 和 getTracks 都可能返回分页结果。继续请求时把 nextCursor 原样传回。writable 为 false 时不要写入。

## 创建本地歌单

~~~ts
await ctx.app.call(
  'playlist.create',
  { name: '通勤清单', location: 'local' },
  { permissionKey: 'playlist-write', operation },
)
~~~

这个调用返回 null，不会直接返回新歌单 ID。创建成功后重新调用 ctx.library.playlists.list，让用户确认刚创建的歌单，再取得 target.ref。不要根据名称拼接 ID，也不要访问本地数据库。

location 为 cloud 时创建云端歌单，需要用户已登录。local 和 cloud 不能混用权限或目标引用。

## 添加歌曲到指定歌单

~~~ts
await ctx.app.call(
  'playlist.addTracks',
  {
    playlist: {
      id: target.ref.id,
      name: target.name,
      location: target.ref.location,
    },
    tracks: [track],
  },
  { permissionKey: 'playlist-write', operation },
)
~~~

target 必须包含当前 id、name 和 location。宿主会校验目标是否仍然是用户刚选择的歌单。目标被改名、删除或位置变化时，调用会失败，应重新读取列表。

## 移除歌曲和清空歌单

~~~ts
await ctx.app.call(
  'playlist.removeTracks',
  {
    playlist: {
      id: target.ref.id,
      name: target.name,
      location: target.ref.location,
    },
    tracks: [track],
  },
  { permissionKey: 'playlist-delete', operation },
)

await ctx.library.playlists.clearPlaylist({
  target: target.ref,
  permissionKey: 'playlist-delete',
  operation,
})
~~~

removeTracks 只接受 kind 为 track 的资源引用，需要 library.delete。clearPlaylist 清空歌曲但保留歌单。

## 删除歌单

~~~ts
await ctx.app.call(
  'playlist.delete',
  {
    playlist: {
      id: target.ref.id,
      name: target.name,
      location: target.ref.location,
    },
  },
  { permissionKey: 'playlist-delete', operation },
)
~~~

删除是不可逆的用户数据操作。界面先展示当前歌单名称和歌曲数量，再让用户明确确认。成功后清除本地缓存并从列表中移除目标。

## 导入歌曲的另一条路径

插件已有一批歌曲、但不需要强制写入某个歌单时，使用 ctx.library.playlists.import：

~~~ts
const result = await ctx.library.playlists.import({
  suggestedName: '导入清单',
  items: tracks,
  requestId: crypto.randomUUID(),
  permissionKey: 'playlist-write',
  operation,
})

if (result.cancelled) {
  ctx.log.info('用户取消了歌单导入')
} else {
  ctx.log.info('歌单导入完成', {
    playlistId: result.target?.id ?? null,
    added: result.added,
    skipped: result.skipped,
  })
}
~~~

宿主负责让用户选择或创建目标、去重和保存。重试同一批次时复用 requestId。需要指定已有歌单时，改用 playlist.addTracks。

## 当前不公开的能力

当前 v3 SDK 没有供插件调用的歌单元数据修改 API。插件不能通过公开 API 修改本地歌单的名称、描述或封面。ctx.library.playlists 也没有 create、edit、delete 或 addTracks 方法名，这些能力分别对应上文的宿主操作或专用方法。

宿主内部可能有自己的歌单管理实现，但插件只能使用 SDK 中公开的接口，不能访问本地数据库或 Renderer 内部 API。

## 验证顺序

1. 只申请 library.read，确认能列出本地歌单和读取歌曲。
2. 由用户点击创建按钮，申请 library.write，创建后重新列出歌单。
3. 选择一首已知歌曲，测试添加后再次读取确认数量增加。
4. 测试移除和清空，确认歌曲减少但歌单仍存在。
5. 在单独的测试歌单上确认删除，重新读取列表确认目标消失。
6. 撤销 library.write 和 library.delete，确认插件显示错误且不继续修改数据。

相关内容：[完整 API 目录](./api-reference) · [操作权限与执行时限](./operations) · [权限申请与撤销](./permissions) · [歌曲引用](./media)
