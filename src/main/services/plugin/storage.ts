import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { getAppDirPath } from '../../utils/path'
import { getPluginConfig } from './pluginConfig'

interface StorageRecord {
  version: 1
  values: Record<string, unknown>
  readers: Record<string, '*' | string[]>
}
type StorageAdapter = {
  read(id: string): StorageRecord
  write(id: string, value: StorageRecord): void
}
const isObject = (value: unknown): value is Record<string, any> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
const isId = (id: unknown): id is string =>
  typeof id === 'string' && /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(id)
const own = (value: object, key: string) => Object.hasOwn(value, key)
function storagePath(id: string) {
  if (!isId(id)) throw new Error('无效的插件 ID')
  return join(getAppDirPath(), 'plugins', 'storage', id + '.json')
}
const disk: StorageAdapter = {
  read(id) {
    const path = storagePath(id)
    if (!existsSync(path))
      return { version: 1, values: getPluginConfig(id + '.storage'), readers: {} }
    const value = JSON.parse(readFileSync(path, 'utf8'))
    if (value?.version !== 1 || !isObject(value.values) || !isObject(value.readers))
      throw new Error('插件存储文件损坏')
    return value
  },
  write(id, value) {
    const path = storagePath(id)
    mkdirSync(join(getAppDirPath(), 'plugins', 'storage'), { recursive: true })
    writeFileSync(path + '.tmp', JSON.stringify(value))
    renameSync(path + '.tmp', path)
    // Only remove legacy data after the new data and its ACL are committed together.
    const legacy = join(getAppDirPath(), 'plugins', 'config', id + '.storage.json')
    if (existsSync(legacy)) unlinkSync(legacy)
  }
}

export function deletePluginStorage(instanceId: string) {
  const file = storagePath(instanceId)
  if (existsSync(file)) unlinkSync(file)
  if (existsSync(file + '.tmp')) unlinkSync(file + '.tmp')
}

/** Resolve public manifest IDs through installed inventory, never through caller-supplied paths. */
export class PluginStorage {
  constructor(
    private readonly instanceId: string,
    private readonly manifestId: string,
    private readonly resolveOwner: (manifestId: string) => string | undefined,
    private readonly adapter: StorageAdapter = disk
  ) {}

  invoke(method: 'get' | 'set' | 'delete', selector: unknown, value?: unknown): unknown {
    const request = typeof selector === 'string' ? { key: selector } : selector
    if (
      !isObject(request) ||
      Object.keys(request).some((key) => !['key', 'pluginId', 'readableBy'].includes(key))
    )
      throw new Error('无效的插件存储请求')
    const key = request.key
    if (
      typeof key !== 'string' ||
      !key ||
      key.length > 256 ||
      ['__proto__', 'constructor', 'prototype'].includes(key)
    )
      throw new Error('无效的存储键')
    if (request.pluginId !== undefined && !isId(request.pluginId)) throw new Error('无效的插件 ID')
    const ownerId = request.pluginId ?? this.manifestId
    const local = ownerId === this.manifestId
    if (!local && method !== 'get') throw new Error('不能修改其他插件的数据或读取权限')
    if (method !== 'set' && own(request, 'readableBy'))
      throw new Error('只有数据所属插件可以设置读取权限')
    const target = local ? this.instanceId : this.resolveOwner(ownerId)
    if (!target) throw new Error('目标插件未安装')
    const stored = this.adapter.read(target)
    if (!local) {
      const readers = own(stored.readers, key) ? stored.readers[key] : undefined
      if (readers !== '*' && !(Array.isArray(readers) && readers.includes(this.manifestId)))
        throw new Error('目标插件未授权读取此数据')
    }
    if (method === 'get')
      return own(stored.values, key) ? JSON.parse(JSON.stringify(stored.values[key])) : null
    const next: StorageRecord = {
      version: 1,
      values: { ...stored.values },
      readers: { ...stored.readers }
    }
    if (method === 'delete') {
      delete next.values[key]
      delete next.readers[key]
    } else {
      if (value === undefined) throw new Error('存储值必须是 JSON，空值请使用 null')
      next.values[key] = value
      if (own(request, 'readableBy')) {
        const readers = request.readableBy
        if (
          readers !== '*' &&
          (!Array.isArray(readers) || readers.length > 128 || !readers.every(isId))
        )
          throw new Error('读取权限必须是 * 或插件 ID 数组')
        next.readers[key] = readers === '*' ? '*' : [...new Set<string>(readers)]
      }
    }
    const encoded = JSON.stringify(next)
    if (Buffer.byteLength(encoded, 'utf8') > 10 * 1024 * 1024)
      throw new Error('插件存储超过 10 MiB')
    this.adapter.write(target, JSON.parse(encoded))
    return null
  }
}
