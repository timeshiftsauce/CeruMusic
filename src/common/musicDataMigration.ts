import {
  normalizeMusicItem,
  normalizeQualities,
  songKey,
  selectSong,
  type MusicItem
} from './musicItem'
import { toAppTrack } from './pluginMusic'
import { savedCoverDetail } from './musicAppearance'

export const MUSIC_STORAGE_KEYS = [
  'globalPlayStatus',
  'songList',
  'userInfo',
  'ceru-plugin-playback-history-v1'
] as const
export const MUSIC_SHADOW_PREFIX = 'ceru-music-pending:'

export function repairBrowserMusicData(
  raw: Record<string, string | null>,
  library: MusicItem[] = []
) {
  const issues: string[] = []
  const parse = (key: string, fallback: any) => {
    const text = raw[MUSIC_SHADOW_PREFIX + key] ?? raw[key]
    if (!text) return fallback
    try {
      return JSON.parse(text)
    } catch {
      issues.push(`${key} 无法解析，原文已备份`)
      return fallback
    }
  }
  const songs = (values: any, label: string): MusicItem[] => {
    if (!Array.isArray(values)) {
      issues.push(`${label} 不是数组，原文已备份`)
      return []
    }
    return values.flatMap((value, index) => {
      try {
        return [value?.ref ? toAppTrack(value) : normalizeMusicItem(value)]
      } catch {
        issues.push(`${label} 第 ${index + 1} 项无法恢复，原文已备份`)
        return []
      }
    })
  }
  const unique = (values: MusicItem[]) => {
    const seen = new Set<string>()
    return values.filter((song) => {
      const key = songKey(song)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }
  const state = parse('globalPlayStatus', {})
  let originalState: any = {}
  try {
    originalState = JSON.parse(raw.globalPlayStatus || '{}')
  } catch {
    /* Original text is backed up. */
  }
  const originalPlayer = originalState?.player ?? originalState ?? {}
  const originalSnapshot = originalPlayer.songInfo
    ? songs([originalPlayer.songInfo], '旧快照')[0]
    : undefined
  const legacy = state?.player ?? state ?? {}
  const snapshot = legacy.songInfo ? songs([legacy.songInfo], '当前歌曲')[0] : undefined
  let queue = unique(songs(parse('songList', []), '播放队列'))
  const preferencesValue = parse('userInfo', {})
  const preferences =
    preferencesValue && typeof preferencesValue === 'object' && !Array.isArray(preferencesValue)
      ? preferencesValue
      : {}
  const candidates = [
    ...queue,
    ...(snapshot ? [snapshot] : []),
    ...(originalSnapshot ? [originalSnapshot] : []),
    ...library
  ]
  const enrich = (song: MusicItem): MusicItem => {
    const matches = candidates.filter((value) => songKey(value) === songKey(song))
    const result = { ...song }
    for (const other of matches) {
      for (const field of [
        'name',
        'singer',
        'albumName',
        'albumId',
        'img',
        'hash',
        'lrc',
        'interval'
      ]) {
        if (
          result[field] == null ||
          result[field] === '' ||
          (field === 'interval' && ['0:00', '00:00'].includes(result[field]))
        )
          result[field] = other[field]
      }
      const qualities = normalizeQualities(result.types, result._types)
      const otherQualities = normalizeQualities(other.types, other._types)
      result.types = qualities.length
        ? qualities.map((q) => ({ ...otherQualities.find((o) => o.type === q.type), ...q }))
        : otherQualities
    }
    return normalizeMusicItem(result)
  }
  queue = queue.map(enrich)
  let current: MusicItem | undefined
  try {
    current = selectSong(queue, preferences.lastPlaySongKey ?? preferences.lastPlaySongId ?? '')
  } catch {
    /* Use the snapshot's full identity to disambiguate. */
  }
  current ??= snapshot ? enrich(snapshot) : undefined
  if (current) {
    preferences.lastPlaySongId = current.songmid
    preferences.lastPlaySongKey = songKey(current)
    if (!queue.some((song) => songKey(song) === songKey(current))) queue.push(current)
  }
  const history = unique(
    [
      ...songs(state?.history ?? [], '播放历史'),
      ...songs(originalState?.history ?? [], '原播放历史'),
      ...songs(parse('ceru-plugin-playback-history-v1', []), '2.0 播放历史'),
      ...(originalSnapshot && originalState.schemaVersion !== 2 ? [originalSnapshot] : [])
    ].map(enrich)
  ).slice(0, 200)
  const unresolved = history.filter(
    (song) => !song.interval || ['0:00', '00:00'].includes(song.interval)
  ).length
  if (unresolved) issues.push(`${unresolved} 首历史歌曲缺少时长，现存数据不足以恢复；未编造时长`)
  return {
    values: {
      globalPlayStatus: JSON.stringify({
        schemaVersion: 2,
        player: current
          ? {
              songId: String(current.songmid),
              songInfo: current,
              ...(snapshot && songKey(snapshot) === songKey(current) && snapshot.img === current.img
                ? { coverDetail: savedCoverDetail(legacy.coverDetail) }
                : {})
            }
          : {},
        history
      }),
      songList: JSON.stringify(queue),
      userInfo: JSON.stringify(preferences)
    },
    issues,
    fixed: queue.length + history.length
  }
}
