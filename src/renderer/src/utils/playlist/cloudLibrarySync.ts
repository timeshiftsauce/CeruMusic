import { useAuthStore } from '@renderer/store'
import songListAPI from '@renderer/api/songList'
import {
  cloudSongListAPI,
  type CloudSongDto,
  type CloudSongList
} from '@renderer/api/cloudSongList'
import { canUseNasSync, nasCloudSongListAPI } from '@renderer/api/nasSync'
import { mapCloudSongToLocal, mapSongsToCloud } from '@renderer/utils/playlist/cloudList'
import { getPersistentMeta } from '@renderer/utils/playlist/meta'
import type { SongList, Songs } from '@common/types/songList'

export const FAVORITES_PLAYLIST_NAME = '我的喜欢'

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : typeof error === 'string' ? error : '未知错误'

const canUseCloudLibrary = () => {
  if (canUseNasSync()) return true
  try {
    return !!useAuthStore().isAuthenticated
  } catch {
    return false
  }
}

const getSongListSyncAPI = () => (canUseNasSync() ? nasCloudSongListAPI : cloudSongListAPI)

const compactMeta = (meta: Record<string, any>) => {
  const next = { ...meta }
  Object.keys(next).forEach((key) => {
    if (next[key] === undefined || next[key] === '') delete next[key]
  })
  return next
}

const persistPlaylistMeta = async (localId: string, meta: Record<string, any>) => {
  const persistentMeta = compactMeta(getPersistentMeta(meta))
  const res = await songListAPI.edit(localId, { meta: persistentMeta })
  if (!res.success) {
    throw new Error(res.error || '保存歌单同步状态失败')
  }
  return persistentMeta
}

const findCloudMatch = (cloudLists: CloudSongList[], playlist: SongList) => {
  return cloudLists.find(
    (item) =>
      item.localId === playlist.id ||
      item.id === playlist.meta?.cloudId ||
      (playlist.name === FAVORITES_PLAYLIST_NAME && item.name === FAVORITES_PLAYLIST_NAME)
  )
}

const createCloudPlaylist = async (playlist: SongList, songs: readonly Songs[] = []) => {
  const res = await getSongListSyncAPI().createUserSongList({
    localId: playlist.id,
    name: playlist.name,
    describe: playlist.description || '',
    cover: playlist.coverImgUrl && playlist.coverImgUrl !== 'default-cover' ? playlist.coverImgUrl : undefined,
    songlist: mapSongsToCloud(songs)
  })

  return {
    id: res.id,
    updatedAt: res.updatedAt
  }
}

export const markPlaylistCloudSyncFailed = async (
  playlist: Pick<SongList, 'id' | 'meta'>,
  operation: string,
  error: unknown
) => {
  try {
    await persistPlaylistMeta(playlist.id, {
      ...(playlist.meta || {}),
      cloudSyncPending: true,
      cloudSyncOperation: operation,
      cloudSyncError: getErrorMessage(error),
      cloudSyncFailedAt: new Date().toISOString()
    })
  } catch (metaError) {
    console.error('保存云同步失败状态失败:', metaError)
  }
}

export const markPlaylistCloudSyncOk = async (
  playlist: Pick<SongList, 'id' | 'meta'>,
  cloudId: string,
  updatedAt?: string
) => {
  return persistPlaylistMeta(playlist.id, {
    ...(playlist.meta || {}),
    cloudId,
    cloudSyncPending: false,
    cloudSyncOperation: undefined,
    cloudSyncError: undefined,
    cloudSyncFailedAt: undefined,
    localUpdatedAt: updatedAt || new Date().toISOString()
  })
}

export const ensureLocalFavoritesPlaylist = async () => {
  const favApi = (window as any).api?.songList
  const favIdRes = await favApi?.getFavoritesId?.()
  let favoritesId: string | null = (favIdRes && favIdRes.data) || null

  if (favoritesId) {
    const existsRes = await songListAPI.exists(favoritesId)
    if (!existsRes.success || !existsRes.data) favoritesId = null
  }

  if (!favoritesId) {
    const searchRes = await songListAPI.search(FAVORITES_PLAYLIST_NAME, 'local')
    if (searchRes.success && Array.isArray(searchRes.data)) {
      const exact = searchRes.data.find(
        (playlist) => playlist.name === FAVORITES_PLAYLIST_NAME && playlist.source === 'local'
      )
      favoritesId = exact?.id || null
    }
  }

  if (!favoritesId) {
    const createRes = await songListAPI.create(FAVORITES_PLAYLIST_NAME, '', 'local', {
      semantic: 'favorites'
    })
    if (!createRes.success || !createRes.data?.id) {
      throw new Error(createRes.error || '创建“我的喜欢”失败')
    }
    favoritesId = createRes.data.id
  }

  await favApi?.setFavoritesId?.(favoritesId)
  return favoritesId
}

export const ensureCloudPlaylistForLocal = async (playlist: SongList) => {
  if (!canUseCloudLibrary()) return null
  if (playlist.meta?.isCloudOnly) return playlist.meta?.cloudId || playlist.id

  if (playlist.meta?.cloudId) return playlist.meta.cloudId as string

  try {
    const [cloudLists, songsRes] = await Promise.all([
      getSongListSyncAPI().getUserSongLists(),
      songListAPI.getSongs(playlist.id)
    ])
    const songs = songsRes.success ? [...(songsRes.data || [])] : []
    const match = findCloudMatch(Array.isArray(cloudLists) ? cloudLists : [], playlist)

    if (match) {
      await markPlaylistCloudSyncOk(playlist, match.id, match.updatedAt)
      return match.id
    }

    const created = await createCloudPlaylist(playlist, songs)
    await markPlaylistCloudSyncOk(playlist, created.id, created.updatedAt)
    return created.id
  } catch (error) {
    await markPlaylistCloudSyncFailed(playlist, 'bind', error)
    throw error
  }
}

