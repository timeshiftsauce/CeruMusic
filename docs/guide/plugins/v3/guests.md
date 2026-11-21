---
pageClass: plugin-v3-doc
title: 让父插件管理 Guest 子插件
---

# 让父插件管理 Guest 子插件

> **适用读者**　需要导入用户脚本的兼容层作者。**前置条件**　已具备开发预览环境。**学习目标**　让一个子插件完成导入、握手和停用。预计 12 分钟。

适配已有脚本格式时，父插件负责让用户导入、选择、停用和移除脚本，Guest bootstrap 负责实现该格式的兼容接口。先做一个只返回脚本名称的本地练习，验证边界后再实现目标协议。

## 1. 生成并认识两个入口

```sh
npx --yes create-ceru-plugin@3.0.0 my-adapter --template guest-adapter --lang ts
cd my-adapter
npm install
```

打开 `ceru.plugin.json`。模板将 `logic.main` 映射到 `src/index.ts`，`guest.bootstrap` 映射到 `src/guest.ts`。`provides.guestAdapters` 中的适配器 ID 为 `example-script`；父插件导入文件时用这个 ID。保留模板的 `guestPolicy` 以及 `guests.manage`、`guests.run` 权限声明。脚手架仅预置边界和设置页，具体脚本格式的兼容层由作者实现。

## 2. 先实现可观察的握手

把下段用作 `src/guest.ts`。本例只提供信息查询，所以启动时公布空的平台列表。

```ts
import { defineGuestAdapter } from '@shiqianjiang/ceru-plugin-sdk'

export default defineGuestAdapter(ctx => {
  ctx.handle(async method => {
    if (method === 'info') return { name: ctx.scriptInfo.name }
    throw new Error('未知的 Guest 方法')
  })
  ctx.ready({ providers: [] })
})
```

要让音乐能力出现在平台列表，填写实际实现的 provider ID、名称、按低到高排列的 `qualities` 和 `protocols`。每个协议必须在该 adapter 的 `projectableProtocols` 范围内。Guest 的网络访问按子插件独立授权。

## 3. 从父插件的按钮触发

给父插件的 `manifest.provides.actions` 增加 `guest.try` 动作。在父插件 `definePlugin` 中注册如下，把设置页按钮接到 `ctx.invoke('guest.try', null)`，并在按钮旁显示调用结果或错误。

```ts
ctx.actions.register('guest.try', async (_input, operation) => {
  const item = await ctx.guests.import('example-script')
  if (!item) return null
  await ctx.guests.select(item.id)
  return ctx.guests.invoke(item.id, 'info', null, operation)
})
```

用 `npm run build` 和 `npm run validate` 检查工程后加载到开发者模式。授权管理与运行，选择自己编写的本地演示脚本并确认导入，页面应显示导入项名称。点取消时动作返回 `null`。同一文件已安装时，从 `ctx.guests.list()` 找到现有条目后选择它。

## 4. 处理停用与移除

用 `list()` 显示名称、`selected` 与 `state`；状态为 `error` 时展示其 `error` 字段。用户点“停用”时调用 `select(null)`；确认删除时调用 `remove(item.id)` 并刷新列表。调用前重新读取选中项，避免快速切换后仍向原脚本发请求。[Guest 方法签名](./reference#hooks)

## 用一个可复制的文件做首次导入

创建 `example.guest.js`，保存以下内容。这个练习的握手与信息查询由上面的 bootstrap 实现，脚本只需提供可识别的文件头：

```js
/*
 * @name 我的第一个子插件
 * @version 1.0.0
 */
```

在 `src/settings.ts` 使用这个完整页面，把父插件的动作与用户点击接起来：

```ts
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'

export default defineSurface(ctx => {
  const button = document.createElement('button')
  const output = document.createElement('output')
  button.textContent = '导入并读取名称'
  button.onclick = async () => {
    button.disabled = true
    try {
      const info = await ctx.invoke('guest.try', null)
      output.textContent = info && typeof info === 'object' && !Array.isArray(info)
        && typeof info.name === 'string' ? info.name : '已取消'
    } catch (error) {
      output.textContent = String(error)
    } finally {
      button.disabled = false
    }
  }
  ctx.root.replaceChildren(button, output)
  return () => { button.onclick = null; ctx.root.replaceChildren() }
})
```

打开插件设置页，先在文件选择框按取消，按钮应恢复可用；再次点击并选择上述文件、同意导入，结果应显示「我的第一个子插件」。若返回“子插件未完成初始化”，先确认 bootstrap 执行了 `ready`，再排查声明的协议和适配器 ID。

## 下载并运行本章工程

先构建并加载父插件，再从设置页选择压缩包里的 `example.guest.js`。 [下载Guest 父插件与演示子脚本（ZIP）](/plugins/v3/tutorial/downloads/guest-adapter.zip)
