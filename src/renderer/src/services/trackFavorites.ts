import { toRaw } from 'vue'
import { songKey } from '@common/musicItem'
import { songListAPI } from '@renderer/api/songList'
import { desktopBridge } from './desktopBridge'
import type { SongList } from '@renderer/types/audio'

export const favoriteChanged = new EventTarget()
let writes:Promise<unknown>=Promise.resolve()

async function setFavorite(song:SongList,liked:boolean,signal?:AbortSignal):Promise<boolean> {
  signal?.throwIfAborted()
  const stored=await desktopBridge.api.songList.getFavoritesId()
  if (!stored.success) throw Error(stored.error || '读取收藏歌单失败')
  let id=stored.data || null
  if (id) {
    const exists=await songListAPI.exists(id)
    if (!exists.success) throw Error(exists.error || '读取收藏歌单失败')
    if (!exists.data) id=null
  }
  if (!id) {
    const found=await songListAPI.search('我的喜欢','local')
    if (!found.success) throw Error(found.error || '查找收藏歌单失败')
    id=found.data?.find(row=>row.name==='我的喜欢' && row.source==='local')?.id || null
    if (!id && !liked) return false
    if (!id) {
      signal?.throwIfAborted()
      const created=await songListAPI.create('我的喜欢','','local')
      if (!created.success || !created.data?.id) throw Error(created.error || '创建收藏歌单失败')
      id=created.data.id
    }
    signal?.throwIfAborted()
    await desktopBridge.api.songList.setFavoritesId(id)
  }
  const identity=songKey(song), membership=await songListAPI.hasSong(id,identity)
  if (!membership.success) throw Error(membership.error || '读取收藏状态失败')
  const previous=!!membership.data
  if (previous!==liked) {
    signal?.throwIfAborted()
    const result=liked?await songListAPI.addSongs(id,[toRaw(song) as any]):await songListAPI.removeSong(id,identity)
    if (!result.success || (!liked && !result.data)) throw Error(result.error || '更新收藏失败')
    favoriteChanged.dispatchEvent(new CustomEvent('change',{detail:{id,identity,liked}}))
    const accounts=await import('./pluginAccounts')
    signal?.throwIfAborted()
    await accounts.syncPlatformLike(song,liked)
  }
  return previous
}

export function applyTrackFavorite(song:SongList,liked:boolean,signal?:AbortSignal):Promise<boolean> {
  const write=writes.then(()=>setFavorite(song,liked,signal))
  writes=write.catch(()=>{})
  return write
}
