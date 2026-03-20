/// <reference types="jest" />

import { createSongCoverQuery } from './songCoverQuery'

describe('songCoverQuery', () => {
  it('should reuse cached cover results for the same song key', async () => {
    const fetchCover = jest.fn(async (_source: string, song: any) => `cover-${song.songmid}`)
    const query = createSongCoverQuery({
      fetchCover
    })
    const songs = [{ songmid: 1, img: '' }]

    await query.fill({
      songs,
      source: 'wy'
    })
    songs[0].img = ''
    await query.fill({
      songs,
      source: 'wy'
    })

    expect(fetchCover).toHaveBeenCalledTimes(1)
    expect(songs[0].img).toBe('cover-1')
  })

  it('should dedupe concurrent cover requests for the same song key', async () => {
    const fetchCover = jest.fn(
      async (_source: string, song: any) =>
        await new Promise<string>((resolve) => setTimeout(() => resolve(`cover-${song.songmid}`), 5))
    )
    const query = createSongCoverQuery({
      fetchCover
    })
    const songsA = [{ songmid: 2, img: '' }]
    const songsB = [{ songmid: 2, img: '' }]

    await Promise.all([
      query.fill({ songs: songsA, source: 'tx' }),
      query.fill({ songs: songsB, source: 'tx' })
    ])

    expect(fetchCover).toHaveBeenCalledTimes(1)
    expect(songsA[0].img).toBe('cover-2')
    expect(songsB[0].img).toBe('cover-2')
  })

  it('should stop applying stale fills after reset', async () => {
    let resetDone = false
    const fetchCover = jest.fn(async (_source: string, song: any) => {
      if (!resetDone) {
        resetDone = true
      }
      return `cover-${song.songmid}`
    })
    const query = createSongCoverQuery({
      fetchCover
    })
    const songs = [{ songmid: 3, img: '' }]
    const pending = query.fill({ songs, source: 'wy' })
    query.reset()
    await pending

    expect(songs[0].img).toBe('')
  })
})
