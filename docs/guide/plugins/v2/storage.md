---
pageClass: plugin-v2-doc
---

# Storage：隔离存储与共享读取

**适用：澜音 1.14.1 桌面与工具链 0.3.5。** 工作台将本插件数据持久化到工程的 `.ceru-dev/storage`，同样限制为 10 MiB，支持读取自己的字符串键与结构化键。跨插件读取与共享授权需要正式安装 Host，下文的共享规则指澜音桌面。

## 先保存一个偏好

比如用户选择了无损音质，你希望下次启动仍记得这个选择。在插件动作里写：

```ts
await ctx.storage.set('quality', 'flac')
const quality = await ctx.storage.get('quality')
// quality 是刚才保存的 "flac"
```

`quality` 是键，`flac` 是值。换成相同的键就会覆盖旧值。还不熟悉读写过程时，先完成[保存数据这一课](./first-storage)，再回来看下面的参数与限制。

## 容量与生命周期

下面的完整记录格式、共享权限计量和卸载规则指澜音桌面。0.3.3 工作台也按 UTF-8 JSON 字节限制为 10 MiB，但使用自己的开发存储结构，不保存桌面的共享授权；两个环境的结构开销不必相同。

每个插件安装实例可使用 **10 MiB = 10,485,760 字节**。额度按完整存储记录的 `JSON.stringify` 结果转为 **UTF-8** 后计算，包含：

- 所有键名及 JSON 值；
- 共享读取权限记录；
- 记录版本与 JSON 结构开销。

这不是单个键的上限，也不是 1,000 万字符。中文和 emoji 的 UTF-8 大小与 JavaScript 字符串 length 不同。写入后总量超过额度时抛出 `插件存储超过 10 MiB`，原数据保持不变。

| 操作                   | 数据结果                       |
| ---------------------- | ------------------------------ |
| 重启软件、停用再启用   | 保留                           |
| 同一插件正常更新       | 保留；作者负责自己的数据迁移   |
| 卸载插件               | 清除                           |
| 删除一个键             | 同时删除该键的共享权限         |
| 首次写入旧格式私有数据 | 写入新格式成功后迁移旧记录     |
| 读取公开键             | 不复制到读取者，不占读取者额度 |

## 基础 API

```ts
get<T extends JsonValue = JsonValue>(key: ReadKey): Promise<T | null>
set(key: WriteKey, value: JsonValue): Promise<void>
delete(key: ReadKey): Promise<void>
```

`ReadKey` 可以是字符串或 `{ key, pluginId? }`；`WriteKey` 还支持 `readableBy`。`set/delete` 没有业务返回值；底层 RPC 可能返回 null，不应依赖此实现细节。

```ts
await ctx.storage.set('preferences', { quality: '320k', autoConnect: false })
const preferences = await ctx.storage.get('preferences')
await ctx.storage.delete('preferences')
```

读取自己的不存在键返回 **`null`**，删除不存在键可重复调用。键不支持遍历、事务、CAS 或跨插件写入；需要索引时自行维护一个 JSON 对象。

## 参数规则

| 参数         | 规则                                                                                      |
| ------------ | ----------------------------------------------------------------------------------------- |
| `key`        | 非空字符串，最长 **256 个 UTF-16 代码单元**；禁止 `__proto__`、`constructor`、`prototype` |
| `pluginId`   | Manifest 中的稳定 ID；允许字母、数字、点、下划线和短横线，最长 128，开头须为字母或数字    |
| `value`      | JSON：null、布尔、有限数值、字符串、数组、普通对象；空值用 null，不用 undefined           |
| `readableBy` | `'*'` 或最多 **128 项**插件 ID 数组；数组会去重，限制在去重前检查                         |

JSON 通道不能保存函数、BigInt、循环引用、类实例语义、Date 对象语义、Map/Set 或原生二进制对象。即使某些值能被 JSON.stringify 转换，也应先显式转换为所需的普通 JSON，避免静默丢失字段。

`pluginId` 不是名称、磁盘路径或宿主安装实例 ID。跨插件读取由已安装清单解析身份，目标未安装、身份不唯一或没有开放权限时失败。

## 共享读取

