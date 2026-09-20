# v2 插件抽屉与存储

::: tip 完整文档已归入 v2 专区
适用于使用 v2 插件的澜音 **2.0 起**；1.14.1 仍使用 v1。本页保留原地址与章节锚点；完整参数、容量、类型差异、错误和可运行示例请阅读 [原生配置抽屉](/guide/plugins/v2/ui-schema)、[Storage 存储与共享](/guide/plugins/v2/storage)。首次开发请从 [运行插件](/guide/plugins/v2/quick-start)进入。
:::

以下是澜音桌面 Host 的 v2 扩展，沿用现有 `ctx.ui`、`ctx.storage` 传输协议。需要包含这些扩展的桌面版本；旧 Host 不会自动获得这些能力。

## 原生配置抽屉

`ctx.ui.openView('connection')` 打开已声明的页面。将该 Surface 声明为 `kind: 'schema'`，并在 JSON 资源中指定 `presentation.kind: 'drawer'`，宿主就会使用软件内的原生控件显示抽屉。

```javascript
// manifest.modules.surfaces
[{ id: 'connection', kind: 'schema', entry: 'schema.connection' }]

// exports.resources
{
  'schema.connection': {
    type: 'json',
    value: {
      schemaVersion: '1.0',
      presentation: {
        kind: 'drawer',
        placement: 'right',
        size: 480,
        openOnFirstUse: true
      },
      root: {
        type: 'form',
        title: '连接设置',
        submitAction: 'connection.save',
        submitLabel: '保存',
        children: [
          { type: 'text', bind: 'status' },
          { type: 'text-input', bind: 'serverUrl', label: '服务器地址', required: true },
          { type: 'password', bind: 'password', label: '密码' },
          { type: 'toggle', bind: 'remember', label: '记住登录' }
        ]
      }
    }
  }
}
```

- `placement` 支持 `left`、`right`、`top`、`bottom`，默认右侧。`size` 是左右抽屉的宽度、上下抽屉的高度，支持 280–1200 px，并自动限制在窗口范围内。
- 抽屉和遮罩自动避开软件标题栏，跟随标题栏尺寸调整，抽屉内控件不参与窗口拖拽。可点击关闭按钮、空白遮罩或按 Escape 关闭。
- `openOnFirstUse: true` 在首次明确点击「使用」或启用时显示。展示成功后记录，后续启动恢复、更新和再次启用不重复弹出；仍可通过设置页按钮或 `openView()` 打开。
- 控件支持 `text-input`、`password`、`number`、`toggle`、`select`、`text` 和 `button`。`select` 提供 `options: [{ label, value }]`。
- `button` 使用 `action` 指定动作，`input` 指定固定参数；`requires` 可绑定一个状态字段，为 false 时禁用。提交使用 `submitAction` 和可选的 `submitInput`。所有动作都必须在 Manifest commands 中声明并注册。
- `ctx.ui.setState('connection', state)` 设置初始及后续状态。请在激活结束前设置初始值，动作完成后更新状态。表单值传给动作，固定参数由宿主合并，表单不能覆盖它们。
- 密码字段不会从状态回填；每次提交及关闭时清空。失败保留其他输入，显示错误；成功使用最新状态更新表单。关闭会销毁抽屉会话，过期会话无法再调用动作。停用和卸载会关闭所属抽屉。

完整示例见社区插件仓库的 `plugins/ceru.navidrome/plugin.js`。抽屉协议类型位于 `src/common/pluginDrawer.ts`。

## 隔离存储

每个插件有 **10 MiB** 持久化 JSON 存储，按 UTF-8 序列化后的字节数计算，包含数据及读取权限。写入超限会失败，原数据不变。重启或停用保留数据，卸载清除。旧版插件私有存储会在首次写入时自动迁移。

```javascript
await ctx.storage.set('preferences', { quality: 'original' })
const preferences = await ctx.storage.get('preferences')
await ctx.storage.delete('preferences')

// 显式使用自己的 manifest.id 也可以。
await ctx.storage.get({ pluginId: ctx.plugin.id, key: 'preferences' })
```

新键默认私有。数据所属插件可以在写入时决定谁能读取：

```javascript
// 只允许指定插件读取。
await ctx.storage.set(
  { key: 'librarySummary', readableBy: ['example.dashboard'] },
  { albums: 120, tracks: 1800 }
)

// 允许所有已安装插件读取。
await ctx.storage.set({ key: 'publicInfo', readableBy: '*' }, { version: 1 })

// 另一个插件通过发布者的 manifest.id 读取。
const summary = await ctx.storage.get({
  pluginId: 'example.library',
  key: 'librarySummary'
})

// 撤回共享：空数组表示私有，后续读取立即按新权限检查。
const value = await ctx.storage.get('librarySummary')
await ctx.storage.set({ key: 'librarySummary', readableBy: [] }, value)
```

`pluginId` 是 Manifest 中的稳定 ID，不是显示名称或安装实例 ID。宿主通过已安装插件清单解析身份，插件无法提供磁盘路径。未安装、ID 不唯一或未授权都会报错；读取自己的不存在键返回 `null`。目标插件停用后仍可读取其已开放数据，不会为读取而启动目标插件。

省略 `readableBy` 会保留已有键的权限；删除键会同时删除权限。其他插件只能读取被开放的键，不能修改、删除或替它设置权限。共享数据仅计入所属插件额度，不复制到读取者的存储。

结构化键扩展沿用现有 `get/set/delete` RPC，JavaScript 插件可直接使用。TypeScript 的扩展接口见 `src/common/types/pluginStorage.ts`，其中 `PluginStorageAPI` 提供结构化键签名。SDK 0.2.4 自带的签名仅声明字符串键，使用结构化键时需要引用此扩展类型。

插件存储是本地数据隔离机制，不是加密凭据保险库。不要将登录令牌、密码等键开放给其他插件；Navidrome 的连接凭据保持私有。
