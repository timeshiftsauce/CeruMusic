import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm, mkdir, copyFile, readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import { build } from 'esbuild'

// Fresh Electron main process and disposable profile; never boots the music app.
const require = createRequire(import.meta.url)
const tooling = resolve(process.argv[2] ?? '../CeruMusic-Plugin-Cli')
const scratch = await mkdtemp(join(tmpdir(), 'ceru-utility-runtime-'))
try {
  const packed = process.argv.includes('--asar')
  const frameworkRoot = process.env.CERU_TRUSTED_INTEGRATION_TOOLS
  const frameworkFactories = []
  if (frameworkRoot)
    for (const name of ['express', 'koa']) {
      const source =
        name === 'express'
          ? "import express from 'express'; export default async function(ctx){const app=express();app.get('/',(_q,r)=>r.send('express'));await ctx.server.listen(app)}"
          : "import Koa from 'koa'; export default async function(ctx){const app=new Koa();app.use(c=>{c.body='koa'});await ctx.server.listen(app.callback())}"
      const output = await build({
        stdin: { contents: source, resolveDir: frameworkRoot },
        bundle: true,
        platform: 'node',
        format: 'iife',
        globalName: '__ceru_entry',
        write: false
      })
      frameworkFactories.push([
        name,
        `async function(ctx){${output.outputFiles[0].text};return __ceru_entry.default(ctx)}`
      ])
    }
  const nativeBytes = await readFile(
    join(
      require.resolve('better-sqlite3/package.json'),
      '..',
      'prebuilds',
      process.platform + '-' + process.arch + '.node'
    )
  )
  const { createHash } = await import('node:crypto')
  const nativeResource = {
    type: 'base64',
    value: nativeBytes.toString('base64'),
    sha256: 'sha256:' + createHash('sha256').update(nativeBytes).digest('hex')
  }
  await mkdir(join(scratch, 'core', 'dist', 'trusted-runtime'), { recursive: true })
  await mkdir(join(scratch, 'core', 'assets'), { recursive: true })
  await writeFile(join(scratch, 'core', 'package.json'), '{"type":"module"}')
  await build({
    entryPoints: [join(tooling, 'packages/core/src/trusted-runtime/index.ts')],
    outfile: join(scratch, 'core/dist/trusted-runtime/index.js'),
    bundle: true,
    platform: 'node',
    format: 'esm'
  })
  await copyFile(
    join(tooling, 'packages/core/assets/trusted-runner.cjs'),
    join(scratch, 'core/assets/trusted-runner.cjs')
  )
  await build({
    entryPoints: [resolve('src/main/services/plugin/trusted/utilityProcess.ts')],
    outfile: join(scratch, 'adapter.cjs'),
    bundle: true,
    platform: 'node',
    format: 'cjs',
    external: ['electron']
  })
  const main = join(scratch, 'main.cjs')
  await writeFile(
    main,
    `
const {app}=require('electron');
app.setPath('userData',${JSON.stringify(join(scratch, 'profile'))});
app.disableHardwareAcceleration();
app.whenReady().then(async()=>{
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {TrustedPluginRuntime}=await import(require('node:url').pathToFileURL(require('node:path').join(__dirname,'core/dist/trusted-runtime/index.js')).href);
const {encodeArtifact,readArtifact,generateSigningKeys,signArtifact}=await import(${JSON.stringify(pathToFileURL(join(tooling, 'packages/issuer/dist/index.js')).href)});
const {launchTrustedUtilityProcess}=require('./adapter.cjs');
let runtime;
const deadline=setTimeout(()=>{console.error('utility runtime timed out');app.exit(2)},25000);
try{
const dataDir=${JSON.stringify(join(scratch, 'data'))},nativeDir=${JSON.stringify(join(scratch, 'native'))},outside=${JSON.stringify(join(scratch, 'outside.txt'))};
await fs.mkdir(dataDir);await fs.mkdir(nativeDir);await fs.writeFile(outside,'disposable outside fixture');
const manifest={manifestVersion:3,id:'fixture.utility',name:'Utility fixture',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{server:{module:'server',runtime:'node'}},provides:{actions:[{id:'inspect',title:'Inspect'},{id:'hold',title:'Hold'}]},uses:{permissions:[{name:'runtime.trusted',key:'trusted',reason:'Verify the fully trusted utility process.'},{name:'network.serve',key:'serve',reason:'Serve disposable fixture'}]}};
const source='async function(ctx){const fs=module.require("node:fs");const outside=fs.readFileSync('+JSON.stringify(outside)+',"utf8");const info=await ctx.app.getInfo();ctx.actions.register("inspect",()=>({pid:process.pid,electron:process.versions.electron,permission:!!process.permission,info,outside}));ctx.actions.register("hold",()=>ctx.app.getInfo());await ctx.server.listen((_q,r)=>r.end("utility-ok"),{permissionKey:"serve"})}';
const keys=generateSigningKeys();const bytes=encodeArtifact({formatVersion:2,syntax:'js',manifest,signature:null},'const Server=/* @ceru-self-contained */ '+source+';exports.modules={server:Server};');
const artifact=readArtifact(signArtifact(bytes,keys.privateKey));const controller=new AbortController();
let address,removed=0,calls=0,release,entered;
const held=new Promise(r=>release=r),waiting=new Promise(r=>entered=r);
const options={artifact,executable:process.execPath,dataDir,nativeDir,verification:{signatureVerified:true,publisher:'verified-fixture',codeDigest:artifact.codeDigest,nodeApiModules:[]},consent:{granted:true,pluginId:manifest.id,publisher:'verified-fixture',signal:controller.signal,fileAccess:'unrestricted'},launchUtilityProcess:launchTrustedUtilityProcess,authorize:async(key,name)=>{assert.equal(key,'serve');assert.equal(name,'network.serve')},rpc:async(name,data,signal)=>{assert.equal(name,'services.app.getInfo');calls++;if(calls>1){entered();await held;signal.throwIfAborted()}return {hostApi:'3.0.0'}},onListen:value=>{address=value;return()=>removed++}};
const denied=new TrustedPluginRuntime({...options,consent:{...options.consent,fileAccess:undefined}});await assert.rejects(denied.start(),/unrestricted/);assert.equal(denied.pid,undefined);
runtime=new TrustedPluginRuntime(options);await runtime.start();
const info=await runtime.invoke('actions:inspect');assert.notEqual(info.pid,process.pid);assert.ok(info.electron);assert.equal(info.outside,'disposable outside fixture');assert.deepEqual(info.info,{hostApi:'3.0.0'});assert.equal(await(await fetch(address.url)).text(),'utility-ok');
const pending=runtime.invoke('actions:hold');const rejected=assert.rejects(pending);await waiting;controller.abort();release();await rejected;await runtime.stop();assert.equal(runtime.running,false);assert.equal(removed,1);await assert.rejects(fetch(address.url));assert.deepEqual(await fs.readdir(nativeDir),[]);
console.log(JSON.stringify({electron:process.versions.electron,node:process.versions.node,transport:'utilityProcess + MessagePort',fileAccess:'unrestricted (explicit consent)',separateProcess:true,rpc:true,http:true,revocation:true,portClosed:true,sessionRemoved:true}));
async function make(source,extras={}){
 const next=structuredClone(manifest);Object.assign(next.entry,extras.entry??{});
 const contents='const Server=/* @ceru-self-contained */ '+source+';exports.modules={server:Server};exports.resources='+JSON.stringify(extras.resources??{})+';';
 const parsed=readArtifact(signArtifact(encodeArtifact({formatVersion:2,syntax:'js',manifest:next,signature:null},contents),keys.privateKey));
 return new TrustedPluginRuntime({...options,...extras,artifact:parsed,verification:{...options.verification,codeDigest:parsed.codeDigest,nodeApiModules:(next.entry.native??[]).map(item=>item.name)},consent:{...options.consent,signal:new AbortController().signal},onListen:value=>{address=value;return()=>{}},rpc:async()=>({hostApi:'3.0.0'})});
}
runtime=await make('async function(ctx){ctx.native.load("fixture.node").initialize(Error,()=>[],()=>{},()=>({}),()=>({}));ctx.actions.register("inspect",()=>({loaded:true,entry:__filename,runner:process.argv[1]}))}',{entry:{native:[{name:'fixture.node',platforms:{[process.platform+'-'+process.arch]:'native.current'}}]},resources:{'native.current':${JSON.stringify(nativeResource)}}});
await runtime.start();const nativeInfo=await runtime.invoke('actions:inspect');assert.equal(nativeInfo.loaded,true);assert.doesNotMatch(nativeInfo.entry,/\\.asar/);assert.doesNotMatch(nativeInfo.runner,/\\.asar/);await runtime.stop();
for(const [name,factory] of ${JSON.stringify(frameworkFactories)}){
 runtime=await make(factory);await runtime.start();assert.equal(await(await fetch(address.url)).text(),name);await runtime.stop();console.log('PASS utility framework '+name);
}
runtime=await make('async function(ctx){ctx.actions.register("inspect",()=>process.exit(7));await ctx.server.listen((_q,r)=>r.end("crash fixture"))}');await runtime.start();const crashedAddress=address.url;await assert.rejects(runtime.invoke('actions:inspect'));await runtime.stop();await assert.rejects(fetch(crashedAddress));assert.deepEqual(await fs.readdir(nativeDir),[]);
runtime=await make('async function(){await new Promise(()=>{})}',{startupTimeoutMs:100});await assert.rejects(runtime.start(),/timed out/);await runtime.stop();assert.deepEqual(await fs.readdir(nativeDir),[]);
console.log(JSON.stringify({nativeAddon:true,frameworks:${JSON.stringify(frameworkFactories.map(([name]) => name))},crashCleanup:true,startupTimeout:true,asar:${packed}}));
app.exit(0);
}catch(error){console.error(error);try{await runtime?.stop()}catch(cleanup){console.error(cleanup)}app.exit(1)}finally{clearTimeout(deadline)}
});
`
  )
  let launch = main
  if (packed) {
    const appDir = join(scratch, 'packed-app')
    await mkdir(appDir)
    const { cp } = await import('node:fs/promises')
    await cp(join(scratch, 'core'), join(appDir, 'core'), { recursive: true })
    await copyFile(main, join(appDir, 'main.cjs'))
    await copyFile(join(scratch, 'adapter.cjs'), join(appDir, 'adapter.cjs'))
    await writeFile(
      join(appDir, 'package.json'),
      '{"name":"ceru-utility-probe","version":"1.0.0","main":"main.cjs"}'
    )
    launch = join(scratch, 'app.asar')
    await require('@electron/asar').createPackage(appDir, launch)
  }
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const code = await new Promise((done, reject) => {
    const executable =
      process.argv[3] && !process.argv[3].startsWith('--') ? process.argv[3] : require('electron')
    const child = spawn(executable, [launch], { env, windowsHide: true, stdio: 'inherit' })
    child.once('error', reject)
    child.once('exit', done)
  })
  assert.equal(code, 0, 'Real Electron utility runtime probe failed')
} finally {
  await rm(scratch, { recursive: true, force: true, maxRetries: 4 })
}
