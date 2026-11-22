---
pageClass: plugin-v3-doc
title: 调用桌面服务并处理不可用的能力
---

# 调用桌面服务并处理不可用的能力

> 面向需要调用播放器、文件或桌面功能的作者。先完成[脚手架入门](./quick-start)。预计 10 分钟；练习使用 SDK 3.0.0。

## 用一个按钮显示宿主版本

创建 `web-surface` 模板，在 `src/index.ts` 替换已有的 `hello` 注册，保留其他注册。模板清单已声明同名动作。

```ts
ctx.actions.register('hello', async () => {
  const available = await ctx.capabilities.get('app')
  if (!available.available || (available.methods && !available.methods.includes('getInfo'))) {
    return '当前桌面无法提供应用信息'
  }
  const info = await ctx.app.getInfo()
  return '澜音 ' + info.version
})
```

将 `src/view.ts` 完整替换为下段，在工程根目录运行 `npm run dev` 后添加预览。从侧栏进入模板页面，点「查看版本」，应在按钮旁看到当前桌面的版本。可将检查中的 `getInfo` 临时换成没有提供的方法名，验证不可用时的用户提示；验证后改回。

```ts
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'

export default defineSurface(ctx => {
  const button = document.createElement('button')
  const result = document.createElement('output')
  button.textContent = '查看版本'
  button.onclick = async () => {
    button.disabled = true
    try {
      result.textContent = String(await ctx.invoke('hello', null))
    } catch (error) {
      result.textContent = String(error)
    } finally {
      button.disabled = false
    }
  }
  ctx.root.replaceChildren(button, result)
  return () => { button.onclick = null; ctx.root.replaceChildren() }
})
```

## 创建、删除歌单并增删曲目

直接调用宿主的歌单操作时，用 `ctx.app.call`，并在清单声明用户授权。下面的调用放在已注册的 Logic 动作处理器中，沿用它收到的 `operation`。三个歌单字段应来自用户当前选择的宿主歌单；`track` 是你从音乐查询得到的单曲对象，且必须属于本次授权范围。创建动作与修改已选歌单的动作可以分开注册。

```ts
const available = await ctx.app.operations.list()
const call = { permissionKey: 'library', operation }
await ctx.app.call('playlist.create', { name: '通勤清单', location: 'local' }, call) // 返回 null，不包含新歌单 ID
await ctx.app.call('playlist.addTracks', {
  playlist: { id: playlistId, name: playlistName, location: 'local' },
  tracks: [track],
}, call)
await ctx.app.call('playlist.removeTracks', {
  playlist: { id: playlistId, name: playlistName, location: 'local' },
  tracks: [track],
}, { permissionKey: 'remove', operation })
await ctx.app.call('playlist.delete', {
  playlist: { id: playlistId, name: playlistName, location: 'local' },
}, { permissionKey: 'remove', operation })
```

在 `manifest.uses.permissions` 分别声明 `library.write` 与 `library.delete`，例如：

```json
[
  { "key": "library", "name": "library.write", "reason": "创建歌单并添加所选歌曲" },
  { "key": "remove", "name": "library.delete", "reason": "按用户选择移除歌曲或删除歌单" }
]
```

`playlist.create` 的输入是名称与 `local` / `cloud` 位置，返回 `null`，不会返回新歌单 ID。实际桌面实现为空描述创建本地歌单；云端创建要求用户已登录。要把新建歌单用于下一步，先通过 `ctx.library.playlists.list({ location: 'local', permissionKey: 'read', operation })` 重新读取并找到它的宿主 ID，另行声明 `library.read` 并传入它对应的权限键。

添加和移除操作都需要宿主歌单的 `id`、当前 `name`、`location` 与曲目列表。歌曲带有标准资源引用。移除需要 `library.delete`，传入的歌曲只允许 `kind: 'track'`。上述同一权限键可用于一次用户明确发起的移除和删除动作，应用应为它们说明真实用途。歌单若已更名或不再存在，宿主会拒绝过期目标，需要重新读取后让用户选择。

若只需把已有歌曲交给宿主，请用更适合导入流程的 `ctx.library.playlists.import({ suggestedName, items, requestId, permissionKey, operation })`。宿主会让用户选择或创建目标，并负责去重。清空但保留歌单可用 `ctx.library.playlists.clearPlaylist({ target, permissionKey, operation })`。这些 `library.playlists` 接口没有修改歌单名称或描述的 API；当前直接操作的创建能力也没有提供可由插件立即取得新 ID 的返回值。

## 换成有副作用的操作

| 用户想做什么 | 首先查找的方法 | 实现与验收要点 |
| --- | --- | --- |
| 播放、暂停或拖动 | `player.getState`、`player.play`、`player.seek` | 播放位置使用毫秒。对同一测试歌曲分别验证授权和撤权。[跳到第十秒](./api) |
| 修改队列 | `queue.get`、`append`、`replace`、`reorder` | 重排沿用读取时的 revision，过期时重新读取队列；整队替换之前让用户看清选择 |
| 读取或修改收藏和曲库 | `favorites.contains`、`library.playlists.getTracks` 等 | 空列表、分页和删除都单测。用测试歌单核对目标与顺序，再验证撤销授权 |
| 让用户选择文件 | `files.pick`、`files.pickDirectory`、`files.readText` | 通过宿主返回的句柄继续操作，选择后和取消时各测试一次 |
| 创建下载任务 | `downloads.create`、`pause`、`cancel` | 使用授权曲目与测试目录，区分任务已入队、已完成及实际文件可读 |
| 管理快捷键、后台任务 | `hotkeys.register`、`tasks.schedule`、`tasks.cancel` | 避免重复注册；测试停用、重新启用后一次按键或一次任务只执行一遍 |
| 使用剪贴板、分享或房间 | `clipboard.writeText`、`sharing.create`、`rooms.join` | 操作和用户点击绑定；失败时恢复按钮，避免在后台循环重试 |
| 读取设置、设备或其他可选能力 | `settings.get`、`devices.list`、`ai.generate` | 先查当前宿主可用性，再查方法权限。设备为空与服务不可用应有分别可辨认的提示 |

查参数类型、必填位置和返回值时，用[方法索引](./methods)搜索上表的方法名。遇到授权错误时记录方法、权限键和状态即可；私密内容应一直保留在该次交互的业务链路内。
