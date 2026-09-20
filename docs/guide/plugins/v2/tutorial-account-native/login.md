---
pageClass: plugin-v2-doc
title: 3. Vue 登录与账号
description: 用后台状态机保存会话，用 Vue 页面发起、轮询和取消登录。
prev:
  text: 最小账号入口
  link: /guide/plugins/v2/tutorial-account-native/manifest
next:
  text: 原生歌单区块
  link: /guide/plugins/v2/tutorial-account-native/native-library
---

# 3. Vue 登录与账号

上一节只有一条未登录摘要。本节把它改成完整的本地登录流程：打开账号项会生成一次登录请求，页面轮询后台；确认后，后台保存会话并更新账号菜单；关闭页面会停止轮询。

本节只改账号功能，不加入歌单和播放。

## 1. 替换 Manifest

完整替换 `ceru.plugin.json`。新增的六个动作都同时出现在 `commands` 和后台代码中；退出动作完成后，`accountItems` 才声明 `logoutAction`。

<details>
<summary>ceru.plugin.json 完整内容</summary>

```json [ceru.plugin.json]
{
  "manifest": {
    "manifestVersion": 2,
    "id": "tutorial.account-native",
    "name": "账号与原生歌单教程",
    "version": "0.1.0",
    "description": "演示账号菜单、Vue 登录页和原生歌单",
    "engines": {
      "hostApi": "^2.0.0",
      "logicRuntime": "ceru-js@1",
      "libraries": { "vue": "^3.5.0" }
    },
    "modules": {
      "logic": {
        "entry": "logic.main",
        "activation": ["onCommand:account.open"]
      },
      "surfaces": [
        {
          "id": "account",
          "kind": "web",
          "entry": "view.account",
          "title": "连接演示账号",
          "presentation": { "kind": "modal", "size": 360 },
          "lifecycle": { "closeAction": "account.cancel" }
        }
      ]
    },
    "contributes": {
      "commands": [
        { "id": "account.open", "title": "连接演示账号", "action": "account.open", "view": "account" },
        { "id": "account.summary", "title": "读取账号摘要", "action": "account.summary" },
        { "id": "account.session", "title": "读取公开账号状态", "action": "account.session" },
        { "id": "account.start", "title": "开始演示登录", "action": "account.start" },
        { "id": "account.approve", "title": "确认演示登录", "action": "account.approve" },
        { "id": "account.poll", "title": "检查演示登录", "action": "account.poll" },
        { "id": "account.cancel", "title": "取消演示登录", "action": "account.cancel" },
        { "id": "account.logout", "title": "退出演示账号", "action": "account.logout" }
      ],
      "accountItems": [
        {
          "id": "demo-account",
          "title": "演示音乐账号",
          "view": "account",
          "action": "account.summary",
          "logoutAction": "account.logout"
        }
      ]
    },
    "permissions": [],
    "dataSchemas": { "config": 1, "state": 1 }
  },
  "entries": {
    "logic.main": "src/index.ts",
    "view.account": "src/view.ts"
  },
  "resources": {},
  "output": "dist/plugin.js",
  "framework": "vue"
}
```

</details>

`lifecycle.closeAction` 是宿主关闭 modal 时的兜底清理。Vue 组件仍要清除自己的定时器，因为后台动作无法清除页面里的 `setTimeout`。

## 2. 新建账号后台

新建 `src/account.ts`。这个文件拥有私密 `session` 和当前 `attempt`，页面只能通过动作取得筛选后的公开数据。

<details>
<summary>src/account.ts 完整内容</summary>

