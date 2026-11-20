import assert from 'node:assert/strict'
import {mkdir,mkdtemp,rm,writeFile} from 'node:fs/promises'
import {join,resolve} from 'node:path'
import {build} from 'esbuild'
import {_electron as electron} from 'playwright'

const workspace=resolve(import.meta.dirname,'..')
const args=process.argv.slice(2)
const reportPath=args.find(arg=>arg.startsWith('--report='))?.slice('--report='.length)
const roots=args.filter(arg=>!arg.startsWith('--report=')).map(path=>resolve(path))
assert.ok(roots.length===1 || roots.length===2,'Supply the candidate build or baseline and candidate builds')
async function measure(root,candidate){
  const directory=await mkdtemp(join(workspace,'.electron-runtime-advance-'))
  let application
  try {
    const profile=join(directory,'profile');await mkdir(profile)
    const pcm=Buffer.alloc(44+30*44100*2)
    pcm.write('RIFF');pcm.writeUInt32LE(pcm.length-8,4);pcm.write('WAVEfmt ',8);pcm.writeUInt32LE(16,16)
    pcm.writeUInt16LE(1,20);pcm.writeUInt16LE(1,22);pcm.writeUInt32LE(44100,24);pcm.writeUInt32LE(88200,28)
    pcm.writeUInt16LE(2,32);pcm.writeUInt16LE(16,34);pcm.write('data',36);pcm.writeUInt32LE(pcm.length-44,40)
    for(const id of [1,2,3])await writeFile(join(profile,`advance-${id}.wav`),pcm)
    await build({entryPoints:[join(root,'src/main/services/MusicDatabase.ts')],outfile:join(directory,'database.cjs'),bundle:true,platform:'node',format:'cjs',packages:'external'})
    const launcher=join(directory,'launch.cjs')
    await writeFile(launcher,`
      const {app,ipcMain}=require('electron'); app.setPath('userData',${JSON.stringify(profile)});
      app.getAppPath=()=>${JSON.stringify(root)};app.setAsDefaultProtocolClient=()=>false;
      globalThis.qaAdvance={registered:false,calls:0,snapshots:0};const handle=ipcMain.handle.bind(ipcMain);
      ipcMain.handle=(name,fn)=>{
        if(name==='plugin:run-playback-operation')globalThis.qaAdvance.registered=true;
        if(name!=='plugin:run-playback-operation' && name!=='plugin:hook-snapshot')return handle(name,fn);
        return handle(name,(...args)=>{globalThis.qaAdvance[name==='plugin:hook-snapshot'?'snapshots':'calls']++;return fn(...args)})
      };
      const db=new(require('./database.cjs').MusicDatabase)();
      for(const id of [1,2,3]) db.upsertTrack({songmid:'advance-'+id,path:require('node:path').join(app.getPath('userData'),'advance-'+id+'.wav'),url:null,singer:'QA',name:'Advance '+id,albumName:'QA',albumId:0,source:'local',interval:'00:30',hasCover:0,coverKey:null,year:2026,lrc:'[00:00.00]QA',types:'[]',_types:'{}',typeUrl:'{}',bitrate:705600,sampleRate:44100,channels:1,duration:30,size:${pcm.length},mtime_ms:1,hash:null,updated_at:Date.now()});
      require(${JSON.stringify(join(root,'out/main/index.js'))});`)
    const env={...process.env};delete env.ELECTRON_RENDERER_URL;delete env.ELECTRON_RUN_AS_NODE
    application=await electron.launch({args:[launcher],env,timeout:45000})
    await application.firstWindow()
    let page
    const deadline=Date.now()+30000
    while(!page && Date.now()<deadline){
      for(const window of application.windows()){
        const main=await window.evaluate(()=>innerWidth>=1000 && innerHeight>=600).catch(()=>false)
        if(main){page=window;break}
      }
      if(!page) await new Promise(resolve=>setTimeout(resolve,100))
    }
    assert.ok(page,'No desktop player window found')
    page.setDefaultTimeout(15000)
    page.on('pageerror',error=>console.error('Renderer error:',error.message))
    page.on('console',message=>{if(message.type()==='error')console.error('Renderer:',message.text().slice(0,450))})
    await page.addInitScript(()=>{window.__guide_initialized=true})
    await page.waitForFunction(()=>!!document.querySelector('#app')?.children.length)
    await page.evaluate(()=>{localStorage.setItem('ceru_music_has_seen_first_run_notice_tips','true');location.hash='/home/local'})
    await page.reload({waitUntil:'domcontentloaded'})
    await application.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().forEach(win=>win.webContents.setAudioMuted(true)))
    await page.getByText('Advance 1',{exact:true}).first().waitFor()
    await page.getByText('Advance 3',{exact:true}).first().waitFor()
    await page.waitForFunction(()=>window.musicEmitter?.all?.get('replacePlaylist')?.length>0)
    await page.getByRole('button',{name:'播放全部'}).click()
    await page.waitForFunction(()=>Array.from(document.querySelectorAll('audio')).some(media=>!media.paused && /advance-[123]\.wav/.test(media.currentSrc))).catch(async error=>{
      console.error(await page.evaluate(()=>({body:document.body.innerText.slice(-1600),audio:Array.from(document.querySelectorAll('audio'),media=>({source:media.currentSrc,paused:media.paused,state:media.readyState,error:media.error?.message}))})))
      throw error
    })
    const button=page.locator('button:visible').filter({has:page.locator('.icon-xiayishou')}).first()
    await button.waitFor()
    const protocol=await page.context().newCDPSession(page),traces=[]
    protocol.on('Tracing.dataCollected',({value})=>{for(const event of value)if(event.name==='ceru-next-latency' && event.ph==='b')traces.push(event)})
    await protocol.send('Tracing.start',{categories:'blink.user_timing',transferMode:'ReportEvents'})
    const counter=()=>application.evaluate(()=>({...globalThis.qaAdvance}))
    const samples=[],measurements=[];let initial
    for(let index=0;index<105;index++){
      if(index===5)initial=await counter()
      await button.evaluate(element=>{
        const before=Array.from(document.querySelectorAll('audio')).find(media=>!media.paused && /advance-[123]\.wav/.test(media.currentSrc))?.currentSrc
        if(!before)throw Error('No previous fixture is playing')
        element.addEventListener('click',()=>{
          const start=performance.now(),stages={};window.qaAdvanceSample=null
          const capture=event=>{
            const media=event.target
            if(!(media instanceof HTMLAudioElement) || before===media.currentSrc || !/advance-[123]\.wav/.test(media.currentSrc))return
            stages[event.type]??=performance.now()-start
          }
          const types=['loadstart','loadedmetadata','loadeddata','canplay']
          for(const type of types)document.addEventListener(type,capture,true)
          const playing=event=>{
            const media=event.target
            if(!(media instanceof HTMLAudioElement) || before===media.currentSrc || media.paused || !/advance-[123]\.wav/.test(media.currentSrc))return
            document.removeEventListener('playing',playing,true)
            for(const type of types)document.removeEventListener(type,capture,true)
            const mark=performance.measure('ceru-next-latency',{start,end:performance.now()})
            window.qaAdvanceStages={...stages,playing:mark.duration}
            window.qaAdvanceSample=mark.duration
          };document.addEventListener('playing',playing,true)
        },{capture:true,once:true});window.qaAdvanceSample=null
      })
      await button.click();await page.waitForFunction(()=>typeof window.qaAdvanceSample==='number',undefined,{timeout:10000})
      if(index>=5){
        const sample=await page.evaluate(()=>({durationMs:window.qaAdvanceSample,stages:window.qaAdvanceStages}))
        measurements.push(sample);samples.push(sample.durationMs)
      }
    }
    const final=await counter(),done=new Promise(resolve=>protocol.once('Tracing.tracingComplete',resolve))
    await protocol.send('Tracing.end');await done;await protocol.detach()
    assert.equal(traces.length,105,'Chromium Performance trace must contain all click-to-playing measurements')
    assert.equal(final.registered,candidate,'Wrong build or operation IPC instrumentation not installed')
    const operationIPC=final.calls-initial.calls,snapshotIPC=final.snapshots-initial.snapshots
    assert.equal(operationIPC,0);assert.equal(snapshotIPC,0)
    samples.sort((first,second)=>first-second)
    const viewport=await page.evaluate(()=>[innerWidth,innerHeight,devicePixelRatio])
    const result={root,viewport,count:samples.length,operationIPC,snapshotIPC,mean:samples.reduce((sum,sample)=>sum+sample,0)/samples.length,median:(samples[49]+samples[50])/2,p95:samples[94]}
    console.log(JSON.stringify(result));return {...result,measurements}
  } finally {
    if(application){await application.evaluate(({app})=>app.exit(0)).catch(()=>{});await application.close().catch(()=>{})}
    await rm(directory,{recursive:true,force:true,maxRetries:5,retryDelay:300})
  }
}
const results=[]
for(const [index,root] of roots.entries())results.push(await measure(root,index===roots.length-1))
if(reportPath)await writeFile(resolve(reportPath),JSON.stringify({results,thresholdMs:5},null,2)+'\n')
if(results.length===2){
  assert.deepEqual(results[0].viewport,results[1].viewport,'Both groups must use the same main viewport')
  const differenceMs=results[1].mean-results[0].mean
  console.log(JSON.stringify({differenceMs,thresholdMs:5}))
  assert.ok(Math.abs(differenceMs)<=5,'Absolute mean click-to-playing difference exceeds 5 ms')
}