<PluginDiagram src="/plugins/v2/storage-sharing.svg" alt="插件 A 持有数据，按私有、指定插件和公开策略允许插件 B 读取" />

新键默认私有。只有数据所属插件可以修改数据与读取策略。

```ts
// 以下 storage 使用下一节提供的桌面扩展类型。
await storage.set(
  { key: 'summary', readableBy: ['example.dashboard'] },
  { tracks: 120, updatedAt: Date.now() }
)

await storage.set({ key: 'publicInfo', readableBy: '*' }, { version: 1 })

// example.dashboard 中：目标为数据所属插件的 Manifest ID。
const summary = await storage.get({
  pluginId: 'example.library',
  key: 'summary'
})
```

| 写法                                | 权限效果                       |
| ----------------------------------- | ------------------------------ |
| 新键省略 readableBy                 | 私有                           |
| 已有键省略 readableBy               | 保留现有策略，不会自动恢复私有 |
| `readableBy: ['example.dashboard']` | 只允许列出的插件读取           |
| `readableBy: '*'`                   | 允许所有已安装插件读取         |
| `readableBy: []`                    | 撤回共享，恢复私有             |

撤回示例：

```ts
const value = await storage.get('summary')
await storage.set({ key: 'summary', readableBy: [] }, value)
```

后续读取立即按新策略检查，但已经交给其他插件的旧副本无法收回。目标停用后仍可读取其开放数据；读取不会启动目标插件。跨插件仅支持 get，set/delete 即使带对方 pluginId 也会被拒绝。

## TypeScript 扩展类型

**SDK 0.3.3 起已内置下面这些签名**，当前可直接使用 0.3.5 的 `ctx.storage` 或从 SDK 导入 `PluginStorageAPI`。安装方式见 [0.3.5 工具链更新](./sdk-upgrade)。

::: details 继续使用 SDK 0.2.4 的兼容声明

SDK **0.2.4** 只声明字符串键，并将 get 的空值写为 undefined；桌面实现是 null。将下面代码保存为工程的 `src/desktop-storage.ts`，不需要引用澜音内部源码路径：

```ts
import type { JsonValue, PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

export type ReadKey = string | { key: string; pluginId?: string }
export type WriteKey = string | { key: string; pluginId?: string; readableBy?: '*' | string[] }

export interface DesktopStorage {
  get<T extends JsonValue = JsonValue>(key: ReadKey): Promise<T | null>
  set(key: WriteKey, value: JsonValue): Promise<void>
  delete(key: ReadKey): Promise<void>
}

export function desktopStorage(ctx: PluginContext): DesktopStorage {
  return ctx.storage as unknown as DesktopStorage
}
```

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { desktopStorage } from './desktop-storage'

export default definePlugin(async (ctx) => {
  const storage = desktopStorage(ctx)
  const visits = await storage.get<number>('visits')
  await storage.set('visits', (visits ?? 0) + 1)
})
```

这个类型适配只描述已存在的桌面协议，不会给工作台补充该能力。需要同时运行的代码可使用 `value == null` / `??` 处理开发环境的空值差异。

:::

## 写入失败怎么处理

```ts
try {
  await ctx.storage.set('cache', { items: [] })
} catch (error) {
  ctx.log.warn('缓存写入失败', {
    message: error instanceof Error ? error.message : String(error)
  })
}
```

| 错误                    | 排查方式                                               |
| ----------------------- | ------------------------------------------------------ |
| 无效的存储键            | 检查空串、长度和保留名称                               |
| 存储值必须是 JSON       | 将 undefined 改为 null，去掉不可序列化数据             |
| 插件存储超过 10 MiB     | 缩减缓存、分页保存必要字段；不要继续重试相同大对象     |
| 目标插件未安装 / 未授权 | 检查 Manifest ID 和所属插件的 readableBy               |
| 不能修改其他插件的数据  | 将修改请求交给对方业务，storage 不提供此能力           |
| 插件存储文件损坏        | 检查本地数据与日志；不要在文档示例里无条件覆盖用户数据 |

容量不足时可以删除已知旧缓存键。不要把 storage 用作音乐文件仓库；密码、令牌保持私有，也不要宣称本地 JSON 存储经过加密。
