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
