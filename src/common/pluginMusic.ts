import type { CrLyric } from '@shiqianjiang/ceru-plugin-sdk'
import { formatQualitySize } from './utils/quality'
/** Application adapters consume standard JSON only. Platform formats stay in plugins. */
export function toAppTrack(item: any): any {
  const ref = item.ref
  if (!ref || ref.kind !== 'track' || !item.metadata) throw new Error('无效的标准歌曲')
  const seconds = Math.round((item.metadata.durationMs ?? item.durationMs ?? 0) / 1000)
  const types = (item.metadata.qualities ?? []).map((type: string) => {
    const sizeBytes = item.metadata.qualitySizes?.[type]
    return Number.isSafeInteger(sizeBytes) && sizeBytes > 0
      ? { type, size: formatQualitySize(sizeBytes), sizeBytes }
      : { type }
  })
  return {
    songmid: ref.id,
    source: ref.providerId,
    name: item.title,
    singer: item.metadata.artists.join('、'),
    albumName: item.metadata.album?.title ?? '',
    albumId: item.metadata.album?.id ?? '',
    img: item.metadata.artworkUrl ?? '',
    interval: `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`,
    types,
    _types: Object.fromEntries(types.map(({ type, ...details }: any) => [type, details])),
    lrc: null,
    pluginResource: ref
  }
}

export function toPluginTrack(song: any, manifestId = 'local.library'): any {
  return {
    ref: song.pluginResource ?? {
      pluginId: manifestId,
      providerId: song.source || 'local',
      kind: 'track',
      id: String(song.songmid)
    },
    title: song.name ?? '',
    subtitle: song.singer ?? '',
    playable: true,
    capabilities: ['music.resolve@1', 'music.lyrics@1'],
    metadata: {
      artists: String(song.singer ?? '')
        .split('、')
        .filter(Boolean),
      album: { id: String(song.albumId ?? ''), title: song.albumName ?? '' },
      artworkUrl: song.img ?? '',
      qualities: (song.types ?? []).map((q: any) => (typeof q === 'string' ? q : q.type)),
      qualitySizes: Object.fromEntries((song.types ?? []).flatMap((q: any) => {
        const type = typeof q === 'string' ? q : q.type
        const bytes = q.sizeBytes ?? song._types?.[type]?.sizeBytes
        return Number.isSafeInteger(bytes) && bytes > 0 ? [[type, bytes]] : []
      }))
    }
  }
}

export function toPlayerLyrics(
  document: CrLyric
): import('@applemusic-like-lyrics/core').LyricLine[] {
  const offset = Number(document.offsetMs) || 0
  return document.lines.map((line: any, index: number) => {
    const end = line.endTimeMs ?? document.lines[index + 1]?.startTimeMs ?? line.startTimeMs + 5000
    return {
      startTime: Math.max(0, line.startTimeMs + offset),
      endTime: Math.max(0, end + offset),
      words: (line.words?.length
        ? line.words
        : [{ text: line.text, startTimeMs: line.startTimeMs, endTimeMs: end }]
      ).map((word: any) => ({
        word: word.text,
        startTime: Math.max(0, word.startTimeMs + offset),
        endTime: Math.max(0, word.endTimeMs + offset),
        ...(word.romanization ? { romanWord: word.romanization } : {})
      })),
      translatedLyric: line.translation ?? '',
      romanLyric: line.romanization ?? '',
      isBG: line.isBackground ?? false,
      isDuet: line.isDuet ?? false
    }
  })
}
