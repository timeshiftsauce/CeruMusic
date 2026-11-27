import type { MusicItem } from '@common/musicItem'
import { isProviderTrackRef, normalizeAppTrackRef } from '@common/pluginMusic'
import { activePluginContributions } from './pluginState'

/** Mirror host routing: public tracks may use any implementation of their provider.
 * An account-bound or private track may only use its owning plugin.
 */
export function trackMenuCapabilities(song?: MusicItem) {
  const resource = normalizeAppTrackRef(song?.pluginResource)
  const source = resource?.providerId || song?.source
  if (!source || source === 'local') return { comments: false, websiteShare: false }

  const implementations = activePluginContributions.value.filter(
    ({ descriptor, providerMethods }) =>
      Object.hasOwn(providerMethods ?? {}, source) &&
      descriptor.providers.some((provider) => provider.id === source)
  )
  function candidates(owner?: string) {
    if (!owner) return implementations
    const owners = implementations.filter(
      ({ pluginId, descriptor }) => pluginId === owner || descriptor.id === owner
    )
    return owners.length === 1 ? owners : []
  }

  const commentProviders = candidates(
    resource && !isProviderTrackRef(resource) ? resource.pluginId : undefined
  )
  const shareRef = song?.pluginResource
  const shareProviders = candidates(shareRef?.scope === 'provider' ? undefined : shareRef?.pluginId)
  return {
    comments: commentProviders.some(({ actionIds }) =>
      actionIds?.some((action) => action === 'comments.hot' || action === 'comments.get')
    ),
    // The website dialog exports a playback resolver. The sharing.describe method
    // alone provides a descriptor and cannot generate a playable website link.
    websiteShare: shareProviders.some(
      ({ descriptor, providerMethods }) =>
        descriptor.hasShareResolver &&
        providerMethods[source].includes('tracks.resolve') &&
        descriptor.providers.some(
          (provider) => provider.id === source && provider.qualities?.length
        )
    )
  }
}
