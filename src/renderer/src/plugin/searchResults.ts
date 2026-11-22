import {toAppTrack} from '@common/pluginMusic'
import type {OperationInputs, SearchResultItem} from '@shiqianjiang/ceru-plugin-sdk'

type Input = OperationInputs['search.results']
type Kind = Input['page']['kind']
type Row = Record<string,any>
const key = (ref:SearchResultItem['ref']) => JSON.stringify([ref.providerId,ref.kind,ref.id])

export async function rewriteSearchResults(query:string,sourceId:string,kind:Kind,rows:Row[],run:(input:Input)=>Promise<SearchResultItem[]>):Promise<Row[]> {
  const originals = new Map<string,{row:Row;item:SearchResultItem}[]>()
  const items = rows.map(row=>{
    const resource=row.pluginResource
    const providerId=String(resource?.providerId ?? row.source ?? sourceId)
    const id=String(resource?.id ?? row.songmid ?? row.id ?? '')
    const portable=providerId!=='local' && providerId!=='private' && /^[\w.-]{1,128}$/.test(providerId) && /^[\w.-]{1,256}$/.test(id) &&
      (!resource || (resource.scope==='provider' && !resource.connectionId && !resource.data))
    const ref={kind,providerId:portable?providerId:'private',id:portable?id:crypto.randomUUID()}
    const subtitle=String(kind==='track'?row.singer ?? '':row.author ?? '').slice(0,512)
    const item:SearchResultItem={ref,title:String(row.name ?? '').slice(0,512),subtitle,
      ...(kind==='track'?{metadata:{artists:subtitle.split('、').filter(Boolean).slice(0,32).map(artist=>artist.slice(0,256))}}:{})}
    const identity=key(ref), entries=originals.get(identity) ?? []
    entries.push({row,item}); originals.set(identity,entries)
    return item
  })
  const output=await run({query,sourceId,page:{kind,items}})
  return output.map(item=>{
    const entry=originals.get(key(item.ref))?.shift()
    if (entry) return {...entry.row,name:item.title===entry.item.title?entry.row.name:item.title,
      ...(kind==='track'?{singer:JSON.stringify(item.metadata)===JSON.stringify(entry.item.metadata)?entry.row.singer:item.metadata?.artists.join('、') ?? item.subtitle ?? ''}:
        {author:item.subtitle===entry.item.subtitle?entry.row.author:item.subtitle ?? ''})}
    if (item.ref.providerId==='private') return undefined
    if (kind==='track') return toAppTrack({ref:{...item.ref,scope:'provider'},title:item.title,metadata:item.metadata ?? {artists:item.subtitle?[item.subtitle]:[]}})
    return {id:item.ref.id,source:item.ref.providerId,name:item.title,author:item.subtitle ?? ''}
  }).filter((row):row is Row=>row!==undefined)
}
