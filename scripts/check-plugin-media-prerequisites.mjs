import {mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {createRequire} from 'node:module'
import {spawn} from 'node:child_process'
const require=createRequire(import.meta.url), root=await mkdtemp(join(tmpdir(),'ceru-media-probe-'))
const allowed=join(root,'allowed'), denied=join(root,'outside.txt'), launcher=join(root,'main.cjs'), child=join(allowed,'child.cjs')
try {
  await mkdir(allowed); await writeFile(denied,'private fixture'); await writeFile(join(allowed,'ok.txt'),'public fixture')
  await writeFile(child, `
    const fs=require('node:fs'), path=require('node:path');
    const probe=(fn)=>{try{fn();return true}catch(error){return error.code}};
    process.parentPort.postMessage({permission:!!process.permission,
      addons:process.permission?.has('addon'), allowedRead:probe(()=>fs.readFileSync(path.join(__dirname,'ok.txt'))),
      allowedWrite:probe(()=>fs.writeFileSync(path.join(__dirname,'write.txt'),'test')), deniedRead:probe(()=>fs.readFileSync(process.argv[2])), deniedWrite:probe(()=>fs.writeFileSync(process.argv[2]+'.test','test'))})
  `)
  await writeFile(launcher, `
    const {app,BrowserWindow,protocol,utilityProcess}=require('electron');
    app.setPath('userData',${JSON.stringify(join(root,'profile'))});app.disableHardwareAcceleration();
    protocol.registerSchemesAsPrivileged([{scheme:'ceru-probe',privileges:{standard:true,secure:true,stream:true}}]);
    async function permissions(addons){
      try {return await new Promise(resolve=>{
        const worker=utilityProcess.fork(${JSON.stringify(child)},[${JSON.stringify(denied)}],{stdio:'pipe',execArgv:['--permission','--allow-fs-read='+${JSON.stringify(allowed)},'--allow-fs-write='+${JSON.stringify(allowed)},...(addons?['--allow-addons']:[])]});
        let stderr='';worker.stderr?.on('data',data=>stderr=(stderr+data).slice(-1000));
        const timer=setTimeout(()=>{worker.kill();resolve({error:'timeout',stderr})},7000);
        worker.on('message',message=>{clearTimeout(timer);resolve(message);worker.kill()});
        worker.on('exit',code=>{clearTimeout(timer);resolve({exit:code,stderr})});
      })}catch(error){return {error:error.message}}
    }
    async function media(){
      const rate=22050, length=rate*2*180, wave=Buffer.alloc(length+44), requests=[];
      wave.write('RIFF');wave.writeUInt32LE(length+36,4);wave.write('WAVEfmt ',8);wave.writeUInt32LE(16,16);wave.writeUInt16LE(1,20);wave.writeUInt16LE(1,22);wave.writeUInt32LE(rate,24);wave.writeUInt32LE(rate*2,28);wave.writeUInt16LE(2,32);wave.writeUInt16LE(16,34);wave.write('data',36);wave.writeUInt32LE(length,40);
      protocol.handle('ceru-probe',request=>{
        if(new URL(request.url).pathname==='/')return new Response('<audio muted></audio>',{headers:{'Content-Type':'text/html'}});
        const range=request.headers.get('Range'),match=range && /^bytes=([0-9]+)-([0-9]*)$/.exec(range),start=match?Number(match[1]):0,end=match?.[2]?Math.min(Number(match[2]),wave.length-1):wave.length-1;
        if((range&&!match)||start>end)return new Response(null,{status:416});requests.push(start);
        let offset=start,stopped=false;
        return new Response(new ReadableStream({async pull(controller){await new Promise(resolve=>setTimeout(resolve,5));if(stopped)return;const chunk=wave.subarray(offset,Math.min(offset+8192,end+1));controller.enqueue(chunk);offset+=chunk.length;if(offset>end)controller.close()},cancel(){stopped=true}}),{status:match?206:200,headers:{'Content-Type':'audio/wav','Accept-Ranges':'bytes','Content-Length':String(end-start+1),...(match?{'Content-Range':'bytes '+start+'-'+end+'/'+wave.length}:{})}})
      });
      const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}});win.webContents.setAudioMuted(true);
      try {await win.loadURL('ceru-probe://media/');const player=await win.webContents.executeJavaScript("(async()=>{const audio=document.querySelector('audio');audio.src='ceru-probe://media/test.wav';await audio.play();await new Promise(r=>setTimeout(r,200));const started=audio.currentTime>0;const seeked=new Promise(r=>audio.addEventListener('seeked',r,{once:true}));audio.currentTime=143;await seeked;await new Promise(r=>setTimeout(r,250));return {started,resumed:audio.currentTime>143}})()",true);return {...player,range:requests.some(start=>start>0),requests};}finally{win.destroy()}
    }
    app.whenReady().then(async()=>{const timeout=setTimeout(()=>app.exit(2),25000);try{const denied=await permissions(false),granted=await permissions(true),stream=await media();
      const confined=(value,addons)=>value.permission&&value.addons===addons&&value.allowedRead===true&&value.allowedWrite===true&&value.deniedRead==='ERR_ACCESS_DENIED'&&value.deniedWrite==='ERR_ACCESS_DENIED';
      const ok=!!(confined(denied,false)&&confined(granted,true)&&stream.started&&stream.resumed&&stream.range);
      console.log(JSON.stringify({electron:process.versions.electron,denied,granted,stream,ok},null,2));app.exit(ok?0:1)
    }catch(error){console.error(error);app.exit(2)}finally{clearTimeout(timeout)}})
  `)
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
  const code=await new Promise((resolve,reject)=>{const instance=spawn(require('electron'),[launcher],{env,stdio:'inherit',windowsHide:true});instance.once('error',reject);instance.once('exit',resolve)})
  process.exitCode=code ?? 2
} finally { await rm(root,{recursive:true,force:true,maxRetries:4,retryDelay:200}) }
