import * as fs from 'fs'
import * as path from 'path'
import { getAppDirPath } from '../../utils/path'

const CONFIG_DIR = 'plugins/config'

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
}
