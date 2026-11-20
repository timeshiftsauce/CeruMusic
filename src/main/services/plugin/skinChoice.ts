import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import { PLAYER_REGIONS } from '@shiqianjiang/ceru-plugin-sdk'
import type { SkinChoice, RegionChoice, SkinPreferences, RegionEdit } from '@common/pluginSkin'
import { acceptsSkinValue, skinFields, skinScalar, skinSettingKey, type SkinSettingEdit, type SkinValues } from '@common/pluginSkin'
export type { SkinChoice } from '@common/pluginSkin'
const idValid = (id: unknown) => typeof id === 'string' && /^[\w.:-]{1,128}$/.test(id)
function validRegion(value: unknown): value is RegionChoice {
  const choice = value as RegionChoice | null
  return !!choice && idValid(choice.pluginId) && idValid(choice.view)
}
function valid(value: unknown): value is SkinChoice {
  if (!value || typeof value !== 'object') return false
  const choice = value as SkinChoice
  return idValid(choice.pluginId) && idValid(choice.skinId)
}
export function loadSkinPreferences(file: string): SkinPreferences {
  const state: SkinPreferences = { selected:null, overrides:{} }
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (data.version !== 1) return state
    if (valid(data.selected)) state.selected = { pluginId:data.selected.pluginId, skinId:data.selected.skinId }
    if (Array.isArray(data.settings)) {
      for (const item of data.settings.slice(0,256)) {
        if (!valid(item) || !('values' in item) || !item.values || typeof item.values !== 'object' || Array.isArray(item.values)) continue
        const values:SkinValues = {}
        for (const [key,value] of Object.entries(item.values).slice(0,64)) if (skinSettingKey(key) && skinScalar(value)) values[key] = value
        if (Object.keys(values).length) (state.settings ??= []).push({pluginId:item.pluginId,skinId:item.skinId,values})
      }
    }
    for (const name of PLAYER_REGIONS) {
      const choice = data.overrides?.[name]
      if (choice === null) state.overrides[name] = null
      else if (validRegion(choice)) state.overrides[name] = {pluginId:choice.pluginId, view:choice.view}
    }
  } catch {}
  return state
}
export const loadSkinChoice = (file:string) => loadSkinPreferences(file).selected
function writePreferences(file: string, state: SkinPreferences) {
  mkdirSync(dirname(file), { recursive: true })
  const document = {version:1, selected:state.selected, ...(Object.keys(state.overrides).length ? {overrides:state.overrides} : {}), ...(state.settings?.length ? {settings:state.settings} : {})}
  writeFileSync(file + '.tmp', JSON.stringify(document), { mode: 0o600 })
  renameSync(file + '.tmp', file)
}
export function saveRegionChoice(file: string, edit: RegionEdit): SkinPreferences {
  if (!PLAYER_REGIONS.includes(edit?.name) || (edit.choice !== null && edit.choice !== 'inherit' && !validRegion(edit.choice))) throw Error('无效的区域选择')
  const state = loadSkinPreferences(file)
  if (edit.choice === 'inherit') delete state.overrides[edit.name]
  else state.overrides[edit.name] = edit.choice && {pluginId:edit.choice.pluginId, view:edit.choice.view}
  writePreferences(file, state)
  return state
}
export function saveSkinChoice(file: string, choice: SkinChoice | null) {
  if (choice !== null && !valid(choice)) throw Error('无效的播放器皮肤')
  const selected = choice && { pluginId: choice.pluginId, skinId: choice.skinId }
  writePreferences(file, {...loadSkinPreferences(file),selected, overrides:{}})
  return selected
}
export function saveSkinSetting(file:string, edit:SkinSettingEdit, schema:unknown): SkinPreferences {
  if (!valid(edit)) throw Error('无效的播放器皮肤')
  const field = skinFields(schema).find(item => item.key === edit.key)
  if (!field || (edit.value !== null && !acceptsSkinValue(field,edit.value))) throw Error('皮肤设置值无效')
  const state = loadSkinPreferences(file)
  const entries = state.settings ?? []
  const index = entries.findIndex(item => item.pluginId === edit.pluginId && item.skinId === edit.skinId)
  const values = { ...(entries[index]?.values ?? {}) }
  if (edit.value === null) delete values[edit.key]
  else values[edit.key] = edit.value
  if (index >= 0) entries.splice(index,1)
  if (Object.keys(values).length) {
    if (entries.length >= 256 || Object.keys(values).length > 64) throw Error('皮肤设置数量已达上限')
    entries.push({pluginId:edit.pluginId,skinId:edit.skinId,values})
  }
  if (entries.length) state.settings = entries
  else delete state.settings
  writePreferences(file,state)
  return state
}
