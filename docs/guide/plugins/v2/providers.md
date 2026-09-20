---
pageClass: plugin-v2-doc
---

# Provider 与标准音乐数据

Provider 是宿主调用音乐能力的入口。先在 Manifest 声明，再在激活函数里用相同 ID 注册。

## 先理解它解决什么问题

用户输入歌名后，澜音需要知道向哪个插件请求结果。Provider 就是插件提供这组功能的入口。第一次接触时，先完成[理解搜索](./first-search)：从一个本地数组返回歌曲，再看本页的完整数据格式。

## 声明 Provider

```json
{
  "providers": [
    {
      "id": "catalog",
      "name": "我的曲库",
      "protocols": ["music.search@1", "music.resolve@1"],
      "qualities": ["128k", "320k", "flac"],
      "connectionMode": "none",
      "icon": { "kind": "host", "name": "music-note" }
    }
  ]
}
```

把此片段合并到 `manifest.contributes`。`connectionMode` 为 `none / single / multiple`，用于表达连接方式；不要将声明理解为宿主已经替你完成登录。

## 方法分组与签名

`operation` 均为宿主提供的 OperationContext，方法返回 Promise。

| 方法                   | 业务参数                                    | 返回                  |
| ---------------------- | ------------------------------------------- | --------------------- |
| `tracks.search`        | `request, operation`                        | `Page<ContentEntity>` |
| `tracks.resolve`       | `resource, quality \| undefined, operation` | ResolveResult         |
| `tracks.lyrics`        | `resource, operation`                       | CrLyric               |
| `playlists.search`     | `request, operation`                        | `Page<ContentEntity>` |
| `playlists.categories` | `operation`                                 | `Page<ContentEntity>` |
| `playlists.list`       | `resource, cursor \| undefined, operation`  | `Page<ContentEntity>` |
| `playlists.get`        | `resource, cursor \| undefined, operation`  | PlaylistTrackPage     |
| `charts.list`          | `operation`                                 | `Page<ContentEntity>` |
| `charts.getTracks`     | `resource, cursor \| undefined, operation`  | `Page<ContentEntity>` |
| `sharing.describe`     | `resource, policy, operation`               | JsonObject            |

旧的顶层 `search/resolve/lyrics/categories/list/share` 标为兼容早期 v2 预览契约；新插件使用分组方法。桌面内部的 artwork/suggest/hotSearch 扩展不属于 SDK 0.3.5 标准接口，本文不要求插件实现。

## ResourceRef：资源身份

```ts
const ref = {
  pluginId: 'example.library',
  providerId: 'catalog',
  kind: 'track',
  id: 'morning'
}
```

| 字段            | 说明                                                        |
| --------------- | ----------------------------------------------------------- |
| `pluginId`      | 当前插件 Manifest ID，代码里用 ctx.plugin.id                |
| `providerId`    | 清单及注册时的 Provider ID                                  |
| `kind`          | track、playlist、chart 等资源类型                           |
| `id`            | 上游稳定标识，始终转换为字符串                              |
| `connectionId?` | 多连接场景的连接标识                                        |
| `data?`         | 插件私有 JSON 对象，随资源保存并回传；最多 **64 KiB UTF-8** |

四个必需标识不能为空，每个最多 2048 个 UTF-16 代码单元。`data` 不是凭据保险箱，不要保存 Cookie、token 或不可公开的发行信息。

## ContentEntity：宿主认识的数据

```ts
import type { ContentEntity } from '@shiqianjiang/ceru-plugin-sdk'

const track: ContentEntity = {
  ref: {
    pluginId: 'example.library',
    providerId: 'catalog',
    kind: 'track',
    id: 'morning'
  },
  title: 'Morning Light',
  subtitle: 'Ceru Demo',
  playable: false,
  durationMs: 180000,
  capabilities: [],
  metadata: {
    artists: ['Ceru Demo'],
    album: { title: 'Demo Album' },
    durationMs: 180000,
    qualities: ['320k']
  }
}
```

`ref / title / capabilities` 必需；track 类型必须有 `metadata.artists` 数组。`metadata` 支持 album、qualities、artworkUrl、durationMs。`artwork` 是 AssetHandle，与 `metadata.artworkUrl` 字符串不同。

