<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import type { JsonObject, JsonValue, SurfaceContext } from '@shiqianjiang/ceru-plugin-sdk'

const props = defineProps<{ context: SurfaceContext }>()
const state = reactive({ count: 0, activeSeconds: 0, status: '正在连接...' })
const busy = ref(false)
const error = ref('')
let stopState: (() => void) | undefined

function applyState(value: JsonValue) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return
  const next = value as JsonObject
  if (typeof next.count === 'number') state.count = next.count
  if (typeof next.activeSeconds === 'number') state.activeSeconds = next.activeSeconds
  if (typeof next.status === 'string') state.status = next.status
}

async function run(action: 'counter.increment' | 'counter.reset' | 'counter.read') {
  busy.value = true
  error.value = ''
  try {
    const result = await props.context.invoke(action, {})
    applyState(result)
  } catch (reason) {
    error.value = reason instanceof Error ? reason.message : String(reason)
  } finally {
    busy.value = false
  }
}

onMounted(async () => {
  stopState = props.context.subscribe(applyState)
  await run('counter.read')
})

onBeforeUnmount(() => stopState?.())
</script>

<template>
  <main>
    <p class="status">{{ state.status }}</p>
    <h1>持久计数器</h1>
    <p class="count">{{ state.count }}</p>
    <p class="session">本次页面已打开 {{ state.activeSeconds }} 秒</p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="actions">
      <button type="button" class="primary" :disabled="busy" @click="run('counter.increment')">
        加一
      </button>
      <button type="button" :disabled="busy || state.count === 0" @click="run('counter.reset')">
        重置
      </button>
    </div>
  </main>
</template>

<style scoped>
:global(*) {
  box-sizing: border-box;
}
:global(body) {
  margin: 0;
  background: #f4f7f5;
  color: #1d2922;
}
main {
  width: 100%;
  padding: 28px;
  font: 15px/1.5 system-ui, sans-serif;
}
.status,
.session {
  margin: 0;
  color: #5a675f;
}
h1 {
  margin: 8px 0 18px;
  font-size: 24px;
}
.count {
  margin: 0;
  font-size: 64px;
  font-weight: 700;
  line-height: 1;
  color: #207447;
}
.session {
  margin-top: 12px;
}
.actions {
  display: flex;
  gap: 8px;
  margin-top: 24px;
}
button {
  min-width: 84px;
  padding: 9px 15px;
  border: 1px solid #bdc8c0;
  border-radius: 7px;
  background: #fff;
  color: inherit;
  font: inherit;
  cursor: pointer;
}
button.primary {
  border-color: #207447;
  background: #207447;
  color: #fff;
}
button:disabled {
  cursor: default;
  opacity: 0.55;
}
.error {
  color: #b42318;
}
@media (prefers-color-scheme: dark) {
  :global(body) {
    background: #19211c;
    color: #edf4ef;
  }
  .status,
  .session {
    color: #aebbb2;
  }
  .count {
    color: #69c58d;
  }
  button {
    border-color: #435047;
    background: #222c26;
  }
  button.primary {
    border-color: #55ad78;
    background: #55ad78;
    color: #102016;
  }
}
</style>
