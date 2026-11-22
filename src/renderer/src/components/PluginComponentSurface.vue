<template>
  <div class="plugin-component-surface" :data-component-instance="session.sessionId">
    <div ref="host" class="component-root" />
    <p v-if="failure" class="component-error" role="alert">{{ failure }}</p>
    <p v-else-if="stopped" class="component-error" role="status">插件页面已关闭</p>
  </div>
</template>

<script setup lang="ts">
import * as vue from 'vue'
import * as tdesign from 'tdesign-vue-next'
import * as sdk from '@shiqianjiang/ceru-plugin-sdk/vue'
import { HOST_ICON_NAMES, type MountedRegion, type PlayerRegion, type JsonObject } from '@shiqianjiang/ceru-plugin-sdk'
import type { ViewBridge, ViewEntry } from '@shiqianjiang/ceru-plugin-sdk/view-bridge'
import { createHostComponents, createRegionTransition, bindRegionActivity } from '@shiqianjiang/ceru-plugin-core/component-runtime'
import { pluginComponentSheet } from '@renderer/plugin/componentStyles'
import type { PluginWebDrawerSession } from '@common/pluginDrawer'
import { desktopBridge } from '@renderer/services/desktopBridge'
import * as desktopComponents from '@renderer/plugin/desktopComponents'
import { componentTheme, watchComponentTheme } from '@renderer/plugin/componentTheme'
import { subscribeComponentFrames } from '@renderer/plugin/componentFrames'
import { skinSimulatorKey } from '@renderer/plugin/skinSimulator'
import { regionTrackIdentity } from '@renderer/plugin/regionTrack'
import { regionClock } from '@renderer/plugin/regionClock'

