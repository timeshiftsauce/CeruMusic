<template>
  <div class="plugin-surface" :class="{ embedded }">
    <PluginNativeSurface
      v-if="session?.kind === 'native'"
      :key="session.sessionId"
      :session="session"
      :embedded="embedded"
    />
    <PluginWebSurface
      v-else-if="session?.kind === 'web'"
      :key="session.sessionId"
      :session="session"
    />
    <div v-else-if="error" class="surface-status" role="alert">
      <p>{{ error }}</p>
      <TButton variant="outline" @click="reload++">重试</TButton>
    </div>
    <div v-else class="surface-status" role="status">正在加载插件页面…</div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import type { PluginVisibleSession } from '@common/pluginDrawer'
import PluginWebSurface from './PluginWebSurface.vue'
import PluginNativeSurface from './PluginNativeSurface.vue'

const props = defineProps<{ pluginId: string; surfaceId: string; embedded?: boolean }>()
const session = ref<PluginVisibleSession>()
const error = ref('')
const reload = ref(0)
let closing: Promise<unknown> = Promise.resolve()
let unsubscribe: (() => void) | undefined
onMounted(() => {
  unsubscribe = window.api.plugins.onChanged((change) => {
    if (change?.pluginId === props.pluginId && change.type === 'updated') reload.value++
  })
})
onBeforeUnmount(() => unsubscribe?.())
watch(
  [() => props.pluginId, () => props.surfaceId, reload],
  async ([pluginId, surfaceId], _old, onCleanup) => {
    let cancelled = false
    let mounted: PluginVisibleSession | undefined
    const close = (value: PluginVisibleSession) =>
      window.api.plugins
        .closeDrawer(value.pluginId, value.surfaceId, value.sessionId)
        .catch(() => {})
    onCleanup(() => {
      cancelled = true
      if (mounted) closing = close(mounted)
    })
    session.value = undefined
    error.value = ''
    try {
      await closing
      if (cancelled) return
      mounted = await window.api.plugins.mountSurface(String(pluginId), String(surfaceId))
      if (cancelled) {
        closing = close(mounted)
        return
      }
      session.value = mounted
    } catch (reason: any) {
      if (!cancelled) error.value = reason.message || '插件页面加载失败'
    }
  },
  { immediate: true }
)
</script>

<style scoped>
.plugin-surface {
  height: 100%;
  min-height: 0;
  width: 100%;
}
.surface-status {
  padding: 32px;
  text-align: center;
  color: var(--td-text-color-secondary);
}
.plugin-surface.embedded {
  height: auto;
}
</style>
