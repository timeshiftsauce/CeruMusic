import { assertContentPage, type AccountListCapability, type ContentEntity, type Page } from '@shiqianjiang/ceru-plugin-sdk'

export function accountCollectionPage(raw:unknown,capability:AccountListCapability,owner:string,providers:readonly string[],connectionId:string,limit:number,cursor?:string):Page<ContentEntity> {
  const page=raw as Page<ContentEntity>
  assertContentPage(page)
  if (page.items.length>limit || (page.nextCursor && (page.nextCursor===cursor || !page.items.length))) throw Error('平台分页结果无效')
  const kind=capability==='playlists'?'playlist':'track'
  const items=page.items.map(item=>{
    const ref=item.ref
    if(ref.kind!==kind || ref.pluginId!==owner || ref.scope || !providers.includes(ref.providerId) || (ref.connectionId!==undefined && ref.connectionId!==connectionId)) throw Error('平台资源不属于当前账号')
    return {title:item.title,ref:{pluginId:owner,providerId:ref.providerId,kind:ref.kind,id:ref.id,connectionId,...(ref.data?{data:ref.data}:{})},capabilities:item.capabilities,...(item.metadata?{metadata:item.metadata}:{}),...(item.playlist?{playlist:item.playlist}:{}),...(typeof item.playable==='boolean'?{playable:item.playable}:{})}
  })
  return {items,...(page.nextCursor?{nextCursor:page.nextCursor}:{})}
}
