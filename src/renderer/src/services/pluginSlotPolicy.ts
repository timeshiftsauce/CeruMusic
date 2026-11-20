import { desktopBridge } from '@renderer/services/desktopBridge'
import { ref } from 'vue'

export const strictPluginViews = ref(true)
export const pausedSlotPlugins = ref(new Set<string>())
const instances = new Map<string, number>()
const slowMounts = new Map<string, number>()
let pending: Promise<void> | undefined
export function loadSlotPolicy() {
  return pending ??= desktopBridge.api.plugins.strictMode().then(value => {strictPluginViews.value = value}).catch(() => {pending = undefined})
}
export async function setStrictPluginViews(value: boolean) {
  await loadSlotPolicy()
  strictPluginViews.value = await desktopBridge.api.plugins.strictMode(value)
}
export function acquireSlot(pluginId:string, slot:string) {
  const key = JSON.stringify([pluginId,slot]), count = instances.get(key) ?? 0
  if (strictPluginViews.value || pausedSlotPlugins.value.has(pluginId) || count >= 200) return
  instances.set(key,count+1)
  let released=false
  return () => { if(released)return; released=true; const left=(instances.get(key) ?? 1)-1; if(left)instances.set(key,left);else instances.delete(key) }
}
export function recordSlotMount(pluginId:string, elapsed:number) {
  const count = elapsed > 50 ? (slowMounts.get(pluginId) ?? 0) + 1 : 0
  slowMounts.set(pluginId,count)
  if (count) console.warn('插件槽位挂载超过 50ms',pluginId,Math.round(elapsed))
  if (count >= 5) pausedSlotPlugins.value.add(pluginId)
}
