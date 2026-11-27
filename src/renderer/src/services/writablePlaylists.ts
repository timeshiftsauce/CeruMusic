import songListAPI from '@renderer/api/songList'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import { MessagePlugin } from '@renderer/plugin/notifications'
import { useAuthStore } from '@renderer/store/Auth'
import type { SongList } from '@common/types/songList'

export async function loadWritablePlaylists(): Promise<SongList[]> {
  const cloudRequest = useAuthStore().isAuthenticated
    ? cloudSongListAPI.getUserSongLists().catch((error) => {
        MessagePlugin.error(error?.message || '获取云歌单失败')
        return []
      })
    : Promise.resolve([])
  const [local, cloud] = await Promise.all([songListAPI.getAll(), cloudRequest])
  const lists = (local.success ? (local.data ?? []) : []).map((list) => ({
    ...list,
    meta: { ...list.meta }
  }))
  for (const remote of Array.isArray(cloud) ? cloud : []) {
    const localList = lists.find(
      ({ id, meta }) => id === remote.localId || meta.cloudId === remote.id
    )
    if (localList) {
      Object.assign(localList.meta, {
        cloudId: remote.id,
        isSynced: true,
        localUpdatedAt: remote.updatedAt
      })
    } else {
      lists.push({
        id: remote.id,
        name: remote.name + '[云端]',
        description: remote.describe,
        coverImgUrl: remote.cover,
        createTime: '',
        updateTime: remote.updatedAt,
        source: 'local',
        meta: { isCloudOnly: true, cloudId: remote.id, localUpdatedAt: remote.updatedAt }
      })
    }
  }
  return lists
}
