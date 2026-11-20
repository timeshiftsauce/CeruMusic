import { isDeepStrictEqual } from 'node:util'
import fs, { Dirent } from 'fs'
import path from 'path'
import fsPromise from 'fs/promises'
import { createHash } from 'crypto'
import { dialog } from 'electron'
import { getAppDirPath } from '../../utils/path'
import { pluginAccountVault } from './accounts/vault'
import axios from 'axios'
import { getRequestAgentsFor } from '../networkProxy'

import type { PluginDescriptor } from '@common/pluginDescriptor'
import { encodePermissionKeys, readPermissionKeys } from './shared/permissions'
import type CeruMusicPluginHost from './shared/DesktopPluginHost'
import { runLifecycleOnly } from './v3/lifecycleOnly'
import { createAppReadyGate } from './lifecycle'
import V2PluginHost from './v2/V2PluginHost'
import V3PluginHost from './v3/V3PluginHost'
import { cancelPluginUI, pluginChanged } from './uiBridge'
import {
  trustedPublisher, trustedDeclaration, readTrustedConsent, requestTrustedConsent,
  writeTrustedConsent, trustedConsentDetail, trustedConsentRecords, stopTrustedRuntime
} from './trusted/consent'
import { musicRegistry, setMusicOwnerOrder, providerOwners, capabilityOwners } from './musicRegistry'
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
import {
  describeInstalled,
  readInstalledArtifact,
  sniffManifestVersion,
  type PluginRuntime
} from './runtimes'
import { GuestStore as V2Guests } from 'ceru-plugin-core-v2/guests'
import { GuestStore as V3Guests } from '@shiqianjiang/ceru-plugin-core/guests'
import { deletePluginStorage } from './storage'
import { isRoutablePluginCapability } from '@common/pluginCapabilities'
import { dependencyOrder } from '@shiqianjiang/ceru-plugin-core/services'
import { pluginServices } from './v3/serviceRouter'

// 导出类型以解决TypeScript错误

