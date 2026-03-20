import { MessagePlugin } from 'tdesign-vue-next'
import type { SongList } from '../../types/audio'
import {
  executeAddToPlaylistAndPlayCommand,
  executeAppendToPlaylistCommand,
  executePausePlaybackCommand,
  executeReplacePlaylistCommand
} from '../../utils/audio/playbackCommands'

export type PlaybackExecutors = {
  addAndPlay: (song: SongList) => Promise<void>
  append: (songs: SongList[]) => Promise<void>
  pause: () => Promise<void>
  replace: (songs: SongList[]) => Promise<void>
}

const defaultExecutors: PlaybackExecutors = {
  addAndPlay: executeAddToPlaylistAndPlayCommand,
  append: executeAppendToPlaylistCommand,
  pause: executePausePlaybackCommand,
  replace: executeReplacePlaylistCommand
}

const resolveErrorMessage = (error: unknown, fallback: string) => {
  const message =
    error && typeof error === 'object' && 'message' in error ? String((error as any).message) : ''
  return message.trim() || fallback
}

export const createPlaybackActions = (
  executors: PlaybackExecutors = defaultExecutors,
  notifyError: (message: string) => void = (message) => {
    MessagePlugin.error(message)
  }
) => {
  const runSafely = async (runner: () => Promise<void>, fallbackMessage: string) => {
    try {
      await runner()
    } catch (error) {
      notifyError(resolveErrorMessage(error, fallbackMessage))
    }
  }

  return {
    playSong: async (song: SongList) =>
      runSafely(() => executors.addAndPlay(song), '播放失败'),
    appendSong: async (song: SongList) =>
      runSafely(() => executors.append([song]), '添加到播放列表失败'),
    appendSongs: async (songs: SongList[]) =>
      runSafely(() => executors.append(songs), '添加到播放列表失败'),
    pause: async () => runSafely(() => executors.pause(), '暂停失败'),
    replaceSongs: async (songs: SongList[]) =>
      runSafely(() => executors.replace(songs), '播放列表替换失败')
  }
}

export const usePlaybackActions = () => createPlaybackActions()
