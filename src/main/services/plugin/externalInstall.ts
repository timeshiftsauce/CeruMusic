import { readFile, stat } from 'node:fs/promises'
import { basename } from 'node:path'
import { readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { readGuestInfo } from '@shiqianjiang/ceru-plugin-core/guests'
import { getPendingDeepLinks } from '../../router/pendingLinks'
import pluginService from './index'

const drafts = new Map<number, { code: string; name: string; target?: string; native: boolean }>()
export async function prepareExternalPlugin(sequence: number) {
  const entry = getPendingDeepLinks().find((item) => item.sequence === sequence)
  if (!entry || !['plugin-file', 'plugin-link'].includes(entry.kind))
    throw new Error('插件安装请求已失效')
  let code: string, name: string, target: string | undefined
  if (entry.kind === 'plugin-file') {
    const info = await stat(entry.value)
    if (!info.isFile() || info.size > 16 * 1024 * 1024)
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