// 存储已加载的插件实例
const loadedPlugins: Record<string, CeruMusicPluginHost> = Object.create(null)
interface InstalledPlugin {
  pluginId: string
  pluginName: string
  filePath: string
  descriptor?: PluginDescriptor
  state: PluginRuntimeState
  runtime: PluginRuntime
  development?: boolean
  shadowBy?: string
  detachedFile?: boolean
  blocked?: string
  broken?: boolean
  loadError?: string
}
const installedPlugins = new Map<string, InstalledPlugin>()
/** Read/manage persisted children even when their parent runtime is closed. */
async function withStoredGuests<T>(
  pluginId: string,
  work: (store: V2Guests | V3Guests) => Promise<T> | T
): Promise<T> {
  const parent = installedPlugins.get(pluginId)
  if (!parent?.descriptor?.guestAdapters.length) throw new Error('兼容环境未安装')
  const parsed = readInstalledArtifact(await fsPromise.readFile(parent.filePath, 'utf8'))
  const options = {
    root: path.join(getAppDirPath(), 'plugins', 'guests', pluginId),
    approve: async () => false,
    authorize: async () => false,
    request: async () => {
      throw new Error('兼容环境未运行')
    },
    changed: () => pluginChanged(),
    event: () => {}
  }
  const store =
    parsed.runtime === 2
      ? new V2Guests({ ...options, artifact: parsed.artifact })
      : new V3Guests({ ...options, artifact: parsed.artifact })
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
setMusicOwnerOrder(() => runtimeEntries().map(([id]) => id))
const pluginTransitions = new Map<string, Promise<any>>()

/** 全局限流回调，由 main/index.ts 注入 */
let _throttleHandler: ((pluginId: string, reason: string, duration?: number) => void) | null = null
/** 全局禁用回调，由 main/index.ts 注入。插件因崩溃次数过多被永久禁用时触发。 */
let _disabledHandler: ((pluginId: string, reason: string) => void) | null = null

let appLifecycleReady = false
function attachRunningHost(host: CeruMusicPluginHost) {
  host.attachMusic()
  if (appLifecycleReady) void host.publishLifecycle('onAppReady').catch(console.warn)
}
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

function serviceDependencies(descriptor: PluginDescriptor) {
  return descriptor.dependencies.map(({ targetPluginId, service, version, optional }) => ({
    pluginId: targetPluginId,
    service,
    version,
    optional
  }))
}
function serviceOrder(extra?: PluginDescriptor) {
  const candidates = new Map<string, PluginDescriptor>()
  for (const item of installedPlugins.values())
    if (!item.broken && !item.shadowBy && item.descriptor?.runtime === 3)
      candidates.set(item.descriptor.id, item.descriptor)
  if (extra?.runtime === 3) candidates.set(extra.id, extra)
  return dependencyOrder(
    [...candidates.values()].map((descriptor) => ({
      id: descriptor.id,
      dependencies: serviceDependencies(descriptor)
    }))
  )
}
function dependencyFailure(descriptor?: PluginDescriptor) {
  if (descriptor?.runtime !== 3 || !descriptor.dependencies.length) return
  if (serviceOrder(descriptor).cycles.has(descriptor.id)) return '插件依赖成环：' + descriptor.id
  const missing = pluginServices.missing(serviceDependencies(descriptor))
  if (missing)
    return (
      '缺少依赖 ' +
      missing.pluginId +
      '（服务 ' +
      missing.service +
      ' ' +
      missing.version +
      '），请安装或启用兼容版本'
    )
  return undefined
}
async function transitionPlugin<T>(pluginId: string, work: () => Promise<T>): Promise<T> {
  const previous = pluginTransitions.get(pluginId) ?? Promise.resolve()
  const transition = previous.catch(() => undefined).then(work)
  pluginTransitions.set(pluginId, transition)
  try {
    return await transition
  } finally {
    if (pluginTransitions.get(pluginId) === transition) pluginTransitions.delete(pluginId)
  }
}
let servicesDirty = false,
  checkingServices = false
function queueDependencyCheck() {
  servicesDirty = true
  if (checkingServices) return
  checkingServices = true
  setTimeout(async () => {
    try {
      while (servicesDirty) {
        servicesDirty = false
        if (!initialized || initialization) continue
        for (const item of [...installedPlugins.values()]) {
          if (
            !item.state.enabled ||
            item.shadowBy ||
            item.broken ||
            item.descriptor?.runtime !== 3 ||
            !item.descriptor.dependencies.length
          )
            continue
          const reason = dependencyFailure(item.descriptor)
          if (
            (reason && (loadedPlugins[item.pluginId] || item.blocked !== reason)) ||
            (!reason && item.blocked)
          ) {
            await transitionPlugin(item.pluginId, async () => {
              if (
                installedPlugins.get(item.pluginId) !== item ||
                !item.state.enabled ||
                item.shadowBy
              )
                return
              await pluginService.applyPluginEnabled(item.pluginId, true)
            }).catch(() => {})
          }
        }
      }
    } finally {
      checkingServices = false
    }
  }, 0)
}
pluginServices.onChange(queueDependencyCheck)

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

function removePluginSkinPreferences(pluginId: string): void {
  const file = path.join(getAppDirPath(), 'plugins', 'skins.json')
  let state: any
  try { state = JSON.parse(fs.readFileSync(file, 'utf8')) }
  catch (error: any) { if (error?.code !== 'ENOENT') console.warn('无法清理插件皮肤设置:', error); return }
  if (!state || state.version !== 1) return
  let changed = false
  if (state.selected?.pluginId === pluginId) { state.selected = null; changed = true }
  for (const [region, choice] of Object.entries(state.overrides ?? {})) {
    if ((choice as any)?.pluginId === pluginId) { delete state.overrides[region]; changed = true }
  }
  if (Array.isArray(state.settings)) {
    const settings = state.settings.filter((item: any) => item?.pluginId !== pluginId)
    if (settings.length !== state.settings.length) { state.settings = settings; changed = true }
  }
  if (!changed) return
  fs.writeFileSync(file + '.tmp', JSON.stringify(state), { mode: 0o600 })
  fs.renameSync(file + '.tmp', file)
}

function createPluginHost(
  pluginId: string,
  runtime: PluginRuntime,
  pluginCode?: string,
  developmentPreview = false
): CeruMusicPluginHost {
  if (runtime !== 2 && runtime !== 3) throw new Error('无法识别的插件运行环境')
  const logger = new Logger(pluginId)
  const host = runtime === 3 ? new V3PluginHost(pluginCode, logger, developmentPreview) : new V2PluginHost(pluginCode, logger)
  host.pluginId = pluginId
  host.resolveStorageOwner = (manifestId) => {
    const matches = [...installedPlugins.values()].filter(
      (item) => item.descriptor?.id === manifestId
    )
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
  markAppReady: createAppReadyGate(() => { void pluginService.publishLifecycle('onAppReady') }),
  getMusicSources: () => musicRegistry.sources(),
  async loadDevelopmentFile(filePath:string,code:string) {
    await this.initializePlugins()
    const parsed=readInstalledArtifact(code), manifest=parsed.header.manifest
    const pluginId='dev.'+createHash('sha256').update(filePath+'\0'+manifest.id).digest('hex')
    const conflicts=[...installedPlugins.values()].filter(item=>item.development && (item.filePath===filePath || item.descriptor?.id===manifest.id) && item.pluginId!==pluginId)
    if(conflicts.length || (installedPlugins.has(pluginId)&&!installedPlugins.get(pluginId)?.development))throw Error('开发文件或插件 ID 冲突，请先移除旧的开发记录')
    const publisher = trustedPublisher(parsed.artifact, true)
    const consent = await requestTrustedConsent(pluginId, manifest, publisher, true)
    if (consent !== undefined) writeTrustedConsent(pluginId, manifest, publisher, consent)
    const descriptor=describeInstalled(pluginId,parsed), blocked=dependencyFailure(descriptor)
    if(blocked){
      if(loadedPlugins[pluginId] || [...installedPlugins.values()].some(item=>!item.development && item.descriptor?.id===manifest.id))throw Error(blocked)
      installedPlugins.set(pluginId,{pluginId,pluginName:path.basename(filePath),filePath,descriptor,runtime:parsed.runtime,development:true,state:{enabled:true,order:-1},blocked,loadError:blocked})
      queueDependencyCheck();pluginChanged({type:'updated',pluginId});return {id:pluginId,runtime:parsed.runtime}
    }
    if (parsed.runtime === 3) {
      const views = loadedPlugins[pluginId]?.updateRegionPreview(code, parsed.artifact)
      if (views != null) {
        if (views.length) pluginChanged({type:'views-updated', pluginId, views})
        return {id:pluginId, runtime:parsed.runtime}
      }
    }
    const candidate=createPluginHost(pluginId,parsed.runtime,code,true)
    try {await candidate.ensureReady()}catch(error){await candidate.destroy();throw error}
    for(const item of installedPlugins.values()) if(!item.development && item.descriptor?.id===manifest.id){
      item.shadowBy=pluginId
      const running=loadedPlugins[item.pluginId];delete loadedPlugins[item.pluginId];cancelPluginUI(item.pluginId);await running?.destroy()
    }
    const previous=loadedPlugins[pluginId];if(previous){cancelPluginUI(pluginId);await previous.destroy()}
    installedPlugins.set(pluginId,{pluginId,pluginName:path.basename(filePath),filePath,descriptor:describeInstalled(pluginId,parsed),runtime:parsed.runtime,development:true,state:{enabled:true,order:-1}})
    loadedPlugins[pluginId]=candidate;attachRunningHost(candidate);pluginChanged({type:'updated',pluginId})
    return {id:pluginId,runtime:parsed.runtime}
  },
  async removeDevelopmentFile(pluginId:string) {
    if(!installedPlugins.get(pluginId)?.development)return
    const host=loadedPlugins[pluginId];delete loadedPlugins[pluginId];installedPlugins.delete(pluginId);clearRuntimeSelections(pluginId);cancelPluginUI(pluginId);await host?.destroy()
    for(const item of installedPlugins.values()) if(item.shadowBy===pluginId){delete item.shadowBy;if(item.state.enabled)await this.setPluginEnabled(item.pluginId,true)}
    pluginChanged({type:'uninstalled',pluginId})
  },
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
      const pluginCode = await fsPromise.readFile(filePath, 'utf-8')

      // 插件格式校验
      if (type === 'lx') {
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

  async addPlugin(pluginCode: string, pluginName: string, targetPluginId?: string) {
    const parsed = readInstalledArtifact(pluginCode)
    await this.initializePlugins()
    const id = parsed.header.manifest.id
    const owner = [...installedPlugins.values()].find(item => !item.broken && item.descriptor?.id === id)?.pluginId
    return transitionPlugin(owner ?? createHash('sha256').update(id).digest('hex').slice(0,32), () =>
      pluginService.applyPluginFile(pluginCode, parsed, pluginName, targetPluginId))
  },
  async applyPluginFile(pluginCode: string, parsed: ReturnType<typeof readInstalledArtifact>, _pluginName: string, targetPluginId?: string) {
    try {
      // Shared Core performs side-effect-free artifact validation before the
      // executable code is handed to the isolated worker.
      const manifest = parsed.header.manifest
      const pluginInfo = {
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        author: manifest.author || manifest.publisher || '',
        description: manifest.description
      }
      if ([...installedPlugins.values()].some(item => item.development && (item.pluginId===targetPluginId || item.descriptor?.id===manifest.id))) throw Error('请先移除同 ID 的开发预览，再安装或更新正式文件')
      const identity = createHash('sha256').update(manifest.id).digest('hex').slice(0, 32)
      const matches = [...installedPlugins.values()].filter(
        (item) => !item.broken && item.descriptor?.id === manifest.id
      )
      if (
        matches.length > 1 ||
        (matches.length && installedPlugins.has(identity) && matches[0].pluginId !== identity)
      )
        throw new Error('存在冲突的插件 ID，无法确定更新目标；原文件均已保留')
      const existing = matches[0] ?? installedPlugins.get(identity)
      if (
        targetPluginId &&
        installedPlugins.get(targetPluginId)?.broken &&
        targetPluginId !== identity
      )
        throw new Error('无法核实损坏文件的原插件 ID。请单独安装有效文件，原文件和授权不会转移')
      if (existing && !existing.broken && existing.descriptor?.id !== manifest.id)
        throw new Error('插件文件与已安装的清单 ID 不一致')
      const pluginId = existing?.pluginId ?? identity
      if (targetPluginId && targetPluginId !== pluginId)
        throw new Error('更新插件的清单 ID 与原插件不一致')
      const publisher = trustedPublisher(parsed.artifact)
      const consent = await requestTrustedConsent(pluginId, manifest, publisher)
      const previousPermissions = getPluginPermissions(pluginId)
      const oldHost = loadedPlugins[pluginId] as CeruMusicPluginHost | undefined
      const previousVersion = existing?.descriptor?.version
      const state = existing?.state ?? { enabled: false, order: nextPluginOrder() }
      const pluginsDir = path.join(getAppDirPath(), 'plugins')
      await fsPromise.mkdir(pluginsDir, { recursive: true })
      const filePath = existing?.filePath ?? path.join(pluginsDir, pluginId + '-plugin.js')
      const safePluginName = path.basename(filePath).slice(pluginId.length + 1)
      const tempPath = filePath + '.tmp'
      const backupPath = filePath + '.bak'
      const previousPath = existing?.filePath
      let ceruPluginManager: CeruMusicPluginHost | undefined
      try {
        if (consent !== undefined) {
          writeTrustedConsent(pluginId, manifest, publisher, consent)
          // Invalidate old pending permission prompts before the candidate can run.
          oldHost?.setGrantedPermissions(this.getPermissions(pluginId))
        }
        ceruPluginManager = existing && state.enabled
          ? createPluginHost(pluginId, parsed.runtime, pluginCode)
          : undefined
        if(ceruPluginManager){const blocked=dependencyFailure(describeInstalled(pluginId,parsed));if(blocked)throw Error(blocked)}
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
        if (consent !== undefined) {
          savePluginPermissions(pluginId, previousPermissions)
          oldHost?.setGrantedPermissions(this.getPermissions(pluginId))
        }
        await fsPromise.unlink(tempPath).catch(() => {})
        throw error
      }
      await oldHost?.destroy()
      delete loadedPlugins[pluginId]

      if (!existing) {
        deletePluginConfig(pluginId)
        deletePluginConfig(pluginId + '.storage')
        if (consent !== undefined) writeTrustedConsent(pluginId, manifest, publisher, consent)
      }
      if (consent === undefined && trustedConsentRecords(pluginId).length)
        writeTrustedConsent(pluginId, manifest, publisher, false)
      installedPlugins.set(pluginId, {
        pluginId,
        pluginName: safePluginName,
        filePath,
        descriptor: describeInstalled(pluginId, parsed),
        runtime: parsed.runtime,
        state
      })
      if (!existing || !Object.hasOwn(getPluginStates(), pluginId)) savePluginState(pluginId, state)
      if (ceruPluginManager) {
        if (previousVersion && previousVersion !== manifest.version)
          await ceruPluginManager.invokePluginLifecycle('onUpdate', { from: previousVersion })
        loadedPlugins[pluginId] = ceruPluginManager
        attachRunningHost(ceruPluginManager)
      } else if (parsed.runtime === 3) {
        if (!existing) await runLifecycleOnly(pluginId, parsed, {name:'onInstall'})
        else if (previousVersion && previousVersion !== manifest.version)
          await runLifecycleOnly(pluginId, parsed, {name:'onUpdate', from:previousVersion})
      }
      await fsPromise.unlink(backupPath).catch(() => {})
      queueDependencyCheck()
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
      title: `更新 ${current.descriptor?.name ?? current.pluginName}`,
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
    return transitionPlugin(pluginId,()=>pluginService.applyPluginEnabled(pluginId,enabled))
  },

  async applyPluginEnabled(pluginId: string, enabled: boolean) {
    const installed = installedPlugins.get(pluginId)
    if (!installed) throw new Error(`插件 ${pluginId} 未安装`)
    if (installed.development && !enabled) throw Error('请在开发者模式面板中移除开发文件')
    if (installed.shadowBy) throw Error('同 ID 的开发版本正在预览，请先移除开发文件')
    if (installed.broken) throw new Error(installed.loadError)
    const running = Boolean(loadedPlugins[pluginId]) && !loadedPlugins[pluginId].isDisabled()
    const blocked = enabled ? dependencyFailure(installed.descriptor) : undefined
    if(blocked){
      const host=loadedPlugins[pluginId];delete loadedPlugins[pluginId];clearRuntimeSelections(pluginId);cancelPluginUI(pluginId)
      installed.blocked=blocked;installed.loadError=blocked
      if(!installed.state.enabled){installed.state.enabled=true;if(!installed.development)savePluginState(pluginId,installed.state)}
      await host?.destroy();pluginChanged({type:'state-changed',pluginId,enabled:false});throw Error(blocked)
    }
    if(installed.blocked){delete installed.blocked;delete installed.loadError}
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
      await host?.invokePluginLifecycle('onDisable')
      await host?.destroy().catch((error) => console.warn('停止插件失败:', error))
      pluginChanged({ type: 'state-changed', pluginId, enabled: false })
      return { success: true, enabled: false }
    }

    const parsed = readInstalledArtifact(await fsPromise.readFile(installed.filePath, 'utf8'))
    const declaration = trustedDeclaration(parsed.header.manifest)
    const publisher = trustedPublisher(parsed.artifact, installed.development === true)
    if (declaration && (!publisher || (declaration.optional !== true &&
      !readTrustedConsent(pluginId, parsed.header.manifest, publisher)))) {
      installed.loadError = '此插件需要完全信任才能运行，请在插件详情中确认授权'
      throw Error(installed.loadError)
    }
    const host = createPluginHost(pluginId, installed.runtime, undefined, installed.development === true)
    try {
      await host.loadPlugin(installed.filePath, new Logger(pluginId))
      loadedPlugins[pluginId] = host
      attachRunningHost(host)
      installed.loadError = undefined
      if (!installed.state.enabled) {
        installed.state.enabled = true
        savePluginState(pluginId, installed.state)
        await host.invokePluginLifecycle('onEnable')
      }
      pluginChanged({ type: 'state-changed', pluginId, enabled: true })
      return { success: true, enabled: true }
    } catch (error: any) {
      await host.destroy().catch(() => {})
      installed.loadError = error?.message || String(error)
      throw new Error(`启用插件失败: ${installed.loadError}`)
    }
  },

  async setActivePlugin(pluginId: string | null) {
    if (pluginId) await this.setPluginEnabled(pluginId, true)
    activePluginId = pluginId
  },

  setProviderOwner(source: string, pluginId: string | null) {
    if (!pluginId) {
      if (providerOwners.delete(source)) musicRegistry.changed()
      return
    }
    const host = this.getPluginById(pluginId)
    if (!host?.supportsV2Provider(source)) throw new Error(`插件 ${pluginId} 未提供 ${source}`)
    if (providerOwners.get(source) !== pluginId) { providerOwners.set(source,pluginId); musicRegistry.changed() }
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
    const entry = musicRegistry.provider(source, method, ownerId, (id) => {
      const host = loadedPlugins[id]
      return !!host && !host.isDisabled() && (!requireShareResolver || host.supportsShareResolver())
    })
    return entry ? {pluginId:entry.pluginId,host:loadedPlugins[entry.pluginId]} : null
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
      (host) => !host.isDisabled() && host.getDescriptor().lyricConverters.length
    )
  },
  getLyricConverters(): CeruMusicPluginHost[] {
    return (Object.values(loadedPlugins) as CeruMusicPluginHost[]).filter(
      (host) => !host.isDisabled() && host.getDescriptor().lyricConverters.length
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
    return transitionPlugin(pluginId, () => pluginService.applyUninstall(pluginId))
  },
  async applyUninstall(pluginId: string) {
    try {
      const installed = installedPlugins.get(pluginId)
      if (installed?.development || installed?.shadowBy) throw Error('请先从开发者模式面板中移除开发文件；不会删除源文件')
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
      if (installed.runtime === 3 && !installed.broken && !installed.detachedFile) {
        try {
          const parsed = readInstalledArtifact(await fsPromise.readFile(installed.filePath, 'utf8'))
          const declaration = trustedDeclaration(parsed.header.manifest)
          const publisher = trustedPublisher(parsed.artifact)
          if (parsed.runtime === 3 && parsed.header.manifest.id === installed.descriptor?.id &&
            (!declaration || (publisher && (declaration.optional === true || readTrustedConsent(pluginId, parsed.header.manifest, publisher)))))
            await runLifecycleOnly(pluginId, parsed, {name:'onUninstall'})
        } catch (error) { console.warn('卸载前无法读取插件:', error) }
      }
      if (!installed.detachedFile && installed.runtime === 3) await pluginAccountVault.forgetPlugin(pluginId)
      await fsPromise.rm(installed.filePath, { force: true })
      installedPlugins.delete(pluginId)

      if (installed.detachedFile) {
        pluginChanged({ type: 'uninstalled', pluginId })
        return { success: true, message: '已删除损坏文件' }
      }
      deletePluginConfig(pluginId)
      deletePluginConfig(pluginId + '.storage')
      deletePluginStorage(pluginId)
      deletePluginState(pluginId)
      for (const area of ['guests', 'data', 'native']) {
        const root = path.resolve(getAppDirPath(), 'plugins', area)
        const directory = path.resolve(root, pluginId)
        if (!directory.startsWith(root + path.sep)) throw Error('无效的插件数据目录')
        await fsPromise.rm(directory, { recursive: true, force: true })
      }
      removePluginSkinPreferences(pluginId)
      pluginChanged({ type: 'uninstalled', pluginId })
      return { success: true, message: '插件卸载成功' }
    } catch (error: any) {
      console.error('卸载插件失败:', error)
      throw new Error(`卸载插件失败: ${error.message}`)
    }
  },

  async initializePlugins() {
    if (initialization) return initialization
    if (initialized)
      return Object.entries(loadedPlugins).map(([pluginId, host]: any) => ({
        pluginId,
        pluginInfo: host.getPluginInfo(),
        supportedSources: host.getSupportedSources()
      }))
    return this.loadInstalledPlugins()
  },

  /** Called after the renderer UI bridge is ready; installation alone never activates code. */
  restoreEnabledPlugins(): Promise<void> {
    if (restoration) return restoration
    restoration = (async () => {
      await this.initializePlugins()
      const saved = [...installedPlugins.values()]
        .filter((plugin) => !plugin.development && !plugin.shadowBy && !plugin.broken && plugin.state.enabled)
        .sort((a, b) => a.state.order - b.state.order)
      const rank=new Map(serviceOrder().ordered.map((id,index)=>[id,index]))
      const dependencySorted = saved.filter(item=>item.runtime===3).sort((left,right)=>(rank.get(left.descriptor!.id)??0)-(rank.get(right.descriptor!.id)??0))
      let nextV3=0
      for (const slot of saved) {
        const plugin=slot.runtime===3 ? dependencySorted[nextV3++] : slot
        try {
          await this.setPluginEnabled(plugin.pluginId, true)
        } catch (error) {
          console.warn(`恢复插件 ${plugin.descriptor?.name ?? plugin.pluginName} 失败:`, error)
        }
      }
    })().catch((error) => {
      restoration = undefined
      throw error
    })
    return restoration
  },

  async loadInstalledPlugins() {
    if (initialization) return initialization
    restoration = undefined
    initialization = this.scanInstalledPlugins()
    try {
      return await initialization
    } finally {
      initialization = undefined
    }
  },

  async scanInstalledPlugins() {
    const pluginDirPath = path.join(getAppDirPath(), 'plugins')

    // 确保插件目录存在
    if (!fs.existsSync(pluginDirPath)) {
      await fsPromise.mkdir(pluginDirPath, { recursive: true })
    }

    let files: Dirent<string>[] = []
    try {
      files = await fsPromise.readdir(pluginDirPath, { recursive: false, withFileTypes: true })

      // 只处理文件，忽略目录
      files = files.filter((file) => file.isFile() && file.name.endsWith('.js'))

      const previews = [...installedPlugins.values()].filter(item => item.development)
      const previewIds = new Set(previews.map(item => item.pluginId))
      // 清空已加载的插件（先销毁 worker）
      await Promise.all(
        Object.keys(loadedPlugins).filter(key => !previewIds.has(key)).map(async (key) => {
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
      const failures: InstalledPlugin[] = []
      let nextOrder = Math.max(-1, ...Object.values(states).map((state) => state.order)) + 1
      for (const file of files) {
        const separator = file.name.indexOf('-')
        const prefix = separator > 0 ? file.name.slice(0, separator) : ''
        const named =
          /^[a-zA-Z0-9_][a-zA-Z0-9._]{0,127}$/.test(prefix) &&
          !Object.hasOwn(Object.prototype, prefix) &&
          !/^(?:broken\.|(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$))|\.(?:ui|storage)$/i.test(
            prefix
          )
        const fallback = 'broken.' + createHash('sha256').update(file.name).digest('hex')
        const pluginId = named ? prefix : fallback
        const fullPath = path.join(pluginDirPath, file.name)
        const state = states[pluginId] ?? { enabled: false, order: nextOrder++ }
        let runtime: PluginRuntime = 'unknown'
        try {
          const pluginCode = await fsPromise.readFile(fullPath, 'utf-8')
          const version = sniffManifestVersion(pluginCode)
          if (version === 2 || version === 3) runtime = version
          if (!named || installedPlugins.has(pluginId))
            throw new Error('无法识别或重复的插件文件名')
          const parsed = readInstalledArtifact(pluginCode, version)
          const record: InstalledPlugin = {
            pluginId,
            pluginName: file.name.slice(separator + 1),
            filePath: fullPath,
            descriptor: describeInstalled(pluginId, parsed),
            runtime,
            state
          }
          installedPlugins.set(pluginId, record)
          if (!Object.hasOwn(states, pluginId)) savePluginState(pluginId, state)
        } catch (error: any) {
          failures.push({
            pluginId,
            pluginName: file.name,
            filePath: fullPath,
            state,
            runtime,
            broken: true,
            detachedFile: !named,
            loadError: error.message || String(error)
          })
        }
      }
      for (const entry of failures) {
        if (installedPlugins.has(entry.pluginId)) {
          entry.pluginId = 'broken.' + createHash('sha256').update(entry.pluginName).digest('hex')
          entry.detachedFile = true
          entry.state = { enabled: false, order: nextOrder++ }
        }
        installedPlugins.set(entry.pluginId, entry)
      }

      for (const preview of previews) {
        for (const item of installedPlugins.values()) {
          if (item.descriptor?.id === preview.descriptor?.id) item.shadowBy = preview.pluginId
        }
        installedPlugins.set(preview.pluginId, preview)
      }
      // Installation scanning is static. The renderer restores the explicit user selection
      // after its UI bridge is mounted; no installed plugin runs just because it exists.
      initialized = true
      return this.snapshotPlugins()
    } catch (err: any) {
      console.error('读取插件目录失败:', err)
      throw new Error(`无法读取插件目录${err.message ? ': ' + err.message : ''}`)
    }
  },

  async getPluginsList() {
    if (!initialized || initialization) {
      await this.initializePlugins()
    }

    return this.snapshotPlugins()
  },

  snapshotPlugins() {
    return [...installedPlugins.values()]
      .sort((a, b) => a.state.order - b.state.order)
      .map((installed) => {
        const { pluginId } = installed
        const host = loadedPlugins[pluginId]
        const descriptor = host?.getDescriptor() ?? installed.descriptor
        const supportedSources = Object.fromEntries(
          (descriptor?.providers ?? []).map((provider: any) => [
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
          runtime: installed.runtime,
          development: installed.development === true,
          devPath: installed.development ? installed.filePath : undefined,
          shadowBy: installed.shadowBy,
          status: installed.broken ? 'broken' : installed.blocked ? 'blocked' : 'installed',
          pluginInfo: {
            id: descriptor?.id,
            name: descriptor?.name ?? installed.pluginName,
            version: descriptor?.version ?? '',
            author: descriptor?.author,
            description: descriptor?.description
          },
          supportedSources,
          descriptor,
          providerMethods: host?.getProviderMethods() ?? {},
          providerIconUrls: host?.getProviderIconUrls() ?? {},
          sidebarIconUrls: host?.getSidebarIconUrls() ?? {},
          skinPreviewUrls: host?.getSkinPreviewUrls() ?? {},
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
      const pluginCode = await this.downloadFile(url)

      // 插件格式校验
      if (type === 'lx') {
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
      const agents = getRequestAgentsFor(url)
      const response = await axios.get(url, {
        timeout: 30000, // 30秒超时
        responseType: 'text',
        // 代理由主进程网络设置决定;显式关闭以避免环境变量代理干扰
        proxy: false,
        ...(agents ? { httpAgent: agents.httpAgent, httpsAgent: agents.httpsAgent } : {}),
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

  async getTrustedConsentDetail(pluginId: string) {
    const installed = installedPlugins.get(pluginId)
    if (!installed || installed.broken) throw Error('插件未安装或文件损坏')
    const parsed = readInstalledArtifact(await fsPromise.readFile(installed.filePath, 'utf8'))
    if (parsed.header.manifest.id !== installed.descriptor?.id) throw Error('插件文件身份已改变')
    return trustedConsentDetail(pluginId, parsed.header.manifest,
      trustedPublisher(parsed.artifact, installed.development === true), installed.development === true)
  },

  async setTrustedConsent(pluginId: string, allowed: boolean) {
    return transitionPlugin(pluginId, async () => {
      const installed = installedPlugins.get(pluginId)
      if (!installed || installed.broken) throw Error('插件未安装或文件损坏')
      const parsed = readInstalledArtifact(await fsPromise.readFile(installed.filePath, 'utf8'))
      if (parsed.header.manifest.id !== installed.descriptor?.id) throw Error('插件文件身份已改变')
      const manifest = parsed.header.manifest
      const declaration = trustedDeclaration(manifest)
      if (!declaration) throw Error('插件未声明完全信任权限')
      const publisher = trustedPublisher(parsed.artifact, installed.development === true)
      if (allowed) {
        const accepted = await requestTrustedConsent(pluginId, manifest, publisher, installed.development === true, true)
        if (accepted !== true) return this.getTrustedConsentDetail(pluginId)
        // Detect replacement while the confirmation was visible.
        const current = await fsPromise.readFile(installed.filePath, 'utf8')
        const checked = readInstalledArtifact(current)
        if (checked.artifact.codeDigest !== parsed.artifact.codeDigest ||
          !isDeepStrictEqual(checked.header, parsed.header)) throw Error('插件文件已改变，请重新确认')
        writeTrustedConsent(pluginId, manifest, publisher, true)
        const host = loadedPlugins[pluginId]
        if (host) {
          if (installed.development) {
            delete loadedPlugins[pluginId]; clearRuntimeSelections(pluginId); cancelPluginUI(pluginId)
            await host.destroy()
          } else {
            await this.applyPluginEnabled(pluginId, false)
          }
          await this.applyPluginEnabled(pluginId, true)
        }
      } else {
        writeTrustedConsent(pluginId, manifest, publisher, false)
        const stopped = await stopTrustedRuntime(pluginId).catch(() => false)
        if (stopped && declaration.optional === true) {
          // Refresh the surviving sandbox's permission snapshot after persisting revocation.
          // This also invalidates pending prompts that could otherwise restore stale consent.
          loadedPlugins[pluginId]?.setGrantedPermissions(this.getPermissions(pluginId))
        }
        if (!stopped || declaration.optional !== true) {
          const host = loadedPlugins[pluginId]
          delete loadedPlugins[pluginId]; clearRuntimeSelections(pluginId); cancelPluginUI(pluginId)
          // Revocation must not run plugin lifecycle code before stopping its process.
          await host?.destroy()
          if (declaration.optional === true && host) await this.applyPluginEnabled(pluginId, true)
        }
        if (declaration.optional !== true) {
          installed.state.enabled = false
          installed.loadError = '此插件需要完全信任才能运行'
          if (!installed.development) savePluginState(pluginId, installed.state)
        }
      }
      pluginChanged({ type: 'state-changed', pluginId, enabled: !!loadedPlugins[pluginId] })
      return this.getTrustedConsentDetail(pluginId)
    })
  },

  getPermissions(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (plugin) return plugin.getGrantedPermissions().filter(key => String(this.getDescriptor(pluginId)?.permissions.find(p => p.key === key)?.name) !== 'runtime.trusted')
    if (!installedPlugins.has(pluginId)) throw new Error(`插件 ${pluginId} 未找到`)
    return readPermissionKeys(
      installedPlugins.get(pluginId)?.descriptor?.permissions ?? [],
      getPluginPermissions(pluginId)
    ).filter(key => String(installedPlugins.get(pluginId)?.descriptor?.permissions.find(p => p.key === key)?.name) !== 'runtime.trusted')
  },

  getDescriptor(pluginId: string) {
    const plugin = this.getPluginById(pluginId)
    if (plugin) return plugin.getDescriptor()
    const installed = installedPlugins.get(pluginId)
    if (!installed) throw new Error(`插件 ${pluginId} 未找到`)
    return installed.descriptor
  },

  savePermissions(pluginId: string, permissions: string[]) {
    const declarations = this.getDescriptor(pluginId)?.permissions ?? []
    if (!Array.isArray(permissions) || permissions.some(key => declarations.some(p => p.key === key && String(p.name) === 'runtime.trusted')))
      throw Error('完全信任只能通过专用确认框授权或撤销')
    const consentRecords = trustedConsentRecords(pluginId)
    const plugin = this.getPluginById(pluginId)
    if (plugin) {
      plugin.setGrantedPermissions(permissions)
      return plugin.getGrantedPermissions()
    }
    if (!installedPlugins.has(pluginId)) throw new Error(`插件 ${pluginId} 未找到`)
    const descriptor = installedPlugins.get(pluginId)?.descriptor
    if (!descriptor) throw new Error('无法修改未识别插件的权限')
    savePluginPermissions(pluginId, [...encodePermissionKeys(descriptor.permissions, permissions), ...consentRecords])
    return [...permissions]
  },

  saveConfig(pluginId: string, config: Record<string, any>) {
    const previous = getPluginConfig(pluginId)
    savePluginConfig(pluginId, config)
    const current = getPluginConfig(pluginId)
    const changed = [...new Set([...Object.keys(previous), ...Object.keys(current)])].filter(key =>
      !isDeepStrictEqual(previous[key], current[key]))
    if (changed.length) void loadedPlugins[pluginId]?.publishLifecycle('onConfigChange', changed).catch(console.warn)
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

  async routeCompleted(to: import('@shiqianjiang/ceru-plugin-sdk').PluginRoute, from: import('@shiqianjiang/ceru-plugin-sdk').PluginRoute | null) {
    await Promise.allSettled(runtimeEntries().map(([,host])=>host.publishRoute(to,from)))
  },
  beforeQuit(signal: AbortSignal): Promise<unknown>[] {
    return runtimeEntries().flatMap(([, host]) => {
      const pending = host.beforeQuit(signal)
      return pending ? [pending] : []
    })
  },
  async publishLifecycle<Name extends import('@shiqianjiang/ceru-plugin-sdk').LifecycleName>(name: Name, ...args: import('@shiqianjiang/ceru-plugin-sdk').LifecycleArgs<Name>) {
    if (name === 'onAppReady') appLifecycleReady = true
    await Promise.allSettled(runtimeEntries().map(([, host]) => host.publishLifecycle(name, ...args)))
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
