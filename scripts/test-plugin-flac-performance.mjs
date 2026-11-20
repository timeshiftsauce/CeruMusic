// Generated audio only. Measures Electron MAIN process CPU during real muted playback.
import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { execFileSync, spawn } from 'node:child_process'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve, dirname, basename } from 'node:path'
import { createRequire } from 'node:module'
import { once } from 'node:events'
import { build } from 'esbuild'
const require=createRequire(import.meta.url)
const root=await mkdtemp(resolve('.flac-qa-'))
try {
  const flac=join(root,'source.flac'), encrypted=join(root,'encrypted.bin'), module=join(root,'media.mjs')
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','anoisesrc=color=white:amplitude=0.01:sample_rate=96000:duration=24','-ac','2','-sample_fmt','s32','-c:a','flac',flac],{windowsHide:true,timeout:30000})
  const bytes=await readFile(flac), key=randomBytes(16), iv=randomBytes(16), cipher=createCipheriv('aes-128-ctr',key,iv)
  await writeFile(encrypted,Buffer.concat([cipher.update(bytes),cipher.final()]))
  await build({entryPoints:['src/main/services/plugin/media/mediaProtocol.ts'],outfile:module,bundle:true,platform:'node',format:'esm',packages:'external'})
  const launcher=join(root,'main.cjs')
  await writeFile(launcher,`(${probe.toString()})(${JSON.stringify({root,module,flac,encrypted,key:key.toString('hex'),iv:iv.toString('hex'),length:bytes.length})}).catch(error=>{console.error(error);require('electron').app.exit(1)})`)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const child=spawn(require('electron'),[launcher],{env,stdio:'inherit',windowsHide:true})
  const timer=setTimeout(()=>child.kill(),60000)
  const [code]=await once(child,'exit');clearTimeout(timer)
  assert.equal(code,0,'FLAC CPU comparison failed')
}finally{
  if(dirname(root)!==resolve('.') || !basename(root).startsWith('.flac-qa-'))throw Error('Unexpected temporary directory')
  await rm(root,{recursive:true,force:true,maxRetries:4,retryDelay:200})
}

async function probe(config){
  const {app,BrowserWindow,protocol}=require('electron')
  const {createServer}=require('node:http'),{readFileSync}=require('node:fs'),{once}=require('node:events'),{pathToFileURL}=require('node:url')
  app.setPath('userData',config.root+'/profile')
  app.disableHardwareAcceleration()
  protocol.registerSchemesAsPrivileged([{scheme:'ceru-media',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}])
  const {PluginMediaRegistry}=await import(pathToFileURL(config.module).href)
  const registry=new PluginMediaRegistry(), files={'/plain':readFileSync(config.flac),'/encrypted':readFileSync(config.encrypted)}
  const server=createServer((request,response)=>{
    const bytes=files[request.url]
    if(!bytes){response.writeHead(404).end();return}
    const match=/^bytes=(\d+)-(\d*)$/.exec(request.headers.range??'')
    let offset=match?Number(match[1]):0
    const end=match?.[2]?Math.min(Number(match[2]),bytes.length-1):bytes.length-1
    response.writeHead(match?206:200,{'Content-Type':'audio/flac','Content-Length':end-offset+1,'Accept-Ranges':'bytes',...(match?{'Content-Range':`bytes ${offset}-${end}/${bytes.length}`}:{})})
    const timer=setInterval(()=>{if(offset>end){clearInterval(timer);response.end();return}const next=Math.min(offset+65536,end+1);response.write(bytes.subarray(offset,next));offset=next},25)
    response.once('close',()=>clearInterval(timer))
  })
  server.listen(0,'127.0.0.1');await once(server,'listening')
  registry.registerService('fixture',server.address().port)
  await app.whenReady();protocol.handle('ceru-media',request=>registry.handle(request))
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
  win.webContents.setAudioMuted(true)
  try{
    await win.loadURL('data:text/html,<audio muted></audio>')
    const results=[]
    for(const encrypted of [false,true,false,true]){
      const {url}=await registry.prepare('fixture',{ok:true,url:`http://127.0.0.1:${server.address().port}/${encrypted?'encrypted':'plain'}`,...(encrypted?{stream:{contentType:'audio/flac',contentLength:config.length,decrypt:{algorithm:'aes-128-ctr',key:config.key,iv:config.iv}}}:{})},new AbortController().signal)
      // Include initial response/decryption work in each sample, alternating the two paths.
      const before=process.cpuUsage(),start=performance.now()
      const playback=await win.webContents.executeJavaScript(`(async()=>{const audio=document.querySelector('audio');audio.src=${JSON.stringify(url)};await audio.play();await new Promise(resolve=>setTimeout(resolve,3500));const result={position:audio.currentTime,duration:audio.duration,error:audio.error?.code??null};audio.pause();audio.removeAttribute('src');audio.load();return result})()`)
      const elapsed=performance.now()-start,cpu=process.cpuUsage(before)
      if(playback.error||playback.position<2)throw Error('FLAC did not play: '+JSON.stringify(playback))
      results.push({encrypted,mainCpuPercent:(cpu.user+cpu.system)/(elapsed*10),elapsedMs:elapsed,...playback})
    }
    const average=value=>results.filter(row=>row.encrypted===value).reduce((sum,row)=>sum+row.mainCpuPercent,0)/2
    const increase=average(true)-average(false)
    console.log(JSON.stringify({electron:process.versions.electron,format:'24-bit 96kHz stereo FLAC',bytes:config.length,results,mainCpuIncreasePercentagePoints:increase,limit:5,passed:increase<=5},null,2))
    if(increase>5)throw Error('Main process CPU increase exceeds five percentage points')
  }finally{win.destroy();registry.dispose();server.closeAllConnections();server.close()}
  app.exit(0)
}
