---
pageClass: plugin-v3-doc
title: 两个插件共用一个查询服务
---

# 两个插件共用一个查询服务

> **适用读者**　为两个插件设计服务依赖的作者。**前置条件**　能创建两个独立的 CLI 工程。**学习目标**　分别验证授权、拒绝与提供方离线。预计 15 分钟。

这次练习有两个工程。提供方拥有曲库数据，消费方只调用一个公开的 `find` 方法。先用固定返回值在终端测通消费方，再到桌面测试真实的两个插件。

## 1. 创建两个工程

```sh
npx --yes create-ceru-plugin@3.0.0 catalog-provider --template web-surface --lang ts
npx --yes create-ceru-plugin@3.0.0 catalog-reader --template web-surface --lang ts
```

分别进入两个目录运行 `npm install`。以下改动合并进各自的 `ceru.plugin.json`，保留原有视图和文件映射。为使提供方启用时即可注册服务，移除它的 `manifest.entry.logic.activation`，保留 `module`。

## 2. 在提供方登记服务

把提供方的 `manifest.id` 改为 `example.catalog`，然后把这个数组写入它的 `manifest.provides.services`：

```json
[{ "id": "lookup", "version": "1.2.0", "methods": ["find"] }]
```

在提供方 `src/index.ts` 的 `definePlugin` 回调里加入：

```ts
ctx.services.register('lookup', {
  find: input => {
    if (input && typeof input === 'object' && !Array.isArray(input) && input.id === '1') {
      return { title: '示例歌曲' }
    }
    return null
  },
})
```

只返回可序列化的 JSON。以后增加可选方法时更新服务版本；消费方按这里的服务版本范围匹配。

## 3. 在消费方调用它

给消费方使用独立的插件 ID，例如 `example.reader`。在 `manifest.provides.actions` 加入 `{ "id": "lookup.song", "title": "查歌曲" }`，在 `manifest.uses` 合并以下两个数组的条目：

```json
{
  "plugins": [{ "pluginId": "example.catalog", "service": "lookup", "version": "^1.0.0", "optional": true }],
  "permissions": [{ "key": "lookup", "name": "services.consume", "reason": "从用户启用的曲库插件查询歌曲" }]
}
```

在消费方 Logic 的 `definePlugin` 中注册：

```ts
ctx.actions.register('lookup.song', async input => {
  const catalog = await ctx.plugins.use('example.catalog', 'lookup')
  return catalog ? catalog.find(input) : null
})
```

前端可以用 `ctx.invoke('lookup.song', { id: '1' })`（Web 视图）或 `useAction('lookup.song')`（Vue 组件）触发查询。有服务就显示返回的标题；若返回 `null`，给用户提示检查提供方与歌曲 ID。

## 4. 在终端分别测试授权和拒绝

在消费方根目录的 `ceru.config.json` 添加：

```json
{ "mockServices": [{ "pluginId": "example.catalog", "service": "lookup", "version": "1.2.0", "returns": { "find": { "title": "示例歌曲" } } }] }
```

新建 `tests/services.json`：

```json
[
  { "name": "查询成功", "action": "lookup.song", "input": { "id": "1" }, "granted": true, "expect": { "title": "示例歌曲" } },
  { "name": "拒绝授权", "action": "lookup.song", "input": { "id": "1" }, "granted": false, "error": "Permission denied: services.consume" }
]
```

在消费方运行 `npx --no-install ceru-plugin test-services`，两个场景都应显示 PASS。再把 `mockServices` 改为空数组，把第一个场景的 `expect` 改为 `null` 后重跑，检查可选依赖缺失的分支。

## 5. 让桌面使用真实提供方

分别构建两个工程，在开发者模式中先加载并启用提供方，再加载消费方。允许服务消费权限，点查询应得到标题；停用提供方再次查询应得到空结果。离线测试使用静态返回值，桌面验证则会执行提供方真正的 `find`。实际业务可监听 `ctx.plugins.on('available' | 'unavailable', handler)` 刷新界面。

## 把查询接到消费方页面

在 `catalog-reader/src/view.ts` 使用下面的完整入口。它调用前面注册的动作，区分找到歌曲、没有匹配结果和调用失败。提供方工程无需改视图。

```ts
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'

export default defineSurface(ctx => {
  const button = document.createElement('button')
  const output = document.createElement('output')
  button.textContent = '查歌曲'
  button.onclick = async () => {
    button.disabled = true
    try {
      const value = await ctx.invoke('lookup.song', { id: '1' })
      output.textContent = value && typeof value === 'object' && !Array.isArray(value)
        && typeof value.title === 'string' ? value.title : '未找到，请检查曲库插件是否已启用'
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

桌面依次启用提供方与消费方后，从侧栏打开消费方页面点击按钮。若离线测试通过但桌面只显示未找到，先确认提供方的清单 ID、服务名、版本以及逻辑注册，再检查歌曲 ID。若页面显示权限错误，在消费方的权限设置中检查服务消费权限。

## 下载并运行本章工程

解压后分别进入 `catalog-provider` 和 `catalog-reader` 安装依赖、构建。消费方包含可直接执行的离线场景。 [下载可联调的服务提供方和消费方（ZIP）](/plugins/v3/tutorial/downloads/catalog-services.zip)
