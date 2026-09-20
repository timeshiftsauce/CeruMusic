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
      // 等后台动作完成并发布公开状态后，再关闭当前 modal。
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

async function simulateScan() {
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
      <div>
        <h1>连接演示音乐账号</h1>
        <p class="muted">本地演示账号</p>
      </div>
    </header>

    <p v-if="error" class="error" role="alert">{{ error }}</p>

    <section v-if="!account.signedIn">
      <div class="qr" aria-label="演示二维码图案">
        <i v-for="(dark, index) in cells" :key="index" :class="{ dark }" />
      </div>
      <strong>{{ statusText }}</strong>
      <div class="actions">
        <button class="primary" :disabled="busy || status === 'scanned'" @click="simulateScan">
          确认登录
        </button>
        <button :disabled="busy || status === 'scanned'" @click="startLogin">重新获取</button>
        <button @click="cancel">取消</button>
      </div>
    </section>

    <section v-else>
      <img
        v-if="account.avatarUrl"
        class="avatar"
        :src="String(account.avatarUrl)"
        alt="账号头像"
      />
      <h2>{{ account.displayName }}</h2>
      <p class="muted">登录已完成，账号菜单和原生音乐页会同步刷新。</p>
      <button class="primary done" @click="cancel">完成</button>
    </section>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}
:global(body) {
  margin: 0;
  background: #f8f8fb;
  color: #26242c;
}
main {
  width: 100%;
  padding: 18px;
  font:
    14px/1.55 system-ui,
    'Microsoft YaHei',
    sans-serif;
}
header {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 14px;
}
h1,
h2,
p {
  margin: 0;
}
h1 {
  font-size: 20px;
  letter-spacing: 0;
}
.logo {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  border-radius: 6px;
  color: white;
  font-size: 25px;
  background: #366a58;
}
section {
  border: 1px solid #e7e5ee;
  border-radius: 6px;
  background: white;
}
section {
  padding: 16px;
  text-align: center;
}
.qr {
  display: grid;
  grid-template-columns: repeat(11, 11px);
  width: fit-content;
  margin: 0 auto 15px;
  padding: 13px;
  border: 1px solid #ddd9e8;
  border-radius: 4px;
  background: white;
}
.qr i {
  width: 11px;
  height: 11px;
  background: white;
}
.qr i.dark {
  background: #24212b;
}
.muted {
  margin-top: 6px;
  color: #777181;
}
.actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 9px;
  margin-top: 18px;
}
button {
  padding: 9px 14px;
  border: 1px solid #ddd9e8;
  border-radius: 5px;
  background: white;
  color: inherit;
  cursor: pointer;
}
button.primary {
  border-color: #366a58;
  color: white;
  background: #366a58;
}
button:disabled {
  opacity: 0.55;
  cursor: wait;
}
.error {
  margin-bottom: 14px;
  color: #b42336;
}
.avatar {
  width: 72px;
  height: 72px;
  margin-bottom: 10px;
  border-radius: 50%;
}
.done {
  margin-top: 18px;
}
@media (prefers-color-scheme: dark) {
  :global(body) {
    background: #17161b;
    color: #f3f0f5;
  }
  section {
    border-color: #39353f;
    background: #211f26;
  }
  button {
    border-color: #46414d;
    background: #29262f;
    color: inherit;
  }
}
</style>
