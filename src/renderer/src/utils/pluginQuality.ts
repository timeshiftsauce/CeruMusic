import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { pluginContributions } from '@renderer/services/pluginState'

export function pluginQualityOrder(source: string): string[] {
  const current = LocalUserDetailStore().userInfo.supportedSources?.[source]?.qualitys
  if (current?.length) return [...current]
  for (const { manifest } of pluginContributions.value.filter((item) => item.enabled)) {
    const provider = manifest.contributes?.providers?.find((item: any) => item.id === source)
    if (provider?.qualities?.length) return [...provider.qualities]
  }
  return []
}
export function batchQualityChoices(songs: readonly { source: string }[]) {
  return [...new Set(songs.flatMap((song) => pluginQualityOrder(song.source)))].map((type) => ({
    type,
    size: ''
  }))
}
