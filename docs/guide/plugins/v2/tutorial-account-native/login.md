---
pageClass: plugin-v2-doc
title: Vue 登录与账号状态
description: 实现账号摘要、扫码轮询、状态广播、自动关窗与退出。
prev:
  text: 工程与 Manifest
  link: /guide/plugins/v2/tutorial-account-native/manifest
next:
  text: 原生歌单区块
  link: /guide/plugins/v2/tutorial-account-native/native-library
---

# Vue 登录与账号状态

账号功能分成三层。这样 Vue 页面关闭后，登录资料仍由后台管理，宿主也不需要知道某个平台怎样登录。

| 层          | 负责什么                                        | 不应该保存什么        |
| ----------- | ----------------------------------------------- | --------------------- |
| 插件后台    | 请求登录接口、解析 Cookie、判断会员、持久化会话 | DOM 与 Vue 响应式对象 |
| Web Surface | 展示二维码、轮询状态、处理取消和关窗            | 长期 Cookie、刷新令牌 |
| 澜音宿主    | 展示账号入口和通用弹窗，调用声明的动作          | 平台私有接口逻辑      |

## 1. 返回 AccountSummary

账号菜单调用 <code>accountItems[].action</code>。这个动作返回：

```ts
type AccountSummary = {
  signedIn: boolean
  displayName: string
  avatarUrl?: string
  badge?: string
}
```

完整注册代码：

```ts
const accountSummary = (): AccountSummary => ({
  signedIn: !!session,
  displayName: session?.displayName ?? '演示音乐账号',
  ...(session?.avatarUrl ? { avatarUrl: session.avatarUrl } : {}),
  ...(session?.membership && session.membership !== 'FREE' ? { badge: session.membership } : {})
})

ctx.effects.add(ctx.actions.register('account.summary', () => accountSummary()))
```

| 字段                     | 返回规则                    | 宿主中的结果                   |
| ------------------------ | --------------------------- | ------------------------------ |
| <code>signedIn</code>    | 有已验证会话才为 true       | false 时显示默认头像与“未登录” |
| <code>displayName</code> | 始终返回非空字符串          | 登录后显示昵称                 |
| <code>avatarUrl</code>   | 只返回 HTTP(S) 公开头像地址 | 登录后替换默认头像             |
| <code>badge</code>       | 仅 VIP/SVIP 等有效权益返回  | 昵称旁显示短标签               |

普通用户不要返回 <code>badge: "FREE"</code>，直接省略字段。Cookie、用户手机号、令牌和会员接口原始响应都不能进入摘要。

## 2. 把私密会话与公开状态分开

教程中的后台会话含一个模拟 Cookie：

```ts
type DemoSession = {
  cookie: string
  displayName: string
  avatarUrl: string
  membership: 'FREE' | 'VIP' | 'SVIP'
}

await ctx.storage.set('tutorial.session.v1', session)
```

Storage 每个插件最多 **10 MiB（10,485,760 字节）**。它适合小型 JSON 会话，不适合缓存封面或歌曲文件。完整容量与共享读取规则见 [Storage](../storage)。

对外广播时重新挑选字段：

```ts
const publicAccount = () => ({
  signedIn: !!session,
  displayName: session?.displayName ?? '演示音乐账号',
  ...(session?.avatarUrl ? { avatarUrl: session.avatarUrl } : {}),
  ...(session && session.membership !== 'FREE' ? { badge: session.membership } : {})
})

await ctx.ui.setState('account', { account: publicAccount() })
await ctx.ui.setState('library', { account: publicAccount(), changedAt: Date.now() })
```

<code>ctx.ui.setState(surfaceId, state)</code> 的 state 是公开、可克隆的 JSON 快照。它会通知已打开的 Surface，并让 native Surface 重新 render。不要放 Cookie、Authorization 头或刷新令牌。

## 3. 用动作实现一次登录

演示版把真实二维码接口拆成四个动作：

| 动作                         | 输入                            | 返回                                       | 调用方                           |
| ---------------------------- | ------------------------------- | ------------------------------------------ | -------------------------------- |
| <code>account.start</code>   | <code>{ attemptId }</code>      | <code>{ status, attemptId, qrText }</code> | Vue 页面首次打开或重新取码       |
| <code>account.approve</code> | <code>{ attemptId }</code>      | <code>{ status: "scanned" }</code>         | 教程里的“模拟手机确认”按钮       |
| <code>account.poll</code>    | <code>{ attemptId }</code>      | waiting / expired / success                | Vue 定时轮询                     |
| <code>account.cancel</code>  | 可选 <code>{ attemptId }</code> | <code>null</code>                          | 关闭、取消或生命周期 closeAction |

真实平台通常不需要 <code>account.approve</code>。手机 App 扫码后，平台的轮询接口会自然从 waiting 变成 scanned 和 success。

