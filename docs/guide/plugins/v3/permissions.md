---
pageClass: plugin-v3-doc
title: 给一次用户操作申请权限
---

# 给一次用户操作申请权限

> **适用读者**　需要访问受保护能力的作者。**前置条件**　已运行 page-extension 模板。**学习目标**　检查授权状态并处理拒绝和撤销。预计 8 分钟。

以「音源搜索」为例。读取曲库和控制播放分开授权，用户可以允许搜索，同时拒绝播放。下面在 `page-extension` 模板中给搜索按钮补上授权处理。

## 1. 找到权限键

在 `ceru.plugin.json` 中看 `manifest.uses.permissions`。模板的 `catalog` 是调用者选的 key，`music.read` 是宿主的能力名；另一个 key `listen` 对应 `music.control`。写 `permissionKey` 时填前者。给每项写出具体用途，便于用户决定。

## 2. 仅在用户点击时请求

在 `src/index.ts` 的 `search` 动作内、调用 `ctx.music.sources()` 前插入下段，保留模板已有的请求代数检查。这里的 `operation` 来自动作回调的第二个参数：

```ts
let { status } = await ctx.permissions.query({ key: 'catalog' })
if (status === 'prompt') {
  const grant = await ctx.permissions.request({
    key: 'catalog',
    intent: operation.userIntent,
  })
  status = grant.status
}
if (status !== 'granted') {
  throw new Error('读取音源需要授权，请在插件权限中允许后重新搜索。')
}
```

保留模板原有的 `ctx.music.search(..., { permissionKey: 'catalog', operation })`。宿主在实际执行时仍会检查当前授权；如果等待中被撤权，请把调用失败显示在这次操作的界面上。多项权限属于同一组时可以使用 `requestGroup({ group, keys, intent })`，按结果里的 `grants` 判断具体项。

## 3. 验证拒绝和撤销

在桌面开发者模式加载工程。先只允许读取，确认搜索能返回数据；播放已有歌曲时应受到另一项授权约束。撤销读取后重新搜索，应能看到失败原因。若状态是 `undeclared`，对照清单的 key 并确认桌面加载了新产物。若只有某些地址失败，检查私网、凭据或来源范围，具体方法见[网络连接](./network)及[扫码账号](./accounts)。

权限发生改变时可以注册 `ctx.lifecycle.onPermissionChange(keys => …)`，按变化的 key 刷新页面。持久保存用户偏好时不要把“上次授权过”当作下一次调用的许可。

## 读懂一次授权结果

| 查询状态 | 搜索按钮下一步做什么 |
| --- | --- |
| `granted` | 带着当前动作的 `operation` 调用搜索。宿主会在执行时继续检查权限 |
| `prompt` | 从这次点击请求授权，等用户选择后再看返回状态 |
| `denied` | 显示拒绝原因并恢复按钮；等用户自行调整权限后重试 |
| `undeclared` | 检查清单 key 拼写、加载的产物路径和本轮构建结果 |
| `expired`、`restricted`、`unavailable` | 提示当前功能不可用，按宿主给出的状态处理。不要在后台循环申请 |

**自己检查一次撤权**：打开两个使用同一音源的页面，在管理设置中撤销读取，再从另一页点击搜索。两页都应根据当前结果处理失败，即使界面上还保留上一次的搜索结果。不要在页面或 storage 中缓存一个永久有效的“已授权”标志。[权限变更回调](./lifecycle#changes) · [参数与状态类型](./reference#logic)
