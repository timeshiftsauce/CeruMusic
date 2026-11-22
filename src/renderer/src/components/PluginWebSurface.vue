<template>
  <div ref="home" class="plugin-web-surface">
    <iframe
      v-if="!stopped"
      ref="frame"
      :class="{ 'component-frame': session.init.viewKind === 'component' }"
      :name="'ceru-plugin-surface-' + session.sessionId"
      :srcdoc="session.html"
      sandbox="allow-scripts"
      :title="session.title"
      @load="!initSent && send('init', session.init)"
    />
    <Teleport to="body">
      <section v-if="expanded" class="component-overlay-shell" :style="{ top: topInset + 'px' }" role="dialog" :aria-label="session.title">
        <header><span>插件 · {{ session.title }}</span><button type="button" aria-label="关闭插件弹层" title="关闭插件弹层" @click="dismissOverlay"><t-icon name="close" /></button></header>
        <div ref="destination" class="component-overlay-content" />
      </section>
    </Teleport>
    <p v-if="failure" class="surface-error" role="alert">{{ failure }}</p>
    <p v-else-if="stopped" class="surface-error" role="status">插件页面已关闭</p>
  </div>
</template>

<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { nextTick, onDeactivated, onMounted, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import type { PluginWebDrawerSession } from '@common/pluginDrawer'
import { componentTheme, watchComponentTheme } from '@renderer/plugin/componentTheme'
import { surfaceThemeTokens, watchSurfaceTheme } from '@renderer/plugin/surfaceTheme'
import { computed, inject } from 'vue'
import { skinSimulatorKey } from '@renderer/plugin/skinSimulator'
import { regionTrackIdentity } from '@renderer/plugin/regionTrack'
const props = defineProps<{ session: PluginWebDrawerSession; regionData?: Record<string,unknown>; positionMs?: number; playing?: boolean; skipEntryMotion?: boolean }>()
const emit = defineEmits<{ resize: [height: number]; mounted: [elapsed:number]; failed: [message:string]; health: [state:'warning'|'recovered'|'fallback'] }>()
const simulator = inject(skinSimulatorKey, null)
const hostTrack = inject(regionTrackIdentity, null)
const previewTheme = computed(() => props.regionData && simulator?.active.value ? simulator.theme.value : null)
const surfaceTheme = () => previewTheme.value ?? componentTheme()
watch(previewTheme, () => { if (active) send('component-theme', surfaceTheme()) })
const frame = ref<HTMLIFrameElement>()
const home = ref<HTMLElement>(), destination = ref<HTMLElement>()
const expanded = ref(false), topInset = ref(48)
type Movable = HTMLElement & { moveBefore?: (node: Node, reference: Node | null) => void }
function restoreOverlay() {
  if (!expanded.value) return
  const container = home.value as Movable | undefined
  if (container?.isConnected && frame.value && frame.value.parentNode !== container) container.moveBefore?.(frame.value, container.firstChild)
  expanded.value = false
  if (!disposed) send('component-overlay-state', false)
}
function dismissOverlay() {
  send('component-overlay-state', 'dismiss')
  restoreOverlay()
}
async function openOverlay() {
  const guest = frame.value
  if (expanded.value || !guest || document.activeElement !== guest || !navigator.userActivation.isActive || document.querySelector('.component-overlay-shell')) return
  if (typeof (home.value as Movable)?.moveBefore !== 'function') return
  const bounds = guest.getBoundingClientRect()
  if (!bounds.width || !bounds.height) return
  topInset.value = Math.max(48, ...Array.from(document.querySelectorAll('[data-app-titlebar]'), el => el.getBoundingClientRect().bottom).filter(bottom => bottom > 0 && bottom < innerHeight / 2))
  expanded.value = true
  await nextTick()
  if (disposed || stopped.value || !expanded.value || !destination.value?.isConnected) return restoreOverlay()
  try {
    ;(destination.value as Movable).moveBefore!(guest, null)
    guest.focus({ preventScroll: true })
    send('component-overlay-state', true)
  } catch { restoreOverlay() }
}
const failure = ref('')
const stopped = ref(false)
let unsubscribe: (() => void) | undefined
let stopTheme: (() => void) | undefined
let stopTokens: (() => void) | undefined
let initSent = false
let active = false
let disposed = false
function updateRegionActivity() {
  if (!props.regionData) return
  send('region-active', !document.hidden && document.hasFocus())
  if (!document.hidden && document.hasFocus()) updateRegion(true)
}
function deliverSpectrum(data: Float32Array) {
  const mount = props.session.init.mount as { kind?: string; name?: string } | undefined
  if (active && !disposed && !stopped.value && mount?.kind === 'region' && ['player.stage','player.visualizer','player.background'].includes(mount.name ?? ''))
    frame.value?.contentWindow?.postMessage({type:'region-spectrum',generation:props.session.sessionId,data}, '*')
}
let transitionId = 0
let pendingTransition: { id: number; finish(): void } | undefined
function transition(phase: 'onEnter' | 'onLeave', reason: 'skin' | 'track') {
  pendingTransition?.finish()
  if (!active || disposed || stopped.value || !props.regionData || document.hidden || matchMedia('(prefers-reduced-motion: reduce)').matches) return Promise.resolve()
  const id = ++transitionId
  return new Promise<void>(resolve => {
    const finish = () => { clearTimeout(timer); if (pendingTransition?.id === id) pendingTransition = undefined; resolve() }
    const timer = window.setTimeout(finish, 600)
    pendingTransition = { id, finish }
    send('region-transition', { id, phase, reason })
  })
}
defineExpose({ deliverSpectrum, transition })
let inFlight = 0
let lastTime = 0, lastTick = 0, lastPlaying = false
function updateRegion(content = false) {
  if (!active || stopped.value || !props.regionData) return
  const positionMs = Math.max(0, Number(props.positionMs) || 0), now = performance.now(), playing = !!props.playing
  if (!content && playing === lastPlaying && Math.abs(positionMs - lastTime - (playing ? now - lastTick : 0)) < 150 && (now - lastTick < 2000 || !playing)) return
  send('region-update', { positionMs, playing, ...(content ? { content: props.regionData } : {}) })
  lastTick = now; lastTime = positionMs; lastPlaying = playing
}
const trackIdentity = () => {
  const track = props.regionData?.track as {title?:string; artists?:string[]; album?:string} | null
  return hostTrack ? hostTrack.value : (track ? JSON.stringify([track.title, track.artists, track.album]) : null)
}
let trackVersion = 0, switchingTrack = false, shownTrack: unknown
watch([() => props.regionData, trackIdentity], async () => {
  if (!active || stopped.value || disposed) return
  const next = trackIdentity()
  if (shownTrack === next && !switchingTrack) { updateRegion(true); return }
  if (switchingTrack) return
  switchingTrack = true
  const version = ++trackVersion
  await transition('onLeave','track')
  if (disposed || stopped.value || version !== trackVersion) return
  shownTrack = trackIdentity()
  switchingTrack = false
  updateRegion(true)
  void transition('onEnter','track')
})
watch([() => props.positionMs, () => props.playing], () => updateRegion())
watch(failure, message => { if (message) emit('failed', message) })
function send(type: string, data: unknown) {
  const guest = frame.value?.contentWindow
  if (disposed || !guest) return
  let payload
  if (type === 'init') {
    initSent = true
    const initial = toRaw(props.session.init), mount = initial.mount
    payload = {
      ...initial, surfaceTheme: surfaceThemeTokens(),
      ...(initial.viewKind === 'component' ? { theme: surfaceTheme() } : {}),
      ...(mount && typeof mount === 'object' && !Array.isArray(mount) && mount.kind === 'region' && props.regionData ? {
        mount: { ...mount, initial: { positionMs: Math.max(0, Number(props.positionMs) || 0), playing: !!props.playing, active: !document.hidden && document.hasFocus(), content: JSON.parse(JSON.stringify(props.regionData)) } }
      } : {})
    }
  } else payload = JSON.parse(JSON.stringify(data ?? null))
  guest.postMessage({type, data:payload, generation:props.session.sessionId}, '*')
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
  if (type === 'region-transition-done') {
    if (pendingTransition && pendingTransition.id === data?.id) pendingTransition.finish()
    return
  }
  if (type === 'region-health') {
    if (active && !stopped.value && props.regionData && (data === 'warning' || data === 'recovered' || data === 'fallback')) emit('health',data)
    return
  }
  if (type === 'region-seek') {
    const mount = props.session.init.mount as {kind?:string;name?:string} | undefined
    if (!active || stopped.value || mount?.kind !== 'region' || !props.regionData || !['player.lyrics','player.stage'].includes(mount.name ?? '') || !Number.isSafeInteger(data?.id)) return
    let ok = false
    if (document.activeElement === frame.value && navigator.userActivation.isActive && Number.isFinite(data.milliseconds) && data.milliseconds >= 0 && inFlight === 0) {
      inFlight++
      try {
        if (simulator?.active.value) { simulator.seek(data.milliseconds); ok = true }
        else {
          const { seekTo } = await import('@renderer/utils/audio/globaPlayList')
          if (!disposed && !stopped.value && !simulator?.active.value) { await seekTo(data.milliseconds / 1000); ok = true }
        }
      } catch {} finally { inFlight-- }
    }
    send('region-seek-result', { id:data.id, ok })
    return
  }
  if (type === 'component-overlay' && active && !stopped.value && props.session.init.viewKind === 'component') {
    if (data === true) await openOverlay()
    else if (data === false) restoreOverlay()
    return
  }
  if (type === 'resize' && active && !expanded.value) {
    if (typeof data?.height === 'number' && Number.isFinite(data.height) && data.height > 0)
      emit('resize', Math.min(10000, Math.ceil(data.height)))
    return
  }
  if (type === 'close-view' && active) {
    await desktopBridge.api.plugins.closeDrawer(
      props.session.pluginId,
      props.session.surfaceId,
      props.session.sessionId
    )
    return
  }
  if (type === 'active') {
    if (active) return
    active = true
    updateRegionActivity()
    shownTrack = trackIdentity()
    updateRegion(true)
    if (!props.skipEntryMotion) void transition('onEnter','skin')
    if (props.session.init.viewKind === 'component') send('component-theme', surfaceTheme())
    send('surface-theme', surfaceThemeTokens())
    if (typeof data?.mountMs === 'number' && Number.isFinite(data.mountMs) && data.mountMs >= 0) {
      emit('mounted', data.mountMs)
    }
    send('state', props.session.state)
    try {
      const state = await desktopBridge.api.plugins.surfaceReady(
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
    const value = await desktopBridge.api.plugins.surfaceAction(
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
  window.addEventListener('focus', updateRegionActivity)
  window.addEventListener('blur', updateRegionActivity)
  document.addEventListener('visibilitychange', updateRegionActivity)
  if (props.session.init.viewKind === 'component')
    stopTheme = watchComponentTheme(() => { if (active) send('component-theme', surfaceTheme()) })
  stopTokens = watchSurfaceTheme(() => { if (active) send('surface-theme', surfaceThemeTokens()) })
  unsubscribe = desktopBridge.api.plugins.onSurfaceState((event) => {
    if (event.pluginId !== props.session.pluginId || event.sessionId !== props.session.sessionId)
      return
    if (event.closed) {
      trackVersion++
      pendingTransition?.finish()
      restoreOverlay()
      send('dispose', {})
      stopped.value = true
    } else if (active) send('state', event.state)
  })
})
onDeactivated(restoreOverlay)
onBeforeUnmount(() => {
  trackVersion++
  pendingTransition?.finish()
  restoreOverlay()
  send('dispose', {})
  disposed = true
  unsubscribe?.()
  stopTheme?.()
  stopTokens?.()
  window.removeEventListener('message', receive)
  window.removeEventListener('focus', updateRegionActivity)
  window.removeEventListener('blur', updateRegionActivity)
  document.removeEventListener('visibilitychange', updateRegionActivity)
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
html[data-theme='dark'] .component-frame {
  color-scheme: dark;
}
html[data-theme='light'] .component-frame {
  color-scheme: light;
}
.component-overlay-shell {
  position: fixed; inset: 48px 0 0; z-index: 1601; display: grid; grid-template-rows: 36px minmax(0, 1fr);
  background: var(--td-bg-color-container); color: var(--td-text-color-primary);
}
.component-overlay-shell header { display: flex; align-items: center; justify-content: space-between; padding-inline: 16px; border-bottom: 1px solid var(--td-component-stroke); font-size: 13px; }
.component-overlay-shell button { display: grid; place-items: center; width: 30px; height: 28px; border: none; border-radius: 4px; background: transparent; color: inherit; cursor: pointer; }
.component-overlay-shell button:hover { background: var(--td-bg-color-container-hover); }
.component-overlay-content { min-height: 0; }
.surface-error {
  position: absolute;
  inset: 12px 16px auto;
  padding: 12px;
  background: var(--td-error-color-1);
  color: var(--td-error-color);
  border-radius: 8px;
}
</style>
