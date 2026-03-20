/// <reference types="jest" />

import type { SongList } from '../../types/audio'
import { createPlaybackActions } from './playbackActions'

describe('playbackActions', () => {
  it('should delegate play requests to the add-and-play executor', async () => {
    const addAndPlay = jest.fn(async () => {})
    const actions = createPlaybackActions(
      {
        addAndPlay,
        append: jest.fn(async () => {}),
        pause: jest.fn(async () => {}),
        replace: jest.fn(async () => {})
      },
      jest.fn()
    )

    const song = { songmid: 1, name: 'A' } as SongList
    await actions.playSong(song)

    expect(addAndPlay).toHaveBeenCalledTimes(1)
    expect(addAndPlay).toHaveBeenCalledWith(song)
  })

  it('should delegate batch append requests to the append executor', async () => {
    const append = jest.fn(async () => {})
    const actions = createPlaybackActions(
      {
        addAndPlay: jest.fn(async () => {}),
        append,
        pause: jest.fn(async () => {}),
        replace: jest.fn(async () => {})
      },
      jest.fn()
    )

    const songs = [{ songmid: 2, name: 'B' }] as SongList[]
    await actions.appendSongs(songs)

    expect(append).toHaveBeenCalledTimes(1)
    expect(append).toHaveBeenCalledWith(songs)
  })

  it('should report fallback errors when an executor rejects without a message', async () => {
    const notifyError = jest.fn()
    const actions = createPlaybackActions(
      {
        addAndPlay: jest.fn(async () => {}),
        append: jest.fn(async () => {}),
        pause: jest.fn(async () => {
          throw new Error('')
        }),
        replace: jest.fn(async () => {})
      },
      notifyError
    )

    await actions.pause()

    expect(notifyError).toHaveBeenCalledTimes(1)
    expect(notifyError).toHaveBeenCalledWith('暂停失败')
  })
})
