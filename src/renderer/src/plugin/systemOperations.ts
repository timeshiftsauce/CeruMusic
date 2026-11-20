import { publicLink, type OperationInputs, type SystemOperationName } from '@shiqianjiang/ceru-plugin-sdk'
import { desktopBridge } from '@renderer/services/desktopBridge'
import { activePluginContributions } from '@renderer/services/pluginState'
import { hasOperation, announcePluginOperation } from './operations'

const pending=new Map<string,(input:never)=>Promise<unknown>>()
export async function performSystemDefault(id:string,input:unknown) {
  const run=pending.get(id)
  if(!run)throw Error('系统操作已结束')
  pending.delete(id)
  await run(input as never)
  return null
}
export async function runSystemOperation<Name extends SystemOperationName>(name:Name,input:OperationInputs[Name],execute:(input:OperationInputs[Name])=>Promise<unknown>) {
  if(!hasOperation(name)) {await execute(input);return}
  const id=crypto.randomUUID()
  pending.set(id,execute)
  try {
    const outcome=await desktopBridge.api.plugins.systemOperation(id,name,input)
    if(name==='link.open'&&outcome.handledBy.length) {
      const labels=outcome.handledBy.map(owner=>activePluginContributions.value.find(row=>row.descriptor.id===owner)?.descriptor.name??owner)
      // Replaying an already executed link could duplicate an import or start playback twice.
      await announcePluginOperation(labels,outcome.prevented?()=>execute(input):undefined)
    }
  } finally {pending.delete(id)}
}
export async function openPublicLink(value:string,from:OperationInputs['link.open']['from']) {
  const url=publicLink(value)
  if(!url)return
  await runSystemOperation('link.open',{url,from},input=>desktopBridge.api.plugins.dispatchLink(input.url))
}
export function installLinkEntries() {
  const editable=(target:EventTarget|null)=>target instanceof Element && !!target.closest('input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"]')
  const accept=(text:string)=>{
    const value=publicLink(text.trim())
    return value&&(hasOperation('link.open')||value.startsWith('cerumusic://'))?value:null
  }
  const paste=(event:ClipboardEvent)=>{
    if(event.defaultPrevented||editable(event.target)||event.clipboardData?.files.length)return
    const url=accept(event.clipboardData?.getData('text/plain')??'')
    if(!url)return
    event.preventDefault()
    void openPublicLink(url,'paste').catch(error=>console.warn('粘贴链接处理失败',error))
  }
  const drop=(event:DragEvent)=>{
    if(event.defaultPrevented||editable(event.target)||event.dataTransfer?.files.length)return
    const url=accept(event.dataTransfer?.getData('text/plain')||event.dataTransfer?.getData('text/uri-list')||'')
    if(!url)return
    event.preventDefault()
    void openPublicLink(url,'drop').catch(error=>console.warn('拖入链接处理失败',error))
  }
  const dragover=(event:DragEvent)=>{
    if(editable(event.target)||event.dataTransfer?.types.includes('Files'))return
    if(event.dataTransfer?.types.some(type=>type==='text/plain'||type==='text/uri-list'))event.preventDefault()
  }
  document.addEventListener('paste',paste)
  document.addEventListener('drop',drop)
  document.addEventListener('dragover',dragover)
  return ()=>{document.removeEventListener('paste',paste);document.removeEventListener('drop',drop);document.removeEventListener('dragover',dragover)}
}
