/// <reference types="jest" />

import { fillMissingSongCovers } from './fillMissingSongCovers'

describe('fillMissingSongCovers', () => {
  it('should only fetch and update songs that are still missing covers', async () => {
    const songs = [
      { songmid: 1, img: 'cached-cover' },
      { songmid: 2, img: '' },
      { songmid: 3 }
    ]
    const fetchCover = jest.fn(async (_source: string, song: (typeof songs)[number]) => {
      return `cover-${song.songmid}`
    })

    await fillMissingSongCovers({
      songs,
      source: 'wy',
      offset: 1,
      concurrency: 2,
      fetchCover
    })

    expect(fetchCover).toHaveBeenCalledTimes(2)
    expect(songs[0].img).toBe('cached-cover')
    expect(songs[1].img).toBe('cover-2')
    expect(songs[2].img).toBe('cover-3')
  })

  it('should limit concurrent cover requests', async () => {
    const songs = Array.from({ length: 5 }, (_, index) => ({
      songmid: index + 1,
      img: ''
    }))
    let active = 0
    let maxActive = 0
    const fetchCover = jest.fn(async (_source: string, song: (typeof songs)[number]) => {
      active += 1
      maxActive = Math.max(maxActive, active)
      await new Promise((resolve) => setTimeout(resolve, 5))
      active -= 1
      return `cover-${song.songmid}`
    })

    await fillMissingSongCovers({
      songs,
      source: 'wy',
      concurrency: 2,
      fetchCover
    })

    expect(maxActive).toBeLessThanOrEqual(2)
  })

  it('should stop applying stale requests', async () => {
    const songs = [
      { songmid: 1, img: '' },
      { songmid: 2, img: '' }
    ]
    let stale = false
    const fetchCover = jest.fn(async (_source: string, song: (typeof songs)[number]) => {
      if (song.songmid === 1) {
        stale = true
      }
      return `cover-${song.songmid}`
    })

    await fillMissingSongCovers({
      songs,
      source: 'wy',
      concurrency: 1,
      fetchCover,
      isStale: () => stale
    })

    expect(songs[0].img).toBe('')
    expect(songs[1].img).toBe('')
  })
})
