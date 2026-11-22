import {randomUUID} from 'node:crypto'
import type {OperationSource} from '@shiqianjiang/ceru-plugin-sdk'
import {downloadInput} from '@shiqianjiang/ceru-plugin-core/operations'
import type {DownloadSingleSongArgs} from '../../musicSdk/type'
import {downloadBus} from './bus'
import {operationTrack} from './track'
import {callPluginUI} from '../uiBridge'
import {downloadManager} from '../../DownloadManager'

const replays=new Map<string,{expires:number;run:()=>Promise<unknown>}>()
export async function replayDownload(token:unknown) {
  if(typeof token!=='string')throw Error('无效的下载撤销请求')
  const replay=replays.get(token)
  replays.delete(token)
  if(!replay||replay.expires<Date.now())throw Error('下载撤销已过期')
  return replay.run()
}
export async function runDownloadTasks(tasks:DownloadSingleSongArgs[],source:OperationSource,execute:(tasks:DownloadSingleSongArgs[],bypassHooks?:boolean)=>Promise<any[]>) {
  if(!tasks.length||!downloadBus.names().includes('download.create'))return execute(tasks)
  if(tasks.length>1000)throw Error('一次最多创建 1000 个下载任务')
  const tracks=tasks.map(task=>operationTrack(task.songInfo)), quality=tasks.every(task=>task.quality===tasks[0].quality)?tasks[0].quality:'auto'
  const directory=tasks.some(task=>!!task.path)?randomUUID():undefined
  const input={tracks,quality,...(directory?{directory}:{})}
  let created:any[]=[]
  const result=await downloadBus.run('download.create',input,source,async selected=>{
    if(!('tracks' in selected))throw Error('无效的下载选择')
    const remaining=tracks.map((track,index)=>({track,task:tasks[index]}))
    const chosen=selected.tracks.map(track=>{
      const index=remaining.findIndex(row=>row.track.ref.id===track.ref.id&&row.track.ref.providerId===track.ref.providerId)
      if(index<0)throw Error('下载歌曲不在本次选择中')
      const [row]=remaining.splice(index,1)
      return {...row.task,quality:selected.quality===quality||selected.quality==='auto'?row.task.quality:selected.quality}
    })
    created=await execute(chosen)
  })
  if(source.kind==='ui'&&result.handledBy.length) {
    const token=randomUUID()
    const ids=created.filter(row=>row.success!==false&&typeof row.id==='string').map(row=>row.id)
    replays.set(token,{expires:Date.now()+30000,run:async()=>{
      downloadManager.cancelPendingTasks(ids)
      return execute(tasks,true)
    }})
    setTimeout(()=>replays.delete(token),30000).unref()
    await callPluginUI('','operation.downloadNotice',{owners:result.handledBy,token}).catch(()=>{})
  }
  return created
}
export async function downloadFilename(song:any,name:string,source:OperationSource) {
  if(!downloadBus.names().includes('download.filename'))return name
  const input={track:operationTrack(song),name}
  try {downloadInput('download.filename',input)}catch{return name}
  let result=name
  await downloadBus.run('download.filename',input,source,async selected=>{if('name' in selected)result=selected.name})
  return result
}
