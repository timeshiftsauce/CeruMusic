import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { createServer, Agent } from 'node:https'
import type { AddressInfo } from 'node:net'
import { resolve } from 'node:path'
import { cp, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, expect, jest, test } from '@jest/globals'
import pluginService from '..'
import { sniffManifestVersion, readInstalledArtifact } from '../runtimes'
import { PluginStorage } from '../storage'

let mockProfile: string
jest.mock('node:dns/promises', () => ({
  lookup: jest.fn(async () => [{ address: '93.184.216.34', family: 4 }])
}))
jest.mock('../../../utils/path', () => ({ getAppDirPath: () => mockProfile }))
jest.mock('electron', () => ({
  app: {
    getPath: () => mockProfile,
    getLocale: () => 'zh-CN',
    getName: () => 'Ceru Music',
    getVersion: () => '2.4.0'
  },
  BrowserWindow: { getAllWindows: () => [] },
  webContents: { getAllWebContents: () => [] },
  nativeTheme: {},
  powerMonitor: { getSystemIdleTime: () => 121 },
  shell: {},
  clipboard: {},
  safeStorage: {isAsyncEncryptionAvailable:async()=>true,encryptStringAsync:async (value:string)=>Buffer.from(value).reverse(),decryptStringAsync:async (data:Buffer)=>({result:Buffer.from(data).reverse().toString(),shouldReEncrypt:false})},
  dialog: {},
  globalShortcut: {}
}))
jest.mock('../uiBridge', () => ({
  callPluginUI: jest.fn(),
  publishHookNames: jest.fn(),
  publishPluginAccountChanged: jest.fn(),
  pluginChanged: jest.fn(),
  cancelPluginUI: jest.fn(),
  publishPluginSurface: jest.fn()
}))
jest.mock('../logger', () => ({
  __esModule: true,
  default: class {
    info() {}
    warn() {}
    error() {}
    debug() {}
  }
}))
jest.mock('../../networkProxy', () => ({ getRequestAgentsFor: jest.fn() }))
jest.mock('../../DownloadManager', () => ({downloadManager: {cancelPendingTasks: jest.fn()}}))
jest.mock('ceru-plugin-core-v2', () => mockNative('ceru-plugin-core-v2'))
jest.mock('ceru-plugin-core-v2/node', () => mockNative('ceru-plugin-core-v2/node'))
jest.mock('ceru-plugin-core-v2/network', () => mockNative('ceru-plugin-core-v2/network'))
jest.mock('ceru-plugin-core-v2/sockets', () => mockNative('ceru-plugin-core-v2/sockets'))
jest.mock('ceru-plugin-core-v2/surface', () => mockNative('ceru-plugin-core-v2/surface'))
jest.mock('ceru-plugin-core-v2/surface-document', () =>
  mockNative('ceru-plugin-core-v2/surface-document')
)
jest.mock('ceru-plugin-core-v2/guests', () => mockNative('ceru-plugin-core-v2/guests'))
jest.mock('@shiqianjiang/ceru-plugin-sdk', () => mockNative('@shiqianjiang/ceru-plugin-sdk'))
jest.mock('ceru-plugin-sdk-v2', () => mockNative('ceru-plugin-sdk-v2'))

jest.mock('@shiqianjiang/ceru-plugin-core', () => mockNative('@shiqianjiang/ceru-plugin-core'))
jest.mock('@shiqianjiang/ceru-plugin-core/music', () => mockNative('@shiqianjiang/ceru-plugin-core/music'))
jest.mock('@shiqianjiang/ceru-plugin-core/contract', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/contract')
)
jest.mock('@shiqianjiang/ceru-plugin-core/dispatch', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/dispatch')
)
jest.mock('@shiqianjiang/ceru-plugin-core/guests', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/guests')
)
jest.mock('@shiqianjiang/ceru-plugin-core/node', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/node')
)
jest.mock('@shiqianjiang/ceru-plugin-core/network', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/network')
)
jest.mock('@shiqianjiang/ceru-plugin-core/media', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/media')
)
jest.mock('@shiqianjiang/ceru-plugin-core/server', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/server')
)
jest.mock('@shiqianjiang/ceru-plugin-core/trusted', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/trusted')
)
// This Node-only suite verifies shared host policy with Core's Node transport.
// Real utilityProcess/MessagePort, ASAR, native and shutdown are exercised by
// scripts/test-plugin-utility-runtime.mjs under Electron.
jest.mock('../trusted/utilityProcess', () => ({ launchTrustedUtilityProcess: undefined }))
jest.mock('@shiqianjiang/ceru-plugin-core/sockets', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/sockets')
)
jest.mock('@shiqianjiang/ceru-plugin-core/operations', () => mockNative('@shiqianjiang/ceru-plugin-core/operations'))
jest.mock('@shiqianjiang/ceru-plugin-core/services', () => mockNative('@shiqianjiang/ceru-plugin-core/services'))
jest.mock('@shiqianjiang/ceru-plugin-core/surface', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/surface')
)
jest.mock('@shiqianjiang/ceru-plugin-core/surface-document', () =>
  mockNative('@shiqianjiang/ceru-plugin-core/surface-document')
)
jest.mock('@shiqianjiang/ceru-plugin-issuer', () => mockNative('@shiqianjiang/ceru-plugin-issuer'))

function mockNative(name: string) {
  return process.getBuiltinModule('module').createRequire(__filename)(name)
}

test('playlist writes preserve the calling runtime, filter private rows and stop on cancel or revocation',async()=>{
  const {HostServices} = await import('../hostServices')
  const bridge = jest.mocked((await import('../uiBridge')).callPluginUI)
  const services = new HostServices(()=>'caller-file',()=>false,()=>{})
  const manifest={manifestVersion:3,id:'test.library-track-guard',name:'Track guard',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'guard',name:'library.intercept',reason:'检查歌单变更'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{for(const name of ["playlist.addTracks","playlist.removeTracks"])ctx.hooks.on(name,async(op,next)=>{if(op.source.pluginId!=="test.caller" || op.source.kind!=="plugin" || JSON.stringify(op.input).includes("secret"))return;if(op.source.runtime===2 || op.input.playlist.name==="cancel")op.preventDefault();else await next({...op.input,tracks:op.input.tracks.slice(1)})})}'
  const {pluginId}=await pluginService.addPlugin(code,'playlist-track-guard.js')
  const items = ['first','second'].map(id=>({title:id,ref:{kind:'track',providerId:'catalog',id:'secret-'+id,scope:'connection',connectionId:'secret-account'},metadata:{artists:[]}}))
  const target = {id:'list-1',location:'local'}, data={target,items}
  let label='Original', revoke=false
  const writes:unknown[]=[]
  bridge.mockImplementation(async (_owner,method,payload)=>{
    if (method==='operation.playlistTarget') {
      if (revoke) services.revokeAccess()
      return {playlist:{...target,name:label}}
    }
    if (method==='operation.writePlaylistTracks') {
      writes.push(payload.items)
      return payload.adding ? {cancelled:false,target,added:payload.items.length,skipped:0} : {removed:payload.items.length,notFound:0}
    }
    if (method==='library.playlists.import') {writes.push(payload.items);return {cancelled:false,target,added:2,skipped:0}}
    throw Error(method)
  })
  const run = (method:string,runtime:2|3=3)=>services.changePlaylistTracks(method,data,{kind:'plugin',pluginId:'test.caller',runtime},services.accessSignal())
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    expect((await run('library.playlists.import')).added).toBe(2)
    pluginService.savePermissions(pluginId,['guard'])
    expect(await run('library.playlists.import')).toMatchObject({added:1,skipped:1,cancelled:false})
    expect(await run('library.playlists.removeTracks')).toEqual({removed:1,notFound:1})
    expect((await run('library.playlists.import',2)).cancelled).toBe(true)
    label='cancel';expect(await run('library.playlists.removeTracks')).toEqual({removed:0,notFound:2})
    revoke=true;await expect(run('library.playlists.import')).rejects.toThrow()
    expect(writes).toEqual([items,[items[1]],[items[1]]])
  } finally {services.dispose();await pluginService.uninstallPlugin(pluginId);bridge.mockReset()}
})

test('a real sharing worker supplies links, cancels and wraps the host without exposing private references',async()=>{
  const {HostServices}=await import('../hostServices')
  const {readShareDescriptor}=await import('../sharing')
  const services=new HostServices(()=>'caller',()=>false,()=>{})
  const manifest={manifestVersion:3,id:'test.sharing-hooks',name:'Sharing',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'share',name:'sharing.intercept',reason:'分享测试'}]}}
  const {pluginId}=await pluginService.addPlugin('exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>ctx.hooks.on('share.create',async(op,next)=>{
    if(JSON.stringify(op.input).includes('secret'))throw Error('private reference leaked');
    if(op.input.track.title==='cancel'){op.preventDefault();return}
    if(op.input.track.title==='custom')return {id:'custom',url:'https://example.test/custom'};
    const result=await next();return result?{...result,id:'wrapped'}:null;
  })`,'share-hooks.js')
  const descriptor={track:{kind:'track',providerId:'demo',id:'secret-song',pluginId:'source.owner',connectionId:'secret-account'},title:'custom',artists:['QA']}
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    pluginService.savePermissions(pluginId,['share'])
    for(const runtime of [2,3] as const)expect(await services.handleSharingService('services.sharing.create',[descriptor],{kind:'plugin',pluginId:'caller',runtime})).toEqual({id:'custom',url:'https://example.test/custom'})
    await expect(services.handleSharingService('services.sharing.create',[{...descriptor,title:'cancel'}])).rejects.toThrow('取消')
    const result=await services.handleSharingService('services.sharing.create',[{...descriptor,title:'wrapped'}])
    if(!result || !('id' in result))throw Error('Expected created share')
    expect(result.id).toBe('wrapped')
    pluginService.savePermissions(pluginId,[])
    const raw=await services.handleSharingService('services.sharing.create',[descriptor])
    if(!raw || !('id' in raw))throw Error('Expected original share')
    expect(raw.id).toMatch(/^v2_/)
    expect(readShareDescriptor(raw.id).title).toBe('custom')
    const publicShare=await services.handleSharingService('services.sharing.create',[{track:{kind:'track',providerId:'demo',id:'public',scope:'provider'},title:'Public',artists:[]}])
    if(!publicShare || !('id' in publicShare))throw Error('Expected public share')
    expect(readShareDescriptor(publicShare.id).track).toMatchObject({scope:'provider',id:'public'})
  } finally {services.dispose();await pluginService.uninstallPlugin(pluginId)}
})

test('a real download worker filters private tracks, renames safely, cancels and replays only once',async()=>{
  const {runDownloadTasks,downloadFilename,replayDownload}=await import('../operations/downloads')
  const {downloadManager}=await import('../../DownloadManager')
  const bridge=jest.mocked((await import('../uiBridge')).callPluginUI)
  const manifest={manifestVersion:3,id:'test.download-hooks',name:'Downloads',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'downloads',name:'downloads.intercept',reason:'管理下载'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    ctx.hooks.on('download.create',async(op,next)=>{
      if(JSON.stringify(op.input).includes('secret'))throw Error('private data leaked');
      if(op.input.tracks[0]?.title==='cancel')op.preventDefault();
      else await next({...op.input,tracks:op.input.tracks.slice(1),quality:'flac'});
    });
    ctx.hooks.on('download.filename',op=>({...op.input,name:'Renamed.mp3'}));
  }`
  const {pluginId}=await pluginService.addPlugin(code,'download-hooks.js')
  const tasks:Parameters<typeof runDownloadTasks>[0]=['first','second'].map(name=>({songInfo:{source:'demo',songmid:'secret-'+name,name,singer:'Artist',albumName:'',albumId:'',interval:'',img:'',lrc:null,pluginResource:{kind:'track',providerId:'demo',id:'secret-'+name,connectionId:'secret-account'}},quality:'128k',path:'C:/secret/downloads',pluginId:'provider',tagWriteOptions:{}}))
  const calls:any[]=[]
  const execute=async(rows:any[],bypass=false)=>{calls.push({rows,bypass});return rows.map((_,index)=>({success:true,id:'download-'+index}))}
  let token=''
  bridge.mockImplementation(async(_owner,method,data)=>{if(method==='operation.downloadNotice')token=data.token})
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    await runDownloadTasks(tasks,{kind:'ui'},execute)
    expect(calls[0].rows).toEqual(tasks)
    pluginService.savePermissions(pluginId,['downloads'])
    await runDownloadTasks(tasks,{kind:'ui'},execute)
    expect(calls[1].rows).toEqual([{...tasks[1],quality:'flac'}])
    expect(await downloadFilename(tasks[0].songInfo,'Original.mp3',{kind:'ui'})).toBe('Renamed.mp3')
    await replayDownload(token)
    expect(downloadManager.cancelPendingTasks).toHaveBeenCalledWith(['download-0'])
    expect(calls[2]).toEqual({rows:tasks,bypass:true})
    await expect(replayDownload(token)).rejects.toThrow('过期')
    const cancelled=[{...tasks[0],songInfo:{...tasks[0].songInfo,name:'cancel'}}]
    expect(await runDownloadTasks(cancelled,{kind:'ui'},execute)).toEqual([])
    expect(calls).toHaveLength(3)
    const host=pluginService.getPluginById(pluginId)!
    const lifetime=host.getAccessSignal()
    pluginService.savePermissions(pluginId,[])
    expect(lifetime.aborted).toBe(true)
    expect(await downloadFilename(tasks[0].songInfo,'Original.mp3',{kind:'ui'})).toBe('Original.mp3')
    await pluginService.setPluginEnabled(pluginId,false)
    await runDownloadTasks(tasks,{kind:'ui'},execute)
    expect(calls[3].rows).toEqual(tasks)
  } finally {await pluginService.uninstallPlugin(pluginId);bridge.mockReset()}
})

