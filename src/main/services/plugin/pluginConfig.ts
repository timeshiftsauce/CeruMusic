import * as fs from 'fs'
import * as path from 'path'
import { getAppDirPath } from '../../utils/path'

const CONFIG_DIR = 'plugins/config'
const PERMISSION_DIR = 'plugins/permissions'
const STATE_FILE = 'plugins/state.json'

export interface PluginRuntimeState {
  enabled: boolean
  order: number
}

function getConfigDir(): string {
  return path.join(getAppDirPath(), CONFIG_DIR)
}

function getConfigFilePath(pluginId: string): string {
  return path.join(getConfigDir(), `${pluginId}.json`)
}

function ensureConfigDir(): void {
  const dir = getConfigDir()
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
}

function getPermissionFilePath(pluginId: string): string {
  return path.join(getAppDirPath(), PERMISSION_DIR, `${pluginId}.json`)
}

function ensurePermissionDir(): void {
  const dir = path.join(getAppDirPath(), PERMISSION_DIR)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

export function getPluginPermissions(pluginId: string): string[] {
  const filePath = getPermissionFilePath(pluginId)
  if (!fs.existsSync(filePath)) return []
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function savePluginPermissions(pluginId: string, permissions: string[]): void {
  ensurePermissionDir()
  const filePath = getPermissionFilePath(pluginId)
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify([...new Set(permissions)], null, 2))
  fs.renameSync(tempPath, filePath)
}

export function deletePluginPermissions(pluginId: string): void {
  const filePath = getPermissionFilePath(pluginId)
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath)
}

function getStateFilePath(): string {
  return path.join(getAppDirPath(), STATE_FILE)
}

export function getPluginStates(): Record<string, PluginRuntimeState> {
  const filePath = getStateFilePath()
  if (!fs.existsSync(filePath)) return {}
  try {
    const value = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    return Object.fromEntries(
      Object.entries(value ?? {}).filter(
        ([, state]: any) =>
          typeof state?.enabled === 'boolean' && Number.isFinite(Number(state?.order))
      )
    ) as Record<string, PluginRuntimeState>
  } catch {
    return {}
  }
}

export function savePluginState(pluginId: string, state: PluginRuntimeState): void {
  const filePath = getStateFilePath()
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const values = getPluginStates()
  values[pluginId] = state
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(values, null, 2))
  fs.renameSync(tempPath, filePath)
}

export function deletePluginState(pluginId: string): void {
  const filePath = getStateFilePath()
  const values = getPluginStates()
  if (!Object.hasOwn(values, pluginId)) return
  delete values[pluginId]
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(values, null, 2))
  fs.renameSync(tempPath, filePath)
}

/**
 * 获取插件的用户配置
 */
export function getPluginConfig(pluginId: string): Record<string, any> {
  const filePath = getConfigFilePath(pluginId)
  if (!fs.existsSync(filePath)) {
    return {}
  }
  try {
    const content = fs.readFileSync(filePath, 'utf-8')
    return JSON.parse(content)
  } catch {
    return {}
  }
}

/**
 * 保存插件的用户配置
 */
export function savePluginConfig(pluginId: string, config: Record<string, any>): void {
  ensureConfigDir()
  const filePath = getConfigFilePath(pluginId)
  const tempPath = `${filePath}.tmp`
  fs.writeFileSync(tempPath, JSON.stringify(config, null, 2))
  fs.renameSync(tempPath, filePath)
}

/**
 * 删除插件的用户配置
 */
export function deletePluginConfig(pluginId: string): void {
  const filePath = getConfigFilePath(pluginId)
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath)
  }
  deletePluginPermissions(pluginId)
  const uiFilePath = getConfigFilePath(pluginId + '.ui')
  if (fs.existsSync(uiFilePath)) fs.unlinkSync(uiFilePath)
}
