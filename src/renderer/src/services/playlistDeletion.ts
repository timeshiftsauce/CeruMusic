export type DeleteScope = 'local' | 'cloud' | 'both'

export function capturePlaylistDeletion(playlist: {id:string;name:string;meta?:Record<string,any>}, scope:DeleteScope) {
  const {id,name}=playlist
  const cloudOnly=!!playlist.meta?.isCloudOnly
  const cloudId: string | undefined = cloudOnly ? id : playlist.meta?.cloudId
  const matches=(row: typeof playlist | undefined)=>!!row && row.id===id && row.name===name && !!row.meta?.isCloudOnly===cloudOnly &&
    (scope==='local' || (cloudOnly ? row.id : row.meta?.cloudId)===cloudId)
  const apply=async (current:()=>typeof playlist|undefined, local:(id:string)=>Promise<void>, cloud:(id:string)=>Promise<unknown>)=>{
    if (!matches(current())) throw Error('歌单已更改，请重新确认删除')
    if (scope !== 'local') {
      if (!cloudId) throw Error('未找到已确认的云端副本')
      await cloud(cloudId)
    }
    if (scope !== 'cloud') {
      if (!matches(current())) throw Error('歌单已更改，请重新确认删除')
      await local(id)
    }
  }
  return {matches,apply}
}
