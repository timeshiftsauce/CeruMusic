import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { readArtifact } from '@shiqianjiang/ceru-plugin-issuer'
const temporary=await mkdtemp(join(tmpdir(),'ceru-share-resolver-'))
const hosts=[]
try {
  await build({entryPoints:['src/main/services/plugin/shareResolver.ts'],outfile:join(temporary,'export.mjs'),bundle:true,platform:'node',format:'esm'})
  const {exportShareResolver}=await import(pathToFileURL(join(temporary,'export.mjs')).href)
  // Compile the actual backend host and worker in isolation; no database/API server needed.
  await build({entryPoints:['../ceru-backend/src/share/plugin-host/CeruMusicPluginHost.ts','../ceru-backend/src/share/plugin-host/pluginWorker.ts'],outdir:temporary,bundle:true,platform:'node',format:'cjs'})
  const worker=join(temporary,'pluginWorker.js')
  const fakeNetwork=`globalThis.fetch=async(url,options)=>{
    const u=new URL(url);
    if(u.hostname!=='example.com')throw Error('Unexpected upstream');
    if(options.headers['X-API-Key']&&options.headers['X-API-Key']!=='fixture-key')throw Error('Wrong credential');
    const denied=u.searchParams.get('songId')==='denied';
    return new Response(JSON.stringify(denied?{code:403,message:'fixture denied'}:{code:200,url:'https://media.example.test/'+(u.searchParams.get('songId')||'lx')+'.mp3'}),{status:denied?403:200,headers:{'content-type':'application/json'}});
  };\n`
  await writeFile(worker,fakeNetwork+await readFile(worker,'utf8'))
  const require=createRequire(import.meta.url)
  const {CeruMusicPluginHost}=require(join(temporary,'CeruMusicPluginHost.js'))
  const load=async(code)=>{
    const host=new CeruMusicPluginHost(code,{log(){},info(){},warn(){},error(){}});hosts.push(host)
    await host.ensureReady();return host
  }
  const linglan=readArtifact(await readFile('G:/code/pluginclitest/聆澜音源/dist/plugin.js'))
  const linglanCode=exportShareResolver(linglan,{apiUrl:'https://example.com',apiKey:'fixture-key',gitcodeToken:'must-not-export'})
  assert.ok(!linglanCode.includes('must-not-export'))
  assert.ok(!linglanCode.includes('defineSurface'))
  assert.ok(!linglanCode.includes('musicSearch'))
  assert.ok(Buffer.byteLength(linglanCode)<200*1024)
  const host=await load(linglanCode)
  assert.equal(await host.getMusicUrl('tx',{songmid:'123'},'flac'),'https://media.example.test/123.mp3')
  assert.equal(await host.getMusicUrl('kg',{hash:'hash-id'},'128k'),'https://media.example.test/hash-id.mp3')
  // Scope validation is generated ahead of the resolver factory and upstream request.
  assert.match(linglanCode, /hasOwnProperty\.call\(sources,source\)/)
  assert.match(linglanCode, /qualitys\.includes\(quality\)/)
  const authFailure = { exports: {} }
  runInNewContext(linglanCode, {
    module: authFailure,
    exports: authFailure.exports,
    URL,
    URLSearchParams,
    cerumusic: {
      request: async () => ({ statusCode: 403, headers: {}, body: { code: 403, message: 'fixture denied' } }),
      utils: {}
    }
  })
  await assert.rejects(authFailure.exports.musicUrl('tx',{songmid:'denied'},'flac'),/fixture denied/)
  const lxArtifact=readArtifact(await readFile('G:/code/pluginclitest/洛雪兼容环境/dist/plugin.js'))
  const guest={info:{id:'fixture',adapterId:'lx',name:'Fixture LX',version:'1.0.0',state:'ready',selected:true,providers:[{id:'kw',name:'酷我音乐',qualities:['128k'],protocols:['music.resolve@1']}]},script:`
    const {on,send,EVENT_NAMES,request}=globalThis.lx;
    if(lx.utils.crypto.md5('test')!=='098f6bcd4621d373cade4e832627b4f6')throw Error('LX crypto');
    on(EVENT_NAMES.request,async({source,action,info})=>{
      if(source!=='kw'||action!=='musicUrl'||info.type!=='128k')throw Error('LX arguments');
      return new Promise((resolve,reject)=>request('https://example.com/resolve',{},(err,res,body)=>err?reject(err):resolve(body.url)));
    });
    send(EVENT_NAMES.inited,{sources:{kw:{name:'酷我音乐',actions:['musicUrl'],qualitys:['128k']}}});
  `}
  const lxCode=exportShareResolver(lxArtifact,{},guest)
  assert.ok(!lxCode.includes('musicSearch'))
  assert.ok(Buffer.byteLength(lxCode)<200*1024)
  const lxHost=await load(lxCode)
  assert.equal(await lxHost.getMusicUrl('kw',{songmid:'1'},'128k'),'https://media.example.test/lx.mp3')
  assert.match(lxCode, /hasOwnProperty\.call\(sources,source\)/)
  assert.throws(()=>exportShareResolver(lxArtifact,{}),/选择/)
  console.log(JSON.stringify({result:'PASS: actual backend Worker musicUrl, QQ/KG, selected LX, auth failure, source/quality checks, private config exclusion',bytes:{linglan:Buffer.byteLength(linglanCode),lx:Buffer.byteLength(lxCode)}}))
} finally {await Promise.all(hosts.map(host=>host.destroy()));await rm(temporary,{recursive:true,force:true})}
