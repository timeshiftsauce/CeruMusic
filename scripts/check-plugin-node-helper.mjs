import assert from 'node:assert/strict'
import {spawn} from 'node:child_process'
import {createRequire} from 'node:module'
import {mkdtemp,mkdir,writeFile,rm,readFile,copyFile} from 'node:fs/promises'
import {tmpdir} from 'node:os'
import {join} from 'node:path'

// Alternative to utilityProcess: check Electron's Node entry point in a disposable directory.
const require=createRequire(import.meta.url), root=await mkdtemp(join(tmpdir(),'ceru-node-helper-'))
const executable=process.argv[2] || require('electron')
const allowed=join(root,'allowed'), outside=join(root,'outside.txt'), entry=join(allowed,'helper.cjs')
try {
  await mkdir(allowed)
  await writeFile(outside,'unchanged')
  await writeFile(join(allowed,'read.txt'),'allowed')
  await copyFile(join(require.resolve('better-sqlite3/package.json'),'../prebuilds',process.platform+'-'+process.arch+'.node'),join(allowed,'fixture.node'))
  await writeFile(entry, `
    const fs=require('node:fs'), path=require('node:path');
    const probe=fn=>{try{fn();return true}catch(error){return error.code}};
    (async()=>{
      let asyncRead;try{await fs.promises.readFile(process.argv[2]);asyncRead=true}catch(error){asyncRead=error.code}
      const result={node:process.versions.node,electron:process.versions.electron,permission:!!process.permission,
        addons:process.permission?.has('addon'),nativeLoad:probe(()=>require('./fixture.node')),
        nativeCall:probe(()=>require('./fixture.node').initialize(Error,()=>[],()=>{},()=>({}),()=>({}))),
        allowedRead:probe(()=>fs.readFileSync(path.join(__dirname,'read.txt'))),
        allowedWrite:probe(()=>fs.writeFileSync(path.join(__dirname,'written.txt'),'allowed')),
        deniedRead:probe(()=>fs.readFileSync(process.argv[2])),deniedWrite:probe(()=>fs.writeFileSync(process.argv[2],'changed')),
        asyncRead,childProcess:probe(()=>require('node:child_process').spawn(process.execPath,['-e','process.exit()'])),
        worker:probe(()=>new (require('node:worker_threads').Worker)('0',{eval:true}))};
      console.log(JSON.stringify(result));
    })().catch(error=>{console.error(error);process.exitCode=2})
  `)
  const reports=[]
  for(const addons of [false,true]) {
    const env={...process.env,ELECTRON_RUN_AS_NODE:'1'}
    delete env.NODE_OPTIONS
    const result=await new Promise((resolve,reject)=>{
      const child=spawn(executable,['--permission','--allow-fs-read='+allowed,'--allow-fs-write='+allowed,...(addons?['--allow-addons']:[]),entry,outside],{env,windowsHide:true,stdio:['ignore','pipe','pipe']})
      let stdout='',stderr=''
      child.stdout.on('data',chunk=>stdout+=chunk)
      child.stderr.on('data',chunk=>stderr+=chunk)
      const timer=setTimeout(()=>child.kill(),10000)
      child.once('error',error=>{clearTimeout(timer);reject(error)})
      child.once('exit',code=>{clearTimeout(timer);resolve({code,stdout,stderr})})
    })
    assert.equal(result.code,0,result.stderr)
    const report=JSON.parse(result.stdout.trim())
    reports.push(report)
    console.log(JSON.stringify(report))
    assert.equal(report.permission,true)
    assert.equal(report.addons,addons)
    assert.equal(report.nativeLoad,addons?true:'ERR_DLOPEN_DISABLED')
    assert.equal(report.nativeCall,addons?true:'ERR_DLOPEN_DISABLED')
    for(const key of ['allowedRead','allowedWrite'])assert.equal(report[key],true,key)
    for(const key of ['deniedRead','deniedWrite','asyncRead','childProcess','worker'])assert.equal(report[key],'ERR_ACCESS_DENIED',key)
    assert.equal(await readFile(outside,'utf8'),'unchanged')
  }
  console.log(JSON.stringify({mode:'ELECTRON_RUN_AS_NODE',executable,reports,ok:true},null,2))
} finally {
  await rm(root,{recursive:true,force:true,maxRetries:4,retryDelay:200})
}
