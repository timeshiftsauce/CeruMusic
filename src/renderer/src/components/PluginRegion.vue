<template>
  <PluginViewSurface v-if="session" ref="surface" :class="surfaceClass" :key="session.sessionId" :data-region-owner="session.pluginId" :session="session" :region-data="regionContent" :skip-entry-motion="skipEntryMotion" :position-ms="preview ? simulator!.time.value : positionMs" :playing="preview ? simulator!.playing.value : playing" @failed="fallback" @health="reportHealth" />
  <slot v-else />
</template>
<script setup lang="ts">
import { computed, inject, onMounted, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { skinSimulatorKey } from '@renderer/plugin/skinSimulator'
import { MessagePlugin } from '@renderer/plugin/notifications'
import { desktopBridge } from '@renderer/services/desktopBridge'
import type { PluginWebDrawerSession, PluginVisibleSession } from '@common/pluginDrawer'
import type { PlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'
import { canLeaveRegion, clearWarning, regionFailed, regionHealth, regionView, settingsForRegion } from '@renderer/plugin/regions'
import PluginViewSurface from './PluginViewSurface.vue'
import { listenRegionSpectrum } from '@renderer/plugin/spectrum'
const props = defineProps<{ name: PlayerRegion; visible: boolean; content: Record<string,unknown>; positionMs: number; playing: boolean; surfaceClass?: string; audio?: HTMLAudioElement | null }>()
const surface = shallowRef<InstanceType<typeof PluginViewSurface>>()
const simulator = inject(skinSimulatorKey, null)
const preview = computed(() => !!simulator?.active.value)
const target = computed(() => props.visible ? regionView(props.name) : null)
const revision = ref(0)
let lastViewRevision = 0
let unsubscribe: (() => void) | undefined
onMounted(() => {
  unsubscribe = desktopBridge.api.plugins.onChanged(change => {
    if (!change || target.value?.pluginId !== change.pluginId) return
    if (change.type === 'updated') revision.value++
    else if (change.type === 'views-updated' && change.views?.includes(target.value?.view)) {
      lastViewRevision = ++revision.value
    }
  })
})
onBeforeUnmount(() => unsubscribe?.())
const session = shallowRef<PluginWebDrawerSession>()
const skipEntryMotion = ref(false)
const regionContent = computed(() => ({...props.content, settings:session.value ? settingsForRegion(props.name,session.value.pluginId,session.value.surfaceId) : {}}))
function fallback() { if (session.value) regionFailed(session.value.pluginId, props.name) }
function reportHealth(state:'warning'|'recovered'|'fallback') {
  if (!session.value) return
  regionHealth(session.value.pluginId,props.name,state)
  if (state === 'fallback') void MessagePlugin.warning('皮肤区域持续卡顿，已换回默认')
}
watch([surface, () => props.name, () => props.audio, () => props.playing, preview], ([current,name,audio,playing,simulated], _previous, clean) => {
  if (!current) return
  const release = listenRegionSpectrum(name, audio, playing, simulated, current.deliverSpectrum)
  if (release) clean(release)
})
function close(value: PluginVisibleSession) { void desktopBridge.api.plugins.closeDrawer(value.pluginId, value.surfaceId, value.sessionId).catch(() => {}) }
onBeforeUnmount(() => { if (session.value) close(session.value) })
watch([() => target.value?.pluginId, () => target.value?.view, () => props.name, revision], async ([pluginId, view, name], _old, clean) => {
  let stale = false
  let mounted: PluginVisibleSession | undefined
  let cancelLeave: (() => void) | undefined
  clean(() => { stale = true; cancelLeave?.(); if (pluginId) clearWarning(name,pluginId) })
  const previous = session.value
  const sameViewReload = !!previous && previous.pluginId === pluginId && previous.surfaceId === view && _old?.[3] !== revision.value
  let keepPrevious = sameViewReload && lastViewRevision === revision.value
  if (previous && props.visible && canLeaveRegion(name, previous.pluginId, previous.surfaceId) && (previous.pluginId !== pluginId || previous.surfaceId !== view)) {
    let interrupt: () => void = () => {}
    const interrupted = new Promise<void>(resolve => { interrupt = resolve })
    const stop = watch(() => props.visible && canLeaveRegion(name, previous.pluginId, previous.surfaceId), available => { if (!available) interrupt() }, {flush:'sync'})
    cancelLeave = interrupt
    try { await Promise.race([surface.value?.transition('onLeave','skin'), interrupted]) }
    finally { stop() }
    if (stale) return
  }
  if (!keepPrevious) {
    if (previous) close(previous)
    session.value = undefined
  }
  if (!pluginId || !view) return
  try {
    const mount = () => desktopBridge.api.plugins.mountSurface(pluginId, view, undefined, undefined, name)
    try { mounted = await mount() }
    catch (error) {
      if (stale || !keepPrevious || !previous || !String(error).includes('插件页面数量超过限制')) throw error
      keepPrevious = false
      session.value = undefined
      await desktopBridge.api.plugins.closeDrawer(previous.pluginId, previous.surfaceId, previous.sessionId)
      if (stale) return
      mounted = await mount()
    }
    if (stale) { close(mounted); return }
    if (mounted.kind !== 'web') { close(mounted); throw Error('区域不是组件视图') }
    skipEntryMotion.value = sameViewReload
    session.value = mounted
    if (keepPrevious && previous) close(previous)
  } catch { if (!stale) regionFailed(pluginId, name) }
}, { immediate:true })
</script>
