import songListAPI from '@renderer/api/songList'

export interface SavePlaylistToLocalPayload {
  title: string
  desc?: string
  cover?: string
  songs: any[]
  meta?: Record<string, any>
}

export async function savePlaylistSnapshotToLocal(payload: SavePlaylistToLocalPayload) {
  const createRes = await songListAPI.create(
    payload.title || '歌单',
    payload.desc || '',
    'local',
    payload.meta || {}
  )
  if (!createRes.success || !createRes.data?.id) {
    throw new Error(createRes.error || '创建歌单失败')
  }
  const localId = createRes.data.id

  if (payload.cover) {
    await songListAPI.updateCover(localId, payload.cover)
  }

  const addRes = await songListAPI.addSongs(
    localId,
    payload.songs.map((song) => ({ ...song })) as any
  )
  if (!addRes.success) {
    throw new Error(addRes.error || '保存歌曲失败')
  }

  window.dispatchEvent(new Event('playlist-updated'))
  return localId
}