歌单信息放在 `playlist: { trackCount?, description?, author?, artworkUrl? }`；排行榜信息放在 `chart: { updateFrequency?, artworkUrl? }`。不要直接返回平台原始 JSON。

## 搜索与分页

`SearchRequest` 包含 `query: string, kinds: string[], filters: JsonObject, limit: number` 和可选 `cursor`。可按上游支持范围缩小 limit。

`Page<T>` 为 `{ items: T[], nextCursor?, snapshotId?, totalEstimate? }`。没有下一页时省略 nextCursor，不返回空字符串。游标应由请求和上游真实进度生成，避免无限重复同一页。

下面是完整的无网络搜索逻辑，可替换 source 模板入口：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  const tracks = [
    { id: 'morning', title: 'Morning Light', artist: 'Ceru Demo' },
    { id: 'rain', title: 'Rainy Afternoon', artist: 'Ceru Demo' }
  ]
  ctx.providers.register('catalog', {
    tracks: {
      async search(request, operation) {
        operation.signal.throwIfAborted()
        const query = request.query.trim().toLowerCase()
        const matches = tracks.filter((item) =>
          (item.title + ' ' + item.artist).toLowerCase().includes(query)
        )
        const offset = Math.max(0, Number(request.cursor) || 0)
        const limit = Math.max(1, Math.min(request.limit, 100))
        const items = matches.slice(offset, offset + limit).map((item) => ({
          ref: {
            pluginId: ctx.plugin.id,
            providerId: 'catalog',
            kind: 'track',
            id: item.id
          },
          title: item.title,
          subtitle: item.artist,
          playable: false,
          capabilities: [],
          metadata: { artists: [item.artist] }
        }))
        return {
          items,
          totalEstimate: matches.length,
          ...(offset + items.length < matches.length
            ? { nextCursor: String(offset + items.length) }
            : {})
        }
      },
      async resolve() {
        return ctx.playback.failure({
          code: 'UNSUPPORTED',
          message: '本地演示尚未接入播放服务'
        })
      }
    }
  })
})
```

单页最多 **10,000 项**，nextCursor 最多 2048 个代码单元，title 最多 4096，capabilities 每项最多 128。这些是校验上限，正常界面应使用合理小页。

## 解析播放地址

```ts
type ResolveResult =
  | {
      ok: true
      url: string
      expiresAt?: number
      requestHeaders?: Record<string, string>
    }
  | { ok: false; error: MusicFault }
```

成功返回可播放 HTTP(S) 直链；`expiresAt` 为毫秒时间戳，不是剩余秒数。URL 最多 8192 个代码单元。平台要求防盗链或认证头时，通过 `requestHeaders` 返回。Host 只对这条完整 URL 注入这些值，并将它们保留在主进程；页面状态、日志与分享数据都不会收到请求头。

只有真实获取到有效地址才返回 ok:true。失败返回结构化错误，避免返回空 URL、占位 MP3 或 throw 一个含令牌的上游响应。

## 失败与恢复

`ctx.playback.failure(error)` 和 SDK `failure(error)` 构造 `{ ok: false, error }`，不启动播放。

| code                                | 典型情况                    |
| ----------------------------------- | --------------------------- |
| RATE_LIMITED                        | 请求限流，可给 retryAfterMs |
| AUTH_REQUIRED / ENTITLEMENT_EXPIRED | 需要登录 / 权益失效         |
| NOT_FOUND / REGION_UNAVAILABLE      | 内容不存在 / 地区不可用     |
| NETWORK_ERROR / PERMISSION_DENIED   | 网络失败 / 用户未授权       |
| UNSUPPORTED                         | Provider 不支持该功能或音质 |
| CANCELLED / INTERNAL                | 操作取消 / 内部错误         |

MusicFault 还支持 `retryable` 和 `recovery`。recovery.mode 为 default、retry-later、await-user、stop-current，可带 maxWaitMs 与 actions（retry、choose-source、cancel 或 plugin-command）。

这些字段表达恢复意图；播放器是否支持对应交互取决于桌面版本。别依赖错误字段实现无限等待，完整契约见[类型参考](./reference)。
