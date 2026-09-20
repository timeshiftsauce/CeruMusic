import type { JsonObject } from '@shiqianjiang/ceru-plugin-sdk'

export type DrawerPlacement = 'left' | 'right' | 'top' | 'bottom'
export interface PluginDrawerField {
  type: 'text-input' | 'password' | 'number' | 'toggle' | 'select' | 'text'
  bind: string
  label?: string
  placeholder?: string
  description?: string
  required?: boolean
  options?: { label: string; value: string }[]
}
export interface PluginDrawerButton {
  type: 'button'
  label: string
  action: string
  input?: JsonObject
  requires?: string
}
export interface PluginDrawerSchema {
  schemaVersion: '1.0'
  presentation: {
    kind: 'drawer'
    placement?: DrawerPlacement
    size?: number
    openOnFirstUse?: boolean
    /** Declared action invoked when the user closes the drawer (e.g. cancel login polling). */
    closeAction?: string
    openAction?: string
  }
  root: {
    type: 'form'
    title: string
    submitAction: string
    submitLabel?: string
    submitInput?: JsonObject
    children: (PluginDrawerField | PluginDrawerButton)[]
  }
}
export interface PluginSchemaDrawerSession {
  kind?: 'schema'
  sessionId: string
  pluginId: string
  surfaceId: string
  schema: PluginDrawerSchema
  state: JsonObject
}
export interface PluginWebDrawerSession {
  kind: 'web'
  sessionId: string
  pluginId: string
  surfaceId: string
  title: string
  presentation: Omit<PluginDrawerSchema['presentation'], 'kind'> & { kind: 'drawer' | 'modal' }
  html: string
  init: JsonObject
  state: JsonObject
}
export interface PluginNativeSession
  extends Omit<PluginWebDrawerSession, 'kind' | 'html' | 'init'> {
  kind: 'native'
  renderAction: string
}
export type PluginVisibleSession = PluginWebDrawerSession | PluginNativeSession
export type PluginDrawerSession = PluginSchemaDrawerSession | PluginVisibleSession

const object = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const safeKey = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[a-zA-Z][\w.-]{0,127}$/.test(value) &&
  !['__proto__', 'constructor', 'prototype'].includes(value)

/** Drawer documents contain data only. Actions must already be declared by the plugin. */
export function readDrawerSchema(value: unknown, actions: string[]): PluginDrawerSchema {
  const invalid = () => {
    throw new Error('插件抽屉配置无效')
  }
  if (!object(value) || JSON.stringify(value).length > 64 * 1024) return invalid()
  if (value.schemaVersion !== '1.0' || value.presentation?.kind !== 'drawer') return invalid()
  const { presentation, root } = value
  if (
    presentation.placement !== undefined &&
    !['left', 'right', 'top', 'bottom'].includes(presentation.placement)
  )
    return invalid()
  if (
    presentation.size !== undefined &&
    (!Number.isFinite(presentation.size) || presentation.size < 280 || presentation.size > 1200)
  )
    return invalid()
  if (presentation.openOnFirstUse !== undefined && typeof presentation.openOnFirstUse !== 'boolean')
    return invalid()
  if (presentation.closeAction !== undefined && !actions.includes(presentation.closeAction))
    return invalid()
  if (presentation.openAction !== undefined && !actions.includes(presentation.openAction))
    return invalid()
  if (
    !object(root) ||
    root.type !== 'form' ||
    typeof root.title !== 'string' ||
    root.title.length > 100 ||
    !actions.includes(root.submitAction)
  )
    return invalid()
  if (!Array.isArray(root.children) || root.children.length > 64) return invalid()
  if (root.submitInput !== undefined && !object(root.submitInput)) return invalid()
  const bindings = new Set<string>()
  for (const node of root.children) {
    if (!object(node)) return invalid()
    for (const key of ['label', 'placeholder', 'description']) {
      if (node[key] !== undefined && (typeof node[key] !== 'string' || node[key].length > 2000))
        return invalid()
    }
    if (node.type === 'button') {
      if (!actions.includes(node.action) || typeof node.label !== 'string') return invalid()
      if (node.input !== undefined && !object(node.input)) return invalid()
      if (node.requires !== undefined && !safeKey(node.requires)) return invalid()
      continue
    }
    if (
      !['text-input', 'password', 'number', 'toggle', 'select', 'text'].includes(node.type) ||
      !safeKey(node.bind)
    )
      return invalid()
    if (bindings.has(node.bind)) return invalid()
    bindings.add(node.bind)
    if (node.required !== undefined && typeof node.required !== 'boolean') return invalid()
    if (
      node.type === 'select' &&
      (!Array.isArray(node.options) ||
        !node.options.length ||
        node.options.length > 100 ||
        node.options.some(
          (option) =>
            !object(option) || typeof option.label !== 'string' || typeof option.value !== 'string'
        ))
    )
      return invalid()
  }
  return value as PluginDrawerSchema
}

export function drawerAction(schema: PluginDrawerSchema, index: number, values: unknown) {
  if (!object(values) || JSON.stringify(values).length > 64 * 1024)
    throw new Error('插件表单内容无效')
  const root = schema.root
  const button = index === -1 ? undefined : root.children[index]
  if (index !== -1 && button?.type !== 'button') throw new Error('插件未声明此抽屉操作')
  const input: JsonObject = {}
  for (const field of root.children) {
    if (field.type === 'button' || field.type === 'text') continue
    const value = values[field.bind]
    if (
      index === -1 &&
      field.required &&
      (value === undefined || value === null || String(value).trim() === '')
    )
      throw new Error('请填写' + (field.label || field.bind))
    if (value === undefined) continue
    if (
      field.type === 'toggle'
        ? typeof value !== 'boolean'
        : field.type === 'number'
          ? !Number.isFinite(value)
          : typeof value !== 'string' || value.length > 8192
    )
      throw new Error('字段格式无效: ' + (field.label || field.bind))
    if (field.type === 'select' && !field.options?.some((option) => option.value === value))
      throw new Error('请选择有效的' + (field.label || field.bind))
    input[field.bind] = value
  }
  return {
    action: button?.type === 'button' ? button.action : root.submitAction,
    input: { ...input, ...(button?.type === 'button' ? button.input : root.submitInput) }
  }
}

export function drawerState(schema: PluginDrawerSchema, state: JsonObject): JsonObject {
  const copy = { ...state }
  for (const field of schema.root.children) {
    if (field.type === 'password') delete copy[field.bind]
  }
  return copy
}
