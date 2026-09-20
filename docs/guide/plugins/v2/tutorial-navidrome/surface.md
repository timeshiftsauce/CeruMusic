---
pageClass: plugin-v2-doc
title: 3. 完成 Vue 连接页
description: 用 invoke、返回值和状态订阅连接后台，并正确清理页面轮询。
prev:
  text: 连接、认证与保存
  link: /guide/plugins/v2/tutorial-navidrome/connection
next:
  text: 搜索、播放与歌词
  link: /guide/plugins/v2/tutorial-navidrome/provider
---

# 3. 完成 Vue 连接页

本节继续使用已经能连接模拟服务的工程。Vue 页面只负责显示和输入，通过 `SurfaceContext` 调用上一节的后台动作。

## 1. 挂载 Vue

用下面内容完整替换 `src/view.ts`：

```ts [src/view.ts]
import { createApp } from 'vue'
import { defineSurface } from '@shiqianjiang/ceru-plugin-sdk'
import App from './App.vue'

export default defineSurface((ctx) => {
  const app = createApp(App, { context: ctx })
  app.mount(ctx.root)
  return () => app.unmount()
})
```

返回的清理函数会在页面关闭时卸载 Vue，组件的 `onBeforeUnmount` 随之执行。

## 2. 编写连接页面

用下面内容完整替换 `src/App.vue`：

```vue [src/App.vue]
<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { JsonObject, JsonValue, SurfaceContext } from '@shiqianjiang/ceru-plugin-sdk'

const props = defineProps<{ context: SurfaceContext }>()
const form = reactive({
  serverUrl: 'http://127.0.0.1:4533',
  username: 'demo',
  password: '',
  remember: false,
  allowLocal: true
})
const state = reactive({ connected: false, status: '正在读取连接状态...' })
const busy = ref(false)
const error = ref('')
let stopState: (() => void) | undefined
let poll: ReturnType<typeof setInterval> | undefined

function applyState(value: JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const next = value as JsonObject
  state.connected = next.connected === true
  if (typeof next.status === 'string') state.status = next.status
  if (typeof next.serverUrl === 'string' && next.serverUrl) form.serverUrl = next.serverUrl
  if (typeof next.username === 'string' && next.username) form.username = next.username
  form.remember = next.remember === true
  form.allowLocal = next.allowLocal !== false
}

async function run(action: string, input: JsonValue = null) {
  busy.value = true
  error.value = ''
  try {
    const result = await props.context.invoke(action, input)
    applyState(result)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

async function save() {
  await run('connection.save', { ...form })
  form.password = ''
}

async function logout() {
  await run('connection.logout')
  form.password = ''
}

onMounted(async () => {
  stopState = props.context.subscribe(applyState)
  await run('connection.read')
  poll = setInterval(() => {
    if (state.connected && !busy.value) void run('connection.ping')
  }, 30_000)
})

onBeforeUnmount(() => {
  stopState?.()
  if (poll) clearInterval(poll)
})
</script>

<template>
  <main>
    <header>
      <p>Navidrome</p>
      <h1>连接音乐库</h1>
    </header>

    <div class="status" :class="{ online: state.connected }">
      <span aria-hidden="true"></span>{{ state.status }}
    </div>

    <section class="form">
      <label>服务器地址<input v-model.trim="form.serverUrl" type="url" required /></label>
      <label>用户名<input v-model.trim="form.username" autocomplete="username" required /></label>
      <label>
        密码
        <input
          v-model="form.password"
          type="password"
          autocomplete="current-password"
          :placeholder="state.connected ? '重新连接时输入' : '请输入密码'"
          required
        />
      </label>
      <label class="check"><input v-model="form.allowLocal" type="checkbox" />允许本机或局域网</label>
      <label class="check"><input v-model="form.remember" type="checkbox" />记住登录令牌</label>
      <p v-if="error" class="error" role="alert">{{ error }}</p>
      <div class="actions">
        <button type="button" class="primary" :disabled="busy" @click="save">
          {{ busy ? '处理中...' : '验证并保存' }}
        </button>
        <button type="button" :disabled="busy || !state.connected" @click="run('connection.ping')">
          测试连接
        </button>
        <button type="button" :disabled="busy || !state.connected" @click="logout">断开</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}
:global(body) {
  margin: 0;
  background: #f5f7f5;
  color: #1c2b22;
}
main {
  width: 100%;
  padding: 28px;
  font: 15px/1.55 system-ui, sans-serif;
}
header {
  margin-bottom: 20px;
}
header p {
  margin: 0;
  color: #32764a;
  font-size: 13px;
  font-weight: 700;
}
h1 {
  margin: 4px 0 0;
  font-size: 26px;
}
.status {
  display: flex;
  align-items: center;
  gap: 9px;
  margin-bottom: 18px;
  padding: 11px 13px;
  border-radius: 7px;
  background: #e8ece9;
}
.status span {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #8a938d;
}
.status.online span {
  background: #2b9a51;
}
.form {
  display: grid;
  gap: 14px;
}
label {
  display: grid;
  gap: 6px;
  font-weight: 650;
}
input[type='url'],
input[type='text'],
input[type='password'] {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #cad2cc;
  border-radius: 7px;
  background: #fff;
  color: inherit;
  font: inherit;
}
input:focus {
  outline: 2px solid #4b9b68;
  outline-offset: 1px;
}
.check {
  grid-template-columns: 18px 1fr;
  align-items: center;
  gap: 9px;
  font-weight: 500;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
button {
  padding: 9px 15px;
  border: 1px solid #c6cec8;
  border-radius: 7px;
  background: #fff;
  color: inherit;
  cursor: pointer;
}
button.primary {
  border-color: #2e7d4a;
  background: #2e7d4a;
  color: #fff;
}
button:disabled {
  cursor: default;
  opacity: 0.55;
}
.error {
  margin: 0;
  color: #b32727;
}
@media (prefers-color-scheme: dark) {
  :global(body) {
    background: #172019;
    color: #eef5ef;
  }
  .status {
    background: #253028;
  }
  input[type='url'],
  input[type='text'],
  input[type='password'],
  button {
    border-color: #425047;
    background: #202a23;
    color: #eef5ef;
  }
  button.primary {
    border-color: #4d9e69;
    background: #4d9e69;
    color: #102016;
  }
}
</style>
```