const props = defineProps<{ session: PluginWebDrawerSession; regionData?: Record<string, any>; positionMs?: number; playing?: boolean; skipEntryMotion?: boolean }>()
const emit = defineEmits<{ resize: [height: number]; mounted: [elapsed: number]; failed: [message: string]; health: [state: 'warning' | 'recovered' | 'fallback'] }>()
const host = vue.ref<HTMLElement>()
const failure = vue.ref(''), stopped = vue.ref(false)
const state = vue.shallowRef<JsonObject>({})
const theme = vue.ref<'light' | 'dark'>('light')
const active = vue.shallowRef(!document.hidden && document.hasFocus())
const simulator = vue.inject(skinSimulatorKey, null)
const hostTrack = vue.inject(regionTrackIdentity, null)
const clock = vue.inject(regionClock, null)
const spectrum = vue.shallowRef<Float32Array<ArrayBufferLike>>(new Float32Array(128))
const size = vue.shallowRef<Readonly<{ width: number; height: number }>>(Object.freeze({ width: 0, height: 0 }))
let disposed = false, mounted = false, calls = 0
let lastGesture = -Infinity
let root: ShadowRoot | undefined, overlayHost: HTMLElement | undefined
let transitionRunner: ReturnType<typeof createRegionTransition> | undefined
let frames: ReturnType<typeof subscribeComponentFrames> | undefined
const cleanups = new Set<() => void>()
const callbacks = new Set<(time: number) => void>()
const clean = (callback: () => void) => { if (disposed) callback(); else cleanups.add(callback) }
function freezeJson<T>(input: T): T {
  if (input && typeof input === 'object' && !Object.isFrozen(input)) {
    for (const value of Object.values(input)) freezeJson(value)
    Object.freeze(input)
  }
  return input
}
function dispose() {
  if (disposed) return
  disposed = true; mounted = false
  transitionRunner?.dispose(); frames?.dispose(); callbacks.clear()
  for (const callback of [...cleanups].reverse()) { try { callback() } catch {} }
  cleanups.clear(); overlayHost?.remove(); root?.replaceChildren()
}
function failed(error: unknown) {
  if (disposed) return
  failure.value = String(error instanceof Error ? error.message : error).slice(0, 500)
  emit('failed', failure.value); dispose()
}
function updateActivity() { active.value = !document.hidden && document.hasFocus(); frames?.wake() }
const directTime = vue.computed(() => Math.max(0, props.positionMs || 0))
const directPlaying = vue.computed(() => !!props.playing)
const content = vue.computed(() => props.regionData ? vue.readonly(props.regionData) : {})
function createRegion(): MountedRegion | undefined {
  const mount = props.session.init.mount as { kind?: string; name?: PlayerRegion; version?: number } | undefined
  if (mount?.kind !== 'region' || mount.version !== 1 || !mount.name) return
  const name = mount.name
  const regionProps: Record<string, any> = {
    get currentTime() { return simulator?.active.value ? vue.readonly(simulator.time) : clock?.currentTime ?? directTime },
    get playing() { return simulator?.active.value ? vue.readonly(simulator.playing) : clock?.playing ?? directPlaying },
    get track() { return content.value.track ?? null },
    get layout() { return content.value.layout ?? 'cover' },
    get palette() { return content.value.palette ?? defaults },
    get forward() { return content.value.forward ?? empty }
  }
  if (name === 'player.lyrics' || name === 'player.stage') Object.defineProperty(regionProps, 'lines', { get: () => content.value.lines ?? [] })
  if (['player.artwork', 'player.background', 'player.stage'].includes(name)) Object.defineProperty(regionProps, 'artwork', { get: () => content.value.artwork ?? null })
  if (['player.visualizer', 'player.background', 'player.stage'].includes(name)) Object.defineProperty(regionProps, 'spectrum', { get: () => spectrum.value })
  if (name === 'desktopLyric') Object.defineProperties(regionProps, {
    locked: { value: vue.computed(() => content.value.locked === true) },
    current: { get: () => content.value.current ?? null }, next: { get: () => content.value.next ?? null }
  })
  const region = Object.freeze({
    name, version: 1, size: vue.readonly(size), props: Object.freeze(regionProps),
    get settings() { return content.value.settings ?? empty },
    actions: name === 'player.lyrics' || name === 'player.stage' ? Object.freeze({ seek }) : empty,
    onFrame(callback: (time: number) => void) {
      if (disposed) throw Error('Region is closed')
      callbacks.add(callback); frames?.wake()
      return () => { callbacks.delete(callback) }
    }
  }) as unknown as MountedRegion
  clean(bindRegionActivity(region, active))
  frames = subscribeComponentFrames({
    active: () => !disposed && mounted && active.value && (directPlaying.value || callbacks.size > 0),
    run: time => { for (const callback of callbacks) callback(time) },
    layout: () => { host.value?.getBoundingClientRect() },
    health: status => { if (name !== 'desktopLyric') emit('health', status) },
    failed
  })
  return region
}
const defaults = Object.freeze({ accent: '#47867a', foreground: '#232323', background: '#f7f7f7' })
const empty = Object.freeze({})
async function seek(milliseconds: number) {
  if (disposed || !mounted || !Number.isFinite(milliseconds) || milliseconds < 0 || !navigator.userActivation.isActive || performance.now() - lastGesture > 1000 || calls) throw Error('Player seek was not applied')
  calls++
  try {
    if (simulator?.active.value) simulator.seek(milliseconds)
    else {
      const { seekTo } = await import('@renderer/utils/audio/globaPlayList')
      if (disposed) throw Error('Region is closed')
      await seekTo(milliseconds / 1000)
    }
  } finally { calls-- }
}
function deliverSpectrum(data: Float32Array) {
  // The analyser's original buffer is shared by every direct region, without copying.
  if (!disposed) spectrum.value = data
}
function transition(phase: 'onEnter' | 'onLeave', reason: 'skin' | 'track') {
  return disposed ? Promise.resolve() : transitionRunner?.run(phase, reason) ?? Promise.resolve()
}
vue.watch(directPlaying, () => frames?.wake())
vue.watch(() => props.session.state, value => { state.value = freezeJson(structuredClone(vue.toRaw(value))) })
const identity = () => hostTrack?.value ?? props.regionData?.track
let change = 0
vue.watch(identity, async () => {
  if (!mounted || disposed) return
  const version = ++change
  await transition('onLeave', 'track')
  if (!disposed && version === change) await transition('onEnter', 'track')
})
vue.onMounted(async () => {
  try {
    if (!host.value || !props.session.componentSource) throw Error('Missing verified component source')
    root = host.value.attachShadow({ mode: props.session.init.inspectComponent === true ? 'open' : 'closed' })
    const gesture = (event: Event) => { if (event.isTrusted) lastGesture = performance.now() }
    root.addEventListener('pointerdown', gesture, true); root.addEventListener('keydown', gesture, true)
    clean(() => { root?.removeEventListener('pointerdown', gesture, true); root?.removeEventListener('keydown', gesture, true) })
    const sheet = pluginComponentSheet()
    root.adoptedStyleSheets = [sheet]
    overlayHost = document.createElement('div')
    overlayHost.className = 'plugin-component-overlay'
    overlayHost.dataset.componentInstance = props.session.sessionId
    document.body.append(overlayHost)
    const overlayRoot = overlayHost.attachShadow({ mode: 'closed' })
    overlayRoot.adoptedStyleSheets = [sheet]
    const overlay = document.createElement('div')
    overlayRoot.append(overlay)
    const syncTheme = () => {
      theme.value = simulator?.active.value ? simulator.theme.value : componentTheme() ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
      for (const element of [host.value, overlayHost]) {
        element?.setAttribute('theme-mode', theme.value)
        if (element) element.style.colorScheme = theme.value
      }
    }
    syncTheme(); clean(watchComponentTheme(syncTheme)); clean(vue.watch(() => simulator?.theme.value, syncTheme))
    window.addEventListener('focus', updateActivity); window.addEventListener('blur', updateActivity)
    document.addEventListener('visibilitychange', updateActivity)
    clean(() => { window.removeEventListener('focus', updateActivity); window.removeEventListener('blur', updateActivity); document.removeEventListener('visibilitychange', updateActivity) })
    const observer = new ResizeObserver(entries => {
      const rect = entries[0]?.contentRect
      if (!rect || disposed) return
      size.value = Object.freeze({ width: rect.width, height: rect.height })
      emit('resize', Math.min(10000, Math.ceil(rect.height)))
    })
    observer.observe(host.value); clean(() => observer.disconnect())
    state.value = freezeJson(structuredClone(vue.toRaw(props.session.state)))
    const region = createRegion()
    const icons = (props.session.init.catalog as any)?.icons ?? {}
    const iconUrl = (name: string) => {
      const value = icons[name]
      return typeof value === 'string' ? 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(value) : ''
    }
    const invoke: ViewBridge['invoke'] = async (action, input) => {
      if (disposed || calls >= 32 || JSON.stringify(input ?? {}).length > 128 * 1024) throw Error('插件页面请求无效或过于频繁')
      calls++
      try {
        const value = await desktopBridge.api.plugins.surfaceAction(props.session.pluginId, props.session.surfaceId, props.session.sessionId, action, input ?? {})
        if (disposed) throw Error('插件页面已关闭')
        return value as any
      } finally { calls-- }
    }
    const bridge = Object.freeze({
      root, viewId: props.session.surfaceId, instanceId: props.session.sessionId,
      props: freezeJson(structuredClone(vue.toRaw((props.session.init.mount as any)?.props ?? {}))),
      state: vue.readonly(state), theme: vue.readonly(theme), overlay,
      ...(region ? { region } : {}),
      components: createHostComponents(iconUrl, invoke, region, desktopComponents),
      icons: Object.freeze({ url: (name: typeof HOST_ICON_NAMES[number]) => iconUrl(name) }), invoke,
      close: () => desktopBridge.api.plugins.closeDrawer(props.session.pluginId, props.session.surfaceId, props.session.sessionId),
      onDispose: clean
    }) as unknown as ViewBridge
    const url = URL.createObjectURL(new Blob([props.session.componentSource], { type: 'text/javascript' }))
    let factory: (deps: unknown) => ViewEntry
    try { factory = (await import(/* @vite-ignore */ url)).default }
    finally { URL.revokeObjectURL(url) }
    if (disposed) return
    const began = performance.now()
    const entry = factory({ vue, tdesign: { ...tdesign, Dialog: sdk.ViewDialog }, sdk })
    const cleanup = await entry(bridge)
    if (cleanup) clean(cleanup)
    if (disposed) return
    if (region) transitionRunner = createRegionTransition(root, entry)
    mounted = true; frames?.wake()
    emit('mounted', performance.now() - began)
    if (!props.skipEntryMotion) void transition('onEnter', 'skin').catch(failed)
    clean(desktopBridge.api.plugins.onSurfaceState(event => {
      if (event.pluginId !== props.session.pluginId || event.sessionId !== props.session.sessionId) return
      if (event.closed) { stopped.value = true; dispose() }
      else state.value = freezeJson(structuredClone(vue.toRaw(event.state ?? {})))
    }))
    const ready = await desktopBridge.api.plugins.surfaceReady(props.session.pluginId, props.session.surfaceId, props.session.sessionId)
    if (!disposed) state.value = freezeJson(structuredClone(vue.toRaw(ready)))
  } catch (error) { failed(error) }
})
vue.onBeforeUnmount(dispose)
defineExpose({ deliverSpectrum, transition })
</script>

<style scoped>
.plugin-component-surface { position: relative; height: 100%; min-height: 0; }
.component-root { width: 100%; height: 100%; min-height: 0; }
.component-error { position: absolute; inset: 12px 16px auto; padding: 12px; border-radius: 8px; background: var(--td-error-color-1); color: var(--td-error-color); }
</style>
