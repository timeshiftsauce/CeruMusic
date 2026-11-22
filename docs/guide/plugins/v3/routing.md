---
pageClass: plugin-v3-doc
title: 打开具名页面与注册路由守卫
---

# 打开具名页面与注册路由守卫

> **适用读者**　希望从按钮打开页面的作者。**前置条件**　有已声明的页面和 Logic 动作。**学习目标**　验证成功、取消和重复导航。预计 6 分钟。

当一个按钮要打开插件设置、歌单分区，或在页面跳转前检查是否完成配置时，在 Logic 中使用 `ctx.router`。窗口可见性、焦点与插件启停见[生命周期](./lifecycle)。

## 从按钮打开自己的页面

在清单声明动作后，Logic 用 `ctx.actions.register('open.counter', () => ctx.ui.pages.open('counter-page'))` 打开对应的页面。需要具名导航时使用 `ctx.router.push({ name: 'plugin-page', params: { pluginId: ctx.plugin.id, pageId: 'counter-page' } })`。这里只能打开自己已声明并且可见的插件页。通过 `ctx.router.current()` 获取公开的当前路由，主窗口无公开路由时可返回 `null`。

| 要做的事 | 方法与行为 |
| --- | --- |
| 记录已经发生的跳转 | `ctx.router.afterEach(handler)`，返回解绑函数 |
| 在导航前检查条件 | 声明并获得 `navigation.intercept`，注册 `beforeEach(handler)` |
| 放行、取消或改向 | 返回 `undefined`、`false` 或合法具名目标 |
| 打开歌单区块 | `ctx.ui.navigation.open({ page: 'playlist', sectionId: 'library' })`，区块 ID 由本插件声明 |

守卫中应快速判断，避免等待网络。每个插件的路由守卫限时 500 ms，异常或超时会放行。测试重定向时先排除目标页本身，再试撤销授权，确认用户仍能导航。需要观察公开路由名时，可以用带 `route.read` 的 `route.changed` 事件。

`ctx.router.push(to)` 成功切换时返回 `true`，用户停留在原页或重复跳转时返回 `false`。先用自己的页面 ID 测试成功跳转，再从同一页发起一次，核对两个返回值。

```ts
// 放在 definePlugin(ctx => { … }) 内
const stop = ctx.router.afterEach((to, from) => {
  ctx.log.info('页面已切换', { from: from?.name ?? null, to: to.name })
})
ctx.effects.add(stop)
```

打开一个页面再返回，检查日志中的两个具名目标。如果守卫取消了跳转，`afterEach` 不会为这次尝试生成成功记录。

## 守卫要有可结束的分支

如果需要用户先打开本插件的配置页，在守卫中先检查目标是否已经是配置页；返回目标自身会造成重复重定向。缺少授权、处理抛错或超时，桌面会沿用原导航。用一次正常跳转、一次取消、一次改向来验收：只有最终完成的跳转才应出现在 `afterEach` 的日志中。[路由类型和参数](./reference#logic) · [生命周期通知](./lifecycle)
