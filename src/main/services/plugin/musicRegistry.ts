import { MusicRegistry } from '@shiqianjiang/ceru-plugin-core/music'
import { registerLocalSource } from '../musicSdk/localSource'
import { pluginMedia } from './media/mediaProtocol'

export const providerOwners = new Map<string, string>()
export const capabilityOwners = new Map<string, string>()
let ownerOrder: () => string[] = () => []
export function setMusicOwnerOrder(read: () => string[]) {
  ownerOrder = read
}
export const musicRegistry = new MusicRegistry(
  (source, method, owners) => [
    ...new Set(
      [
        capabilityOwners.get(source + ':' + method),
        providerOwners.get(source),
        ...ownerOrder(),
        ...owners
      ].filter((owner): owner is string => !!owner && owners.includes(owner))
    )
  ],
  (source, result, operation) => pluginMedia.prepare(source.pluginId, result, operation.signal)
)
registerLocalSource(musicRegistry)
