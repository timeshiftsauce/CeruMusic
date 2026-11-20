import type { HostServices } from '../hostServices'
import type { RegistrationContext } from '@shiqianjiang/ceru-plugin-core'
import type { GuestServices } from '@shiqianjiang/ceru-plugin-core/guests'
import type { GuestInfo, JsonValue } from '@shiqianjiang/ceru-plugin-sdk'

export type Logger = Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>
export type Activate = (
  context: Pick<
    RegistrationContext,
    'config' | 'providers' | 'actions' | 'playlistImporters' | 'lyricConverters'
  >
) => Promise<() => unknown>
export type GuestOptions = Omit<GuestServices, 'artifact'>
export type SelectedGuest = { script: string; info: GuestInfo }
export type SurfaceAction = (
  action: string,
  input: JsonValue,
  signal?: AbortSignal
) => Promise<unknown>
export interface RuntimeHooks {
  services: HostServices
  pluginId: string
  log: Logger
  signal: AbortSignal
  development?: boolean
  granted(name:string): boolean
  authorize(key: string | undefined, name: string): Promise<void>
  rpc(method: string, data: any, signal?: AbortSignal): Promise<any>
  event(type: string, data: any): void
  operationState(signal:AbortSignal):Promise<import('@shiqianjiang/ceru-plugin-sdk').OperationState>
}
