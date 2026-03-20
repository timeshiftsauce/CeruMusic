import {
  deserializeGlobalPlayerStateFromStorage,
  serializeGlobalPlayerStateForStorage
} from './globalPlayPersistence'

describe('global player persistence', () => {
  it('should persist only the minimal player snapshot', () => {
    const snapshot = serializeGlobalPlayerStateForStorage({
      songId: '1',
      songInfo: {
        songmid: '1',
        hash: 'hash-1',
        singer: 'Singer',
        name: 'Song',
        albumName: 'Album',
        albumId: 'album-1',
        source: 'wy',
        interval: '03:20',
        img: 'cover.jpg',
        lrc: '[00:00] lyric',
        types: ['sq'],
        _types: { sq: { size: 123 } },
        typeUrl: { sq: 'https://example.com/song' },
        comments: { total: 999 }
      } as any
    } as any)

    expect(snapshot).toEqual({
      songId: '1',
      songInfo: {
        songmid: '1',
        hash: 'hash-1',
        singer: 'Singer',
        name: 'Song',
        albumName: 'Album',
        albumId: 'album-1',
        source: 'wy',
        interval: '03:20',
        img: 'cover.jpg',
        lrc: '[00:00] lyric',
        types: ['sq']
      }
    })
  })

  it('should read legacy persisted pinia payloads and sanitize them', () => {
    const restored = deserializeGlobalPlayerStateFromStorage(
      JSON.stringify({
        player: {
          songId: '2',
          songInfo: {
            songmid: '2',
            singer: 'Singer 2',
            name: 'Song 2',
            albumName: 'Album 2',
            albumId: 'album-2',
            source: 'local',
            interval: '05:00',
            img: '',
            lrc: null,
            types: ['flac'],
            hotList: new Array(100).fill('x')
          }
        }
      })
    )

    expect(restored.songId).toBe('2')
    expect(restored.songInfo).toMatchObject({
      songmid: '2',
      source: 'local',
      types: ['flac']
    })
    expect((restored.songInfo as any).hotList).toBeUndefined()
  })
})
