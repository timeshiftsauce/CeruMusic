import type { JsonValue } from '@shiqianjiang/ceru-plugin-sdk'

export type PluginStorageReadKey = string | { key: string; pluginId?: string }
export type PluginStorageWriteKey =
  | string
  | {
      key: string
      pluginId?: string
      /** Omitted preserves the current policy; new keys default to private. */
      readableBy?: '*' | string[]
    }
/** Desktop Host extensions carried by the existing v2 storage RPC. */
export interface PluginStorageAPI {
  get<T extends JsonValue = JsonValue>(key: PluginStorageReadKey): Promise<T | null>
  set(key: PluginStorageWriteKey, value: JsonValue): Promise<void>
  delete(key: PluginStorageReadKey): Promise<void>
}