```ts [src/account.ts]
import type {
  AccountSummary,
  JsonObject,
  JsonValue,
  PluginContext
} from '@shiqianjiang/ceru-plugin-sdk'

const SESSION_KEY = 'tutorial.session.v1'

type DemoSession = {
  cookie: string
  displayName: string
  avatarUrl: string
  membership: 'FREE' | 'VIP' | 'SVIP'
}

type LoginAttempt = {
  id: string
  approved: boolean
  createdAt: number
}

const object = (value: JsonValue | undefined): JsonObject | undefined =>
  value && typeof value === 'object' && !Array.isArray(value) ? value : undefined

function readSession(value: JsonValue | null): DemoSession | null {
  const data = object(value ?? undefined)
  if (
    typeof data?.cookie !== 'string' ||
    typeof data.displayName !== 'string' ||
    typeof data.avatarUrl !== 'string' ||
    !['FREE', 'VIP', 'SVIP'].includes(String(data.membership))
  ) return null
  return data as unknown as DemoSession
}

export async function registerAccount(ctx: PluginContext) {
  let session = readSession(await ctx.storage.get(SESSION_KEY))
  let attempt: LoginAttempt | null = null

  const publicAccount = (): JsonObject => ({
    signedIn: !!session,
    displayName: session?.displayName ?? '演示音乐账号',
    ...(session?.avatarUrl ? { avatarUrl: session.avatarUrl } : {}),
    ...(session?.membership && session.membership !== 'FREE'
      ? { badge: session.membership }
      : {})
  })

  const summary = (): AccountSummary => {
    const state = publicAccount()
    return {
      signedIn: state.signedIn as boolean,
      displayName: state.displayName as string,
      ...(typeof state.avatarUrl === 'string' ? { avatarUrl: state.avatarUrl } : {}),
      ...(typeof state.badge === 'string' ? { badge: state.badge } : {})
    }
  }

  const publish = async () => {
    await ctx.ui.setState('account', { account: publicAccount() })
  }

  ctx.actions.register('account.open', () => ctx.ui.openView('account'))
  ctx.actions.register('account.summary', () => summary())
  ctx.actions.register('account.session', () => publicAccount())

  ctx.actions.register('account.start', (input) => {
    const requestedId = object(input)?.attemptId
    const id = typeof requestedId === 'string' ? requestedId : `attempt-${Date.now()}`
    attempt = { id, approved: false, createdAt: Date.now() }
    return { status: 'waiting', attemptId: id, qrText: `CERU-DEMO:${id}` }
  })

  ctx.actions.register('account.approve', (input) => {
    const id = object(input)?.attemptId
    if (!attempt || id !== attempt.id) throw new Error('本次二维码已失效')
    attempt.approved = true
    return { status: 'scanned' }
  })

  ctx.actions.register('account.poll', async (input) => {
    const id = object(input)?.attemptId
    if (!attempt || id !== attempt.id || Date.now() - attempt.createdAt > 180_000) {
      attempt = null
      return { status: 'expired' } as JsonObject
    }
    if (!attempt.approved) return { status: 'waiting' } as JsonObject

    session = {
      cookie: `demo_session_${Date.now()}`,
      displayName: '演示体验用户',
      avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=CeruDemo',
      membership: 'SVIP'
    }
    await ctx.storage.set(SESSION_KEY, session as unknown as JsonValue)
    attempt = null
    await publish()
    return { status: 'success', account: publicAccount() } as JsonObject
  })

  ctx.actions.register('account.cancel', (input) => {
    const id = object(input)?.attemptId
    if (!id || id === attempt?.id) attempt = null
    return null
  })

  ctx.actions.register('account.logout', async () => {
    attempt = null
    session = null
    await ctx.storage.delete(SESSION_KEY)
    await publish()
    await ctx.ui.closeView('account')
    return publicAccount()
  })

  await publish()
}
```

</details>

`cookie` 只写入插件私有 Storage。`AccountSummary` 和 `setState()` 都是宿主或页面能读取的公开数据，只放登录状态、昵称、头像和可选会员标签。

用下面内容完整替换 `src/index.ts`：

```ts [src/index.ts]
import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import { registerAccount } from './account'

export default definePlugin(async (ctx) => {
  await registerAccount(ctx)
})
```

## 3. 挂载 Vue 页面

完整替换 `src/view.ts`。这个入口只负责挂载和卸载 Vue；业务状态仍在后台。

