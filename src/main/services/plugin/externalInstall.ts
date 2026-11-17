import { readFile, stat } from 'node:fs/promises'
import { basename, isAbsolute, resolve } from 'node:path'
import { readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { readGuestInfo } from '@shiqianjiang/ceru-plugin-core/guests'
import { enqueueDeepLink, getPendingDeepLinks } from '../../router/pendingLinks'
import pluginService from './index'

/** Single-file plugins are small by contract; the same ceiling guards every local entry. */
export const MAX_PLUGIN_FILE_BYTES = 16 * 1024 * 1024

const drafts = new Map<number, { code: string; name: string; target?: string; native: boolean }>()

/**
 * Accept a plugin file the user dragged onto the window. The path is only
 * validated and queued; reading and running the code stays in the shared
 * prepare/commit flow used by deep links and command-line arguments.
 */
export async function queueExternalPluginFile(filePath: unknown): Promise<number> {
  if (typeof filePath !== 'string' || !isAbsolute(filePath))
    throw new Error('插件文件路径无效，请重新拖入插件文件')
  const resolved = resolve(filePath)
  if (!/\.js$/i.test(resolved)) throw new Error('只能添加 .js 插件文件')
  let info
  try {
    info = await stat(resolved)
  } catch {
    throw new Error('插件文件不存在或无法读取')
  }
  if (!info.isFile()) throw new Error('请拖入单个 .js 插件文件')
  if (info.size > MAX_PLUGIN_FILE_BYTES) throw new Error('插件文件过大（上限 16 MB）')
  return enqueueDeepLink('plugin-file', resolved).sequence
}

export async function prepareExternalPlugin(sequence: number) {
  const entry = getPendingDeepLinks().find((item) => item.sequence === sequence)
  if (!entry || !['plugin-file', 'plugin-link'].includes(entry.kind))
    throw new Error('插件安装请求已失效')
  let code: string, name: string, target: string | undefined
  if (entry.kind === 'plugin-file') {
    const info = await stat(entry.value)
    if (!info.isFile() || info.size > MAX_PLUGIN_FILE_BYTES)
      throw new Error('插件文件过大或不是普通文件')
    code = await readFile(entry.value, 'utf8')
    name = basename(entry.value)
  } else {
    const link = new URL(entry.value)
    const url = link.searchParams.get('url')!
    if (!['http:', 'https:'].includes(new URL(url).protocol)) throw new Error('插件地址无效')
    target = link.searchParams.get('pluginId') || undefined
    code = await pluginService.downloadFile(url)
    name = basename(new URL(url).pathname)
  }
  const parents = await pluginService.getPluginsList()
  try {
    const { manifest } = readPluginArtifact(code).header
    const existing = parents.find((p) => p.pluginInfo.id === manifest.id)
    if (target && existing?.pluginId !== target) throw new Error('更新插件 ID 不匹配')
    drafts.set(sequence, { code, name, target, native: true })
    return {
      name: manifest.name,
      version: manifest.version,
      description: manifest.description || '',
      update: !!existing,
      formats: [] as { value: string; label: string }[]
    }
  } catch (error) {
    if (target) throw error
    const adapters = parents
      .filter((p) => p.enabled)
      .flatMap((p) =>
        (p.manifest.contributes?.guestAdapters || []).map((a: any) => ({
          value: p.pluginId + ':' + a.id,
          label: (a.title || a.format) + ' · ' + p.pluginInfo.name
        }))
      )
    if (!adapters.length) throw new Error('无法识别澜音插件格式；其他格式请先使用对应的兼容环境')
    const info = readGuestInfo(code, name)
    drafts.set(sequence, { code, name, native: false })
    return {
      name: info.name,
      version: info.version,
      description: info.description || '',
      update: false,
      formats: adapters
    }
  }
}
export async function commitExternalPlugin(sequence: number, format?: string) {
  const draft = drafts.get(sequence)
  if (!draft || !getPendingDeepLinks().some((item) => item.sequence === sequence))
    throw new Error('安装请求已失效')
  drafts.delete(sequence)
  if (draft.native) return pluginService.addPlugin(draft.code, draft.name, draft.target)
  const split = format?.indexOf(':') ?? -1
  if (split < 1) throw new Error('请选择兼容环境')
  const parent = pluginService.getPluginById(format!.slice(0, split))
  if (!parent) throw new Error('兼容环境未运行')
  return parent.importGuestScript(format!.slice(split + 1), draft.code, draft.name)
}
export function discardExternalPlugin(sequence: number) {
  drafts.delete(sequence)
}
