import { MessagePlugin } from 'tdesign-vue-next'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import songListAPI from '@renderer/api/songList'
import { getPersistentMeta } from '@renderer/utils/playlist/meta'
import { mapSongsToCloud } from '@renderer/utils/playlist/cloudList'
import { isBase64, base64ToFile } from '@renderer/utils/file'

export interface PlaylistInfo {
  id: string
  name: string
  description: string
  cover: string
  meta: any
}

/**
 * Update local meta after cloud operation
 */
export async function syncLocalMetaWithCloudUpdate(
  localId: string,
  currentMeta: any,
  updatedAt: string
) {
  const meta = getPersistentMeta({
    ...currentMeta,
    localUpdatedAt: updatedAt
  })

  // Preserve playlistId if exists
  if (currentMeta?.playlistId) {
    meta.playlistId = currentMeta.playlistId
  }

  // Preserve isSynced flag if it was set (or should be set?)
  // Usually if we are syncing, it implies isSynced should be true.
  // But getPersistentMeta removes it.
  // We should rely on loadPlaylists to restore isSynced from cloudId match?
  // Or should we persist it? The original code didn't seem to persist isSynced.

  const res = await songListAPI.edit(localId, { meta })
  if (!res.success) {
    console.error('Failed to update local meta:', res.error)
  }

  return meta
}

/**
 * Upload local playlist to cloud (Create)
 */
export async function handleUploadToCloudHelper(
  playlist: PlaylistInfo,
  songs: any[],
  onSuccess?: () => void
) {
  const loadingMsg = MessagePlugin.loading('正在上传到云端...', 0)
  try {
    const cover = isBase64(playlist.cover)
      ? base64ToFile(playlist.cover, 'cover.png')
      : playlist.cover

    const res = await cloudSongListAPI.createUserSongList({
      localId: playlist.id,
      name: playlist.name,
      describe: playlist.description,
      cover: cover,
      songlist: mapSongsToCloud(songs)
    })

    const updatedAt = res.updatedAt
    const cloudId = res.id

    const newMeta = await syncLocalMetaWithCloudUpdate(playlist.id, playlist.meta, updatedAt)

    // Return updated meta including in-memory cloudUpdatedAt and isSynced
    const resultMeta = {
      ...playlist.meta,
      ...newMeta,
      cloudUpdatedAt: updatedAt,
      cloudId: cloudId,
      isSynced: true
    }

    loadingMsg.then((inst) => inst.close())
    MessagePlugin.success('上传成功')

    if (onSuccess) onSuccess()

    return resultMeta
  } catch (e: any) {
    loadingMsg.then((inst) => inst.close())
    console.error(e)
    MessagePlugin.error('上传失败: ' + (e.message || '未知错误'))
    throw e
  }
}

/**
 * Sync local playlist to cloud (Update)
 */
export async function handleSyncToCloudHelper(
  playlist: PlaylistInfo,
  songs: any[],
  onSuccess?: () => void
) {
  const loadingMsg = MessagePlugin.loading('正在同步到云端...', 0)
  try {
    if (!playlist.meta?.cloudId) {
      throw new Error('未关联云端歌单')
    }

    const cover = isBase64(playlist.cover)
      ? base64ToFile(playlist.cover, 'cover.png')
      : playlist.cover

    const updateRes: any = await cloudSongListAPI.updateUserSongList({
      listId: playlist.meta.cloudId,
      name: playlist.name,
      describe: playlist.description,
      cover: cover,
      songlist: mapSongsToCloud(songs)
    })

    loadingMsg.then((inst) => inst.close())
    MessagePlugin.success('同步成功')

    const newTimestamp = updateRes?.updatedAt || new Date().toISOString()

    const newMeta = await syncLocalMetaWithCloudUpdate(playlist.id, playlist.meta, newTimestamp)

    const resultMeta = {
      ...playlist.meta,
      ...newMeta,
      cloudUpdatedAt: newTimestamp
    }

    if (onSuccess) onSuccess()

    return resultMeta
  } catch (e: any) {
    loadingMsg.then((inst) => inst.close())
    console.error(e)
    MessagePlugin.error('同步失败: ' + (e.message || '未知错误'))
    throw e
  }
}