页面挂载时先订阅公开状态，再调用 `connection.read`。这两条数据通路作用不同：

| 通路 | 本页用途 |
| --- | --- |
| `invoke()` 返回值 | 立即得到登录、测试或断开的结果 |
| `setState()` → `subscribe()` | 接收后台发布的最新连接状态 |
| Storage | 跨工作台或澜音重启恢复记住的连接 |

页面每 30 秒主动调用一次 `connection.ping`。轮询由 Vue 创建，所以在 `onBeforeUnmount` 中清理；后台无需为此声明空的 `closeAction`。页面也不使用 `100vh`，抽屉高度由宿主和内容共同决定。

## 3. 在工作台运行

```shell
npm run dev
```

点击 `connection · web`，输入模拟账号：

```text
地址：http://127.0.0.1:4533
用户名：demo
密码：demo
```

点击“验证并保存”后应显示 `已连接 · 0.54.5-mock`，密码框清空。“测试连接”应改为“连接正常”，点击“断开”后按钮重新禁用。

常见错误：

- 页面一直显示“正在读取连接状态”：检查 `view.ts` 是否把 `context` 传给 `App.vue`；
- 提示动作未声明：核对 Manifest、`context.invoke()` 与 `ctx.actions.register()` 的字符串；
- 关闭重开后轮询重复：确认清理函数调用 `clearInterval(poll)`；
- 页面出现大片空白：检查是否仍保留模板中的 `height: 100vh` 或 `min-height: 100vh`。

下一节：[加入搜索、播放和歌词 Provider →](./provider)
