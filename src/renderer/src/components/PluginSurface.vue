<template>
  <div class="plugin-surface" :class="{ embedded }">
    <PluginNativeSurface
      v-if="session?.kind === 'native'"
      :key="session.sessionId"
      :session="session"
      :embedded="embedded"
      :heading="heading"
    />
    <PluginViewSurface
      v-else-if="session?.kind === 'web'"
      :key="session.sessionId"
      :session="session"
      @mounted="elapsed => slotName && recordSlotMount(pluginId, elapsed)"
    />
    <div v-else-if="error" class="surface-status" role="alert">
      <p>{{ error }}</p>
      <TButton variant="outline" @click="reload++">重试</TButton>
    </div>
    <div v-else class="surface-status" role="status">正在加载插件页面…</div>
  </div>
</template>

<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { ref, shallowRef, watch, onMounted, onBeforeUnmount } from 'vue'
import type { PluginVisibleSession } from '@common/pluginDrawer'
import PluginViewSurface from './PluginViewSurface.vue'
import type { PlaylistSectionContext } from '@common/pluginPlaylistContext'
import PluginNativeSurface from './PluginNativeSurface.vue'

import { acquireSlot, recordSlotMount } from '@renderer/services/pluginSlotPolicy'
const props = defineProps<{ pluginId: string; surfaceId: string; embedded?: boolean; heading?: string; slotName?: string; sectionContext?: PlaylistSectionContext }>()
const session = shallowRef<PluginVisibleSession>()
const error = ref('')
const reload = ref(0)
let closing: Promise<unknown> = Promise.resolve()
let unsubscribe: (() => void) | undefined
onMounted(() => {
  unsubscribe = desktopBridge.api.plugins.onChanged((change) => {
    if (change?.pluginId === props.pluginId && (change.type === 'updated' ||
        (change.type === 'views-updated' && change.views?.includes(props.surfaceId)))) reload.value++
  })
})
onBeforeUnmount(() => unsubscribe?.())
watch(
  [() => props.pluginId, () => props.surfaceId, () => props.slotName, () => props.sectionContext, reload],
  async ([pluginId, surfaceId], _old, onCleanup) => {
    let cancelled = false
    let release: (() => void) | undefined
    let mounted: PluginVisibleSession | undefined
    const close = (value: PluginVisibleSession) =>
      desktopBridge.api.plugins
        .closeDrawer(value.pluginId, value.surfaceId, value.sessionId)
        .catch(() => {})
    onCleanup(() => {
      cancelled = true
      release?.()
      if (mounted) closing = close(mounted)
    })
    session.value = undefined
    error.value = ''
    try {
      await closing
      if (cancelled) return
      if (props.slotName) {
        release = acquireSlot(String(pluginId),props.slotName)
        if (!release) throw Error('插件槽位已暂停或实例数达到上限')
      }
      const section = props.sectionContext && JSON.parse(JSON.stringify(props.sectionContext))
      mounted = await desktopBridge.api.plugins.mountSurface(String(pluginId), String(surfaceId), props.slotName, section)
      if (cancelled) {
        closing = close(mounted)
        return
      }
      session.value = mounted
    } catch (reason: any) {
      release?.()
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
