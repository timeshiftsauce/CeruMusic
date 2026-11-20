import { toRaw } from 'vue'
import { MessagePlugin } from '@renderer/plugin/notifications'
import type { SongList } from '@common/types/songList'
import type { MusicItem } from '@common/musicItem'
import { songKey } from '@common/musicItem'
import songListAPI from '@renderer/api/songList'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import { mapSongsToCloud } from '@renderer/utils/playlist/cloudList'
import { syncLocalMetaWithCloudUpdate } from '@renderer/utils/playlist/cloudSyncHelper'
import { runPlaylistTracks } from '@renderer/plugin/operations'

type Playlist = Pick<SongList, 'id' | 'name' | 'meta'>

export async function changePlaylistTracks(name:'playlist.addTracks'|'playlist.removeTracks', playlist:Playlist, items:MusicItem[], cloudOnly:boolean, onRemoved?:(keys:Set<string>, count:number|undefined)=>void) {
  if (!items.length) { MessagePlugin.warning('未选择歌曲'); return }
  const {id, name:label} = playlist
  const cloudId = cloudOnly ? playlist.meta?.cloudId || id : playlist.meta?.isSynced && playlist.meta?.cloudId
  const location = cloudOnly ? 'cloud' : cloudId ? 'both' : 'local'
  const adding = name === 'playlist.addTracks'
  const unique = new Map(items.map(item => [songKey(item), toRaw(item)]))
  try {
    await runPlaylistTracks(name, {id, name:label || '歌单', location}, [...unique.values()], async songs => {
      const keys = new Set(songs.map(songKey))
      const cloudSongs = adding && cloudId ? mapSongsToCloud(songs) : []
      if (!cloudOnly) {
        if (adding) {
          const result = await songListAPI.addSongs(id, songs)
          if (!result.success) throw Error(result.error || '添加失败')
          const added = result.data?.added
          if (added === 0) MessagePlugin.info(`所选歌曲已在歌单「${label}」中`)
          else MessagePlugin.success(`已添加 ${added} 首歌曲到「${label}」`)
        } else {
          const result = await songListAPI.removeSongs(id, [...keys])
          if (!result.success || !result.data) throw Error(result.error || '移除失败')
          onRemoved?.(keys, result.data.removed)
          MessagePlugin.info(`已从「${label}」移除 ${result.data.removed} 首歌曲`)
        }
      }
      if (!cloudId) return
      if (adding && !cloudSongs.length) {
        if (cloudOnly) throw Error('本地文件歌曲不能加入云端歌单')
        return
      }
      try {
        const result = adding ? await cloudSongListAPI.addSongsToList(cloudId, cloudSongs) : await cloudSongListAPI.removeSongsFromList(cloudId, [...keys])
        if (cloudOnly) {
          if (!adding) onRemoved?.(keys, undefined)
          MessagePlugin.success(`云歌单「${label}」已更新`)
        } else if (result.updatedAt) {
          const current = await songListAPI.getById(id)
          if (current.success && current.data && current.data.meta?.cloudId === cloudId) await syncLocalMetaWithCloudUpdate(id, current.data.meta, result.updatedAt)
        }
      } catch (error) {
        if (cloudOnly) throw error
        MessagePlugin.warning('本地歌单已更新，但云端同步失败：' + (error instanceof Error ? error.message : String(error)))
      }
    })
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : '更新歌单失败')
  }
}