test('a real lyric worker fills missing lyrics, translates without mutating the provider cache and hides private references',async()=>{
  const {runLyrics}=await import('../operations/lyrics')
  const manifest={manifestVersion:3,id:'test.lyric-hooks',name:'Lyrics',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'lyrics',name:'lyrics.intercept',reason:'补充歌词翻译'}]}}
  const {pluginId}=await pluginService.addPlugin('exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    ctx.hooks.on('lyrics.load',async(op,next)=>{if(JSON.stringify(op).includes('secret'))throw Error('private data leaked');const value=await next();return value??{format:'crlyric',version:1,track:op.input.track.ref,offsetMs:0,lines:[{startTimeMs:0,text:'Fallback'}]}});
    ctx.hooks.on('lyrics.transform',async(op,next)=>{if(JSON.stringify(op.input).includes('secret'))throw Error('private data leaked');const value=await next();return value?{...value,lines:value.lines.map(line=>({...line,translation:'译文'}))}:null})
  }`,'lyric-hooks.js')
  const ref={kind:'track',pluginId:'private.owner',providerId:'demo',id:'secret-track',connectionId:'secret-connection',data:{private:'secret-metadata'}}
  const song={source:'demo',songmid:'secret-track',name:'Song',singer:'Artist',pluginResource:ref}
  const original={format:'crlyric' as const,version:1 as const,track:ref,offsetMs:0,lines:[{startTimeMs:0,text:'Original'}]}
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    expect(await runLyrics(song,async()=>original)).toBe(original)
    pluginService.savePermissions(pluginId,['lyrics'])
    const fallback=await runLyrics(song,async()=>{throw Error('missing provider')})
    expect(fallback?.lines).toEqual([{startTimeMs:0,text:'Fallback',translation:'译文'}])
    expect(fallback?.track).toEqual(ref)
    const translated=await runLyrics(song,async()=>original)
    expect(translated?.lines[0].translation).toBe('译文')
    expect(original.lines).toEqual([{startTimeMs:0,text:'Original'}])
    pluginService.savePermissions(pluginId,[])
    expect(await runLyrics(song,async()=>original)).toBe(original)
    await expect(runLyrics(song,async()=>{throw Error('missing provider')})).rejects.toThrow('missing provider')
  } finally {await pluginService.uninstallPlugin(pluginId)}
})

test('a real v3 playback hook activates only while granted and disposes on stop',async()=>{
  const {operationBus,hookSnapshot}=await import('../operations/bus')
  const manifest={manifestVersion:3,id:'test.playback-hooks',name:'Hook',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'intercept',name:'player.intercept',reason:'测试队列位置'}]}}
  const {pluginId}=await pluginService.addPlugin('exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{ctx.hooks.on("queue.add",async(op,next)=>{await next({...op.input,position:"next"})});for(const name of ["player.play","player.pause","player.resume"])ctx.hooks.on(name,op=>op.preventDefault())}','hooks.js')
  const track={ref:{kind:'track',id:'one',providerId:'demo'},title:'demo',metadata:{artists:[]}}
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    expect(hookSnapshot().names).toEqual([])
    pluginService.savePermissions(pluginId,['intercept'])
    expect(hookSnapshot().names).toEqual(['player.play','queue.add','player.pause','player.resume'])
    const defaults:unknown[]=[]
    const result=await operationBus.run('queue.add',{tracks:[track],position:'end'},{kind:'plugin',pluginId:'v2.caller',runtime:2},async value=>{defaults.push(value)})
    expect(defaults).toEqual([{tracks:[track],position:'next'}]);expect(result.handledBy).toEqual([manifest.id])
    expect((await operationBus.run('player.play',{track},{kind:'ui'},async()=>{throw Error('Unexpected default')})).prevented).toBe(true)
    for (const name of ['player.pause', 'player.resume'] as const) {
      expect((await operationBus.run(name, {}, {kind:'system'}, async()=>{throw Error('Unexpected default')})).prevented).toBe(true)
    }
    pluginService.savePermissions(pluginId,[]);expect(hookSnapshot().names).toEqual([])
    for (const name of ['player.pause', 'player.resume'] as const) {
      let calls = 0
      expect((await operationBus.run(name, {}, {kind:'system'}, async()=>{calls++})).prevented).toBe(false)
      expect(calls).toBe(1)
    }
    pluginService.savePermissions(pluginId,['intercept']);await pluginService.setPluginEnabled(pluginId,false);expect(hookSnapshot().names).toEqual([])
  } finally {await pluginService.uninstallPlugin(pluginId)}
})
const fixture = join(__dirname, '../__fixtures__/appdata-v2')
const reader = 'a7f47b28122585150eef6f10a71fc217'
const parent = '0ae29f049d3bd6e6e898acb1c17a6581'
const source = '67fc3aa42c52d66c86b19db38f7071f6'
async function hashes(root: string, relative = ''): Promise<Record<string, string>> {
  const result: Record<string, string> = {}
  for (const item of await readdir(join(root, relative), { withFileTypes: true })) {
    const key = join(relative, item.name)
    if (item.isDirectory()) Object.assign(result, await hashes(root, key))
    else if (key !== 'state.json')
      result[key] = createHash('sha256')
        .update(await readFile(join(root, key)))
        .digest('hex')
  }
  return result
}

beforeAll(async () => {
  mockProfile = await mkdtemp(join(tmpdir(), 'ceru-upgrade-'))
  await cp(fixture, mockProfile, { recursive: true })
})

afterAll(async () => {
  for (const plugin of await pluginService.getPluginsList())
    await pluginService.getPluginById(plugin.pluginId)?.destroy()
  await rm(mockProfile, { recursive: true, force: true })
})

test('a v2 profile restores its inventory and data, and survives a rejected update', async () => {
  const root = join(mockProfile, 'plugins')
  const original = await hashes(root)
  const stateBytes = await readFile(join(root, 'state.json'), 'utf8')
  const state = JSON.parse(stateBytes)
  await pluginService.initializePlugins()
  await pluginService.restoreEnabledPlugins()
  const list = await pluginService.getPluginsList()
  expect(
    list
      .filter((row) => row.pluginId in state)
      .map(({ pluginId, enabled, order }) => ({ pluginId, enabled, order }))
  ).toEqual(
    Object.entries(state).map(([pluginId, settings]) => ({ pluginId, ...(settings as object) }))
  )
  expect(list.filter((row) => row.status === 'installed').every((row) => row.runtime === 2)).toBe(
    true
  )
  expect(list).toHaveLength((await readdir(root)).filter((name) => name.endsWith('.js')).length)
  expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(stateBytes)
  expect(pluginService.getPermissions(reader)).toEqual(['network'])
  expect(await pluginService.getPluginById(reader)?.invokeV2Action('read', {})).toEqual({
    config: { theme: 'night' },
    favorite: 'track-one'
  })
  expect(await pluginService.listGuests(parent)).toEqual([
    expect.objectContaining({ name: 'Archived guest', selected: true })
  ])
  const search = () =>
    pluginService.invokeV2Provider(source, 'early', 'tracks.search', [{ query: 'one' }])
  const {
    items: [song]
  } = await search()
  expect(song.metadata.artists).toEqual(['歌手'])
  expect(
    await pluginService.invokeV2Provider(source, 'early', 'tracks.resolve', [song.ref, {}])
  ).toMatchObject({ ok: true })
  const beforeUpdate = await readFile(join(root, 'state.json'), 'utf8')
  const download = jest.spyOn(pluginService, 'downloadFile').mockResolvedValue('not a plugin')
  try {
    expect(
      await pluginService.downloadAndAddPlugin('https://example.invalid/update.js', 'cr', source)
    ).toHaveProperty('error')
  } finally {
    download.mockRestore()
  }
  expect(await search()).toEqual({ items: [song] })
  expect(await hashes(root)).toEqual(original)
  expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(beforeUpdate)
  expect(JSON.parse(beforeUpdate)).toMatchObject(state)
})

test('a damaged installed plugin is visible, never restored, and can be repaired in place', async () => {
  const root = join(mockProfile, 'plugins')
  const file = join(root, `${source}-earliest-source.js`)
  const valid = await readFile(file, 'utf8')
  const state = await readFile(join(root, 'state.json'), 'utf8')
  await writeFile(file, 'damaged contents')
  await pluginService.loadInstalledPlugins()
  const list = await pluginService.getPluginsList()
  expect(list.find((row) => row.pluginId === source)).toMatchObject({
    status: 'broken',
    runtime: 'unknown',
    requestedEnabled: true,
    enabled: false,
    loadError: expect.any(String),
    pluginName: `${source}-earliest-source.js`
  })
  await expect(pluginService.setPluginEnabled(source, true)).rejects.toThrow()
  expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(state)
  expect(await readFile(file, 'utf8')).toBe('damaged contents')
  await expect(
    pluginService.addPlugin(
      valid.replace('example.early-source', 'example.other'),
      'wrong.js',
      source
    )
  ).rejects.toThrow('ID')
  expect(await readFile(file, 'utf8')).toBe('damaged contents')
  expect(await pluginService.addPlugin(valid, 'fixed.js', source)).toMatchObject({
    pluginId: source
  })
  expect(
    (await pluginService.getPluginsList()).find((row) => row.pluginId === source)
  ).toMatchObject({ runtime: 2, enabled: true })
})

test('scanning keeps unrecognized files separate from a healthy sibling and ignores directories', async () => {
  const root = join(mockProfile, 'plugins')
  const healthy = join(root, source + '-earliest-source.js')
  const valid = await readFile(healthy, 'utf8')
  const duplicate = source + '-duplicate.js'
  const names = [duplicate, 'unsupported.js', 'constructor-bad.js', 'malformed.js']
  for (const [index, name] of names.entries())
    await writeFile(
      join(root, name),
      [
        'invalid',
        'exports.manifest = { manifestVersion: 3 }',
        'invalid',
        '/* @ceru-plugin-v2\n{bad json'
      ][index]
    )
  await pluginService.loadInstalledPlugins()
  await pluginService.restoreEnabledPlugins()
  const list = await pluginService.getPluginsList()
  const bad = list.filter((row) => names.includes(row.pluginName))
  expect(bad).toHaveLength(names.length)
  expect(new Set(bad.map((row) => row.pluginId)).size).toBe(names.length)
  expect(bad.every((row) => row.status === 'broken' && !row.enabled)).toBe(true)
  expect(bad.find((row) => row.pluginName === 'unsupported.js')?.runtime).toBe(3)
  expect(list.some((row) => row.pluginName === 'config')).toBe(false)
  for (const row of bad) await pluginService.uninstallPlugin(row.pluginId)
  expect(await readFile(healthy, 'utf8')).toBe(valid)
  expect(pluginService.getPluginById(source)).toBeDefined()
})

test('routing reads literal metadata without evaluating plugin code or bypassing full validation', () => {
  const envelope =
    '/* @ceru-plugin-v2\n' +
    JSON.stringify({ manifest: { manifestVersion: 2 } }) +
    '\n@end-ceru-plugin */\n'
  expect(sniffManifestVersion('\ufeff' + envelope)).toBe(2)
  expect(() => readInstalledArtifact(envelope)).toThrow()
  expect(
    sniffManifestVersion(
      'exports.manifest = { manifestVersion: (function () { throw new Error() })() }'
    )
  ).toBeNull()
  expect(
    sniffManifestVersion('exports.manifest = { manifestVersion: 2, manifestVersion: 3 }')
  ).toBeNull()
  expect(sniffManifestVersion('exports.manifest = { manifestVersion: 3 }\nthrow new Error()')).toBe(
    3
  )
  expect(sniffManifestVersion('/*! @name Example\n@version 1.0.0 */')).toBe('legacy-comment')
})

test('a real v3 source coexists with the frozen v2 worker and survives a rejected replacement', async () => {
  const code = await readFile(join(__dirname, '../v3/__fixtures__/source-project.js'), 'utf8')
  const { pluginId } = await pluginService.addPlugin(code, 'v3-source.js')
  try {
    await pluginService.setPluginEnabled(pluginId, true)
    const host = pluginService.getPluginById(pluginId)!
    expect(host.getDescriptor()).toMatchObject({
      runtime: 3,
      providers: [{ id: 'catalog', pluginId }]
    })
    expect(host.getDescriptor()).not.toHaveProperty('config')
    const search = () =>
      host.invokeV2Provider('catalog', 'tracks.search', [{ query: 'morning', limit: 10 }])
    const result = await search()
    expect(result.items[0].ref.pluginId).toBe('local.source-project')
    expect(
      await host.invokeV2Provider('catalog', 'tracks.lyrics', [result.items[0].ref])
    ).toBeTruthy()
    expect(
      (await pluginService.invokeV2Provider(source, 'early', 'tracks.search', [{ query: 'one' }]))
        .items
    ).toHaveLength(1)
    await expect(
      pluginService.addPlugin(
        code.replace('kind: "playlists"', 'kind: "invalid"'),
        'bad.js',
        pluginId
      )
    ).rejects.toThrow(/homeSections|kind/)
    expect(await search()).toEqual(result)
  } finally {
    await pluginService.uninstallPlugin(pluginId)
  }
})

test('real v3 provider resolves encrypted media through host tokens and revokes them on disable', async () => {
  jest.mocked((await import('../uiBridge')).callPluginUI).mockResolvedValue(false)
  const {musicRegistry}=await import('../musicRegistry')
  const {pluginMedia}=await import('../media/mediaProtocol')
  const manifest={manifestVersion:3,id:'test.encrypted-provider',name:'Encrypted provider',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{providers:[{id:'encrypted',name:'Encrypted',protocols:['music.resolve@1'],qualities:['standard']}]},uses:{permissions:[{key:'transform',name:'streams.transform',reason:'处理音频数据流'}]}}
  const result={ok:true,url:'https://example.test/encrypted',requestHeaders:{Authorization:'private'},stream:{decrypt:{algorithm:'aes-128-ctr',key:'00'.repeat(16),iv:'00'.repeat(16)},contentType:'audio/flac',contentLength:1024}}
  const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{ctx.streams.registerTransform("custom",{seekable:true,create(){return {transform:chunk=>chunk}}});ctx.providers.register("encrypted",{tracks:{resolve:(ref)=>ref.id==="custom"?{...('+JSON.stringify(result)+'),stream:{transform:"custom",contentLength:1024}}:('+JSON.stringify(result)+')}})}'
  const {pluginId}=await pluginService.addPlugin(code,'encrypted-provider.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host=pluginService.getPluginById(pluginId)!
    const direct=await host.getMusicUrl('encrypted',{id:'track'},'standard')
    expect(direct).toMatch(/^ceru-media:\/\/[a-f0-9-]{36}$/)
    const shared=await musicRegistry.invoke('music.tracks.resolve',[{id:'track',providerId:'encrypted',pluginId:manifest.id,scope:'provider',kind:'track'},'standard',{}],'reader',{id:'resolve-encrypted',deadlineAt:Date.now()+5000,signal:new AbortController().signal})
    expect(Object.keys(shared).sort()).toEqual(['expiresAt','ok','url'])
    expect(shared.url).toMatch(/^ceru-media:/)
    expect(pluginMedia.has(direct)).toBe(true)
    expect(pluginMedia.has(shared.url)).toBe(true)
    await expect(host.getMusicUrl('encrypted',{id:'custom'},'standard')).rejects.toThrow(/授权/)
    pluginService.savePermissions(pluginId,['transform'])
    const custom=await host.getMusicUrl('encrypted',{id:'custom'},'standard')
    expect(pluginMedia.has(custom)).toBe(true)
    await pluginService.setPluginEnabled(pluginId,false)
    expect(pluginMedia.has(direct)).toBe(false)
    expect(pluginMedia.has(shared.url)).toBe(false)
    expect(pluginMedia.has(custom)).toBe(false)
  } finally {await pluginService.uninstallPlugin(pluginId)}
})

test('sandbox HTTP services stream through a real worker and close on permission revocation', async () => {
  jest.mocked((await import('../uiBridge')).callPluginUI).mockResolvedValue(false)
  const manifest = {
    manifestVersion: 3, id: 'test.http-provider', name: 'HTTP provider', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'main' } },
    uses: { permissions: [{ key: 'serve', name: 'network.serve', reason: '在本机提供测试音频服务' }] },
    provides: {
      actions: [{ id: 'start', title: 'Start' }, { id: 'alive', title: 'Alive' }],
      providers: [{ id: 'local-http', name: 'Local HTTP', protocols: ['music.resolve@1'] }]
    }
  }
  const code = 'exports.manifest=' + JSON.stringify(manifest) + `;exports.activate=ctx=>{
    let server;
    ctx.actions.register('alive',()=>true);
    ctx.actions.register('start',async()=>{
      server=await ctx.server.serve(async request=>{
        if(request.method==='POST')return new Response(request.body,{headers:{'content-type':'application/octet-stream'}});
        return new Response(new Uint8Array([10,20,30,40]),{headers:{'content-type':'audio/wav'}});
      });
      return {url:server.url,port:server.port};
    });
    ctx.providers.register('local-http',{tracks:{resolve:()=>({ok:true,url:server.url+'/audio'})}});
  }`
  const { pluginId } = await pluginService.addPlugin(code, 'http-provider.js')
  try {
    await pluginService.setPluginEnabled(pluginId, true)
    const host = pluginService.getPluginById(pluginId)!
    await expect(host.invokeV2Action('start')).rejects.toThrow()
    pluginService.savePermissions(pluginId, ['serve'])
    const server = await host.invokeV2Action('start')
    expect(server.url).toBe('http://127.0.0.1:' + server.port)
    expect(new Uint8Array(await (await fetch(server.url)).arrayBuffer())).toEqual(new Uint8Array([10,20,30,40]))
    const body = new Uint8Array(3 * 1024 * 1024).fill(67)
    const echoed = new Uint8Array(await (await fetch(server.url, {method:'POST',body})).arrayBuffer())
    // Compare every byte natively; Jest's per-element object comparison of a
    // 3 MiB typed array can consume the entire test deadline on its own.
    expect(Buffer.from(echoed).equals(Buffer.from(body))).toBe(true)
    expect(await host.getMusicUrl('local-http', {id:'one'}, 'standard')).toBe(server.url + '/audio')
    pluginService.savePermissions(pluginId, [])
    await new Promise(resolve => setTimeout(resolve, 50))
    await expect(fetch(server.url)).rejects.toThrow()
    await expect(host.getMusicUrl('local-http', {id:'one'}, 'standard')).rejects.toThrow(/owned/)
    expect(await host.invokeV2Action('alive')).toBe(true)
  } finally {
    await pluginService.uninstallPlugin(pluginId)
  }
})

test('signed trusted service survives unchanged or added grants and revocation preserves the optional sandbox', async () => {
  const issuer = mockNative('@shiqianjiang/ceru-plugin-issuer')
  const bridge = jest.mocked((await import('../uiBridge')).callPluginUI)
  bridge.mockImplementation(async (_owner, method) => method === 'host.trustedConsent'
    ? {choice:'grant',acknowledged:true} : false)
  const manifest = {
    manifestVersion:3,id:'test.trusted-http',name:'Trusted HTTP',publisher:'Local QA',version:'1.0.0',
    engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},
    entry:{logic:{module:'main'},server:{module:'server.main',runtime:'node'}},
    uses:{permissions:[
      {key:'trusted',name:'runtime.trusted',optional:true,reason:'在独立进程运行本地测试服务并返回音频'},
      {key:'serve',name:'network.serve',reason:'在本机提供测试音频服务'},
      {key:'unused',name:'clipboard.read',optional:true,reason:'验证新增普通权限不会停止服务'}
    ]},
    provides:{actions:[{id:'status',title:'Status'}],providers:[{id:'trusted-audio',name:'Trusted',protocols:['music.resolve@1']}]}
  }
  const source='exports.manifest='+JSON.stringify(manifest)+`;exports.activate=ctx=>{
    ctx.actions.register('status',()=>({url:ctx.server.url??null,alive:true}));
    ctx.providers.register('trusted-audio',{tracks:{resolve:()=>ctx.server.url?{ok:true,url:ctx.server.url+'/audio'}:ctx.playback.failure({code:'UNSUPPORTED',message:'服务未启用'})}});
  };
  const Server=/* @ceru-self-contained */ async function(ctx){await ctx.server.listen((_req,res)=>{res.setHeader('content-type','audio/wav');res.end('trusted fixture')})};
  exports.modules={'server.main':Server};`
  const keys=issuer.generateSigningKeys()
  const code=issuer.signArtifact(Buffer.from(source),keys.privateKey).toString()
  const {pluginId}=await pluginService.addPlugin(code,'trusted-http.js')
  try {
    pluginService.savePermissions(pluginId,['serve'])
    await pluginService.setPluginEnabled(pluginId,true)
    const host=pluginService.getPluginById(pluginId)!
    const status=await host.invokeV2Action('status')
    expect(status.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/)
    expect(await (await fetch(status.url)).text()).toBe('trusted fixture')
    expect(await host.getMusicUrl('trusted-audio',{id:'one'},'standard')).toBe(status.url+'/audio')
    for (const permissions of [['serve'], ['serve', 'unused']]) {
      pluginService.savePermissions(pluginId, permissions)
      expect(pluginService.getPermissions(pluginId)).toEqual(permissions)
      const consent = await pluginService.getTrustedConsentDetail(pluginId)
      if (!consent) throw Error('Expected trusted consent details for the signed fixture')
      expect(consent.granted).toBe(true)
      expect(pluginService.getPluginById(pluginId)).toBe(host)
      expect(await host.invokeV2Action('status')).toEqual(status)
      expect(await (await fetch(status.url)).text()).toBe('trusted fixture')
    }
    await pluginService.setTrustedConsent(pluginId,false)
    await expect(fetch(status.url)).rejects.toThrow()
    expect(await host.invokeV2Action('status')).toEqual({url:null,alive:true})
  } finally { await pluginService.uninstallPlugin(pluginId); bridge.mockReset() }
})

test('signed trusted RPC cannot write after revocation while authorization is pending', async () => {
  const issuer = mockNative('@shiqianjiang/ceru-plugin-issuer')
  const { PluginPermissions } = await import('../shared/permissions')
  const { HostServices } = await import('../hostServices')
  const bridge = jest.mocked((await import('../uiBridge')).callPluginUI)
  bridge.mockImplementation(async (_owner, method) => method === 'host.trustedConsent'
    ? { choice: 'grant', acknowledged: true } : false)
  const manifest = {
    manifestVersion: 3, id: 'test.trusted-pending-write', name: 'Pending trusted write',
    publisher: 'Local QA', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'main' }, server: { module: 'server.main', runtime: 'node' } },
    uses: { permissions: [
      { key: 'trusted', name: 'runtime.trusted', optional: true, reason: '在独立进程验证撤销后不再执行宿主写入' },
      { key: 'serve', name: 'network.serve', reason: '提供独立进程测试入口' },
      { key: 'write', name: 'clipboard.write', reason: '验证等待授权期间撤销写入' }
    ] },
    provides: { actions: [{ id: 'status', title: 'Status' }] }
  }
  const source = 'exports.manifest=' + JSON.stringify(manifest) + `;
    exports.activate=ctx=>ctx.actions.register('status',()=>({url:ctx.server.url??null,alive:true}));
    const Server=/* @ceru-self-contained */ async function(ctx) {
      await ctx.server.listen((_req,res)=>{
        void ctx.clipboard.writeText('must not be written',{permissionKey:'write'}).then(
          ()=>res.end('written'),()=>res.end('cancelled'));
      });
    };
    exports.modules={'server.main':Server};`
  const keys = issuer.generateSigningKeys()
  const code = issuer.signArtifact(Buffer.from(source), keys.privateKey).toString()
  let entered!: () => void, release!: () => void
  const waiting = new Promise<void>(resolve => { entered = resolve })
  const gate = new Promise<void>(resolve => { release = resolve })
  const originalAuthorize = PluginPermissions.prototype.authorize
  // Pause AFTER a successful permission check. Pending UI's revision guard must
  // not mask a missing trusted-dispatch cancellation check in this regression.
  const authorize = jest.spyOn(PluginPermissions.prototype, 'authorize').mockImplementation(
    async function(this: InstanceType<typeof PluginPermissions>, key, name) {
      await originalAuthorize.call(this, key, name)
      if (name === 'clipboard.write') { entered(); await gate }
    }
  )
  const write = jest.spyOn(HostServices.prototype, 'writeClipboard').mockReturnValue(null)
  let pluginId: string | undefined
  let pending: Promise<unknown> | undefined
  try {
    pluginId = (await pluginService.addPlugin(code, 'trusted-pending-write.js')).pluginId
    pluginService.savePermissions(pluginId, ['serve', 'write'])
    await pluginService.setPluginEnabled(pluginId, true)
    const host = pluginService.getPluginById(pluginId)!
    const status = await host.invokeV2Action('status')
    pending = fetch(status.url + '/write').then(response => response.text()).catch(() => null)
    await waiting
    await pluginService.setTrustedConsent(pluginId, false)
    release()
    await pending
    // Drain the released authorization continuation and any legacy forwarding
    // microtasks before asserting that no Host side effect occurred.
    await new Promise<void>(resolve => setImmediate(resolve))
    expect(write).not.toHaveBeenCalled()
    expect(await host.invokeV2Action('status')).toEqual({ url: null, alive: true })
    await expect(fetch(status.url)).rejects.toThrow()
  } finally {
    release()
    await pending
    if (pluginId) await pluginService.uninstallPlugin(pluginId)
    authorize.mockRestore()
    write.mockRestore()
    bridge.mockReset()
  }
}, 15000)

function readerUpgrade(original: string) {
  const manifest = {
    manifestVersion: 3,
    id: 'example.upgrade-reader',
    name: 'Upgrade reader',
    version: '2.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'logic.main' } },
    provides: { actions: [{ id: 'read', title: 'Read' }] },
    uses: {
      permissions: [
        { key: 'network', name: 'network.request', reason: 'Read metadata', optional: true }
      ]
    }
  }
  const logic = original
    .slice(original.indexOf('exports.activate'))
    .replace(
      'config: await',
      'api: ctx.host.apiVersion, app: await ctx.app.getInfo(), config: await'
    )
  const build = () => 'exports.manifest = ' + JSON.stringify(manifest) + '\n' + logic
  return { manifest, build }
}

test('upgrading a disabled reader keeps it disabled across restore until explicit activation', async () => {
  const root = join(mockProfile, 'plugins')
  const file = join(root, reader + '-reader.js')
  const original = await readFile(file, 'utf8')
  await pluginService.initializePlugins()
  await pluginService.setPluginEnabled(reader, false)
  const state = await readFile(join(root, 'state.json'), 'utf8')
  const retained = async () => Promise.all(['config', 'storage', 'permissions'].map(section => readFile(join(root, section, reader + '.json'), 'utf8')))
  const before = await retained()
  const checkDisabled = async () => {
    const rows = (await pluginService.getPluginsList()).filter(row => row.pluginId === reader)
    expect(rows).toEqual([expect.objectContaining({runtime: 3, enabled: false, order: JSON.parse(state)[reader].order})])
    expect(pluginService.getPluginById(reader)).toBeNull()
    expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(state)
    expect(await retained()).toEqual(before)
  }
  try {
    await pluginService.addPlugin(readerUpgrade(original).build(), 'new.js', reader)
    await checkDisabled()
    await pluginService.loadInstalledPlugins()
    await pluginService.restoreEnabledPlugins()
    await checkDisabled()
    await pluginService.setPluginEnabled(reader, true)
    const host = pluginService.getPluginById(reader)!
    expect(host.getGrantedPermissions()).toEqual(['network'])
    expect(await host.invokeV2Action('read')).toMatchObject({api: '3.0.0', config: {theme: 'night'}, favorite: 'track-one'})
  } finally {
    await pluginService.addPlugin(original, 'reader.js', reader)
    await pluginService.setPluginEnabled(reader, true)
  }
})

test('upgrading the enabled reader preserves its storage owner, configuration, grants and order', async () => {
  const root = join(mockProfile, 'plugins')
  const file = join(root, reader + '-reader.js')
  const original = await readFile(file, 'utf8')
  const state = await readFile(join(root, 'state.json'), 'utf8')
  const { manifest, build } = readerUpgrade(original)
  try {
    await pluginService.addPlugin(build(), 'new.js', reader)
    const check = async () => {
      const host = pluginService.getPluginById(reader)!
      expect(host.getDescriptor().runtime).toBe(3)
      expect(host.getGrantedPermissions()).toEqual(['network'])
      expect(await host.invokeV2Action('read')).toMatchObject({
        api: '3.0.0',
        app: { hostApi: '3.0.0', version: '2.4.0' },
        config: { theme: 'night' },
        favorite: 'track-one'
      })
    }
    await check()
    const valid = await readFile(file, 'utf8')
    await expect(
      pluginService.addPlugin(
        build().replace(
          'ctx.actions.register',
          'throw new Error("activation rejected"); ctx.actions.register'
        ),
        'invalid.js',
        reader
      )
    ).rejects.toThrow('activation rejected')
    expect(await readFile(file, 'utf8')).toBe(valid)
    await check()
    await pluginService.loadInstalledPlugins()
    await pluginService.restoreEnabledPlugins()
    await check()
    await pluginService.setPluginEnabled(reader, false)
    expect(pluginService.getPermissions(reader)).toEqual(['network'])
    expect(pluginService.savePermissions(reader, ['network'])).toEqual(['network'])
    expect(() => pluginService.savePermissions(reader, ['unknown'])).toThrow('权限')
    await pluginService.setPluginEnabled(reader, true)
    Object.assign(manifest.uses.permissions[0], { scope: { domains: ['music.example'] } })
    await pluginService.addPlugin(build(), 'scope.js', reader)
    expect(pluginService.getPermissions(reader)).toEqual([])
    expect(await readFile(join(root, 'state.json'), 'utf8')).toBe(state)
  } finally {
    await pluginService.addPlugin(original, 'reader.js', reader)
  }
})

test('a provider-free v3 worker discovers local and v2, plays a v2 result, and observes removal', async () => {
  const code = await readFile(join(__dirname,'../v3/__fixtures__/music-consumer.js'),'utf8')
  const {pluginId} = await pluginService.addPlugin(code,'music-consumer.js')
  try {
    await pluginService.setPluginEnabled(source,true)
    await pluginService.setPluginEnabled(pluginId,true)
    const host = pluginService.getPluginById(pluginId)!
    const bridge = jest.mocked(require('../uiBridge').callPluginUI)
    bridge.mockResolvedValue(false)
    await expect(host.invokeV2Action('sources')).rejects.toThrow()
    pluginService.savePermissions(pluginId,['catalog','listen'])
    expect(await host.invokeV2Action('sources')).toEqual(expect.arrayContaining([expect.objectContaining({id:'local',runtime:'host'}),expect.objectContaining({id:'early',runtime:2})]))
    expect(await host.invokeV2Action('play-early')).toBe('第一首歌')
    expect(bridge).toHaveBeenCalledWith(pluginId,'music.play',{args:[[expect.objectContaining({title:'第一首歌',ref:expect.objectContaining({providerId:'early'})})]]})
    expect(await host.invokeV2Action('enqueue')).toBe('第一首歌')
    await pluginService.setPluginEnabled(source,false)
    expect(await host.invokeV2Action('latest')).toEqual([expect.objectContaining({id:'local'})])
    pluginService.savePermissions(pluginId,[])
    await expect(host.invokeV2Action('sources')).rejects.toThrow()
  } finally {
    await pluginService.uninstallPlugin(pluginId)
    await pluginService.setPluginEnabled(source,true)
  }
})

test('sidebar icons resolve only declared images from the owning plugin and preserve unadorned v2 entries', async () => {
  const fixture=await readFile(join(__dirname,'../v3/__fixtures__/sidebar-icons.js'),'utf8')
  const {pluginId}=await pluginService.addPlugin(fixture,'sidebar.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const icons=pluginService.getPluginById(pluginId)!.getSidebarIconUrls()
    expect(icons.search).toMatch(/^data:image\/svg\+xml;base64,/)
    expect(Buffer.from(icons.custom.split(',')[1],'base64').toString()).toContain('<circle')
    expect(icons.other).toBeUndefined()
    const v2=await readFile(join(__dirname,'../v2/__fixtures__/earliest-handwritten.js'),'utf8')
    const legacy=await pluginService.addPlugin(v2.replace('example.handwritten','test.sidebar-legacy'),'legacy.js')
    try {await pluginService.setPluginEnabled(legacy.pluginId,true);expect(pluginService.getPluginById(legacy.pluginId)!.getSidebarIconUrls()).toEqual({})} finally {await pluginService.uninstallPlugin(legacy.pluginId)}
  } finally {await pluginService.uninstallPlugin(pluginId)}
})

test('view state reaches all instances, while pages.close only closes plugin-created overlays', async () => {
  const actions = ['open','close','state','events','render']
  const manifest = {manifestVersion:3,id:'test.view-lifetime',name:'View lifetime',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'},views:[{id:'panel',kind:'native',module:'render',presentation:{kind:'drawer'}}]},provides:{actions:actions.map(id=>({id,title:id}))},ui:{pages:[{id:'details',title:'Details',mount:'sidebar',view:'panel'}]}}
  const code = 'exports.manifest = '+JSON.stringify(manifest)+"\nexports.activate = function(ctx){const events=[]; for(const key of ['mounted','unmounted'])ctx.ui.views.on(key, info=>events.push([key,info]));ctx.actions.register('events',()=>events);ctx.actions.register('open',input=>ctx.ui.pages.open('details',input));ctx.actions.register('close',()=>ctx.ui.pages.close('details'));ctx.actions.register('state',input=>ctx.ui.views.setState('panel',input));ctx.actions.register('render',()=>({type:'text',text:'panel'}))}"
  const {pluginId} = await pluginService.addPlugin(code,'view-lifetime.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host=pluginService.getPluginById(pluginId)!, bridge=jest.mocked(require('../uiBridge').callPluginUI)
    const page=await host.mountSurface('panel')
    await Promise.all([host.readySurface('panel',page.sessionId),host.readySurface('panel',page.sessionId)])
    await host.invokeV2Action('open',{source:'test'})
    const overlay=[...bridge.mock.calls].reverse().find(call=>call[0]===pluginId && call[1]==='ui.drawer.open')![2] as {sessionId:string}
    await host.readySurface('panel',overlay.sessionId)
    await host.invokeV2Action('state',{label:'shared'})
    for (const id of [page.sessionId,overlay.sessionId]) expect(require('../uiBridge').publishPluginSurface).toHaveBeenCalledWith(pluginId,id,{label:'shared'})
    await host.invokeV2Action('close')
    await expect(host.readySurface('panel',overlay.sessionId)).rejects.toThrow('已关闭')
    await expect(host.readySurface('panel',page.sessionId)).resolves.toEqual({label:'shared'})
    await host.closeDrawer('panel',page.sessionId)
    const info=(id:string,props:object)=>({viewId:'panel',instanceId:id,props})
    expect(await host.invokeV2Action('events')).toEqual([['mounted',info(page.sessionId,{})],['mounted',info(overlay.sessionId,{source:'test'})],['unmounted',info(overlay.sessionId,{source:'test'})],['unmounted',info(page.sessionId,{})]])
  } finally {await pluginService.uninstallPlugin(pluginId)}
})

test('v3 lifecycle replays readiness once per active worker and honors unsubscribe', async () => {
  const manifest = {manifestVersion:3,id:'test.lifecycle',name:'Lifecycle',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{actions:[{id:'drain',title:'drain'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const events=[];ctx.lifecycle.onAppReady(()=>events.push("ready"));ctx.lifecycle.onWindowFocus(()=>events.push("focus"));ctx.lifecycle.onWindowBlur(()=>events.push("removed"))();ctx.lifecycle.onThemeChange(theme=>events.push(theme));ctx.actions.register("drain",()=>events.splice(0))}'
  const {pluginId} = await pluginService.addPlugin(code,'lifecycle.js')
  try {
    await pluginService.publishLifecycle('onAppReady')
    await pluginService.setPluginEnabled(pluginId,true)
    const host = pluginService.getPluginById(pluginId)!
    await pluginService.publishLifecycle('onAppReady')
    await pluginService.publishLifecycle('onWindowFocus')
    await pluginService.publishLifecycle('onWindowBlur')
    await pluginService.publishLifecycle('onThemeChange','dark')
    expect(await host.invokeV2Action('drain',{})).toEqual(['ready','focus','dark'])
    await pluginService.setPluginEnabled(pluginId,false)
    await pluginService.publishLifecycle('onWindowFocus')
    await pluginService.setPluginEnabled(pluginId,true)
    expect(await pluginService.getPluginById(pluginId)!.invokeV2Action('drain',{})).toEqual(['ready'])
  } finally { await pluginService.uninstallPlugin(pluginId) }
})
test('shutdown waits for worker storage and skips an unsubscribed or stopped plugin', async () => {
  const manifest = {manifestVersion:3,id:'test.before-quit',name:'Quit',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{actions:[{id:'read',title:'read'},{id:'unsubscribe',title:'unsubscribe'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const stop=ctx.lifecycle.onBeforeQuit(async()=>{await ctx.storage.set("flushed",true)});ctx.actions.register("read",()=>ctx.storage.get("flushed"));ctx.actions.register("unsubscribe",()=>{stop();return null})}'
  const {pluginId} = await pluginService.addPlugin(code,'before-quit.js')
  const signal = new AbortController().signal
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host = pluginService.getPluginById(pluginId)!
    const pending = pluginService.beforeQuit(signal)
    expect(pending).toHaveLength(1)
    await Promise.all(pending)
    expect(await host.invokeV2Action('read',{})).toBe(true)
    await host.invokeV2Action('unsubscribe',{})
    expect(pluginService.beforeQuit(signal)).toHaveLength(0)
    await pluginService.setPluginEnabled(pluginId,false)
    expect(pluginService.beforeQuit(signal)).toHaveLength(0)
  } finally { await pluginService.uninstallPlugin(pluginId) }
})
test('detached worker cannot request grants or publish services, and stalled uninstall is bounded', async () => {
  const manifest = {manifestVersion:3,id:'test.detached',name:'Detached',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'net',name:'network.request',reason:'注销'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{ctx.lifecycle.onInstall(async()=>{let denied=0;for(const call of [()=>ctx.permissions.request({key:"net"}),()=>ctx.http.request({permissionKey:"net",url:"https://example.invalid/"}),()=>ctx.plugins.list()]){try{await call()}catch{denied++}}await ctx.storage.set("denied",denied)});ctx.lifecycle.onUninstall(async()=>{await ctx.storage.set("entered",true);await new Promise(()=>{})})}'
  const {pluginId} = await pluginService.addPlugin(code,'detached.js')
  const file = join(mockProfile,'plugins','storage',pluginId+'.json')
  expect(JSON.parse(await readFile(file,'utf8')).values.denied).toBe(3)
  expect(pluginService.getPermissions(pluginId)).toEqual([])
  const started = Date.now()
  await pluginService.uninstallPlugin(pluginId)
  expect(Date.now()-started).toBeGreaterThanOrEqual(4800)
  expect(Date.now()-started).toBeLessThan(7500)
  await expect(readFile(file)).rejects.toMatchObject({code:'ENOENT'})
}, 15000)
test('install, version migration, explicit toggles and detached uninstall follow the committed file', async () => {
  const script = (version: string) => {
    const manifest = {manifestVersion:3,id:'test.own-lifecycle',name:'Lifecycle owner',version,engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{actions:[{id:'read',title:'read'}]}}
    return 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const note=async name=>ctx.storage.set("events",[...(await ctx.storage.get("events")||[]),name]);ctx.actions.register("read",()=>ctx.storage.get("events"));ctx.lifecycle.onInstall(()=>note("install"));ctx.lifecycle.onUpdate(info=>note(info.from+">"+ctx.plugin.version));ctx.lifecycle.onEnable(()=>note("enable"));ctx.lifecycle.onDisable(()=>note("disable"));ctx.lifecycle.onUninstall(async()=>{await note("uninstall");await new Promise(done=>setTimeout(done,200))})}'
  }
  const {pluginId} = await pluginService.addPlugin(script('1.0.0'),'lifecycle.js')
  const file = join(mockProfile,'plugins','storage',pluginId+'.json')
  const history = async () => JSON.parse(await readFile(file,'utf8')).values.events
  let removed = false
  try {
    expect(pluginService.getPluginById(pluginId)).toBeFalsy()
    expect(await history()).toEqual(['install'])
    await pluginService.addPlugin(script('1.1.0'),'lifecycle.js',pluginId)
    await pluginService.addPlugin(script('1.1.0'),'lifecycle.js',pluginId)
    await Promise.all([pluginService.setPluginEnabled(pluginId,true),pluginService.setPluginEnabled(pluginId,true)])
    await pluginService.addPlugin(script('1.2.0'),'lifecycle.js',pluginId)
    await pluginService.setPluginEnabled(pluginId,false)
    expect(await history()).toEqual(['install','1.0.0>1.1.0','enable','1.1.0>1.2.0','disable'])
    let during: unknown[] = []
    const invoke = PluginStorage.prototype.invoke
    // Observe the committed storage write before uninstall removes it; timer polling can miss it.
    const writes = jest.spyOn(PluginStorage.prototype, 'invoke').mockImplementation(function (this: PluginStorage, ...args) {
      const result = invoke.apply(this, args)
      if (args[0] === 'set' && args[1] === 'events')
        during = JSON.parse(readFileSync(file, 'utf8')).values.events
      return result
    })
    try { await pluginService.uninstallPlugin(pluginId); removed = true } finally { writes.mockRestore() }
    expect(during.at(-1)).toBe('uninstall')
    await expect(readFile(file)).rejects.toMatchObject({code:'ENOENT'})
  } finally { if (!removed) await pluginService.uninstallPlugin(pluginId) }
})
test('account selection is owner-scoped, readable during activation and contains no credential metadata', async () => {
  const dialog = jest.mocked((await import('../uiBridge')).callPluginUI)
  const install = async (id:string) => {
    const manifest = {manifestVersion:3,id,name:id,version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'people',title:'账号',multiple:true,loginMethods:['form']}],actions:[{id:'probe',title:'读取当前账号'}]}}
    const code = `exports.manifest=${JSON.stringify(manifest)};exports.activate=async ctx=>{
      const initial=await ctx.accounts.current('people');let name;
      ctx.accounts.register('people',{login:async({auth})=>{const values=await auth.form({fields:[{key:'name',label:'昵称',type:'text'}]});name=values.name;return {credential:'test-only-'+name}},profile:()=>({id:name,displayName:name}),validate:()=>({valid:false}),logout:()=>{}});
      ctx.actions.register('probe',input=>input.initial?initial:ctx.accounts.current(input.id||'people'));
    }`
    const added=await pluginService.addPlugin(code,id+'.js')
    expect(added.pluginId).toBeTruthy()
    return added.pluginId
  }
  const owner=await install('test.current-primary'), sibling=await install('test.current-other')
  try {
    await pluginService.setPluginEnabled(owner,true); await pluginService.setPluginEnabled(sibling,true)
    const host=()=>pluginService.getPluginById(owner)!, probe=(input={})=>host().invokeV2Action('probe',input)
    expect(await probe({initial:true})).toBeNull()
    await expect(probe({id:'not-declared'})).rejects.toThrow()
    dialog.mockResolvedValueOnce({name:'A'}); await host().changeAccount('people','login')
    const first=(await host().accountConnections('people')).active
    expect(await probe()).toEqual({connectionId:first,expired:false})
    dialog.mockResolvedValueOnce({name:'B'}); await host().changeAccount('people','login')
    const second=(await host().accountConnections('people')).active
    expect(second).not.toBe(first); expect(await probe()).toEqual({connectionId:second,expired:false})
    expect(await pluginService.getPluginById(sibling)!.invokeV2Action('probe',{})).toBeNull()
    await host().changeAccount('people','switch',first!); await host().accountConnections('people',true)
    expect(await probe()).toEqual({connectionId:first,expired:true})
    await pluginService.setPluginEnabled(owner,false); await pluginService.setPluginEnabled(owner,true)
    expect(await probe({initial:true})).toEqual({connectionId:first,expired:true})
    await host().changeAccount('people','logout',first!); expect(await probe()).toEqual({connectionId:second,expired:false})
    await host().changeAccount('people','logout',second!); expect(await probe()).toBeNull()
  } finally {await pluginService.uninstallPlugin(owner);await pluginService.uninstallPlugin(sibling)}
})

test('account-bound providers follow selection, grant revocation, expiry and same-identity renewal', async () => {
  const {callPluginUI} = await import('../uiBridge')
  const dialog = jest.mocked(callPluginUI)
  const manifest = {manifestVersion:3,id:'test.account-binding',name:'Account binding',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'people',title:'账号',multiple:true,loginMethods:['form'],providers:['catalog']}],providers:[{id:'catalog',name:'目录',protocols:['music.list@1']}],actions:[{id:'probe',title:'读取'}]},uses:{permissions:[{key:'use',name:'credentials.use',reason:'发送账号请求'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{let name="",mode="ok",last=null;const events=[];ctx.events.on("account.changed",v=>events.push(["change",v.connectionId]));ctx.events.on("account.expired",v=>events.push(["expire",v.connectionId]));ctx.accounts.register("people",{login:async({auth})=>{const values=await auth.form({fields:[{key:"name",label:"昵称",type:"text"}]});name=values.name;return {credential:"demo-"+name}},profile:()=>({id:name,displayName:name}),validate:()=>{if(mode==="offline")throw Error("offline");return {valid:mode!=="expired"}}});ctx.providers.register("catalog",{tracks:{search:async(query,op)=>{last=op.connectionId||null;return {items:[]}}}});ctx.actions.register("probe",async(input)=>{if(input.report)return ctx.accounts.reportExpired(input.account||"people",input.report,input.credential);if(input.mode)mode=input.mode;if(input.id)return ctx.credentials.get(input.id);return {last,events}})}'
  const {pluginId} = await pluginService.addPlugin(code,'account-binding.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host = pluginService.getPluginById(pluginId)!
    const search = () => host.invokeV2Provider('catalog','tracks.search',[{keyword:'demo'}])
    const probe = (input:Record<string,any>={})=>host.invokeV2Action('probe',input)
    const login = async (name:string,id?:string)=>{dialog.mockResolvedValueOnce({name}); return host.changeAccount('people','login',id)}
    await search(); expect((await probe()).last).toBeNull()
    await login('A'); const first=(await host.accountConnections('people')).active!
    await login('B'); const second=(await host.accountConnections('people')).active!
    await search(); expect((await probe()).last).toBe(second)
    await expect(probe({id:second})).rejects.toThrow()
    pluginService.savePermissions(pluginId,['use'])
    const oldRef=await probe({id:first}); expect(oldRef).toEqual({kind:'credential',id:expect.any(String)})
    expect(await probe({report:first,credential:oldRef})).toBe(false)
    expect(await probe({report:second,credential:oldRef})).toBe(false)
    await expect(probe({account:'absent',report:first,credential:oldRef})).rejects.toThrow()
    expect(await probe({id:'absent'})).toBeNull()
    const guardManifest={manifestVersion:3,id:'test.account-guard',name:'Guard',version:'1.0.0',engines:manifest.engines,entry:manifest.entry,provides:{actions:[{id:'probe',title:'probe'}]},uses:{permissions:[{key:'guard',name:'account.intercept',reason:'拦截切换'}]}}
    const guardCode='exports.manifest='+JSON.stringify(guardManifest)+';exports.activate=ctx=>{let cancel=true,seen=[];ctx.hooks.on("account.switch",async(op,next)=>{seen.push([op.input,op.source]);if(cancel)op.preventDefault();else await next()});ctx.actions.register("probe",v=>{if(v.allow)cancel=false;return seen})}'
    const guardId=(await pluginService.addPlugin(guardCode,'account-hook.js')).pluginId
    try {
      await pluginService.setPluginEnabled(guardId,true);pluginService.savePermissions(guardId,['guard'])
      const interceptor=pluginService.getPluginById(guardId)!,before=(await probe()).events
      expect(await host.changeAccount('people','switch',first)).toBe(false)
      await search();expect((await probe()).last).toBe(second);expect((await probe()).events).toEqual(before)
      expect(await interceptor.invokeV2Action('probe',{allow:true})).toEqual([[{pluginId:manifest.id,accountId:'people',fromConnectionId:second,connectionId:first},{kind:'ui',location:'account-menu'}]])
      expect(await host.changeAccount('people','switch',first)).toBe(true);await search();expect((await probe()).last).toBe(first)
      expect((await probe()).events).toEqual([...before,['change',first]])
      expect(await host.changeAccount('people','switch',first)).toBe(true);expect((await probe()).events).toEqual([...before,['change',first]])
      pluginService.savePermissions(guardId,[]);await host.changeAccount('people','switch',second);await host.changeAccount('people','switch',first)
      expect(await interceptor.invokeV2Action('probe',{})).toHaveLength(2)
    } finally {await pluginService.uninstallPlugin(guardId)}
    await probe({mode:'offline'}); expect((await host.accountConnections('people',true)).rows[0].expired).toBeUndefined()
    await probe({mode:'expired'}); expect((await host.accountConnections('people',true)).rows[0].expired).toBe(true)
    await expect(search()).rejects.toThrow('重新登录'); expect(await probe({id:first})).toBeNull()
    await host.accountConnections('people',true); expect((await probe()).events.filter((row:string[])=>row[0]==='expire')).toEqual([['expire',first]])
    await expect(login('B',first)).rejects.toThrow(); expect((await host.accountConnections('people')).rows[0].expired).toBe(true)
    await login('A',first); expect((await host.accountConnections('people')).active).toBe(first); expect(await probe({id:first})).not.toEqual(oldRef)
    expect(await probe({report:first,credential:oldRef})).toBe(false)
    await search(); expect((await probe()).last).toBe(first)
    const renewedRef=await probe({id:first})
    expect(await probe({report:first,credential:renewedRef})).toBe(true)
    expect(await probe({report:first,credential:renewedRef})).toBe(false)
    expect((await host.accountConnections('people')).rows[0].expired).toBe(true)
    pluginService.savePermissions(pluginId,[]); await expect(probe({id:first})).rejects.toThrow()
    await expect(probe({report:first,credential:renewedRef})).rejects.toThrow()
  } finally { await pluginService.uninstallPlugin(pluginId) }
})
test('account lists discard late replies and like settings apply only to the selected connection',async()=>{
  const manifest={manifestVersion:3,id:'test.collections',name:'Collections',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'people',title:'账号',multiple:true,loginMethods:['form'],providers:['catalog'],capabilities:['likes']}],providers:[{id:'catalog',name:'目录',protocols:['music.list@1']}],actions:[{id:'probe',title:'probe'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{let name,release,entered=false,likes=[];ctx.actions.register("probe",v=>{if(v.release)release();return {entered,likes}});ctx.accounts.register("people",{login:async({auth})=>{name=(await auth.form({fields:[{key:"name",label:"昵称",type:"text"}]})).name;return {credential:"synthetic"}},profile:()=>({id:name,displayName:name}),likes:{list:async(account,{cursor},op)=>{if(cursor==="slow"){entered=true;await new Promise(resolve=>release=resolve)}return {items:[{ref:{kind:"track",id:"song",pluginId:ctx.plugin.id,providerId:"catalog"},title:op.connectionId,metadata:{artists:[]},capabilities:["play"]}]}},set:async(account,change,op)=>{likes.push([account.id,change.liked,op.connectionId])}}});ctx.providers.register("catalog",{tracks:{search:async()=>({items:[]})}})}'
  const {pluginId}=await pluginService.addPlugin(code,'collections.js')
  try{
    await pluginService.setPluginEnabled(pluginId,true)
    const host=pluginService.getPluginById(pluginId)!,dialog=jest.mocked((await import('../uiBridge')).callPluginUI)
    const login=async(name:string)=>{dialog.mockResolvedValueOnce({name});await host.changeAccount('people','login');return (await host.accountConnections('people')).active!}
    const first=await login('甲'),second=await login('乙')
    const pending=host.accountCollection('people','likes',second,'slow'),rejection=expect(pending).rejects.toThrow('切换')
    for(let attempt=0;attempt<100 && !(await host.invokeV2Action('probe',{})).entered;attempt++) await new Promise(done=>setTimeout(done,5))
    expect((await host.invokeV2Action('probe',{})).entered).toBe(true)
    await host.changeAccount('people','switch',first);await host.invokeV2Action('probe',{release:true});await rejection
    const track=(await host.accountCollection('people','likes',first)).items[0];expect(track.title).toBe(first);expect(track.ref.connectionId).toBe(first)
    await expect(host.accountCollection('people','likes',second)).rejects.toThrow();await expect(host.accountCollection('people','history',first)).rejects.toThrow()
    await expect(host.accountLikes('people',first,true,track.ref)).rejects.toThrow('未开启')
    await host.accountLikes('people',first,true);await host.accountLikes('people',first,false,track.ref)
    await expect(host.accountLikes('people',first,true,{...track.ref,pluginId:'other'})).rejects.toThrow()
    expect((await host.invokeV2Action('probe',{})).likes).toEqual([[first,false,first]])
    await host.changeAccount('people','switch',second);await expect(host.accountLikes('people',first,true,track.ref)).rejects.toThrow();expect((await host.accountConnections('people')).rows.find(row=>row.id===second)?.syncLikes).toBeUndefined()
  }finally{await pluginService.uninstallPlugin(pluginId)}
})
test('scoped account HTTP uses verified TLS, denies conflicting headers and never follows external redirects',async()=>{
  const scratch = await mkdtemp(join(tmpdir(),'ceru-account-tls-'))
  const openssl = process.platform === 'win32' ? resolve(execFileSync('git',['--exec-path'],{encoding:'utf8'}).trim(),'../../../usr/bin/openssl.exe') : 'openssl'
  const network = mockNative('@shiqianjiang/ceru-plugin-core/network')
  let pluginId: string | undefined
  const servers:ReturnType<typeof createServer>[]=[]
  let agent:Agent | undefined
  try {
    execFileSync(openssl,['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1','-addext','subjectAltName=IP:127.0.0.1','-keyout','key.pem','-out','cert.pem'],{cwd:scratch,stdio:'ignore',windowsHide:true})
    const cert=await readFile(join(scratch,'cert.pem')), key=await readFile(join(scratch,'key.pem'))
    agent=new Agent({ca:cert}); network.setNetworkProxyResolver(()=>({httpsAgent:agent}))
    let foreignHits=0, accepted=0
    const listen = async (server:ReturnType<typeof createServer>)=>{servers.push(server); await new Promise<void>(done=>server.listen(0,'127.0.0.1',done)); return 'https://127.0.0.1:'+(server.address() as AddressInfo).port}
    const foreign=await listen(createServer({key,cert},(_request,response)=>{foreignHits++;response.end()}))
    const origin=await listen(createServer({key,cert},(request,response)=>{
      if (request.url==='/cross') {response.writeHead(302,{location:foreign+'/other'}).end();return}
      if (request.url==='/same') {response.writeHead(302,{location:'/profile'}).end();return}
      const ok=request.headers.authorization==='Bearer test-only'; if (ok) accepted++
      response.writeHead(ok?200:401,{'set-cookie':'test-only-response=1'}).end(JSON.stringify({ok}))
    }))
    const manifest={manifestVersion:3,id:'test.credential-http',name:'TLS test',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{accounts:[{id:'service',title:'TLS',loginMethods:['form']}],actions:[{id:'call',title:'call'}]},uses:{permissions:[{key:'net',name:'network.request',reason:'账号请求'},{key:'local',name:'network.private',reason:'临时服务'},{key:'cred',name:'credentials.use',reason:'绑定来源',scope:{origins:[origin]}}]}}
    const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const origin='+JSON.stringify(origin)+';const fetch=(credential,url,headers)=>ctx.http.request({url,headers,credential,permissionKey:"net"});ctx.accounts.register("service",{login:async({auth})=>{await auth.form({fields:[{key:"user",label:"测试",type:"text"}]});return {credential:"test-only",binding:{origin,sendAs:"bearer"}}},profile:async account=>{const reply=await fetch(account.credential,origin+"/profile");if(!reply.body.ok)throw Error("Profile failed");return {id:"one",displayName:"one"}}});ctx.actions.register("call",async input=>fetch(input.ref,input.url,input.headers))}'
    const installed=await pluginService.addPlugin(code,'tls-account.js'); pluginId=installed.pluginId
    await pluginService.setPluginEnabled(installed.pluginId,true); pluginService.savePermissions(installed.pluginId,['net','local','cred'])
    jest.mocked((await import('../uiBridge')).callPluginUI).mockResolvedValueOnce({user:'demo'})
    const host=pluginService.getPluginById(installed.pluginId)!
    await host.changeAccount('service','login'); expect(accepted).toBe(1)
    const state=await (await import('../accounts/connections')).readAccounts({pluginId:installed.pluginId,accountId:'service'}),ref=state.rows[0].credential
    const call=(url:string,headers?:Record<string,string>)=>host.invokeV2Action('call',{url,ref,...(headers?{headers}:{})})
    const reply=await call(origin+'/same');expect(reply.body).toEqual({ok:true}); expect(reply.headers['set-cookie']).toBeUndefined()
    await expect(call(origin+'/cross')).rejects.toThrow('跨来源'); await expect(call(foreign)).rejects.toThrow(); expect(foreignHits).toBe(0)
    await expect(call(origin,{Authorization:'conflict'})).rejects.toThrow(); pluginService.savePermissions(installed.pluginId,['net','local'])
    await expect(call(origin)).rejects.toThrow();expect(accepted).toBe(2)
  } finally {
    network.setNetworkProxyResolver(null);agent?.destroy();for(const server of servers){server.closeAllConnections();await new Promise<void>(done=>server.close(()=>done()))}
    if(pluginId)await pluginService.uninstallPlugin(pluginId);await rm(scratch,{recursive:true,force:true})
  }
},15000)
test('route guard follows live grants, validates redirects and fails open on deadline', async () => {
  const {routeBus} = await import('../operations/bus')
  const manifest = {manifestVersion:3,id:'test.guard',name:'Guard',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'guard',name:'navigation.intercept',reason:'导航规则'}]}}
  const code='exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{ctx.router.beforeEach(to=>{if(to.name==="local")return false;if(to.name==="recent")return {name:"settings"};if(to.name==="community")return {name:"plugin-page",params:{pluginId:"someone.else",pageId:"page"}};if(to.name==="profile")return new Promise(()=>{})})}'
  const {pluginId}=await pluginService.addPlugin(code,'guard.js')
  async function navigate(name: 'local'|'recent'|'community'|'profile') {
    let reached: string|null=null
    const decision=await routeBus.run('router.navigate',{to:{name,params:{},query:{}},from:null},{kind:'ui'},async packet=>{reached=packet.to.name})
    return [decision.prevented,reached]
  }
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    expect(await navigate('local')).toEqual([false,'local'])
    pluginService.savePermissions(pluginId,['guard'])
    expect(await navigate('local')).toEqual([true,null])
    expect(await navigate('recent')).toEqual([false,'settings'])
    pluginService.savePermissions(pluginId,[])
    expect(await navigate('local')).toEqual([false,'local'])
    pluginService.savePermissions(pluginId,['guard'])
    expect(await navigate('community')).toEqual([false,'community'])
    const started=Date.now()
    expect(await navigate('profile')).toEqual([false,'profile'])
    expect(Date.now()-started).toBeLessThan(1500)
    expect(await navigate('community')).toEqual([false,'community'])
    expect(routeBus.names()).not.toContain('router.navigate')
  } finally { await pluginService.uninstallPlugin(pluginId) }
})
test('route observers see successful named navigation, isolate cross-plugin query and unsubscribe', async () => {
  const manifest = {manifestVersion:3,id:'test.routes',name:'Routes',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{actions:[{id:'drain',title:'drain'},{id:'stop',title:'stop'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const events=[];const stop=ctx.router.afterEach((to,from)=>events.push([to,from]));ctx.actions.register("drain",()=>events.splice(0));ctx.actions.register("stop",()=>{stop();return null})}'
  const {pluginId}=await pluginService.addPlugin(code,'route-observer.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host=pluginService.getPluginById(pluginId)!
    const own={name:'plugin-page' as const,params:{pluginId:manifest.id,pageId:'settings'},query:{sort:'name'}}
    const other={...own,params:{...own.params,pluginId:'example.other'},query:{secret:'private'}}
    await pluginService.routeCompleted(own,other)
    expect(await host.invokeV2Action('drain',{})).toEqual([[own,{...other,query:{}}]])
    await host.invokeV2Action('stop',{})
    await pluginService.routeCompleted(own,null)
    expect(await host.invokeV2Action('drain',{})).toEqual([])
  } finally { await pluginService.uninstallPlugin(pluginId) }
})
test('idle subscription reaches a real worker once and discards removed thresholds', async () => {
  const manifest = {manifestVersion:3,id:'test.idle',name:'Idle',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{actions:[{id:'read',title:'read'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{let count=0;try{ctx.lifecycle.onIdle(59,()=>{});count=99}catch{};ctx.lifecycle.onIdle(60000,()=>count++);ctx.lifecycle.onIdle(120000,()=>count+=10)();ctx.actions.register("read",()=>count)}'
  const {pluginId} = await pluginService.addPlugin(code,'idle.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host = pluginService.getPluginById(pluginId)!
    await new Promise(resolve=>setTimeout(resolve,2200))
    expect(await host.invokeV2Action('read',{})).toBe(1)
  } finally { await pluginService.uninstallPlugin(pluginId) }
})
test('changed-key lifecycle omits config values, detects removals and ignores identical edits', async () => {
  const manifest = {manifestVersion:3,id:'test.changed-keys',name:'Changes',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},uses:{permissions:[{key:'listen',name:'player.read',reason:'听歌记录'}]},provides:{actions:[{id:'drain',title:'drain'}]}}
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const events=[];ctx.lifecycle.onConfigChange(keys=>events.push(["config",keys]));ctx.lifecycle.onPermissionChange(keys=>events.push(["permission",keys]));ctx.actions.register("drain",()=>events.splice(0))}'
  const {pluginId} = await pluginService.addPlugin(code,'changed-keys.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host = pluginService.getPluginById(pluginId)!
    pluginService.saveConfig(pluginId,{nested:{one:1,two:2},secret:'local value'})
    pluginService.saveConfig(pluginId,{nested:{two:2,one:1},secret:'local value'})
    pluginService.saveConfig(pluginId,{nested:{one:2,two:2}})
    pluginService.savePermissions(pluginId,['listen'])
    pluginService.savePermissions(pluginId,['listen'])
    pluginService.savePermissions(pluginId,[])
    await new Promise(resolve=>setImmediate(resolve))
    expect(await host.invokeV2Action('drain',{})).toEqual([
      ['config',['nested','secret']],['config',['nested','secret']],['permission',['listen']],['permission',['listen']]
    ])
  } finally { await pluginService.uninstallPlugin(pluginId) }
})
test('v3 listening and route events follow independent grants and live revocation', async () => {
  const names = ['player.progress', 'track.started', 'track.finished', 'route.changed']
  const manifest = { manifestVersion: 3, id: 'test.state-listener', name: 'Listener', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' }, entry: { logic: { module: 'logic.main' } },
    uses: { permissions: [{ key: 'listen', name: 'player.read', reason: '听歌记录' }, { key: 'route', name: 'route.read', reason: '页面名称' }] },
    provides: { actions: [{ id: 'drain', title: 'drain' }] } }
  const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate=ctx=>{const events=[];for(const name of '+JSON.stringify(names)+')ctx.events.on(name,value=>events.push([name,value]));ctx.actions.register("drain",()=>events.splice(0))}'
  const { pluginId } = await pluginService.addPlugin(code, 'state-listener.js')
  try {
    await pluginService.setPluginEnabled(pluginId, true)
    const host = pluginService.getPluginById(pluginId)!
    for (const [grants, expected] of [[[], []], [['listen'], names.slice(0, 3)], [['route'], names.slice(3)], [[], []]] as [string[], string[]][]) {
      pluginService.savePermissions(pluginId, grants)
      for (const name of names) await host.publishHostEvent(name, { marker: name })
      expect(await host.invokeV2Action('drain', {})).toEqual(expected.map(name => [name, { marker: name }]))
    }
  } finally { await pluginService.uninstallPlugin(pluginId) }
})

test('v3 service dependencies block, recover, and dispatch between real isolated workers', async () => {
  const provider = 'test.echo-provider',
    hard = 'test.echo-hard',
    soft = 'test.echo-soft'
  const base = {
    manifestVersion: 3,
    version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'logic.main' } }
  }
  const installed: string[] = []
  const install = async (manifest: object, activate: string) => {
    const { pluginId } = await pluginService.addPlugin(
      'exports.manifest=' +
        JSON.stringify({ ...base, ...manifest }) +
        ';exports.activate=' +
        activate,
      'service.js'
    )
    installed.push(pluginId)
    return pluginId
  }
  const client = (id: string, dependency: string, optional: boolean, version = '^1') =>
    install(
      {
        id,
        name: id,
        provides: {
          actions: ['echo', 'list', 'events', 'nested'].map((id) => ({ id, title: id }))
        },
        uses: {
          permissions: [{ key: 'consume', name: 'services.consume', reason: '调用声明的服务' }],
          plugins: [{ pluginId: dependency, service: 'echo', version, optional }]
        }
      },
      'function(ctx){const events=[]; for(const event of ["available","unavailable"])ctx.plugins.on(event,info=>events.push([event,info.pluginId]));ctx.actions.register("list",()=>ctx.plugins.list());ctx.actions.register("events",()=>events);for(const name of ["echo","nested"])ctx.actions.register(name,async input=>{const api=await ctx.plugins.use(' +
        JSON.stringify(dependency) +
        ',"echo");return api?api[name](input):null})}'
    )
  const until = async (predicate: () => boolean | Promise<boolean>) => {
    const end = Date.now() + 5000
    while (!(await predicate()) && Date.now() < end)
      await new Promise((done) => setTimeout(done, 25))
    expect(await predicate()).toBe(true)
  }
  const status = (pluginId: string) =>
    pluginService.snapshotPlugins().find((item) => item.pluginId === pluginId)
  try {
    const hardId = await client(hard, provider, false),
      softId = await client(soft, provider, true)
    for (const id of [hardId, softId]) pluginService.savePermissions(id, ['consume'])
    await expect(pluginService.setPluginEnabled(hardId, true)).rejects.toThrow('缺少依赖')
    expect(status(hardId)).toMatchObject({
      status: 'blocked',
      enabled: false,
      requestedEnabled: true
    })
    await pluginService.setPluginEnabled(softId, true)
    const softHost = pluginService.getPluginById(softId)!
    expect(await softHost.invokeV2Action('echo', {})).toBeNull()
    const providerId = await install(
      {
        id: provider,
        name: 'Echo',
        provides: { services: [{ id: 'echo', version: '1.2.0', methods: ['echo', 'nested'] }] }
      },
      'function(ctx){ctx.services.register("echo",{echo:(input,call)=>({input,caller:call.callerPluginId}),nested:()=>ctx.plugins.use("other","anything")})}'
    )
    await pluginService.setPluginEnabled(providerId, true)
    await until(() => !!pluginService.getPluginById(hardId))
    const hardHost = pluginService.getPluginById(hardId)!
    expect(await hardHost.invokeV2Action('echo', { text: '你好' })).toEqual({
      input: { text: '你好' },
      caller: hard
    })
    expect(await hardHost.invokeV2Action('list')).toMatchObject([
      { pluginId: provider, services: [{ id: 'echo', version: '1.2.0' }] }
    ])
    expect(await softHost.invokeV2Action('events')).toContainEqual(['available', provider])
    await expect(hardHost.invokeV2Action('nested')).rejects.toThrow(
      'Nested plugin service calls are not allowed'
    )
    const wrong = await client('test.echo-range', provider, false, '^2')
    await expect(pluginService.setPluginEnabled(wrong, true)).rejects.toThrow('缺少依赖')
    await pluginService.setPluginEnabled(providerId, false)
    await until(() => !pluginService.getPluginById(hardId))
    expect(status(hardId)?.status).toBe('blocked')
    expect(await softHost.invokeV2Action('echo', {})).toBeNull()
    expect(await softHost.invokeV2Action('events')).toContainEqual(['unavailable', provider])
    await pluginService.setPluginEnabled(providerId, true)
    await until(() => !!pluginService.getPluginById(hardId))
    expect(status(wrong)?.status).toBe('blocked')
    await pluginService.loadInstalledPlugins()
    await pluginService.restoreEnabledPlugins()
    expect(await pluginService.getPluginById(hardId)!.invokeV2Action('echo', { cold: true })).toEqual({input: {cold:true}, caller:hard})
    expect(status(wrong)?.status).toBe('blocked')
    await pluginService.setPluginEnabled(hardId, false)
    await pluginService.setPluginEnabled(providerId, false)
    await pluginService.setPluginEnabled(providerId, true)
    expect(pluginService.getPluginById(hardId)).toBeNull()
    const first = await client('test.cycle-first', 'test.cycle-second', false),
      second = await client('test.cycle-second', 'test.cycle-first', false)
    for (const id of [first, second]) {
      await expect(pluginService.setPluginEnabled(id, true)).rejects.toThrow('依赖成环')
      expect(pluginService.getPluginById(id)).toBeNull()
    }
  } finally {
    for (const id of installed.reverse()) await pluginService.uninstallPlugin(id)
  }
}, 30000)

test('development files overlay an installed ID without inheriting grants or modifying the released file',async()=>{
  const {DeveloperEntries}=await import('../devMode')
  const {rename}=await import('node:fs/promises')
  const root=join(mockProfile,'plugins'),officialFile=join(root,reader+'-reader.js'),original=await readFile(officialFile,'utf8'),external=join(mockProfile,'preview.js')
  await writeFile(external,original)
  const manager=new DeveloperEntries(()=>root,{load:(file,code)=>pluginService.loadDevelopmentFile(file,code),stop:id=>pluginService.removeDevelopmentFile(id),changed(){}})
  async function until(predicate:()=>boolean){const deadline=Date.now()+4000;while(!predicate()&&Date.now()<deadline)await new Promise(done=>setTimeout(done,30));expect(predicate()).toBe(true)}
  try {
    await manager.restore(false);await expect(manager.add(external)).rejects.toThrow('开发者模式')
    await manager.restore(true);const state=await manager.add(external),dev=state.entries[0].id!
    expect(dev).toMatch(/^dev\./);expect(state.entries[0].runtime).toBe(2);expect(pluginService.getPluginById(reader)).toBeFalsy();expect(pluginService.getPermissions(dev)).toEqual([])
    await pluginService.loadInstalledPlugins()
    await pluginService.restoreEnabledPlugins()
    expect(pluginService.getPluginById(dev)?.getDescriptor().runtime).toBe(2)
    expect(pluginService.getPluginById(reader)).toBeFalsy()
    await expect(pluginService.uninstallPlugin(dev)).rejects.toThrow('不会删除源文件')
    const next=external+'.tmp';await writeFile(next,'invalid JS');await rename(next,external);await until(()=>!!manager.snapshot().entries[0].error)
    expect(pluginService.getPluginById(dev)).toBeTruthy()
    const upgraded=original.replace(/exports\.manifest = [\s\S]*?\n\}/,'exports.manifest = '+JSON.stringify({manifestVersion:3,id:'example.upgrade-reader',name:'Dev',version:'1.1.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}},provides:{actions:[{id:'read',title:'Read'}]}}))
    await writeFile(next,upgraded);await rename(next,external);await until(()=>manager.snapshot().entries[0].runtime===3)
    expect(pluginService.getPluginById(dev)?.getDescriptor().runtime).toBe(3)
    await manager.restore(false);expect(pluginService.getPluginById(dev)).toBeFalsy();expect(pluginService.getPluginById(reader)?.getDescriptor().runtime).toBe(2);expect(pluginService.getPermissions(reader)).toEqual(['network'])
    expect(await readFile(officialFile,'utf8')).toBe(original);expect(await readFile(external,'utf8')).toBe(upgraded)
    await manager.remove(external)
  } finally {await manager.dispose()}
})

test('a v3 adapter upgrade retains the selected v2 child and its own grant ledger', async () => {
  const root = join(mockProfile, 'plugins')
  const original = await readFile(join(root, parent + '-adapter.js'), 'utf8')
  const parsed = readInstalledArtifact(original)
  if (parsed.runtime !== 2) throw Error('Expected v2 fixture')
  const old = parsed.header.manifest
  const guest = (await pluginService.listGuests(parent))[0]
  await pluginService.setGuestPermissions(parent, guest.id, ['network'])
  const manifest = {
    manifestVersion: 3,
    id: old.id,
    name: old.name,
    version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'logic.main' } },
    provides: {
      actions: [{ id: 'hello', title: 'Hello' }],
      guestAdapters: old.contributes?.guestAdapters
    },
    uses: { permissions: old.permissions },
    guestPolicy: old.guestPolicy
  }
  const code =
    'exports.manifest = ' +
    JSON.stringify(manifest) +
    ';\n' +
    original.slice(original.indexOf('exports.package'))
  const ledger = join(root, 'guests', parent, 'index.json')
  const snapshot = JSON.parse(await readFile(ledger, 'utf8'))
  try {
    await pluginService.addPlugin(code, 'upgraded-adapter.js', parent)
    for (const enabled of [true, false, true]) {
      await pluginService.setPluginEnabled(parent, enabled)
      const list = await pluginService.listGuests(parent)
      expect(list).toEqual([
        expect.objectContaining({ id: guest.id, selected: true, name: guest.name })
      ])
      expect(await pluginService.getGuestPermissions(parent, guest.id)).toEqual(['network'])
      expect(JSON.parse(await readFile(ledger, 'utf8'))).toEqual(snapshot)
    }
    const changed = jest.mocked((await import('../uiBridge')).pluginChanged)
    changed.mockClear()
    try {
      await pluginService.setGuestPermissions(parent, guest.id, [])
      expect(changed).toHaveBeenCalledWith({ type: 'guests-changed', pluginId: parent })
    } finally {
      await pluginService.setGuestPermissions(parent, guest.id, ['network'])
    }
  } finally {
    await pluginService.addPlugin(original, 'adapter.js', parent)
  }
})


test('custom QR views isolate public state, reject invalid views and cancel without saving credentials', async () => {
  const bridge=jest.mocked((await import('../uiBridge')).callPluginUI)
  const publish=jest.mocked((await import('../uiBridge')).publishPluginSurface)
  const manifest={manifestVersion:3,id:'test.custom-qr',name:'Custom QR',version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'},views:[{id:'login',kind:'web',module:'view.login'},{id:'native',kind:'native',module:'render'}]},provides:{accounts:[{id:'demo',title:'Demo QR',loginMethods:['qrcode']}],actions:['probe','render','state'].map(id=>({id,title:id}))}}
  const code='exports.manifest='+JSON.stringify(manifest)+';exports.surfaces={login:ctx=>{}};exports.activate=ctx=>{let view="login",mode="waiting",polls=0;ctx.actions.register("probe",v=>{if(v.view)view=v.view;if(v.mode)mode=v.mode;return polls});ctx.actions.register("render",()=>({type:"text",text:"native"}));ctx.actions.register("state",()=>ctx.ui.views.setState("login",{label:"custom",login:{credential:"spoof"}}));ctx.accounts.register("demo",{login:({auth})=>auth.qrcode({url:"https://example.invalid/login",view,expiresInMs:60000,poll:async()=>{polls++;return mode==="done"?{status:mode,credential:"test-secret"}:{status:mode}}}),profile:()=>({id:"demo",displayName:"demo"})})}'
  const {pluginId}=await pluginService.addPlugin(code,'custom-qr.js')
  try {
    await pluginService.setPluginEnabled(pluginId,true)
    const host=pluginService.getPluginById(pluginId)!
    let opened:any, resolveOpen:(value:any)=>void=()=>{}
    bridge.mockImplementation(async (_owner,method,payload)=>{
      if(method==='accounts.qrDisplay' && payload.phase==='open'){opened=payload;resolveOpen(payload)}
      return true
    })
    for(const view of ['missing','native']){
      await host.invokeV2Action('probe',{view})
      await expect(host.changeAccount('demo','login',undefined,'qrcode')).rejects.toThrow()
      expect((await host.accountConnections('demo')).rows).toHaveLength(0)
    }
    await host.invokeV2Action('probe',{view:'login'})
    const ordinary=await host.mountSurface('login')
    let opening=new Promise<any>(resolve=>resolveOpen=resolve)
    const cancelled=host.changeAccount('demo','login',undefined,'qrcode')
    await opening
    const session=opened.view
    const initial=await host.readySurface('login',session.sessionId)
    expect(initial.login).toMatchObject({kind:'qrcode',accountId:'demo',status:'waiting',url:'https://example.invalid/login'})
    expect(JSON.stringify(initial)).not.toMatch(/ticket|credential|test-secret/)
    await host.invokeV2Action('state',{})
    expect(await host.readySurface('login',session.sessionId)).toMatchObject({label:'custom',login:{status:'waiting'}})
    expect((await host.readySurface('login',ordinary.sessionId)).login).toEqual({credential:'spoof'})
    await host.closeDrawer('login',session.sessionId)
    expect(await cancelled).toBe(false)
    expect((await host.accountConnections('demo')).rows).toHaveLength(0)
    const polls=await host.invokeV2Action('probe',{})
    await new Promise(resolve=>setTimeout(resolve,1100))
    expect(await host.invokeV2Action('probe',{})).toBe(polls)
    await expect(host.readySurface('login',session.sessionId)).rejects.toThrow('已关闭')
    await host.closeDrawer('login',ordinary.sessionId)
    await host.invokeV2Action('probe',{mode:'done'})
    opening=new Promise<any>(resolve=>resolveOpen=resolve)
    const successful=host.changeAccount('demo','login',undefined,'qrcode')
    await opening
    expect(await successful).toBe(true)
    expect((await host.accountConnections('demo')).rows).toHaveLength(1)
    expect(publish.mock.calls.some(call=>call[0]===pluginId && call[1]===opened.view.sessionId && call[2]===undefined)).toBe(true)
    await expect(host.readySurface('login',opened.view.sessionId)).rejects.toThrow('已关闭')
  } finally {bridge.mockReset();await pluginService.uninstallPlugin(pluginId)}
},15000)
