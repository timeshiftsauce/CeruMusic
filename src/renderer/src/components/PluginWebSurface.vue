<template>
  <div class="plugin-web-surface">
    <iframe
      v-if="!stopped"
      ref="frame"
      :name="'ceru-plugin-surface-' + session.sessionId"
      :srcdoc="session.html"
      sandbox="allow-scripts"
      :title="session.title"
      @load="send('init', session.init)"
    />
    <p v-if="failure" class="surface-error" role="alert">{{ failure }}</p>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import type { PluginWebDrawerSession } from '@common/pluginDrawer'
const props = defineProps<{ session: PluginWebDrawerSession }>()
const emit = defineEmits<{ resize: [height: number] }>()
const frame = ref<HTMLIFrameElement>()
const failure = ref('')
const stopped = ref(false)
let unsubscribe: (() => void) | undefined
let active = false
let disposed = false
let inFlight = 0
function send(type: string, data: unknown) {
  if (!disposed)
    frame.value?.contentWindow?.postMessage(
      JSON.parse(JSON.stringify({ type, data, generation: props.session.sessionId })),
      '*'
    )
}
async function receive(event: MessageEvent) {
  if (event.source !== frame.value?.contentWindow || !event.data || typeof event.data !== 'object')
    return
  const { type, data, generation } = event.data
  if (type === 'ready') {
    send('init', props.session.init)
    return
  }
  if (generation !== props.session.sessionId) return
  if (type === 'resize' && active) {
    if (typeof data?.height === 'number' && Number.isFinite(data.height) && data.height > 0)
      emit('resize', Math.min(10000, Math.ceil(data.height)))
    return
  }
  if (type === 'close-view' && active) {
    await window.api.plugins.closeDrawer(
      props.session.pluginId,
      props.session.surfaceId,
      props.session.sessionId
    )
    return
  }
  if (type === 'active') {
    if (active) return
    active = true
    send('state', props.session.state)
    try {
      const state = await window.api.plugins.surfaceReady(
        props.session.pluginId,
        props.session.surfaceId,
        props.session.sessionId
      )
      send('state', state)
    } catch (error: any) {
      if (!disposed) failure.value = error.message || '插件页面初始化失败'
    }
    return
  }
  if (type === 'failed') {
    failure.value = String(data?.message || '插件页面加载失败').slice(0, 500)
    return
  }
  if (type !== 'rpc' || typeof data?.id !== 'string') return
  if (
    data.method !== 'surface.invoke' ||
    inFlight >= 32 ||
    JSON.stringify(data).length > 128 * 1024
  ) {
    send('rpc-result', { id: data.id, error: '插件页面请求无效或过于频繁' })
    return
  }
  inFlight++
  try {
    const value = await window.api.plugins.surfaceAction(
      props.session.pluginId,
      props.session.surfaceId,
      props.session.sessionId,
      data.data?.action,
      data.data?.input ?? {}
    )
    send('rpc-result', { id: data.id, value })
  } catch (error: any) {
    send('rpc-result', { id: data.id, error: error.message || '插件调用失败' })
  } finally {
    inFlight--
  }
}
watch(
  () => props.session.state,
  (state) => {
    if (active) send('state', state)
  }
)
onMounted(() => {
  window.addEventListener('message', receive)
  unsubscribe = window.api.plugins.onSurfaceState((event) => {
    if (event.pluginId !== props.session.pluginId || event.sessionId !== props.session.sessionId)
      return
    if (event.closed) {
      send('dispose', {})
      stopped.value = true
      failure.value = '插件页面已关闭'
    } else if (active) send('state', event.state)
  })
})
onBeforeUnmount(() => {
  send('dispose', {})
  disposed = true
  unsubscribe?.()
  window.removeEventListener('message', receive)
})
</script>

<style scoped>
.plugin-web-surface {
  position: relative;
  height: 100%;
  min-height: 0;
}
iframe {
  display: block;
  border: 0;
  width: 100%;
  height: 100%;
  background: transparent;
}
.surface-error {
  position: absolute;
  inset: 12px 16px auto;
  padding: 12px;
  background: var(--td-error-color-1);
  color: var(--td-error-color);
  border-radius: 8px;
}
</style>
