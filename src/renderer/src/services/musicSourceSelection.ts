import type { UserInfo } from '@renderer/types/userInfo'

export function reconcileSelectedSource(current: string | undefined, preferredOwner: string | undefined,
  sources: readonly { id: string; pluginId: string; runtime: number | 'host' }[], restored: boolean): string {
  if (current && !restored) return current
  const candidate = sources.find(source => source.id === current)
  if (candidate && (!preferredOwner || candidate.pluginId === preferredOwner)) return candidate.id
  if (current && preferredOwner) return sources.find(source => source.runtime === 'host' && source.id !== current)?.id ?? ''
  return sources[0]?.id ?? ''
}

export function withSelectedMusicSource(info: UserInfo, source: string): UserInfo | null {
  if (!info.supportedSources || !Object.hasOwn(info.supportedSources, source)) return null
  const qualities = info.supportedSources[source].qualitys ?? []
  if (source === 'mix' || !qualities.length)
    return info.selectSources === source ? info : { ...info, selectSources: source }
  const saved = info.sourceQualityMap?.[source]
  const quality = saved && qualities.includes(saved) ? saved : qualities[qualities.length - 1]
  if (info.selectSources === source && info.selectQuality === quality && saved === quality) return info
  return { ...info, selectSources: source, selectQuality: quality, sourceQualityMap: { ...info.sourceQualityMap, [source]: quality } }
}
