import fs, { Dirent } from 'fs'
import path from 'path'
import fsPromise from 'fs/promises'
import { createHash } from 'crypto'
import { dialog } from 'electron'
import { getAppDirPath } from '../../utils/path'
import axios from 'axios'

import CeruMusicPluginHost from './manager/PluginHost'
import { cancelPluginUI, pluginChanged } from './uiBridge'
import Logger, { getLog } from './logger'
import {
  getPluginConfig,
  savePluginConfig,
  deletePluginConfig,
  getPluginPermissions,
  savePluginPermissions,
  getPluginStates,
  savePluginState,
  deletePluginState,
  type PluginRuntimeState
} from './pluginConfig'
import { readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { GuestStore } from '@shiqianjiang/ceru-plugin-core/guests'
import { deletePluginStorage } from './storage'
import { isRoutablePluginCapability } from '@common/pluginCapabilities'

// 导出类型以解决TypeScript错误

// 存储已加载的插件实例
const loadedPlugins: Record<string, CeruMusicPluginHost> = {}
interface InstalledPlugin {
  pluginId: string
  pluginName: string
  filePath: string
  manifest: any
  state: PluginRuntimeState
  loadError?: string
}
const installedPlugins = new Map<string, InstalledPlugin>()
/** Read/manage persisted children even when their parent runtime is closed. */
async function withStoredGuests<T>(
  pluginId: string,
  work: (store: GuestStore) => Promise<T> | T
): Promise<T> {
  const parent = installedPlugins.get(pluginId)
  if (!parent?.manifest.contributes?.guestAdapters?.length) throw new Error('兼容环境未安装')
  const store = new GuestStore({
    root: path.join(getAppDirPath(), 'plugins', 'guests', pluginId),
    artifact: readPluginArtifact(await fsPromise.readFile(parent.filePath, 'utf8')).artifact,
    approve: async () => false,
    authorize: async () => false,
    request: async () => {
      throw new Error('兼容环境未运行')
    },
    changed: () => pluginChanged(),
    event: () => {}
  })
  try {
    await store.initialize()
    return await work(store)
  } finally {
    store.dispose()
  }
}
let initialized = false
let initialization: Promise<any[]> | undefined
let restoration: Promise<void> | undefined
let activePluginId: string | null = null
const providerOwners = new Map<string, string>()
const capabilityOwners = new Map<string, string>()
const pluginTransitions = new Map<string, Promise<any>>()

/** 全局限流回调，由 main/index.ts 注入 */
let _throttleHandler: ((pluginId: string, reason: string, duration?: number) => void) | null = null
/** 全局禁用回调，由 main/index.ts 注入。插件因崩溃次数过多被永久禁用时触发。 */
let _disabledHandler: ((pluginId: string, reason: string) => void) | null = null

function runtimeEntries(): [string, CeruMusicPluginHost][] {
  return [...installedPlugins.values()]
    .sort((a, b) => a.state.order - b.state.order)
    .flatMap((item) => {
      const host = loadedPlugins[item.pluginId]
      return host && !host.isDisabled()
        ? ([[item.pluginId, host]] as [string, CeruMusicPluginHost][])
        : []
    })
}

function nextPluginOrder(): number {
  return Math.max(-1, ...[...installedPlugins.values()].map((item) => item.state.order)) + 1
}

function clearRuntimeSelections(pluginId: string): void {
  if (activePluginId === pluginId) activePluginId = null
  for (const [source, owner] of providerOwners) {
    if (owner === pluginId) providerOwners.delete(source)
  }
  for (const [capability, owner] of capabilityOwners) {
    if (owner === pluginId) capabilityOwners.delete(capability)
  }
}

function createPluginHost(pluginId: string, pluginCode?: string): CeruMusicPluginHost {
  const host = new CeruMusicPluginHost(pluginCode, new Logger(pluginId))
  host.pluginId = pluginId
  host.resolveStorageOwner = (manifestId) => {
    const matches = [...installedPlugins.values()].filter((item) => item.manifest.id === manifestId)
    if (matches.length > 1) throw new Error('目标插件 ID 不唯一，无法读取共享数据')
    return matches[0]?.pluginId
  }
  host.onThrottle = _throttleHandler
  host.onDisabled = (id, reason) => {
    if (loadedPlugins[id] === host) _disabledHandler?.(id, reason)
  }
  return host
}

const pluginService = {
  /**
   * 设置全局限流处理器（由 main/index.ts 在启动时注入）。
   * 当任意插件调用 stopRequests 时触发。
   */
  setThrottleHandler(handler: (pluginId: string, reason: string, duration?: number) => void) {
    _throttleHandler = handler
    // 同步更新已加载的所有插件 host
    for (const host of Object.values(loadedPlugins) as CeruMusicPluginHost[]) {
      host.onThrottle = handler
    }
  },

  /**
   * 设置全局禁用处理器（由 main/index.ts 在启动时注入）。
   * 当任意插件被永久禁用时触发，通常用于 IPC 通知渲染端 + 弹窗。
   */
  setDisabledHandler(handler: (pluginId: string, reason: string) => void) {
    _disabledHandler = handler
    for (const [pluginId, host] of Object.entries(loadedPlugins)) {
      host.onDisabled = (id, reason) => {
        if (id === pluginId && loadedPlugins[id] === host) handler(id, reason)
      }
    }
  },

  async selectAndAddPlugin(type: 'lx' | 'cr') {
    try {
      // 打开文件选择对话框
      const result = await dialog.showOpenDialog({
        title: `请选择你的 ${type == 'lx' ? '洛雪' : '澜音'} js插件`,
        filters: [
          { name: 'JavaScript 文件', extensions: ['js'] },
          { name: '所有文件', extensions: ['*'] }
        ],
        properties: ['openFile']
      })

      if (result.canceled || !result.filePaths.length) {
        return { canceled: true }
      }

      const filePath = result.filePaths[0]
      const fileName = path.basename(filePath)

      // 读取文件内容
      let pluginCode = await fsPromise.readFile(filePath, 'utf-8')

      // 插件格式校验
      if (type === 'cr') {
        const parsed = readPluginArtifact(pluginCode)
        if (parsed.header.manifest.manifestVersion !== 2)
          throw new Error('澜音插件格式校验失败：只支持 v2 单文件插件')
      } else if (type === 'lx') {
        // 洛雪格式校验：检查是否包含lx关键字
        if (!pluginCode.toLowerCase().includes('lx')) {
          throw new Error('洛雪插件格式校验失败：代码有可能不是标准的洛雪插件')
        }
        throw new Error('请通过 LX 兼容插件安装洛雪音源，澜音仅接收 v2 插件')
      }

      // 调用现有的添加插件方法
      return await this.addPlugin(pluginCode, fileName)
    } catch (error: any) {
      console.error('选择并添加插件失败:', error)
      return { error: error.message || '选择插件文件失败' }
    }
  },

  async addPlugin(pluginCode: string, _pluginName: string, targetPluginId?: string) {
    try {
      // Shared Core performs side-effect-free artifact validation before the
      // executable code is handed to the isolated worker.
      const parsed = readPluginArtifact(pluginCode)
      if (parsed.header.manifest.manifestVersion !== 2) {
        throw new Error('澜音 v2 插件清单版本不受支持')
      }
      const manifest = parsed.header.manifest
      const pluginInfo = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        author: manifest.author || manifest.publisher || '',
        description: manifest.description
      }
      const existing = [...installedPlugins.values()].find(
        (item) => item.manifest.id === manifest.id
      )
      const pluginId =
        existing?.pluginId || createHash('sha256').update(manifest.id).digest('hex').slice(0, 32)
      if (targetPluginId && targetPluginId !== pluginId)
        throw new Error('更新插件的清单 ID 与原插件不一致')
      const oldHost = loadedPlugins[pluginId] as CeruMusicPluginHost | undefined
      if (!existing) {
        deletePluginConfig(pluginId)
        deletePluginConfig(pluginId + '.storage')
      }
      const previousVersion = existing?.manifest.version
      const state = existing?.state ?? { enabled: false, order: nextPluginOrder() }
      const pluginsDir = path.join(getAppDirPath(), 'plugins')
      await fsPromise.mkdir(pluginsDir, { recursive: true })
      const safePluginName = 'plugin.js'
      const filePath = path.join(pluginsDir, pluginId + '-' + safePluginName)
      const tempPath = filePath + '.tmp'
      const backupPath = filePath + '.bak'
      const installedFiles = (await fsPromise.readdir(pluginsDir)).filter((file) =>
        file.startsWith(`${pluginId}-`)
      )
      const previousPath = installedFiles.length
        ? path.join(pluginsDir, installedFiles[0])
        : undefined
      const ceruPluginManager = oldHost ? createPluginHost(pluginId, pluginCode) : undefined
      try {
        await ceruPluginManager?.ensureReady()
        await fsPromise.writeFile(tempPath, pluginCode)
        await fsPromise.unlink(backupPath).catch(() => {})
        if (previousPath) await fsPromise.rename(previousPath, backupPath)
        try {
          await fsPromise.rename(tempPath, filePath)
        } catch (error) {
          if (previousPath) await fsPromise.rename(backupPath, previousPath).catch(() => {})
          throw error
        }
      } catch (error) {
        await ceruPluginManager?.destroy()
        await fsPromise.unlink(tempPath).catch(() => {})
        throw error
      }
      await oldHost?.destroy()
      delete loadedPlugins[pluginId]

      installedPlugins.set(pluginId, {
        pluginId,
        pluginName: safePluginName,
        filePath,
        manifest,
        state
      })
      savePluginState(pluginId, state)
      if (ceruPluginManager) loadedPlugins[pluginId] = ceruPluginManager
      await fsPromise.unlink(backupPath).catch(() => {})
      for (const stale of installedFiles.slice(1)) {
        await fsPromise.unlink(path.join(pluginsDir, stale)).catch(() => {})
      }
      pluginChanged({ type: existing ? 'updated' : 'installed', pluginId })

      return {
        pluginId,
        pluginName: safePluginName,
        pluginInfo,
        supportedSources: ceruPluginManager?.getSupportedSources() ?? {},
        updated: Boolean(existing),
        previousVersion,
        version: pluginInfo.version
      }
    } catch (error: any) {
      console.error('添加插件失败:', error)
      throw new Error(`添加插件失败: ${error.message}`)
    }
  },

  getPluginById(pluginId: string): CeruMusicPluginHost | null {
    if (!Object.hasOwn(loadedPlugins, pluginId)) {
      return null
    }

    return loadedPlugins[pluginId]
  },
  async listGuests(pluginId: string) {
    return (
      this.getPluginById(pluginId)?.listGuests() ??
      withStoredGuests(pluginId, (store) => store.list())
    )
  },
  async selectGuest(pluginId: string, guestId: string | null) {
    if (guestId) await this.setActivePlugin(pluginId)
    const host = this.getPluginById(pluginId)
    if (host) await host.selectGuest(guestId)
    else await withStoredGuests(pluginId, (store) => store.select(null))
  },
  async removeGuest(pluginId: string, guestId: string) {
    const host = this.getPluginById(pluginId)
    if (host) await host.removeGuest(guestId)
    else await withStoredGuests(pluginId, (store) => store.remove(guestId))
  },
  async getGuestPermissions(pluginId: string, guestId: string) {
    return (
      this.getPluginById(pluginId)?.getGuestPermissions(guestId) ??
      withStoredGuests(pluginId, (store) => store.permissions(guestId))
    )
  },
  async setGuestPermissions(pluginId: string, guestId: string, keys: string[]) {
    const host = this.getPluginById(pluginId)
    if (host) await host.setGuestPermissions(guestId, keys)
    else await withStoredGuests(pluginId, (store) => store.setPermissions(guestId, keys))
  },

  async selectAndUpdatePlugin(pluginId: string) {
    const current = installedPlugins.get(pluginId)
    if (!current) throw new Error(`插件 ${pluginId} 未找到`)
    const result = await dialog.showOpenDialog({
      title: `更新 ${current.manifest.name}`,
      filters: [{ name: 'Ceru Music v2 插件', extensions: ['js'] }],
      properties: ['openFile']
    })
    if (result.canceled || !result.filePaths.length) return { canceled: true }
    const filePath = result.filePaths[0]
    return this.addPlugin(
      await fsPromise.readFile(filePath, 'utf-8'),
      path.basename(filePath),
      pluginId
    )
  },

  async setPluginEnabled(pluginId: string, enabled: boolean) {
    const previous = pluginTransitions.get(pluginId) ?? Promise.resolve()
    const transition = previous
      .catch(() => undefined)
      .then(() => pluginService.applyPluginEnabled(pluginId, enabled))
    pluginTransitions.set(pluginId, transition)
    try {
      return await transition
    } finally {
      if (pluginTransitions.get(pluginId) === transition) pluginTransitions.delete(pluginId)
    }
  },

  async applyPluginEnabled(pluginId: string, enabled: boolean) {
    const installed = installedPlugins.get(pluginId)
    if (!installed) throw new Error(`插件 ${pluginId} 未安装`)
    const running = Boolean(loadedPlugins[pluginId]) && !loadedPlugins[pluginId].isDisabled()
    if (installed.state.enabled === enabled && running === enabled)
      return { success: true, enabled }

    if (!enabled) {
      if (activePluginId === pluginId) activePluginId = null
      installed.state.enabled = false
      savePluginState(pluginId, installed.state)
      cancelPluginUI(pluginId)
      const host = loadedPlugins[pluginId]
      delete loadedPlugins[pluginId]
      clearRuntimeSelections(pluginId)
      await host?.destroy().catch((error) => console.warn('停止插件失败:', error))
      pluginChanged({ type: 'state-changed', pluginId, enabled: false })
      return { success: true, enabled: false }
    }

    const host = createPluginHost(pluginId)
    try {
      await host.loadPlugin(installed.filePath, new Logger(pluginId))
      loadedPlugins[pluginId] = host
      installed.state.enabled = true
      installed.loadError = undefined
      savePluginState(pluginId, installed.state)
      pluginChanged({ type: 'state-changed', pluginId, enabled: true })
      return { success: true, enabled: true }
    } catch (error: any) {
      await host.destroy().catch(() => {})
      installed.loadError = error?.message || String(error)
      installed.state.enabled = false
      savePluginState(pluginId, installed.state)
      throw new Error(`启用插件失败: ${installed.loadError}`)
    }
  },

  async setActivePlugin(pluginId: string | null) {
    if (pluginId) await this.setPluginEnabled(pluginId, true)
    activePluginId = pluginId
  },

  setProviderOwner(source: string, pluginId: string | null) {
    if (!pluginId) {
      providerOwners.delete(source)
      return
    }
    const host = this.getPluginById(pluginId)
    if (!host?.supportsV2Provider(source)) throw new Error(`插件 ${pluginId} 未提供 ${source}`)
    providerOwners.set(source, pluginId)
  },

  setCapabilityOwner(source: string, capability: string, pluginId: string | null) {
    const key = `${source}:${capability}`
    if (!pluginId) {
      capabilityOwners.delete(key)
      return
    }
    if (!isRoutablePluginCapability(capability)) throw new Error('插件内部操作不能分配给其他插件')
    const host = this.getPluginById(pluginId)
    const supported = capability.startsWith('action:')
      ? host?.supportsV2Provider(source) && host.supportsAction(capability.slice(7))
      : host?.supportsV2Provider(source, capability)
    if (!supported) throw new Error(`插件 ${pluginId} 未实现 ${source} / ${capability}`)
    capabilityOwners.set(key, pluginId)
  },

  getV2Provider(
    source: string,
    ownerId?: string,
    method?: string,
    requireShareResolver = false
  ): { pluginId: string; host: CeruMusicPluginHost } | null {
    const supports = (host: CeruMusicPluginHost) =>
      host.supportsV2Provider(source, method) &&
      (!requireShareResolver || host.supportsShareResolver())
    // A ResourceRef names its owner. Never route its private data to a different plugin.
    if (ownerId) {
      const owners = runtimeEntries().filter(
        ([pluginId, host]) => pluginId === ownerId || host.getPluginInfo().id === ownerId
      )
      const owner = owners.length === 1 ? owners[0] : undefined
      return owner && supports(owner[1])
        ? { pluginId: owner[0], host: owner[1] }
        : null
    }
    if (method) {
      const configuredId = capabilityOwners.get(`${source}:${method}`)
      const configured = configuredId ? this.getPluginById(configuredId) : null
      if (configuredId && configured && supports(configured))
        return { pluginId: configuredId, host: configured }
    }
    const sourceOwnerId = providerOwners.get(source)
    const sourceOwner = sourceOwnerId ? this.getPluginById(sourceOwnerId) : null
    if (sourceOwnerId && sourceOwner && supports(sourceOwner))
      return { pluginId: sourceOwnerId, host: sourceOwner }
    for (const [pluginId, host] of runtimeEntries()) {
      if (supports(host)) return { pluginId, host }
    }
    return null
  },
  getV2Action(source: string, action: string, ownerId?: string) {
    const configuredId = capabilityOwners.get(`${source}:action:${action}`)
    const candidates = runtimeEntries()
    const supports = (host: CeruMusicPluginHost) =>
      host.supportsV2Provider(source) && host.supportsAction(action)
    if (ownerId) {
      const owners = candidates.filter(
        ([pluginId, host]) => pluginId === ownerId || host.getPluginInfo().id === ownerId
      )
      const owner = owners.length === 1 ? owners[0] : undefined
      return owner && supports(owner[1]) ? { pluginId: owner[0], host: owner[1] } : null
    }
    if (!isRoutablePluginCapability(`action:${action}`)) return null
    const selected = configuredId
      ? candidates.find(([pluginId, host]) => pluginId === configuredId && supports(host))
      : undefined
    if (selected) return { pluginId: selected[0], host: selected[1] }
    const sourceOwnerId = providerOwners.get(source)
    const sourceOwner = sourceOwnerId ? this.getPluginById(sourceOwnerId) : null
    if (sourceOwnerId && sourceOwner && supports(sourceOwner))
      return { pluginId: sourceOwnerId, host: sourceOwner }
    const fallback = candidates.find(([, host]) => supports(host))
    return fallback ? { pluginId: fallback[0], host: fallback[1] } : null
  },
  getLyricConverter(): CeruMusicPluginHost | undefined {
    return (Object.values(loadedPlugins) as CeruMusicPluginHost[]).find(
      (host) => !host.isDisabled() && host.getManifest().contributes?.lyricConverters?.length
    )
  },
  getLyricConverters(): CeruMusicPluginHost[] {
    return (Object.values(loadedPlugins) as CeruMusicPluginHost[]).filter(
      (host) => !host.isDisabled() && host.getManifest().contributes?.lyricConverters?.length
    )
  },

  async invokeV2Provider(pluginId: string, providerId: string, method: string, args: any[] = []) {
    const host = this.getPluginById(pluginId)
    if (!host) throw new Error(`插件 ${pluginId} 未找到`)
    return host.invokeV2Provider(providerId, method, args)
  },

  async invokeV2Importer(pluginId: string, importerId: string, input: any) {
    const host = this.getPluginById(pluginId)
    if (!host) throw new Error(`插件 ${pluginId} 未找到`)
    return host.invokeV2Importer(importerId, input)
  },

  async uninstallPlugin(pluginId: string) {
    try {
      const pluginsDir = path.join(getAppDirPath(), 'plugins')
      const installed = installedPlugins.get(pluginId)
      if (!installed) {
        throw new Error(`未找到插件ID为 ${pluginId} 的插件文件`)
      }
      const host = loadedPlugins[pluginId] as CeruMusicPluginHost | undefined
      cancelPluginUI(pluginId)
      if (host) {
        try {
          await host.destroy()
        } catch (e) {
          console.warn('销毁插件 host 失败:', e)
        }
        delete loadedPlugins[pluginId]
      }
      clearRuntimeSelections(pluginId)
      installedPlugins.delete(pluginId)
      const files = await fsPromise.readdir(pluginsDir)
      await Promise.all(
        files
          .filter((file) => file.startsWith(`${pluginId}-`))
          .map((file) => fsPromise.unlink(path.join(pluginsDir, file)).catch(() => {}))
      )

      deletePluginConfig(pluginId)
      deletePluginConfig(pluginId + '.storage')
      deletePluginStorage(pluginId)
      deletePluginState(pluginId)
      const guestsRoot = path.resolve(getAppDirPath(), 'plugins', 'guests')
      const guestDirectory = path.resolve(guestsRoot, pluginId)
      if (guestDirectory.startsWith(guestsRoot + path.sep))
        await fsPromise.rm(guestDirectory, { recursive: true, force: true })
      pluginChanged({ type: 'uninstalled', pluginId })
      return { success: true, message: '插件卸载成功' }
    } catch (error: any) {
      console.error('卸载插件失败:', error)
      throw new Error(`卸载插件失败: ${error.message}`)
    }
  },

  async initializePlugins() {
    if (initialized)
      return Object.entries(loadedPlugins).map(([pluginId, host]: any) => ({
        pluginId,
        pluginInfo: host.getPluginInfo(),
        supportedSources: host.getSupportedSources()
      }))
    if (initialization) return initialization
    initialization = this.loadInstalledPlugins()
    try {
      const result = await initialization
      initialized = true
      return result
    } finally {
      initialization = undefined
    }
  },

  /** Called after the renderer UI bridge is ready; installation alone never activates code. */
  restoreEnabledPlugins(): Promise<void> {
    if (restoration) return restoration
    restoration = (async () => {
      await this.initializePlugins()
      const saved = [...installedPlugins.values()]
        .filter((plugin) => plugin.state.enabled)
        .sort((a, b) => a.state.order - b.state.order)
      for (const plugin of saved) {
        try {
          await this.setPluginEnabled(plugin.pluginId, true)
        } catch (error) {
          console.warn(`恢复插件 ${plugin.manifest.name} 失败:`, error)
        }
      }
    })().catch((error) => {
      restoration = undefined
      throw error
    })
    return restoration
  },

  async loadInstalledPlugins() {
    const pluginDirPath = path.join(getAppDirPath(), 'plugins')

    // 确保插件目录存在
    if (!fs.existsSync(pluginDirPath)) {
      await fsPromise.mkdir(pluginDirPath, { recursive: true })
      return []
    }

    let files: Dirent<string>[] = []
    try {
      files = await fsPromise.readdir(pluginDirPath, { recursive: false, withFileTypes: true })

      // 只处理文件，忽略目录
      files = files.filter((file) => file.isFile() && file.name.endsWith('.js'))

      // 清空已加载的插件（先销毁 worker）
      await Promise.all(
        Object.keys(loadedPlugins).map(async (key) => {
          try {
            await loadedPlugins[key].destroy()
          } catch {}
          delete loadedPlugins[key]
        })
      )
      installedPlugins.clear()
      activePluginId = null
      providerOwners.clear()
      capabilityOwners.clear()
      const states = getPluginStates()
      const records: InstalledPlugin[] = []
      let nextOrder = Math.max(-1, ...Object.values(states).map((state) => state.order)) + 1
      for (const file of files) {
        try {
          const parts = file.name.split('-')
          if (parts.length < 2) {
            console.warn(`跳过无效的插件文件名: ${file.name}`)
            continue
          }
          const pluginId = parts[0]
          const fullPath = path.join(pluginDirPath, file.name)
          const pluginCode = await fsPromise.readFile(fullPath, 'utf-8')
          const parsed = readPluginArtifact(pluginCode)
          const manifest = parsed.header.manifest
          const state = states[pluginId] ?? { enabled: false, order: nextOrder++ }
          const record: InstalledPlugin = {
            pluginId,
            pluginName: parts.slice(1).join('-'),
            filePath: fullPath,
            manifest,
            state
          }
          installedPlugins.set(pluginId, record)
          savePluginState(pluginId, state)
          records.push(record)
        } catch (error: any) {
          console.error(`读取插件 ${file.name} 失败:`, error)
        }
      }

      // Installation scanning is static. The renderer restores the explicit user selection
      // after its UI bridge is mounted; no installed plugin runs just because it exists.
      return this.getPluginsList()
    } catch (err: any) {
      console.error('读取插件目录失败:', err)
      throw new Error(`无法读取插件目录${err.message ? ': ' + err.message : ''}`)
    }
  },

  async getPluginsList() {
    if (!initialized && !initialization) {
      await this.initializePlugins()
    }

    return [...installedPlugins.values()]
      .sort((a, b) => a.state.order - b.state.order)
      .map((installed) => {
        const { pluginId } = installed
        const host = loadedPlugins[pluginId]
        const { config: _privateConfig, ...manifest } = host?.getManifest() ?? installed.manifest
        const supportedSources = Object.fromEntries(
          (manifest.contributes?.providers ?? []).map((provider: any) => [
            provider.id,
            {
              name: provider.name,
              qualitys: provider.qualities ?? [],
              qualities: provider.qualities ?? [],
              icon: provider.icon,
              protocols: provider.protocols
            }
          ])
        )
        return {
          pluginId,
          pluginName: installed.pluginName,
          pluginInfo: {
            id: manifest.id,
            name: manifest.name,
            version: manifest.version,
            author: manifest.author || manifest.publisher || '',
            description: manifest.description
          },
          supportedSources,
          manifest,
          providerMethods: host?.getProviderMethods() ?? {},
          providerIconUrls: host?.getProviderIconUrls() ?? {},
          actionIds: host?.getActionIds() ?? [],
          registrations: host?.getRegistrationInfo(),
          pluginType: host?.getPluginType() ?? 'music-source',
          enabled: installed.state.enabled && Boolean(host) && !host?.isDisabled(),
          requestedEnabled: installed.state.enabled,
          disabled: !installed.state.enabled || !host || host.isDisabled(),
          order: installed.state.order,
          loadError: installed.loadError
        }
      })
  },

  async downloadAndAddPlugin(url: string, type: 'lx' | 'cr', targetPluginId?: string) {
    try {
      // 验证URL
      if (!url || typeof url !== 'string') {
        throw new Error('无效的URL地址')
      }

      // 下载文件
      let pluginCode = await this.downloadFile(url)

      // 插件格式校验
      if (type === 'cr') {
        const parsed = readPluginArtifact(pluginCode)
        if (parsed.header.manifest.manifestVersion !== 2)
          throw new Error('澜音插件格式校验失败：只支持 v2 单文件插件')
      } else if (type === 'lx') {
        // 洛雪格式校验：检查是否包含lx关键字
        if (!pluginCode.toLowerCase().includes('lx')) {
          throw new Error('洛雪插件格式校验失败：代码中未找到lx关键字')
        }
        throw new Error('请通过 LX 兼容插件安装洛雪音源，澜音仅接收 v2 插件')
      }

      // 生成临时文件名
      const fileName = `downloaded_${Date.now()}.js`

      // 调用现有的添加插件方法
      return await this.addPlugin(pluginCode, fileName, targetPluginId)
    } catch (error: any) {
      console.error('下载并添加插件失败:', error)
      return { error: error.message || '下载插件失败' }
    }
  },

  async downloadFile(url: string): Promise<string> {
    try {
      const response = await axios.get(url, {
        timeout: 30000, // 30秒超时
        responseType: 'text',
        headers: {
          'User-Agent': 'CeruMusic/1.0'
        }
      })

      if (response.status !== 200) {
        throw new Error(`下载失败: HTTP ${response.status}`)
      }

      const data = response.data
      if (!data || !data.trim()) {
        throw new Error('下载的文件内容为空')
      }

      return data
    } catch (error: any) {
      if (error.response) {
        throw new Error(`下载失败: HTTP ${error.response.status}`)
      } else if (error.request) {
        throw new Error('网络错误: 无法连接到服务器')
      } else {
        throw new Error(`下载错误: ${error.message}`)
      }
    }
  },

  async getPluginLog(pluginId: string) {
    return await getLog(pluginId)
  },

  // ==================== 服务插件方法 ====================

  getPluginType(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (!plugin) throw new Error(`插件 ${pluginId} 未找到`)
    return plugin.getPluginType()
  },

  getConfigSchema(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (!plugin) throw new Error(`插件 ${pluginId} 未找到`)
    return plugin.getConfigSchema()
  },

  getConfig(pluginId: string) {
    return getPluginConfig(pluginId)
  },

  getPermissions(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (plugin) return plugin.getGrantedPermissions()
    if (!installedPlugins.has(pluginId)) throw new Error(`插件 ${pluginId} 未找到`)
    return getPluginPermissions(pluginId)
  },

  getManifest(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (plugin) return plugin.getManifest()
    const installed = installedPlugins.get(pluginId)
    if (!installed) throw new Error(`插件 ${pluginId} 未找到`)
    return installed.manifest
  },

  savePermissions(pluginId: string, permissions: string[]) {
    const plugin = this.getPluginById(pluginId)
    if (plugin) {
      plugin.setGrantedPermissions(permissions)
      return plugin.getGrantedPermissions()
    }
    if (!installedPlugins.has(pluginId)) throw new Error(`插件 ${pluginId} 未找到`)
    savePluginPermissions(pluginId, permissions)
    return getPluginPermissions(pluginId)
  },

  saveConfig(pluginId: string, config: Record<string, any>) {
    savePluginConfig(pluginId, config)
  },

  deleteConfig(pluginId: string) {
    deletePluginConfig(pluginId)
  },

  async testConnection(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (!plugin) throw new Error(`插件 ${pluginId} 未找到`)
    const config = getPluginConfig(pluginId)
    return await plugin.testConnection(config)
  },

  async getPlaylists(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (!plugin) throw new Error(`插件 ${pluginId} 未找到`)
    const config = getPluginConfig(pluginId)
    return await plugin.getPlaylists(config)
  },

  async getPlaylistSongs(pluginId: string, playlistId: string) {
    const plugin = this.getPluginById(pluginId)
    if (!plugin) throw new Error(`插件 ${pluginId} 未找到`)
    const config = getPluginConfig(pluginId)
    return await plugin.getPlaylistSongs(config, playlistId)
  },

  async getServiceLyric(pluginId: string, songInfo: any) {
    const plugin = this.getPluginById(pluginId)
    if (!plugin) throw new Error(`插件 ${pluginId} 未找到`)
    const config = getPluginConfig(pluginId)
    return await plugin.getServiceLyric(config, songInfo)
  },

  async publishHostEvent(event: string, value: unknown, pluginId?: string) {
    const hosts = pluginId ? runtimeEntries().filter(([id]) => id === pluginId) : runtimeEntries()
    await Promise.allSettled(hosts.map(([, host]) => host.publishHostEvent(event, value)))
  },

  /** 应用退出前调用，销毁所有插件 worker，避免阻塞退出。 */
  async disposeAll() {
    await Promise.all(
      Object.keys(loadedPlugins).map(async (key) => {
        try {
          await loadedPlugins[key].destroy()
        } catch {}
        delete loadedPlugins[key]
      })
    )
  }
}

export default pluginService
