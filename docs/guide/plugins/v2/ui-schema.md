---
pageClass: plugin-v2-doc
---

# 原生配置抽屉

澜音 **1.14.1** 支持把 Schema Surface 渲染为软件内的配置抽屉。适合服务器地址、用户名、音质和开关设置；复杂交互使用 [Web Surface](./surfaces)。

![文档演示插件的原生配置抽屉](/plugins/v2/desktop-drawer.png)

_澜音 1.14.1 开发构建，示例使用虚构服务器地址，不会自动联网。_

## 先选择合适的界面

如果只是填写服务器地址、选择音质和点击保存，可以用本页的原生抽屉。你写字段和动作，澜音替你渲染控件。

如果要展示二维码、个人歌单或复杂交互，直接使用 [Vue / Web Surface](./surfaces)。两种页面都通过 Action 调用后台逻辑。

## 三个部分如何配合

<PluginDiagram src="/plugins/v2/surface-actions.svg" alt="Surface 提交动作到后台，后台更新存储并将 state 返回界面的通信过程" />

1. **Manifest** 声明 Surface 和允许执行的命令。
2. **JSON Schema** 描述表单控件与提交动作。
3. **后台逻辑** 注册动作、读写 storage，通过 setState 更新状态。

可下载[完整抽屉演示插件](/plugins/v2/examples/settings.js)，直接安装到澜音 ≥1.14.1。示例只保存演示偏好，不连接服务器。

## 1. 声明入口

工程配置的相关字段如下，合并进现有 `ceru.plugin.json`：

```json
{
  "manifest": {
    "modules": {
      "logic": { "entry": "logic.main" },
      "surfaces": [{ "id": "settings", "kind": "schema", "entry": "schema.settings" }]
    },
    "contributes": {
      "commands": [
        { "id": "save", "title": "保存偏好", "action": "settings.save" },
        { "id": "open", "title": "打开设置", "action": "settings.open" }
      ],
      "settingsPages": [{ "id": "settings", "title": "连接设置", "view": "settings" }]
    }
  },
  "resources": {
    "schema.settings": { "path": "ui/settings.json", "type": "json" }
  }
}
```

上面是增量字段，不是省略了 id/engines 的完整 Manifest。完整单文件包含所有必要声明。

## 2. 编写 ui/settings.json

```json
{
  "schemaVersion": "1.0",
  "presentation": {
    "kind": "drawer",
    "placement": "right",
    "size": 480,
    "openOnFirstUse": true
  },
  "root": {
    "type": "form",
    "title": "连接设置",
    "submitAction": "settings.save",
    "submitLabel": "保存偏好",
    "children": [
      { "type": "text", "bind": "status", "label": "状态" },
      { "type": "text-input", "bind": "serverUrl", "label": "服务器地址", "required": true },
      { "type": "toggle", "bind": "remember", "label": "记住偏好" }
    ]
  }
}
```

## 3. 注册动作与状态

```ts
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'

export default definePlugin(async (ctx) => {
  const saved = await ctx.storage.get('preferences')
  const initial =
    saved && typeof saved === 'object' && !Array.isArray(saved)
      ? saved
      : { serverUrl: 'https://music.example.com', remember: false }

  ctx.actions.register('settings.open', async () => ctx.ui.openView('settings'))
  ctx.actions.register('settings.save', async (input) => {
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new Error('无效的表单')
    }
    const value = {
      serverUrl: String(input.serverUrl || ''),
      remember: input.remember === true
    }
    if (!value.serverUrl.startsWith('https://')) throw new Error('请输入 HTTPS 地址')
    await ctx.storage.set('preferences', value)
    await ctx.ui.setState('settings', { ...value, status: '偏好已保存，未发起网络连接' })
  })
  await ctx.ui.setState('settings', { ...initial, status: '请填写连接偏好' })
})
```

在激活结束前设置初始 state。openView 只负责请求展示，state 不会自动从 storage 读取。动作失败时抛出可读错误，成功后显式更新 state。

## API 与显示行为

| API        | 签名                                                      | 说明                                                                     |
| ---------- | --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `openView` | `(surfaceId: string) => Promise<void>`                    | Surface 必须已声明；桌面以事件请求打开，Promise 完成不等于用户操作已完成 |
| `setState` | `(surfaceId: string, state: JsonObject) => Promise<void>` | 更新该页面的状态对象；按完整状态发送                                     |
| `notify`   | `({ key, level, message }) => Promise<void>`              | level 为 info/success/warning/error                                      |
| `toast`    | `({ message, level? }) => Promise<void>`                  | 简短提示                                                                 |

openOnFirstUse 在用户首次明确启用/使用并成功展示后记录；启动恢复、更新和再次启用不会反复弹出。之后可从设置入口或 openView 打开。

关闭按钮、遮罩和 Escape 可关闭抽屉；关闭销毁会话，旧会话动作不能继续提交。停用和卸载关闭对应抽屉。

## 控件与限制

| 控件         | 数据与行为                                        |
| ------------ | ------------------------------------------------- |
| `text-input` | 字符串；label、placeholder、description、required |
| `password`   | 不从 state 回填；提交及关闭清空                   |
| `number`     | 有限数值                                          |
| `toggle`     | boolean                                           |
| `select`     | `options: [{ label, value }]`；value 必须属于选项 |
| `text`       | 通过 bind 显示状态，不提交                        |
| `button`     | label、action；可带固定 input 和 requires 状态键  |

| 项目                          | 桌面限制                                                       |
| ----------------------------- | -------------------------------------------------------------- |
| placement                     | left/right/top/bottom，默认 right                              |
| size                          | 280–1200 px；左右为宽、上下为高，限制在窗口内                  |
| 根节点                        | 必须 form，包含 title 和已声明 submitAction                    |
| 根标题                        | 最长 100 个代码单元                                            |
| children                      | 最多 64 个，字段 bind 不能重复                                 |
| bind/requires                 | 以字母开头的安全键，最长 128；禁止保留名称                     |
| label/placeholder/description | 各最长 2000 个代码单元                                         |
| select 选项                   | 1–100 项                                                       |
| 文本输入                      | 最长 8192 个代码单元                                           |
| Schema / 提交表单             | 各自 JSON.stringify(...).length ≤65,536，**不是 UTF-8 字节数** |

submitInput / button.input 为固定参数，由宿主在表单值之后合并，表单不能覆盖它们。required 主要在表单提交时校验；按钮动作也应自行校验业务条件。requires 用于 UI 禁用状态，不能替代后台授权或校验。

保存失败会保留其他输入并显示错误；密码仍会清空。保存成功使用最新 state 回填。SDK 的通用 UINode 类型没有完整覆盖这些桌面字段，JSON 配置与此页桌面扩展为准。
