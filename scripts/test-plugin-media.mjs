import assert from 'node:assert/strict'
import { createCipheriv, randomBytes } from 'node:crypto'
import { createServer } from 'node:http'
import { once } from 'node:events'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { build } from 'esbuild'
import { Worker } from 'node:worker_threads'

const require = createRequire(import.meta.url)
if(process.argv.some(argument=>argument.startsWith('--executable=')))throw Error('Packaged apps ignore a JavaScript entry argument; use the isolated ASAR test harness instead')
const root = await mkdtemp(resolve('.media-qa-'))
const modulePath = join(root, 'media.mjs')
let source, lan, registry, child
try {
  await build({
    entryPoints: ['src/main/services/plugin/media/mediaProtocol.ts'],
    outfile: modulePath,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external'
  })
  const { pluginMedia } = await import(pathToFileURL(modulePath).href)
  registry = pluginMedia
  const cacheDir=join(root,'cache'),cacheModule=join(root,'cache.mjs')
  await mkdir(cacheDir)
  await build({entryPoints:['src/main/services/musicCache/index.ts'],outfile:cacheModule,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'@common':resolve('src/common')},banner:{js:"import {createRequire as __createRequire} from 'node:module';const require=__createRequire(import.meta.url);"},plugins:[{name:'isolated-cache-configuration',setup(builder){
    builder.onResolve({filter:/^\.\.\/plugin\/media\/mediaProtocol$/},()=>({path:pathToFileURL(modulePath).href,external:true}))
    builder.onResolve({filter:/^(\.\.\/ConfigManager|\.\/MetaCache|\.\.\/networkProxy)$/},({path})=>({path,namespace:'cache-fixture'}))
    builder.onLoad({filter:/.*/,namespace:'cache-fixture'},()=>({contents:`export const configManager={getDirectories:()=>({cacheDir:${JSON.stringify(cacheDir)}}),get:(_key,fallback)=>fallback};export const getMusicMetaCache=()=>({});export const getRequestAgentsFor=()=>null;`}))
    builder.onLoad({filter:/[\\/]musicCache[\\/]index\.ts$/},async({path})=>({loader:'ts',contents:(await readFile(path,'utf8')).replace('export const musicCacheService = new MusicCacheService()','export const musicCacheService = null')}))
  }}]})
  const {MusicCacheService}=await import(pathToFileURL(cacheModule).href)
  const cache=Object.create(MusicCacheService.prototype)
  cache.cacheIndex=new Map();cache.coverFileIndex=new Map();cache.evicting=null
  cache.meta={totalSize:()=>0,evictToLimit:()=>({evicted:0,freedBytes:0})}
  const plain = randomBytes(1024 * 1024 + 44),
    encrypted = new Map(),
    headers = []
  plain.write('RIFF');plain.writeUInt32LE(plain.length-8,4);plain.write('WAVEfmt ',8);plain.writeUInt32LE(16,16);plain.writeUInt16LE(1,20);plain.writeUInt16LE(1,22);plain.writeUInt32LE(8000,24);plain.writeUInt32LE(16000,28);plain.writeUInt16LE(2,32);plain.writeUInt16LE(16,34);plain.write('data',36);plain.writeUInt32LE(plain.length-44,40)
  source = createServer((request, response) => {
    headers.push(request.headers)
    const bytes = encrypted.get(request.url)
    if (!bytes) {
      response.writeHead(404)
      response.end()
      return
    }
    const match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
    const start = match ? Number(match[1]) : 0,
      end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1
    response.writeHead(match ? 206 : 200, {
      'Content-Type': 'application/octet-stream',
      'Content-Length': end - start + 1,
      ...(match ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {})
    })
    response.end(bytes.subarray(start, end + 1))
  })
  source.listen(0, '127.0.0.1')
  await once(source, 'listening')
  const address = 'http://127.0.0.1:' + source.address().port
  registry.registerService('fixture', source.address().port)
  const results = []
  for (const algorithm of [
    'aes-128-ctr',
    'aes-256-ctr',
    'aes-128-cbc',
    'aes-256-cbc',
    'chacha20'
  ]) {
    const key = randomBytes(algorithm.startsWith('aes-128') ? 16 : 32),
      iv = randomBytes(16)
    if (algorithm === 'chacha20') iv.writeUInt32LE(0, 0)
    const cipher = createCipheriv(algorithm, key, iv)
    encrypted.set('/' + algorithm, Buffer.concat([cipher.update(plain), cipher.final()]))
    const resolved = {
      ok: true,
      url: address + '/' + algorithm,
      requestHeaders: { Authorization: 'private-fixture' },
      stream: {
        contentType: 'audio/wav',
        contentLength: plain.length,
        decrypt: { algorithm, key: key.toString('hex'), iv: iv.toString('hex') }
      }
    }
    const token = registry.register('fixture', resolved)
    assert.match(token, /^ceru-media:\/\/[0-9a-f-]{36}$/)
    const full = await registry.handle(new Request(token))
    assert.equal(full.status, 200)
    assert.equal(full.headers.get('content-type'), 'audio/wav')
    assert.deepEqual(Buffer.from(await full.arrayBuffer()), plain)
    const partial = await registry.handle(
      new Request(token, { headers: { Range: 'bytes=17-235' } })
    )
    assert.equal(partial.status, 206)
    assert.deepEqual(Buffer.from(await partial.arrayBuffer()), plain.subarray(17, 236))
    const head = await registry.handle(new Request(token, { method: 'HEAD' }))
    assert.equal(head.headers.get('content-length'), String(plain.length))
    assert.equal((await head.arrayBuffer()).byteLength, 0)
    const bad = await registry.handle(new Request(token, { headers: { Range: 'bytes=90000000-' } }))
    assert.equal(bad.status, 416)
    assert.equal(bad.headers.get('content-range'), 'bytes */' + plain.length)
    const download = await registry.downloadUrl(token)
    assert.deepEqual(Buffer.from(await (await fetch(download)).arrayBuffer()), plain)
    const cached=await cache.downloadAndCache(algorithm,token,algorithm,'standard')
    assert.equal(new URL(cached).pathname.endsWith('.wav'),true)
    assert.deepEqual(await readFile(new URL(cached)),plain)
    const workerPath=process.argv.find(arg=>arg.startsWith('--worker='))?.slice(9)
    if(workerPath){
      const worker=new Worker(resolve(workerPath),{workerData:{proxyRule:null,trustSystemCa:false}})
      try {
        const completed=new Promise((resolve,reject)=>{worker.on('error',reject);worker.on('message',message=>{if(message.type==='completed')resolve(message.result);if(message.type==='error')reject(Error(message.error))})})
        worker.postMessage({id:algorithm,url:download,filePath:join(root,algorithm+'.wav'),songInfo:{name:'Fixture'},tagWriteOptions:undefined})
        const result=await completed
        assert.deepEqual(await readFile(result.path),plain)
      } finally {await worker.terminate()}
    }
    const slices = await Promise.all(
      ['bytes=22-55', 'bytes=-44'].map((range) =>
        fetch(download, { headers: { Range: range } }).then((response) => response.arrayBuffer())
      )
    )
    assert.deepEqual(Buffer.from(slices[0]), plain.subarray(22, 56))
    assert.deepEqual(Buffer.from(slices[1]), plain.subarray(-44))
    lan ??= createServer((request, response) => void registry.serve(token, request, response))
    if (!lan.listening) {
      lan.listen(0, '127.0.0.1')
      await once(lan, 'listening')
    }
    const lanResponse = await fetch('http://127.0.0.1:' + lan.address().port + '/media', {
      headers: { Range: 'bytes=31-90' }
    })
    assert.equal(lanResponse.status, 206)
    assert.deepEqual(Buffer.from(await lanResponse.arrayBuffer()), plain.subarray(31, 91))
    assert.throws(() => registry.register('other', resolved), /owned plugin service/)
    const lifetime = new AbortController(),
      revocable = registry.register('fixture', resolved, lifetime.signal)
    const active = await registry.open(revocable)
    const failure = once(active.body, 'error')
    active.body.resume()
    lifetime.abort()
    await failure
    assert.equal(registry.has(revocable), false)
    registry.revoke('other')
    results.push({
      algorithm,
      full: true,
      range: true,
      head: true,
      download: true,
      cache: true,
      downloadWorker: !!workerPath,
      lanRoute: true,
      wrongOwnerDenied: true,
      revoke: true
    })
  }
  assert(headers.every((header) => header.authorization === 'private-fixture'))
  for (const url of [
    'http://localhost:1/audio',
    'http://127.0.0.1:1/audio',
    'http://2130706433:1/audio',
    'http://[::1]:1/audio',
    'http://10.0.0.1/audio'
  ])
    assert.throws(() => registry.assertPlaybackUrl('fixture', url), /owned plugin service/)
  assert.equal(
    (await registry.handle(new Request('ceru-media://00000000-0000-0000-0000-000000000000')))
      .status,
    404
  )
  const token = registry.register('fixture', {
    ok: true,
    url: address + '/aes-128-ctr',
    stream: { decrypt: { algorithm: 'aes-128-ctr', key: '00'.repeat(16), iv: '00'.repeat(16) } }
  })
  assert.equal((await registry.handle(new Request(token, { method: 'POST' }))).status, 405)
  registry.revoke('fixture')
  assert.equal(registry.has(token), false)
  console.log(JSON.stringify({ registry: results }, null, 2))

  if (process.argv.includes('--electron')) {
    const launcher = join(root, 'electron.cjs')
    const rate = 8000,
      length = rate * 2 * 180,
      wave = Buffer.alloc(length + 44)
    wave.write('RIFF')
    wave.writeUInt32LE(length + 36, 4)
    wave.write('WAVEfmt ', 8)
    wave.writeUInt32LE(16, 16)
    wave.writeUInt16LE(1, 20)
    wave.writeUInt16LE(1, 22)
    wave.writeUInt32LE(rate, 24)
    wave.writeUInt32LE(rate * 2, 28)
    wave.writeUInt16LE(2, 32)
    wave.writeUInt16LE(16, 34)
    wave.write('data', 36)
    wave.writeUInt32LE(length, 40)
    const fixtures = []
    for (const algorithm of [
      'aes-128-ctr',
      'aes-256-ctr',
      'aes-128-cbc',
      'aes-256-cbc',
      'chacha20'
    ]) {
      const key = randomBytes(algorithm.startsWith('aes-128') ? 16 : 32),
        iv = randomBytes(16)
      if (algorithm === 'chacha20') iv.writeUInt32LE(0, 0)
      const cipher = createCipheriv(algorithm, key, iv),
        file = join(root, algorithm + '.bin')
      await writeFile(file, Buffer.concat([cipher.update(wave), cipher.final()]))
      fixtures.push({
        file,
        algorithm,
        stream: {
          decrypt: { algorithm, key: key.toString('hex'), iv: iv.toString('hex') },
          contentType: 'audio/wav',
          contentLength: wave.length
        }
      })
    }
    const customFile=join(root,'wasm.bin')
    await writeFile(customFile,Buffer.from(wave.map(byte=>(byte-1)&255)))
    fixtures.push({file:customFile,algorithm:'wasm',stream:{transform:'wasm',contentType:'audio/wav',contentLength:wave.length}})
    await writeFile(
      launcher,
      `(${electronProbe.toString()})(${JSON.stringify(modulePath)},${JSON.stringify(join(root, 'profile'))},${JSON.stringify(fixtures)}).catch(error=>{console.error(error);require('electron').app.exit(1)})`
    )
    const env = { ...process.env }
    delete env.ELECTRON_RUN_AS_NODE
    const executable = require('electron')
    child = spawn(executable, [launcher], { env, windowsHide: true, stdio: 'inherit' })
    const [code] = await once(child, 'exit')
    assert.equal(code, 0, 'Electron encrypted media playback failed')
  }
} finally {
  child?.kill()
  registry?.dispose()
  for (const server of [source, lan])
    if (server) {
      server.closeAllConnections()
      await new Promise((resolve) => server.close(resolve))
    }
  await rm(root, { recursive: true, force: true, maxRetries: 4, retryDelay: 200 })
}

