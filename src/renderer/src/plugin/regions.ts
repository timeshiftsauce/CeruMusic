import { computed, shallowRef } from 'vue'
import { parsePlayerRegion, type PlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'
import { activePluginContributions } from '@renderer/services/pluginState'
import { desktopBridge } from '@renderer/services/desktopBridge'
import { effectiveSkinSettings, skinFields, type RegionEdit, type SkinPreferences, type SkinSettingEdit } from '@common/pluginSkin'

type Choice = { pluginId: string; skinId: string }
export const selectedSkin = shallowRef<Choice | null>(null)
export const overrides = shallowRef<SkinPreferences['overrides']>({})
const storedSettings = shallowRef<NonNullable<SkinPreferences['settings']>>([])
const failed = shallowRef(new Set<string>())
type HealthNotice = {name:PlayerRegion; pluginId:string; reason:'warning'|'performance'|'error'}
export const regionNotices = shallowRef<HealthNotice[]>([])
export function clearWarning(name:PlayerRegion, pluginId:string) {
  if (regionNotices.value.some(item => item.name === name && item.pluginId === pluginId && item.reason === 'warning'))
    regionNotices.value = regionNotices.value.filter(item => item.name !== name || item.pluginId !== pluginId || item.reason !== 'warning')
}
function notice(entry:HealthNotice) {
  regionNotices.value = [...regionNotices.value.filter(item => item.name !== entry.name), entry]
}
export function regionHealth(pluginId:string,name:PlayerRegion,state:'warning'|'recovered'|'fallback') {
  if (state === 'recovered') clearWarning(name,pluginId)
  else if (state === 'fallback') regionFailed(pluginId,name,'performance')
  else if (regionView(name)?.pluginId === pluginId) notice({pluginId,name,reason:'warning'})
}
let revision = 0
function apply(state: SkinPreferences) {
  selectedSkin.value = state.selected
  overrides.value = state.overrides
  storedSettings.value = state.settings ?? []
}
export async function restoreSkin() {
  const started = revision
  const saved = await desktopBridge.api.plugins.skinChoice()
  if (started === revision) apply(saved)
}
export async function selectSkin(choice: Choice | null) {
  const started = ++revision
  const saved = await desktopBridge.api.plugins.skinChoice(choice)
  if (started === revision) { apply(saved); failed.value = new Set(); regionNotices.value = [] }
}
export async function selectRegion(edit: RegionEdit) {
  const started = ++revision
  const saved = await desktopBridge.api.plugins.regionChoice(edit)
  if (started === revision) {
    apply(saved)
    regionNotices.value = regionNotices.value.filter(item => item.name !== edit.name)
    failed.value = new Set([...failed.value].filter(key => !key.endsWith('/' + edit.name)))
  }
}
export const regionOptions = computed(() => activePluginContributions.value.flatMap(({pluginId, descriptor}) => {
  if (descriptor.runtime !== 3) return []
  return descriptor.regions.flatMap((entry: { region:string; view:string }) => {
    const contract = parsePlayerRegion(entry.region)
    if (!contract || contract.version !== 1) return []
    return [{ name:contract.name, pluginId:String(pluginId), view:entry.view, title:String(descriptor.name) }]
  })
}))
export const skinOptions = computed(() => activePluginContributions.value.flatMap(({pluginId, descriptor, skinPreviewUrls}) =>
  descriptor.runtime === 3 ? descriptor.skins.map((skin: {id:string;title:string;regions:string[];settings?:unknown}) => ({pluginId, skinId:skin.id, title:skin.title, previewUrl:skinPreviewUrls?.[skin.id], regions:skin.regions, fields:skinFields(skin.settings), descriptor})) : []))
export const activeSkin = computed(() => skinOptions.value.find(item => item.pluginId === selectedSkin.value?.pluginId && item.skinId === selectedSkin.value?.skinId))
export function canLeaveRegion(name: PlayerRegion, pluginId: string, view: string) {
  return !failed.value.has(pluginId + '/' + name) && regionOptions.value.some(option => option.name === name && option.pluginId === pluginId && option.view === view)
}
export const activeValues = computed(() => {
  const skin = activeSkin.value
  if (!skin) return {}
  return effectiveSkinSettings(skin.fields, storedSettings.value.find(item => item.pluginId === skin.pluginId && item.skinId === skin.skinId)?.values)
})
export async function editSkinSetting(edit:SkinSettingEdit) {
  const started = ++revision
  const saved = await desktopBridge.api.plugins.skinSetting(edit)
  if (started === revision) apply(saved)
}
export function settingsForRegion(name:PlayerRegion, pluginId:string, view:string) {
  const skin = activeSkin.value
  if (!skin || skin.pluginId !== pluginId) return {}
  const matches = skin.descriptor.regions.some((item:{region:string;view:string}) => {
    const contract = parsePlayerRegion(item.region)
    return item.view === view && contract?.name === name && contract.version === 1 && skin.regions.includes(item.region)
  })
  return matches ? activeValues.value : {}
}
export function regionView(name: PlayerRegion) {
  if (Object.hasOwn(overrides.value, name)) {
    const selected = overrides.value[name]
    if (!selected || failed.value.has(selected.pluginId + '/' + name)) return null
    return regionOptions.value.find(item => item.name === name && item.pluginId === selected.pluginId && item.view === selected.view) ?? null
  }
  const choice = selectedSkin.value
  const skin = skinOptions.value.find(item => item.pluginId === choice?.pluginId && item.skinId === choice?.skinId)
  if (!skin || failed.value.has(skin.pluginId + '/' + name)) return null
  const declaration = skin.descriptor.regions.find((item: {region:string;view:string}) => {
    const contract = parsePlayerRegion(item.region)
    return contract?.name === name && contract.version === 1 && skin.regions.includes(item.region)
  })
  return declaration ? {pluginId:skin.pluginId, view:String(declaration.view)} : null
}
export function regionFailed(pluginId: string, name: PlayerRegion, reason:'error'|'performance' = 'error') {
  failed.value = new Set([...failed.value, pluginId + '/' + name])
  notice({pluginId,name,reason})
}
