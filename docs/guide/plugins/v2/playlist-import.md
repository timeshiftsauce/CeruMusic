---
pageClass: plugin-v2-doc
---

# 歌单导入与软件歌单

::: tip 桌面扩展
:::

导入有两个层次：**注册取数来源**让用户通过软件界面导入；或在已授权的业务动作里**调用软件歌单 API**。二者都使用标准歌曲，不另建插件专用歌单数据库。

## 注册导入来源

在 `manifest.contributes` 添加：

```json
{
  "playlistImporters": [
    {
      "id": "demo-import",
      "title": "演示歌单",
      "description": "导入本地演示元数据",
      "placeholder": "输入 demo",
      "examples": [{ "label": "演示", "value": "demo" }],
      "instructions": ["此示例不联网，也不提供播放地址"]
    }
  ],
  "commands": [{ "id": "open-import", "title": "导入演示歌单", "action": "open-import" }]
}
```

对应完整逻辑：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.playlistImporters.register('demo-import', {
    async getTracks(request, operation) {
      operation.signal.throwIfAborted()
      if (request.value.trim() !== 'demo') throw new Error('请输入 demo')
      return {
        name: '演示歌单',
        items: request.cursor
          ? []
          : [
              {
                ref: {
                  pluginId: ctx.plugin.id,
                  providerId: 'catalog',
                  kind: 'track',
                  id: 'morning'
                },
                title: 'Morning Light',
                capabilities: [],
                playable: false,
                metadata: { artists: ['Ceru Demo'] }
              }
            ]
      }
    }
  })
  ctx.actions.register('open-import', async () => {
    await ctx.ui.playlistImport.open({ importerId: 'demo-import', initialValue: 'demo' })
  })
})
```

`getTracks({ value, cursor?, limit }, operation): Promise<PlaylistTrackPage>` 返回 `items, nextCursor?, name?, playlist?`。只负责取一页，宿主控制分页、目标选择和导入流程。需要播放时还须注册歌曲 ref 所属 Provider。

## 打开导入界面

`ctx.ui.playlistImport.open({ importerId?, initialValue?, title? }): Promise<void>`：

- importerId 必须来自本插件已声明的导入器；省略时由用户选择。
- initialValue 最长 8192 个 UTF-16 代码单元。
- title 最长 100 个代码单元。
- 复用澜音已有导入窗口，不创建插件 Surface。
- 此接口只打开界面，不返回“保存成功”；用户可能取消。

工作台可预览取数结果，但没有正式软件的歌单数据库。

## 读取软件歌单

```ts
const lists = await ctx.library.playlists.list({
  location: 'local',
  permissionKey: 'read-library',
  operation
})
const tracks = await ctx.library.playlists.getTracks({
  target: lists.items[0].ref,
  permissionKey: 'read-library',
  operation
})
```

调用前应检查 `items.length`；示例仅展示签名。清单需要 `{ key: 'read-library', name: 'library.read', reason: '选择导入目标' }`。

| 方法                  | 输入                                                                  | 返回                    |
| --------------------- | --------------------------------------------------------------------- | ----------------------- |
| `playlists.list`      | `location?, cursor?, permissionKey, operation`                        | `Page<LibraryPlaylist>` |
| `playlists.getTracks` | `target, cursor?, permissionKey, operation`                           | `Page<ContentEntity>`   |
| `playlists.import`    | `items, requestId, permissionKey, operation, target?, suggestedName?` | PlaylistImportResult    |

目标 `PlaylistReference` 为 `{ id: string, location: 'local' | 'cloud' }`。LibraryPlaylist 包含 ref、name、writable，以及可选 description、trackCount。

桌面 list 默认使用本地歌单，当前本地列表/读取不分页；云歌曲按 100 条读取，nextCursor 是偏移字符串。云操作需要澜音登录。不要仅因声明了 cursor 就假定每个方法都已实现分页。

## 写入与取消

```ts
const result = await ctx.library.playlists.import({
  items: page.items,
  suggestedName: '我的歌单',
  requestId: 'import-batch-001',
  permissionKey: 'write-library',
  operation
})
if (!result.cancelled) {
  ctx.log.info('导入完成', { added: result.added, skipped: result.skipped })
}
```

以上代码用于已有 `page` 和 `operation` 的业务回调。清单需要 library.write 权限。省略 target 时由宿主选择目标；用户取消返回 `{ cancelled: true, added: 0, skipped: 0 }`。

requestId 为非空字符串，最长 256 个代码单元。同一批重试使用同一 ID，不同批次使用新 ID。桌面在插件运行期间缓存最近最多 **200 项**导入结果，键包含 requestId 与目标；它不是永久的跨重启事务凭证。

结果 `{ cancelled, target?, added, skipped }` 表达实际处理数量；授权拒绝、账号未登录、网络失败或非法歌曲会拒绝 Promise。工作台直接调用 library.playlists.\* 会明确报未接入，不能用它验证真实持久化成功。