async function electronProbe(modulePath, profile, fixtures) {
  const { app, BrowserWindow, protocol } = require('electron')
  const { createServer } = require('node:http'),
    { readFileSync } = require('node:fs')
  const { once } = require('node:events'),
    { pathToFileURL } = require('node:url')
  app.setPath('userData', profile)
  app.disableHardwareAcceleration()
  protocol.registerSchemesAsPrivileged([
    {
      scheme: 'ceru-media',
      privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true }
    }
  ])
  const { PluginMediaRegistry } = await import(pathToFileURL(modulePath).href),
    registry = new PluginMediaRegistry()
  await app.whenReady()
  protocol.handle('ceru-media', (request) => registry.handle(request))
  let server, win, worker
  const timeout = setTimeout(() => {
    console.error('Encrypted audio playback timed out')
    app.exit(2)
  }, 30000)
  try {
    const {NodePluginSandbox}=await import('@shiqianjiang/ceru-plugin-core/node')
    const {readArtifact}=await import('@shiqianjiang/ceru-plugin-issuer')
    const manifest={manifestVersion:3,id:'test.wasm-player',name:'WASM playback',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'main'}}}
    const artifact=readArtifact('exports.manifest='+JSON.stringify(manifest)+';exports.activate=async ctx=>{const {instance}=await ctx.wasm.instantiate("adder");ctx.streams.registerTransform("wasm",{seekable:true,create(){return {transform(bytes){for(let i=0;i<bytes.length;i++)bytes[i]=instance.exports.add(bytes[i],1)&255;return bytes}}}})}')
    artifact.resources.adder={type:'base64',mime:'application/wasm',value:Buffer.from('0061736d0100000001070160027f7f017f030201000707010361646400000a09010700200020016a0b','hex').toString('base64')}
    worker=new NodePluginSandbox(async()=>null,()=>{})
    await worker.start(artifact)
    registry.registerRuntime('fixture',(id,signal)=>worker.streamTransform(id,signal))
    const sources = new Map(),
      ranges = []
    for (const fixture of fixtures)
      sources.set('/' + fixture.algorithm, {
        bytes: readFileSync(fixture.file),
        stream: fixture.stream
      })
    server = createServer((request, response) => {
      const { bytes } = sources.get(request.url),
        match = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range ?? '')
      const start = match ? Number(match[1]) : 0,
        end = match?.[2] ? Math.min(Number(match[2]), bytes.length - 1) : bytes.length - 1
      ranges.push({ algorithm: request.url, start })
      response.writeHead(match ? 206 : 200, {
        'Content-Length': end - start + 1,
        ...(match ? { 'Content-Range': `bytes ${start}-${end}/${bytes.length}` } : {})
      })
      let offset = start
      const timer = setInterval(() => {
        if (offset > end) {
          clearInterval(timer)
          response.end()
          return
        }
        const next = Math.min(offset + 4096, end + 1)
        response.write(bytes.subarray(offset, next))
        offset = next
      }, 3)
      response.once('close', () => clearInterval(timer))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    registry.registerService('fixture', server.address().port)
    win = new BrowserWindow({
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false
      }
    })
    win.webContents.setAudioMuted(true)
    await win.loadURL('data:text/html,<audio muted></audio>')
    const results = []
    for (const [route, value] of sources) {
      const token = registry.register('fixture', {
        ok: true,
        url: 'http://127.0.0.1:' + server.address().port + route,
        stream: value.stream
      })
      const result = await win.webContents.executeJavaScript(
        `(async()=>{const audio=document.querySelector('audio');audio.src=${JSON.stringify(token)};await audio.play();await new Promise(r=>setTimeout(r,160));const started=audio.currentTime>0;const seeked=new Promise((resolve,reject)=>{audio.addEventListener('seeked',resolve,{once:true});audio.addEventListener('error',()=>reject(Error('audio error '+audio.error?.code)),{once:true})});audio.currentTime=143;await seeked;await new Promise(r=>setTimeout(r,200));const resumed=audio.currentTime>143;audio.pause();return {started,resumed,duration:audio.duration}})()`,
        true
      )
      if (
        !result.started ||
        !result.resumed ||
        !ranges.some((row) => row.algorithm === route && row.start > 0)
      )
        throw Error('Playback/seek failed for ' + route + JSON.stringify({ result, ranges }))
      results.push({ algorithm: route.slice(1), ...result, range: true })
    }
    console.log(JSON.stringify({ electron: process.versions.electron, audio: results }, null, 2))
  } finally {
    clearTimeout(timeout)
    win?.destroy()
    registry.dispose()
    worker?.dispose()
    server?.closeAllConnections()
    server?.close()
  }
  app.exit(0)
}
