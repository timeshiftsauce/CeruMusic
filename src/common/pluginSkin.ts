import type { PlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'

export type SkinChoice = { pluginId: string; skinId: string }
export type RegionChoice = { pluginId: string; view: string }
export type SkinScalar = string | number | boolean
export type SkinValues = Record<string, SkinScalar>
export type SkinSettingEdit = SkinChoice & { key:string; value:SkinScalar | null }
export type SkinPreferences = { selected: SkinChoice | null; overrides: Partial<Record<PlayerRegion, RegionChoice | null>>; settings?: (SkinChoice & { values:SkinValues })[] }
export type RegionEdit = { name: PlayerRegion; choice: RegionChoice | null | 'inherit' }

export interface SkinField {
  key:string
  title:string
  kind:'color' | 'boolean' | 'number' | 'integer' | 'string'
  options?: SkinScalar[]
  initial?: SkinScalar
  minimum?: number
  maximum?: number
  minLength?: number
  maxLength?: number
}
const object = (value:unknown): value is Record<string,unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
export const skinSettingKey = (key:string) => /^[A-Za-z][\w.-]{0,63}$/.test(key) && !['prototype','constructor','__proto__'].includes(key)
export const skinScalar = (value:unknown): value is SkinScalar => typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value)) || (typeof value === 'string' && value.length <= 1024)
export function acceptsSkinValue(field:SkinField, value:unknown): value is SkinScalar {
  if (!skinScalar(value) || (field.options && !field.options.includes(value))) return false
  if (field.kind === 'boolean') return typeof value === 'boolean'
  if (field.kind === 'number' || field.kind === 'integer') return typeof value === 'number' && (field.kind !== 'integer' || Number.isSafeInteger(value)) && value >= (field.minimum ?? -Infinity) && value <= (field.maximum ?? Infinity)
  return typeof value === 'string' && value.length >= (field.minLength ?? 0) && value.length <= (field.maxLength ?? 1024) && (field.kind !== 'color' || /^#[0-9a-f]{6}$/i.test(value))
}
export function skinFields(schema:unknown): SkinField[] {
  if (!object(schema) || schema.type !== 'object' || !object(schema.properties)) return []
  const fields:SkinField[] = []
  for (const [key,entry] of Object.entries(schema.properties)) {
    if (fields.length >= 64) break
    if (!skinSettingKey(key) || !object(entry)) continue
    const kind = entry.type === 'string' && entry.format === 'color' ? 'color' : entry.type
    if (kind !== 'boolean' && kind !== 'integer' && kind !== 'number' && kind !== 'string' && kind !== 'color') continue
    if (Object.keys(entry).some(name => !['type','title','description','format','default','enum','minimum','maximum','minLength','maxLength'].includes(name))) continue
    if (entry.format !== undefined && kind !== 'color') continue
    const field:SkinField = {key,kind,title:typeof entry.title === 'string' && entry.title.trim() ? entry.title.slice(0,128) : key}
    for (const bound of ['minimum','maximum','minLength','maxLength'] as const) if (typeof entry[bound] === 'number' && Number.isFinite(entry[bound])) field[bound] = entry[bound]
    if (entry.enum !== undefined) {
      if (!Array.isArray(entry.enum) || !entry.enum.length || entry.enum.length > 64 || !entry.enum.every(value => acceptsSkinValue(field,value))) continue
      field.options = [...new Set(entry.enum)]
    }
    if (acceptsSkinValue(field,entry.default)) field.initial = entry.default
    fields.push(field)
  }
  return fields
}
export function effectiveSkinSettings(fields: readonly SkinField[], values?: SkinValues): SkinValues {
  const result: SkinValues = {}
  for (const field of fields) {
    const value = values?.[field.key]
    if (acceptsSkinValue(field,value)) result[field.key] = value
    else if (field.initial !== undefined) result[field.key] = field.initial
  }
  return result
}
