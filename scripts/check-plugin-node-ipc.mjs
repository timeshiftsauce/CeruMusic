import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {mkdtemp,writeFile,rm} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'
import {randomUUID} from 'node:crypto'
import {createDispatcher} from '@shiqianjiang/ceru-plugin-core/dispatch'

// Disposable transport prototype. Does not activate an installed plugin or grant trusted runtime.
const require=createRequire(import.meta.url), root=await mkdtemp(join(tmpdir(),'ceru-node-ipc-'))
const nonce=randomUUID(), entry=join(root,'helper.cjs')
let child
try {
  await writeFile(entry, `
    const http=require('node:http');const pending=new Map();let sequence=0;
    const send=value=>process.send({...value,nonce:process.argv[2]});
    const rpc=(method,data)=>new Promise((resolve,reject)=>{const id=++sequence;pending.set(id,{resolve,reject});send({type:'rpc',id,method,data})});
    process.on('message',async message=>{
      if(message.nonce!==process.argv[2])return;
      if(message.type==='result'){const call=pending.get(message.id);if(!call)return;pending.delete(message.id);message.error?call.reject(Error(message.error)):call.resolve(message.value);return}
      if(message.type!=='probe')return;
      const operation={id:'fixture',deadlineAt:Date.now()+10000};
      const capture=async fn=>{try{return {value:await fn()}}catch(error){return {error:error.message}}};
      const info=await rpc('services.app.getInfo',{args:[]});
      const notice=await rpc('services.app.call',{args:['notification.show',{title:'',body:'fixture',level:'info'},{permissionKey:'',operation}]});
      const denied=await capture(()=>rpc('services.app.call',{args:['player.pause',{},{permissionKey:'control',operation}]}));
      const unknown=await capture(()=>rpc('private.execute',{args:[]}));
      const server=http.createServer((_request,response)=>response.end('temporary helper'));
      server.listen(0,'127.0.0.1',()=>{send({type:'ready',port:server.address().port,info,notice,denied,unknown});void rpc('services.app.call',{args:['link.open',{url:'https://example.test/helper',from:'deeplink'},{permissionKey:'external',operation}]}).catch(()=>{})});
    });
    process.on('disconnect',()=>process.exit(0));
    send({type:'boot'});
  `)
  let release
  const held=new Promise(resolve=>{release=resolve})
  const lifetime=new AbortController()
  let effects=0,requests=0,markHeld
  const entered=new Promise(resolve=>{markHeld=resolve})
  const dispatch=createDispatcher({
    'services.app.getInfo':async()=>({name:'fixture',hostApi:'3.0.0'}),
    'services.app.call':async({args},{signal})=>{
      if(args[0]==='link.open'){markHeld();await held;signal.throwIfAborted()}
      effects++
      return null
    }
  },{
    manifest:{manifestVersion:3,id:'fixture.node-ipc',name:'Fixture',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'main'}}},
    pluginId:'fixture.node-ipc',signal:lifetime.signal,log:{debug(){},warn(){},info(){},error(){}},
    authorize:async(key,permission)=>{if(key!=='external'||permission!=='external.open')throw Error('Permission denied')}
  })
  const env={...process.env,ELECTRON_RUN_AS_NODE:'1'}
  delete env.NODE_OPTIONS
  child=spawn(process.argv[2]||require('electron'),['--permission','--allow-fs-read='+root,'--allow-fs-write='+root,entry,nonce],{env,windowsHide:true,stdio:['ignore','pipe','pipe','ipc']})
  let stderr=''
  child.stderr.on('data',chunk=>stderr+=chunk)
  const exit=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',code=>resolve(code))})
  const ready=new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>reject(Error('Helper IPC timed out: '+stderr)),10000)
    child.once('error',reject)
    child.on('message',message=>{
      if(message?.nonce!==nonce)return
      if(message.type==='boot'){child.send({nonce,type:'probe'});return}
      if(message.type==='ready'){clearTimeout(timer);resolve(message);return}
      if(message.type!=='rpc'||!Number.isSafeInteger(message.id)||typeof message.method!=='string'||JSON.stringify(message).length>65536)return
      requests++
      void dispatch(message.method,message.data).then(
        value=>{if(child.connected)child.send({nonce,type:'result',id:message.id,value})},
        error=>{if(child.connected)child.send({nonce,type:'result',id:message.id,error:error.message})}
      )
    })
  })
  const result=await ready
  assert.equal(result.info.name,'fixture')
  assert.equal(result.notice,null)
  assert.match(result.denied.error,/Permission denied/)
  assert.match(result.unknown.error,/Unsupported RPC method/)
  assert.equal(await (await fetch('http://127.0.0.1:'+result.port)).text(),'temporary helper')
  await entered
  assert.equal(effects,1)
  lifetime.abort(Error('Trusted consent revoked'))
  release()
  child.kill()
  await exit
  assert.equal(effects,1)
  await assert.rejects(fetch('http://127.0.0.1:'+result.port))
  console.log(JSON.stringify({ok:true,requests,effects,denied:result.denied.error,unknown:result.unknown.error,revocationStoppedEffects:true,childExited:true,listenerClosed:true},null,2))
} finally {
  child?.kill()
  await rm(root,{recursive:true,force:true,maxRetries:4,retryDelay:200})
}
