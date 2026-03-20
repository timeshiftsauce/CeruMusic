import { deserializeSongListFromStorage, serializeSongListForStorage } from './localUserPersistence'

describe('local user persistence', () => {
  it('should persist a minimal song snapshot without runtime-only heavy fields', () => {
    const serialized = serializeSongListForStorage([
      {
        songmid: '1',
        hash: 'hash-1',
        singer: 'Singer',
        name: 'Song',
        albumName: 'Album',
        albumId: 'album-1',
        source: 'local',
        interval: '03:20',
        img: 'cover.jpg',
        lrc: '[00:00] lyric',
        types: ['flac'],
        _types: { flac: { size: 123 } },
        typeUrl: { flac: 'https://example.com/flac' },
        url: 'file:///music/song.flac',
        path: 'C:/music/song.flac',
        hasCover: true,
        bitrate: 999
      } as any
    ])

    expect(serialized).toEqual([
      {
        songmid: '1',
        hash: 'hash-1',
        singer: 'Singer',
        name: 'Song',
        albumName: 'Album',
        albumId: 'album-1',
        source: 'local',
        interval: '03:20',
        img: 'cover.jpg',
        lrc: '[00:00] lyric',
        types: ['flac'],
        url: 'file:///music/song.flac',
        path: 'C:/music/song.flac'
      }
    ])
  })

  it('should restore only valid song snapshots', () => {
    const restored = deserializeSongListFromStorage(
      JSON.stringify([
        {
          songmid: '2',
          singer: 'Singer 2',
          name: 'Song 2',
          albumName: 'Album 2',
          albumId: 'album-2',
          source: 'wy',
          interval: '04:10',
          img: '',
          lrc: null,
          types: []
        },
        {
          name: 'broken'
        }
      ])
    )

    expect(restored).toHaveLength(1)
    expect(restored[0]).toMatchObject({
      songmid: '2',
      name: 'Song 2',
      source: 'wy'
    })
  })
})
