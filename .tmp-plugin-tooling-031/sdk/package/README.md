# Ceru Plugin SDK

## 0.2.5 类型同步

0.2.5 补齐桌面 v2 已使用的 Guest、分享解析、Storage、插件更新和导入界面契约。
Guest / 分享 / 存储类型可从包根入口导入，也可分别从 `/guests`、`/share`、`/storage` 导入：

```ts
import type {
  GuestInfo,
  GuestBootstrapAPI,
  ShareResolverEntry,
  PluginStorageAPI,
} from '@shiqianjiang/ceru-plugin-sdk'
import type { GuestInfo as Guest } from '@shiqianjiang/ceru-plugin-sdk/guests'
import type { ShareResolverEntry as Resolver } from '@shiqianjiang/ceru-plugin-sdk/share'
```

`PluginContext.storage` 支持桌面结构化键、`readableBy` 与 `null` 空值；
`guests` 补齐 `import/select/remove` 和完整信息；`GuestContext` 包含 bootstrap 契约；
`ui.pluginUpdate.request` 和导入窗口的可选 `importerId/title` 也已声明。

这些类型描述宿主契约，不会让旧 Host 或 CLI 工作台自动获得对应能力。
Manifest 的分享入口和 Guest 展示字段还需要匹配的构建器与校验器。
`prepareInstall/requestInstall` 保留旧声明，桌面优先使用 `guests.import`。

`npm pack` 会先编译 SDK、复制必要的 ambient 声明，并检查每个 exports 目标存在。
仓库的 `npm run test:sdk-package` 将真实 tarball 安装到空项目中，验证根入口、子路径和类型约束。

面向 Ceru Music v2 的 TypeScript 类型与小型作者辅助函数。

包含 PluginContext、分组 Provider、歌曲/歌词/歌单标准数据、宿主服务、权限组、Surface、资源引用、结构化错误、UI Slot、图标名和类型化 Lodash。运行能力由 Host 提供，SDK 本身不授予权限。

```ts
import { definePlugin, hostIcon } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin((ctx) => {
  ctx.actions.register('hello', async () => {
    const values = ctx.utils.lodash.uniq(['a', 'a', 'b'])
    ctx.log.info('Ready', { count: values.length })
  })
})

const icon = hostIcon('platform.tx')
```

动作需要在 Manifest 中声明。平台图标复用 Host 资源，不内嵌图片。

CLI 并非必需。插件也可以直接写成 `exports.manifest`、`exports.activate`、`exports.surfaces` 的单个 JavaScript 文件，通过 `require('@ceru/http')` 等内置模块使用相同能力。第三方 npm 包必须在发行前打入文件。

运行配置通过 `await ctx.config.get<PluginConfig>()` 读取。配置默认值来自静态 `exports.manifest.config`，个性化发行值来自签名后的 `personalization.config`；Host 递归合并后再交给插件。`definePluginConfig()` 可为外部 TS/JS 配置保留完整字段提示。

[完整指南与示例](https://github.com/CeruMusic/CeruMusic-Plugin-Cli#readme)
