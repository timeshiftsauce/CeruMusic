import type { OperationInputs, ShareOperationResult } from '@shiqianjiang/ceru-plugin-sdk'
import { toAppTrack } from '@common/pluginMusic'
import { desktopBridge } from '@renderer/services/desktopBridge'
import { activePluginContributions } from '@renderer/services/pluginState'
import { announcePluginOperation, hasOperation, projectOperationTrack } from './operations'

const pending=new Map<string,(input:OperationInputs['share.create'])=>Promise<ShareOperationResult|null>>()

export function performShareDefault(id:string,input:OperationInputs['share.create']) {
  const run=pending.get(id)
  if(!run)throw Error('分享请求已结束')
  pending.delete(id)
  return run(input)
}

export async function runShareCreate(
  song:any,
  execute:(song:any)=>Promise<ShareOperationResult|null>,
  replay:(result:ShareOperationResult|null)=>void
):Promise<ShareOperationResult|null> {
  if(!hasOperation('share.create'))return execute(song)
  const id=crypto.randomUUID(),track=projectOperationTrack(song)
  let originalResult:ShareOperationResult|null|undefined
  pending.set(id,async input=>{
    const same=input.track.ref.providerId===track.ref.providerId&&input.track.ref.id===track.ref.id
    const result=await execute(same?song:toAppTrack({...input.track,ref:{...input.track.ref,scope:'provider'}}))
    if(same)originalResult=result
    return result
  })
  try {
    const outcome=await desktopBridge.api.plugins.shareCreate(id,{track})
    if(outcome.handledBy.length) {
      const names=outcome.handledBy.map(id=>activePluginContributions.value.find(row=>row.descriptor.id===id)?.descriptor.name??id)
      await announcePluginOperation(names,async()=>replay(originalResult===undefined?await execute(song):originalResult))
    }
    return outcome.result
  } finally {pending.delete(id)}
}