export const ensureFavoritesCloudBinding = async () => {
  const localId = await ensureLocalFavoritesPlaylist()
  const playlistRes = await songListAPI.getById(localId)
  const playlist = playlistRes.data || ({
    id: localId,
    name: FAVORITES_PLAYLIST_NAME,
    description: '',
    coverImgUrl: 'default-cover',
    createTime: '',
    updateTime: '',
    source: 'local',
    meta: { semantic: 'favorites' }
  } as SongList)

  const cloudId = await ensureCloudPlaylistForLocal({
    ...playlist,
    name: FAVORITES_PLAYLIST_NAME,
    meta: {
      ...(playlist.meta || {}),
      semantic: 'favorites'
    }
  })

  return { localId, cloudId, playlist }
}

export const syncAddSongsToCloud = async (playlist: SongList, songs: readonly Songs[]) => {
  if (!canUseCloudLibrary()) return null
  const cloudSongs = mapSongsToCloud(songs) as CloudSongDto[]
  if (cloudSongs.length === 0) return null

  try {
    const cloudId = await ensureCloudPlaylistForLocal(playlist)
    if (!cloudId) return null
    const res = await getSongListSyncAPI().addSongsToList(cloudId, cloudSongs)
    await markPlaylistCloudSyncOk(playlist, cloudId, res.updatedAt)
    return res
  } catch (error) {
    await markPlaylistCloudSyncFailed(playlist, 'addSongs', error)
    throw error
  }
}

export const syncRemoveSongsFromCloud = async (
  playlist: SongList,
  songmids: readonly (string | number)[]
) => {
  if (!canUseCloudLibrary()) return null
  if (songmids.length === 0) return null

  try {
    const cloudId = await ensureCloudPlaylistForLocal(playlist)
    if (!cloudId) return null
    const res = await getSongListSyncAPI().removeSongsFromList(
      cloudId,
      songmids.map((id) => String(id))
    )
    await markPlaylistCloudSyncOk(playlist, cloudId, res.updatedAt)
    return res
  } catch (error) {
    await markPlaylistCloudSyncFailed(playlist, 'removeSongs', error)
    throw error
  }
}

export const syncPlaylistInfoToCloud = async (playlist: SongList) => {
  if (!canUseCloudLibrary()) return null

  try {
    const cloudId = await ensureCloudPlaylistForLocal(playlist)
    if (!cloudId) return null
    const res = await getSongListSyncAPI().updateUserSongList({
      listId: cloudId,
      localId: playlist.id,
      name: playlist.name,
      describe: playlist.description || '',
      cover:
        playlist.coverImgUrl && playlist.coverImgUrl !== 'default-cover'
          ? playlist.coverImgUrl
          : undefined
    })
    await markPlaylistCloudSyncOk(playlist, cloudId, res.updatedAt)
    return res
  } catch (error) {
    await markPlaylistCloudSyncFailed(playlist, 'updateInfo', error)
    throw error
  }
}

export const syncDeletePlaylistFromCloud = async (playlist: SongList) => {
  if (!canUseCloudLibrary()) return null
  const cloudId = playlist.meta?.cloudId || (playlist.meta?.isCloudOnly ? playlist.id : '')
  if (!cloudId) return null
  return getSongListSyncAPI().deleteUserSongList(cloudId)
}

export const pullFavoritesFromCloud = async () => {
  if (!canUseCloudLibrary()) return null

  const { localId, cloudId, playlist } = await ensureFavoritesCloudBinding()
  if (!cloudId) return null

  try {
    const detail = await getSongListSyncAPI().getSongListDetail(cloudId)
    const cloudSongs = Array.isArray(detail.list) ? detail.list : []
    const cloudSongmids = new Set(cloudSongs.map((song) => String(song.songmid)))
    const localSongsRes = await songListAPI.getSongs(localId)
    const localSongs = localSongsRes.success ? [...(localSongsRes.data || [])] : []
    const localSongmids = new Set(localSongs.map((song) => String(song.songmid)))
    const shouldRemove = localSongs
      .filter((song) => !cloudSongmids.has(String(song.songmid)))
      .map((song) => song.songmid)
    const shouldAdd = cloudSongs
      .filter((song) => !localSongmids.has(String(song.songmid)))
      .map((song) => mapCloudSongToLocal(song) as Songs)

    if (shouldRemove.length > 0) await songListAPI.removeSongs(localId, shouldRemove)
    if (shouldAdd.length > 0) await songListAPI.addSongs(localId, shouldAdd)

    await markPlaylistCloudSyncOk(playlist, cloudId, new Date().toISOString())
    window.dispatchEvent(new Event('playlist-updated'))

    return {
      localId,
      cloudId,
      added: shouldAdd.length,
      removed: shouldRemove.length,
      total: cloudSongs.length
    }
  } catch (error) {
    await markPlaylistCloudSyncFailed(playlist, 'pullFavorites', error)
    throw error
  }
}