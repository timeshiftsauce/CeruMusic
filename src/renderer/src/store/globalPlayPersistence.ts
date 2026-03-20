import type { SongList } from '../types/audio'
import { fromPersistedSongSnapshot, toPersistedSongSnapshot } from './localUserPersistence'

export const GLOBAL_PLAY_STATUS_STORAGE_KEY = 'globalPlayStatus'

export type PersistedGlobalPlayerState = {
  songId?: string | number | null
  songInfo?: SongList | null
}

export const serializeGlobalPlayerStateForStorage = (player: any) => {
  return {
    songId:
      typeof player?.songId === 'string' || typeof player?.songId === 'number'
        ? player.songId
        : undefined,
    songInfo: toPersistedSongSnapshot(player?.songInfo)
  }
}

export const deserializeGlobalPlayerStateFromStorage = (raw: string | null): PersistedGlobalPlayerState => {
  if (!raw) return {}

  try {
    const parsed = JSON.parse(raw)
    const playerLike = parsed?.player ?? parsed
    const songInfo = fromPersistedSongSnapshot(playerLike?.songInfo)
    const songId =
      typeof playerLike?.songId === 'string' || typeof playerLike?.songId === 'number'
        ? playerLike.songId
        : undefined

    return {
      ...(typeof songId !== 'undefined' ? { songId } : {}),
      ...(songInfo ? { songInfo } : {})
    }
  } catch {
    return {}
  }
}
