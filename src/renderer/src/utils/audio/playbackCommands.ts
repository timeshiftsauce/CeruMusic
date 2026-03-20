import type { SongList } from '../../types/audio'

type ReplacePlaylistExecutor = ((songs: SongList[]) => Promise<void>) | null
type AddToPlaylistAndPlayExecutor = ((song: SongList) => Promise<void>) | null
type AppendToPlaylistExecutor = ((songs: SongList[]) => Promise<void>) | null
type PausePlaybackExecutor = (() => Promise<void>) | null

let replacePlaylistExecutor: ReplacePlaylistExecutor = null
let addToPlaylistAndPlayExecutor: AddToPlaylistAndPlayExecutor = null
let appendToPlaylistExecutor: AppendToPlaylistExecutor = null
let pausePlaybackExecutor: PausePlaybackExecutor = null

const ensureRegistered = <T>(executor: T | null): T => {
  if (!executor) {
    throw new Error('播放器未初始化')
  }

  return executor
}

export const registerReplacePlaylistCommand = (executor: ReplacePlaylistExecutor) => {
  replacePlaylistExecutor = executor
}

export const executeReplacePlaylistCommand = async (songs: SongList[]) => {
  const executor = ensureRegistered(replacePlaylistExecutor)
  await executor(songs)
}

export const registerAddToPlaylistAndPlayCommand = (executor: AddToPlaylistAndPlayExecutor) => {
  addToPlaylistAndPlayExecutor = executor
}

export const executeAddToPlaylistAndPlayCommand = async (song: SongList) => {
  const executor = ensureRegistered(addToPlaylistAndPlayExecutor)
  await executor(song)
}

export const registerAppendToPlaylistCommand = (executor: AppendToPlaylistExecutor) => {
  appendToPlaylistExecutor = executor
}

export const executeAppendToPlaylistCommand = async (songs: SongList | SongList[]) => {
  const executor = ensureRegistered(appendToPlaylistExecutor)
  const normalizedSongs = Array.isArray(songs) ? songs : [songs]

  if (normalizedSongs.length === 0) return

  await executor(normalizedSongs)
}

export const registerPausePlaybackCommand = (executor: PausePlaybackExecutor) => {
  pausePlaybackExecutor = executor
}

export const executePausePlaybackCommand = async () => {
  const executor = ensureRegistered(pausePlaybackExecutor)
  await executor()
}
