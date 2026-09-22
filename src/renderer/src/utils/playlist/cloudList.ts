import { normalizeMusicItem, normalizeQualities } from '@common/musicItem'

export const mapSongsToCloud = (songs: readonly any[]): any[] =>
  songs
    .map(normalizeMusicItem)
    .filter((song) => song.source !== 'local')
    .map((song) => ({
      songmid: String(song.songmid),
      ...(song.hash ? { hash: song.hash } : {}),
      name: song.name || '未知歌曲',
      singer: song.singer || '未知歌手',
      albumId: String(song.albumId || '0'),
      albumName: song.albumName || '未知专辑',
      source: song.source,
      interval: song.interval || '00:00',
      img: song.img || 'default-cover',
      lrc: song.lrc,
      types: normalizeQualities(song.types, song._types).map((type) => ({
        ...type,
        size: type.size || '未知'
      })),
      ...(song._types ? { _types: song._types } : {}),
      ...(song.typeUrl ? { typeUrl: song.typeUrl } : {}),
      ...(song.pluginResource ? { pluginResource: song.pluginResource } : {})
    }))

export const mapCloudSongToLocal = (song: any): any => normalizeMusicItem(song)
