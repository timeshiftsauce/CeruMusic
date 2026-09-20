---
pageClass: plugin-v2-doc
title: Navidrome Vue 连接页
description: 用通用 Web Surface 构建登录、状态、轮询和生命周期。
prev:
  text: 连接与认证
  link: /guide/plugins/v2/tutorial-navidrome/connection
next:
  text: Navidrome Provider
  link: /guide/plugins/v2/tutorial-navidrome/provider
---

# Navidrome Vue 连接页

Surface 只负责显示和输入。它通过 `ctx.invoke` 调用后台 Action，通过 `ctx.subscribe` 接收公开状态。

## 1. 声明页面和生命周期

`ceru.plugin.json` 中加入：

```json
{
  "modules": {
    "surfaces": [
      {
        "id": "connection",
        "kind": "web",
        "entry": "view.connection",
        "title": "连接 Navidrome",
        "presentation": { "kind": "drawer", "placement": "right", "size": 440 },
        "lifecycle": {
          "openAction": "connection.surface-open",
          "closeAction": "connection.surface-close"
        }
      }
    ]
  }
}
```

所有会被 Surface 调用、或被 lifecycle 调用的 Action 都要在 `contributes.commands` 中声明，并在 `src/index.ts` 注册。Host 挂载完成后调用 openAction；关闭、切换或卸载时调用 closeAction，并取消仍未完成的页面调用。

## 2. 挂载 Vue

`src/view.ts` 保持很短：

```ts
import { createApp } from 'vue'
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'
import App from './App.vue'

export default defineSurface((ctx) => {
  const app = createApp(App, { context: ctx })
  app.mount(ctx.root)
  return () => app.unmount()
})
```

清理函数很重要。页面关闭后 Vue 会卸载，监听器和组件副作用随之结束。

## 3. 调用后台 Action

`App.vue` 接收 `SurfaceContext`，提交时创建普通 JSON 对象：

```ts
async function save() {
  const result = await props.context.invoke('connection.save', {
    serverUrl: form.serverUrl,
    username: form.username,
    password: form.password,
    remember: form.remember,
    allowLocal: form.allowLocal
  })
  applyState(result)
  form.password = ''
}
```

Surface 没有 `ctx.storage`、`ctx.http` 或 Provider 注册能力。这是刻意的边界：页面只能通过已声明 Action 请求业务操作。

::: warning 沙箱页面不要依赖原生 form 提交
Surface iframe 不允许导航式表单提交。使用 `type="button"` 和 Vue 的 `@click="save"` 显式调用 Action；不要让浏览器把表单提交到空地址。
:::

## 4. 订阅状态

```ts
let stopState: (() => void) | undefined

onMounted(async () => {
  stopState = props.context.subscribe((value) => applyState(value))
  await run('connection.read')
})

onBeforeUnmount(() => stopState?.())
```

`subscribe` 接收逻辑模块通过 `ctx.ui.setState('connection', state)` 发布的状态。首次打开时仍主动调用 read，避免页面等待下一次状态变化。

## 5. 页面拥有自己的轮询

连接成功后，页面每 30 秒调用一次 ping：

```ts
poll = setInterval(() => {
  if (state.connected && !busy.value) void run('connection.ping')
}, 30_000)

onBeforeUnmount(() => {
  stopState?.()
  if (poll) clearInterval(poll)
})
```

这就是“插件负责轮询”的具体实现。澜音只负责页面生命周期和调用桥；它不知道 Navidrome 的 ping 规则。

**完成标志：** 页面能登录、测试、断开；提交后密码框立即清空；关闭再打开不会重复创建轮询。

完整页面源码：<a href="/plugins/v2/tutorial/navidrome-vue/src/App.vue">App.vue</a>。通用 Surface 契约见 [Web / Vue / React](../surfaces)。

下一节：[把连接用于搜索、播放和歌词 →](./provider)
