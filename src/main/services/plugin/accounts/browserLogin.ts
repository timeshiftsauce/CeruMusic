import {randomUUID} from 'node:crypto'
import {BrowserWindow,session} from 'electron'
import {isPrivateAddress} from '../../../utils/proxyAgents'
import {browserLoginCredential,browserLoginSite} from './browserPolicy'

export async function isolatedBrowserLogin(site:ReturnType<typeof browserLoginSite>,signal:AbortSignal,check:()=>void,privateAllowed:()=>boolean) {
  signal.throwIfAborted(); check()
  const isolated=session.fromPartition('ceru-login-'+randomUUID(),{cache:false})
  const allowed=(value:string)=>{
    try {signal.throwIfAborted();check();const target=new URL(value);return target.origin===site.url.origin && target.protocol==='https:' && !target.username && !target.password} catch {return false}
  }
  isolated.setPermissionRequestHandler((_contents,_permission,reply)=>reply(false))
  isolated.setPermissionCheckHandler(()=>false)
  isolated.setDevicePermissionHandler(()=>false)
  isolated.webRequest.onBeforeRequest((request,reply)=>{
    if(!allowed(request.url)){reply({cancel:true});return}
    void isolated.resolveHost(site.url.hostname.replace(/^\[|\]$/g,'')).then(({endpoints})=>{
      reply({cancel:!allowed(request.url) || !endpoints.length || (endpoints.some(endpoint=>isPrivateAddress(endpoint.address)) && !privateAllowed())})
    }).catch(()=>reply({cancel:true}))
  })
  isolated.on('will-download',event=>event.preventDefault())
  const title='登录 · '+site.url.host
  const window=new BrowserWindow({title,show:false,width:560,height:680,autoHideMenuBar:true,webPreferences:{session:isolated,sandbox:true,contextIsolation:true,nodeIntegration:false,webviewTag:false,devTools:false,disableBlinkFeatures:'WebRTC'}})
  window.removeMenu();window.on('page-title-updated',event=>event.preventDefault())
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}))
  window.webContents.on('will-attach-webview',event=>event.preventDefault())
  window.webContents.on('will-navigate',(event,url)=>{if(!allowed(url))event.preventDefault()})
  window.webContents.on('will-redirect',(event,url)=>{if(!allowed(url))event.preventDefault()})
  type Result=ReturnType<typeof browserLoginCredential>
  let finish!:(result:Result)=>void, fail!:(error:Error)=>void
  const outcome=new Promise<Result>((resolve,reject)=>{finish=resolve;fail=reject})
  const cancelled=()=>finish(null)
  const changed=(_event:Electron.Event,cookie:Electron.Cookie,_cause:string,removed:boolean)=>{
    if(removed || signal.aborted || window.isDestroyed() || !allowed(window.webContents.getURL()))return
    const result=browserLoginCredential(site,cookie)
    if(result)finish(result)
  }
  isolated.cookies.on('changed',changed);window.once('closed',cancelled);signal.addEventListener('abort',cancelled,{once:true})
  const watch=setInterval(()=>{try{check()}catch{fail(Error('网页登录授权已撤销'))}},500)
  try {
    window.once('ready-to-show',()=>{if(!window.isDestroyed())window.show()})
    void window.loadURL(site.url.href).then(async()=>{
      if(window.isDestroyed() || !allowed(window.webContents.getURL()))return
      const existing=await isolated.cookies.get({url:site.url.origin+'/',name:site.cookie})
      for(const cookie of existing){const result=browserLoginCredential(site,cookie);if(result)finish(result)}
    }).catch(()=>fail(Error('登录页面未能加载')))
    const result=await outcome
    signal.throwIfAborted();check()
    return result
  } finally {
    clearInterval(watch);signal.removeEventListener('abort',cancelled);isolated.cookies.off('changed',changed)
    if(!window.isDestroyed())window.destroy()
    await isolated.closeAllConnections()
    await isolated.clearStorageData()
    isolated.webRequest.onBeforeRequest(null)
  }
}
