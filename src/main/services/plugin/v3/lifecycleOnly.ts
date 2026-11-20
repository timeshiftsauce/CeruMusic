import { NodePluginSandbox } from '@shiqianjiang/ceru-plugin-core/node'
import { requestNetwork } from '@shiqianjiang/ceru-plugin-core/network'
import { createDispatcher, type HostServices } from '@shiqianjiang/ceru-plugin-core/dispatch'
import { resolveArtifactConfig } from '@shiqianjiang/ceru-plugin-issuer'
import type { readInstalledArtifact } from '../runtimes'
import { getPluginConfig, getPluginPermissions } from '../pluginConfig'
import { readPermissionKeys } from '../shared/permissions'
import { PluginStorage } from '../storage'

type V3File = Extract<ReturnType<typeof readInstalledArtifact>, {runtime: 3}>
type Hook = { name: 'onInstall' | 'onUninstall' } | { name: 'onUpdate'; from: string }

export async function runLifecycleOnly(pluginId: string, parsed: V3File, hook: Hook) {
  const manifest = parsed.header.manifest
  if (!manifest.entry.logic) return
  const controller = new AbortController()
  const permissions = manifest.uses?.permissions ?? []
  const granted = () => readPermissionKeys(permissions, getPluginPermissions(pluginId))
  const ownStorage = new PluginStorage(pluginId, manifest.id, () => undefined)
  const config = resolveArtifactConfig(parsed.header)
  const services: Partial<HostServices> = {
    'config.get': async () => ({ ...config, ...getPluginConfig(pluginId) }),
    'storage.get': async data => ownStorage.invoke('get', data.key),
    'storage.set': async data => ownStorage.invoke('set', data.key, data.value),
    'storage.delete': async data => ownStorage.invoke('delete', data.key),
    'permissions.query': async data => ({status: granted().includes(data.key) ? 'granted' : 'denied'}),
    'http.request': (data, context) => requestNetwork(data, () => permissions.some(item => item.name === 'network.private' && granted().includes(item.key)), context.signal),
    'operations.cancel': async () => null
  }
  const dispatch = createDispatcher(services as HostServices, { manifest, pluginId, log: console, signal: controller.signal,
    authorize: async (key, name) => {
      if (!key || !permissions.some(item => item.key === key && item.name === name) || !granted().includes(key))
        throw Error('生命周期模式不会请求新权限')
    }
  })
  let invoking = false
  const worker = new NodePluginSandbox(async (method, data) => {
    if (!invoking && !['config.get','storage.get','permissions.query'].includes(method))
      throw Error('登记生命周期回调时不能执行宿主操作')
    return dispatch(method, data)
  }, (type, data) => { if (type === 'log' && ['warn','error'].includes(data?.level)) console.warn('[plugin lifecycle]',pluginId,data.message) })
  const timer = setTimeout(() => { controller.abort(); worker.dispose() }, 5000)
  try {
    await worker.start(parsed.artifact, undefined, hook.name)
    invoking = true
    await worker.invoke('lifecycle', hook.name, '', hook.name === 'onUpdate' ? [{from:hook.from}] : [], controller.signal)
  } catch (error) { console.warn('插件生命周期未完成:', pluginId, hook.name, error) }
  finally { clearTimeout(timer); controller.abort(); worker.dispose() }
}