关键点是登录成功时先完成后台动作：

```ts
session = await verifyPlatformLogin(login)
await ctx.storage.set(SESSION_KEY, session)
login = null
await publishAccount()

return {
  status: 'success',
  account: publicAccount()
}
```

在写入 Storage 之前验证平台响应，确认账号资料与会员接口都属于当前登录会话。退出时删除记录：

```ts
ctx.actions.register('account.logout', async () => {
  login = null
  session = null
  await ctx.storage.delete(SESSION_KEY)
  await publishAccount()
  await ctx.ui.closeView('account')
  return publicAccount()
})
```

账号菜单在已登录项上显示悬停二级菜单，并调用 <code>logoutAction</code>。<code>ctx.ui.closeView('account')</code> 是后台主动关闭已打开 Surface 的方式。

## 4. 挂载 Vue Surface

<code>src/view.ts</code> 只有桥接职责：

```ts
import { createApp } from 'vue'
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'
import App from './App.vue'

export default defineSurface((context) => {
  const app = createApp(App, { context })
  app.mount(context.root)
  return () => app.unmount()
})
```

Vue 和组件代码会被打进最终 <code>dist/plugin.js</code>。页面运行在隔离 Surface 中，不会作为组件注入澜音的 Vue 应用。

## 5. 让 modal 跟随内容高度

0.3.5 的 Core、CLI 工作台和澜音 Host 会观察 Web Surface 的实际内容高度。Manifest 中的 <code>presentation.size</code> 控制 modal 宽度：

```json
"presentation": { "kind": "modal", "size": 360 }
```

Vue 页面使用自然高度即可：

```css
html,
body {
  margin: 0;
}

main {
  width: 100%;
  padding: 18px;
}
```

不要给页面根元素设置 <code>height: 100vh</code> 或 <code>min-height: 100vh</code>。否则 iframe 会把视口高度当成内容高度，短页面也会出现大块空白或内部滚动。内容变高、变矮、字体加载或状态切换时，宿主会重新测量并在视口上限内调整。

真实网易云插件采用 360 像素宽 modal：扫码状态的内容高度约 330 像素，已登录摘要约 154 像素。它们是内容布局结果，不需要插件手动发送 resize 消息。

## 6. 页面调用后台并订阅状态

在 <code>App.vue</code> 中，页面只能拿到 <code>SurfaceContext</code>：

```ts
const props = defineProps<{ context: SurfaceContext }>()

const invoke = (action: string, input: JsonObject = {}) => props.context.invoke(action, input)

onMounted(async () => {
  unsubscribe = props.context.subscribe((state) => {
    if (state.account && typeof state.account === 'object') {
      account.value = state.account as JsonObject
    }
  })

  account.value = (await invoke('account.session')) as JsonObject
  if (!account.value.signedIn) await startLogin()
})
```

<code>invoke</code> 只能调用 Manifest 中已经声明、后台已经注册的动作。它返回动作的 JSON 结果；失败时 Promise reject，页面应显示可操作的错误。

登录成功后等待动作完全返回，再关闭：

```ts
const result = await invoke('account.poll', { attemptId })
if (result.status === 'success') {
  stopPolling()
  await props.context.close()
}
```

如果在后台写入和 <code>setState</code> 完成前关窗，当前调用可能被会话取消。顺序应始终是“动作返回 → 页面关闭”。

## 7. 关闭必须停止轮询

```ts
onBeforeUnmount(() => {
  disposed = true
  stopPolling()
  unsubscribe?.()
  if (attemptId) {
    void invoke('account.cancel', { attemptId }).catch(() => {})
  }
})
```

同时在 Manifest 设置：

```json
"lifecycle": { "closeAction": "account.cancel" }
```

两层清理覆盖用户点击取消、宿主关闭窗口、热更新和插件停用。再次打开时组件重新 mount，并调用 <code>account.start</code> 取得新码，不复用上一次 attempt。

## 8. 换成真实接口时谁负责什么？

真实插件在后台完成：

1. 调用取码接口并返回公开的二维码 URL。
2. 带 <code>operation.signal</code> 调用轮询接口，窗口关闭时停止。
3. 从成功响应提取 Cookie 或令牌并写私有 Storage。
4. 调用用户资料和会员接口，计算 FREE、VIP 或 SVIP。
5. 只把昵称、头像和可选标签发布给宿主。

宿主只负责通用网络、权限、存储、账号菜单和窗口，不会内置网易云或其他平台的登录规则。

::: tip 完成标志
打开账号项会自动取码；关闭时轮询停止；重新打开得到新会话；成功后 modal 自动关闭；账号菜单显示昵称、头像和 SVIP；悬停退出后回到默认头像与未登录。
:::
