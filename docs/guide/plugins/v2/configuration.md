---
pageClass: plugin-v2-doc
---

# 配置、状态与数据迁移

## 三种数据放在哪里

| 数据                       | API                                 | 生命周期                           |
| -------------------------- | ----------------------------------- | ---------------------------------- |
| 作者默认值、个性化发行配置 | `ctx.config.get<T>()`               | 构建/发行配置；接口只读            |
| 用户偏好、连接参数、缓存   | `ctx.storage.get/set/delete`        | 桌面持久化，停用保留，卸载清理     |
| 当前表单或页面显示数据     | `ctx.ui.setState(surfaceId, state)` | 运行期间的 UI 状态，不是持久化存储 |

## 默认配置与类型

在 `ceru.plugin.json` 顶层写：

```json
{
  "config": {
    "displayName": "我的曲库",
    "apiOrigin": "https://music.example.com",
    "pageSize": 20
  }
}
```

构建后它进入 `exports.manifest.config`。读取：

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import type { PluginConfig } from '@ceru/plugin-config'

export default definePlugin(async (ctx) => {
  const config = await ctx.config.get<PluginConfig>()
  ctx.log.info('配置已读取', { displayName: config.displayName })
})
```

`get<T = JsonObject>(): Promise<Readonly<T>>` 没有参数。泛型用于编译期提示，不会在运行时验证你手写的 T；外部数据仍应自行校验。

`dev/build` 生成的 `@ceru/plugin-config` 声明不包含配置值。若模块尚不存在，先 build。JS 可使用 `import('@ceru/plugin-config').PluginConfig` 的 JSDoc 类型。

## 配置覆盖顺序

1. Manifest 内的默认配置。
2. 有效个性化发行数据中的 `personalization.config`，由 Issuer 规则约束并递归合并。
3. 桌面保存的该插件配置，由桌面 `config.get` 在最外层覆盖。

第 3 层当前使用浅合并：同名对象会替换第 2 层整个对象。不要把三层都理解成递归合并。没有对应配置时返回可用配置对象，而非承诺每个业务字段都存在。

`ctx.config` 没有公开 set 方法。需要保存用户偏好时使用 storage，再由业务决定如何与默认值组合。

## 升级自己的数据

```ts
import type { PluginContext } from '@shiqianjiang/ceru-plugin-sdk'

export async function readPreferences(ctx: PluginContext) {
  const saved = await ctx.storage.get('preferences')
  if (!saved || typeof saved !== 'object' || Array.isArray(saved)) {
    const initial = { schema: 1, quality: '320k' }
    await ctx.storage.set('preferences', initial)
    return initial
  }
  return saved
}
```

对旧字段先验证，再写入新版本；迁移失败保留原数据。`manifest.dataSchemas` 是版本声明，不会代替此迁移代码。升级时保持 manifest.id 稳定。

## 凭据边界

配置与发行文件可以被持有人读取，storage 也是本地 JSON 隔离，不是加密保险库。SDK 有 `credentials.get` 类型，但当前桌面未接入对应凭据服务，不能据此承诺主密钥自动变成安全引用。

私人连接信息保持私有，不放进共享键、日志、公开示例或截图。需要分发授权时优先采用一次性激活流程，详见[发行](./issuance)。