```ts [src/view.ts]
import { createApp } from 'vue'
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'
import App from './App.vue'

export default defineSurface((context) => {
  const app = createApp(App, { context })
  app.mount(context.root)
  return () => app.unmount()
})
```

完整替换 `src/App.vue`：

<details>
<summary>src/App.vue 完整内容</summary>

```vue [src/App.vue]
<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import type { JsonObject, SurfaceContext } from '@shiqianjiang/ceru-plugin-sdk'

const props = defineProps<{ context: SurfaceContext }>()
const account = ref<JsonObject>({ signedIn: false, displayName: '演示音乐账号' })
const status = ref<'idle' | 'waiting' | 'scanned' | 'expired' | 'error'>('idle')
const attemptId = ref('')
const qrText = ref('')
const busy = ref(false)
const error = ref('')
let disposed = false
let timer: ReturnType<typeof setTimeout> | undefined
let unsubscribe: (() => void) | undefined

const cells = computed(() => {
  const seed = qrText.value || 'CERU-DEMO'
  return Array.from({ length: 121 }, (_, index) => {
    const char = seed.charCodeAt(index % seed.length)
    return (char * (index + 7) + index * index) % 11 < 5
  })
})

const statusText = computed(() => {
  if (status.value === 'scanned') return '已确认，正在登录'
  if (status.value === 'expired') return '二维码已过期'
  if (status.value === 'error') return '登录失败'
  return '等待确认'
})

const invoke = (action: string, input: JsonObject = {}) => props.context.invoke(action, input)

function stopPolling() {
  clearTimeout(timer)
  timer = undefined
}

async function poll(id: string) {
  if (disposed || id !== attemptId.value) return
  try {
    const result = (await invoke('account.poll', { attemptId: id })) as JsonObject
    if (disposed || id !== attemptId.value) return
    status.value = String(result.status) as typeof status.value
    if (result.status === 'success') {
      account.value = (result.account as JsonObject) ?? account.value
      stopPolling()
      await props.context.close()
      return
    }
    if (result.status === 'waiting' || result.status === 'scanned') {
      timer = setTimeout(() => void poll(id), 700)
    }
  } catch (cause) {
    status.value = 'error'
    error.value = cause instanceof Error ? cause.message : String(cause)
  }
}

async function startLogin() {
  stopPolling()
  busy.value = true
  error.value = ''
  const id = `surface-${Date.now()}`
  attemptId.value = id
  try {
    const result = (await invoke('account.start', { attemptId: id })) as JsonObject
    qrText.value = String(result.qrText ?? '')
    status.value = 'waiting'
    timer = setTimeout(() => void poll(id), 700)
  } catch (cause) {
    status.value = 'error'
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function approve() {
  if (!attemptId.value || busy.value) return
  busy.value = true
  error.value = ''
  try {
    await invoke('account.approve', { attemptId: attemptId.value })
    status.value = 'scanned'
  } catch (cause) {
    status.value = 'error'
    error.value = cause instanceof Error ? cause.message : String(cause)
  } finally {
    busy.value = false
  }
}

async function cancel() {
  stopPolling()
  const id = attemptId.value
  attemptId.value = ''
  if (id) await invoke('account.cancel', { attemptId: id }).catch(() => {})
  if (!disposed) await props.context.close()
}

onMounted(async () => {
  unsubscribe = props.context.subscribe((state) => {
    if (!disposed && state.account && typeof state.account === 'object') {
      account.value = state.account as JsonObject
    }
  })
  account.value = (await invoke('account.session')) as JsonObject
  if (!account.value.signedIn) await startLogin()
})

onBeforeUnmount(() => {
  disposed = true
  stopPolling()
  unsubscribe?.()
  const id = attemptId.value
  if (id) void invoke('account.cancel', { attemptId: id }).catch(() => {})
})
</script>

<template>
  <main>
    <header>
      <span class="logo" aria-hidden="true">♪</span>
      <div><h1>连接演示音乐账号</h1><p class="muted">本地演示账号</p></div>
    </header>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <section v-if="!account.signedIn">
      <div class="qr" aria-label="演示二维码图案">
        <i v-for="(dark, index) in cells" :key="index" :class="{ dark }" />
      </div>
      <strong>{{ statusText }}</strong>
      <div class="actions">
        <button class="primary" :disabled="busy || status === 'scanned'" @click="approve">确认登录</button>
        <button :disabled="busy || status === 'scanned'" @click="startLogin">重新获取</button>
        <button @click="cancel">取消</button>
      </div>
    </section>
    <section v-else>
      <img v-if="account.avatarUrl" class="avatar" :src="String(account.avatarUrl)" alt="账号头像" />
      <h2>{{ account.displayName }}</h2>
      <p class="muted">登录已完成</p>
      <button class="primary done" @click="cancel">完成</button>
    </section>
  </main>
</template>

<style scoped>
:global(*) { box-sizing: border-box; }
:global(body) { margin: 0; background: #f8f8fb; color: #26242c; }
main { width: 100%; padding: 18px; font: 14px/1.55 system-ui, 'Microsoft YaHei', sans-serif; }
header { display: flex; align-items: center; gap: 14px; margin-bottom: 14px; }
h1, h2, p { margin: 0; }
h1 { font-size: 20px; letter-spacing: 0; }
.logo { display: grid; place-items: center; width: 48px; height: 48px; border-radius: 6px; color: white; font-size: 25px; background: #366a58; }
section { padding: 16px; border: 1px solid #e7e5ee; border-radius: 6px; background: white; text-align: center; }
.qr { display: grid; grid-template-columns: repeat(11, 11px); width: fit-content; margin: 0 auto 15px; padding: 13px; border: 1px solid #ddd9e8; border-radius: 4px; background: white; }
.qr i { width: 11px; height: 11px; background: white; }
.qr i.dark { background: #24212b; }
.muted { margin-top: 4px; color: #777181; }
.actions { display: flex; flex-wrap: wrap; justify-content: center; gap: 9px; margin-top: 18px; }
button { padding: 9px 14px; border: 1px solid #ddd9e8; border-radius: 5px; background: white; color: inherit; cursor: pointer; }
button.primary { border-color: #366a58; color: white; background: #366a58; }
button:disabled { opacity: .55; cursor: wait; }
.error { margin-bottom: 14px; color: #b42336; }
.avatar { width: 72px; height: 72px; margin-bottom: 10px; border-radius: 50%; }
.done { margin-top: 18px; }
@media (prefers-color-scheme: dark) {
  :global(body) { background: #17161b; color: #f3f0f5; }
  section { border-color: #39353f; background: #211f26; }
  button { border-color: #46414d; background: #29262f; color: inherit; }
}
</style>
```

</details>

页面根元素使用自然高度。不要设置 `100vh`，否则短内容也会撑满 modal。

## 4. 运行本节

```shell
npm run typecheck
npm run build
npm run dev
```

在工作台账号区域点击“演示音乐账号”，然后点击“确认登录”。预期结果：

1. modal 自动关闭；
2. 账号摘要变成“演示体验用户”和 `SVIP`；
3. 停止再重新运行 `npm run dev`，登录状态仍能恢复；
4. 执行退出后，摘要回到未登录。

常见错误：

- 点击动作不存在：Manifest 的 `commands[].action` 必须与 `actions.register()` 完全一致；
- 页面一直等待：确认 `account.approve` 收到的 `attemptId` 与当前页面一致；
- 关闭后仍在调用：检查 `onBeforeUnmount` 是否清除了定时器和订阅；
- 登录后立即关闭却没有保存：必须先等待 `account.poll` 返回成功，再调用 `context.close()`；
- 摘要里出现 Cookie：只返回 `publicAccount()`，不要直接返回 `session`。

下一节：[把账号歌单放进澜音现有“歌单”页 →](./native-library)
