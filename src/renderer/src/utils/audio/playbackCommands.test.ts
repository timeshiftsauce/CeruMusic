/// <reference types="jest" />

import type { SongList } from '../../types/audio'
import {
  executeAddToPlaylistAndPlayCommand,
  executeAppendToPlaylistCommand,
  executePausePlaybackCommand,
  executeReplacePlaylistCommand,
  registerAddToPlaylistAndPlayCommand,
  registerAppendToPlaylistCommand,
  registerPausePlaybackCommand,
  registerReplacePlaylistCommand
} from './playbackCommands'

const resetPlaybackCommands = () => {
  registerAddToPlaylistAndPlayCommand(null)
  registerAppendToPlaylistCommand(null)
  registerPausePlaybackCommand(null)
  registerReplacePlaylistCommand(null)
}

describe('playbackCommands', () => {
  afterEach(() => {
    resetPlaybackCommands()
  })

  it('should reject when the replace-playlist command has not been registered', async () => {
    await expect(executeReplacePlaylistCommand([])).rejects.toThrow('播放器未初始化')
  })

  it('should await the registered replace-playlist command', async () => {
    const handler = jest.fn(async () => {})
    registerReplacePlaylistCommand(handler)

    const songs = [{ songmid: 1, name: 'A' }] as SongList[]
    await executeReplacePlaylistCommand(songs)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(songs)
  })

  it('should await the registered add-to-play-and-play command', async () => {
    const handler = jest.fn(async () => {})
    registerAddToPlaylistAndPlayCommand(handler)

    const song = { songmid: 2, name: 'B' } as SongList
    await executeAddToPlaylistAndPlayCommand(song)

    expect(handler).toHaveBeenCalledTimes(1)
    expect(handler).toHaveBeenCalledWith(song)
  })

  it('should forward single and batch append requests to the registered append command', async () => {
    const handler = jest.fn(async () => {})
    registerAppendToPlaylistCommand(handler)

    const song = { songmid: 3, name: 'C' } as SongList
    const songs = [{ songmid: 4, name: 'D' }] as SongList[]

    await executeAppendToPlaylistCommand(song)
    await executeAppendToPlaylistCommand(songs)

    expect(handler).toHaveBeenCalledTimes(2)
    expect(handler).toHaveBeenNthCalledWith(1, [song])
    expect(handler).toHaveBeenNthCalledWith(2, songs)
  })

  it('should await the registered pause command', async () => {
    const handler = jest.fn(async () => {})
    registerPausePlaybackCommand(handler)

    await executePausePlaybackCommand()

    expect(handler).toHaveBeenCalledTimes(1)
  })
})
