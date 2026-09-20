import type {
  JsonObject,
  JsonValue,
  OperationContext,
  PluginContext
} from '@shiqianjiang/ceru-plugin-sdk'

export interface DesktopGuestInfo {
  id: string
  adapterId: string
  name: string
  version: string
  author?: string
  state: 'ready' | 'stopped' | 'error'
  selected: boolean
  providers: { id: string; name: string; qualities: string[]; protocols: string[] }[]
  error?: string
}
export type DesktopReadKey = string | { key: string; pluginId?: string }
export type DesktopWriteKey =
  | string
  | { key: string; pluginId?: string; readableBy?: '*' | string[] }

export type DesktopPluginContext = Omit<PluginContext, 'storage' | 'ui' | 'guests'> & {
  storage: {
    get<T extends JsonValue = JsonValue>(key: DesktopReadKey): Promise<T | null>
    set(key: DesktopWriteKey, value: JsonValue): Promise<void>
    delete(key: DesktopReadKey): Promise<void>
  }
  ui: Omit<PluginContext['ui'], 'playlistImport'> & {
    playlistImport: {
      open(request: { importerId?: string; initialValue?: string; title?: string }): Promise<void>
    }
    pluginUpdate: {
      request(request: { version: string; url: string; notes?: string }): Promise<{
        accepted: boolean
        updated: boolean
        version?: string
        queued?: boolean
      }>
    }
  }
  guests: {
    list(): Promise<DesktopGuestInfo[]>
    import(adapterId: string): Promise<DesktopGuestInfo | null>
    select(guestId: string | null): Promise<void>
    remove(guestId: string): Promise<void>
    invoke(
      guestId: string,
      method: string,
      input: JsonValue,
      operation: OperationContext
    ): Promise<JsonValue>
  }
}

/** Type adapter for the documented desktop implementation; it does not add runtime methods. */
export function desktopAPI(ctx: PluginContext): DesktopPluginContext {
  return ctx as unknown as DesktopPluginContext
}

export type DesktopSurfaceState = JsonObject
