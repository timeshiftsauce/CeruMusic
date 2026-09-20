import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { compileScript, parse } from '@vue/compiler-sfc'

const bundle = async (text, mocks) => (await build({stdin:{contents:text,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',plugins:[{name:'share-fixtures',setup(b){
  b.onResolve({filter:/.*/},args=>({path:args.path,namespace:'fixture'}))
  b.onLoad({filter:/.*/,namespace:'fixture'},args=>{
    if (!(args.path in mocks)) throw Error('Missing mock: '+args.path)
    return {contents:mocks[args.path],loader:'js'}
  })
}}]})).outputFiles[0].text
const helpers={
  vue:'export const defineComponent=x=>x;export const ref=value=>({value});export const computed=f=>({get value(){return typeof f==="function"?f():f.get()}});export const watch=()=>{};export const toRaw=x=>x;',
  pinia:'export const storeToRefs=s=>({player:{value:s.player}});',
  'tdesign-vue-next':`export const MessagePlugin={warning:x=>state.messages.push(x),error:()=>{},success:()=>{}};export const DialogPlugin={confirm:options=>{state.confirmations++;queueMicrotask(()=>state.accept?options.onConfirm():options.onCancel());return {destroy(){}}}};`,
  '@renderer/api/share':'export default {precheck:async()=>({hasPlugin:state.hasPlugin}),uploadPlugin:async payload=>{state.uploads.push(payload);return {ok:true}},create:async payload=>{state.created.push(payload);return state.result},createPlaylist:async payload=>{state.created.push(payload);return state.result}};',
  '@renderer/store':'export const useAuthStore=()=>({isAuthenticated:state.loggedIn});',
  '@renderer/store/LocalUserDetail':'export const LocalUserDetailStore=()=>({userSource:{quality:"flac"},userInfo:{selectQuality:"flac"}});',
  '@renderer/store/GlobalPlayStatus':'export const useGlobalPlayStatusStore=()=>({player:{songInfo:{},lyrics:{},comments:{}}});',
  '@renderer/api/cloudSongList':`export const cloudSongListAPI={getSongListDetail:async()=>({list:[{source:'wy'},{source:'tx'}],total:2})};`,
  '@renderer/utils/file':'export const sanitizeFileName=x=>x;',
  './posterRenderer':'export const renderSharePoster=async()=>"";export const downloadDataUrl=()=>{};export const getAvailableTemplates=()=>[];export const parseLrcToLines=()=>[];',
  './ShareConsentBar.vue':'export default {};',
  '@renderer/components/BaseDialog.vue':'export default {};',
  '@renderer/assets/images/song.jpg':'export default "";',
}
const uploadText=await readFile('src/renderer/src/components/Share/uploadShareResolver.ts','utf8')
const uploadCode=await bundle(uploadText,helpers)
for(const kind of ['Song','Playlist']){
  const file=`src/renderer/src/components/Share/Share${kind}Dialog.vue`
  const source=await readFile(file,'utf8')
  assert.ok(source.includes('<ShareConsentBar'))
  assert.ok(!source.includes('尚未支持 v2'))
  assert.ok(!/t-switch[^>]*disabled/.test(source))
  const compiled=compileScript(parse(source).descriptor,{id:'share-flow'})
  const code=await bundle(compiled.content,{...helpers,'./uploadShareResolver':'export const ensureShareResolverUploaded=(...args)=>state.uploadHelper(...args);'})
  for(const scenario of ['no-consent','cancel','accept','existing','offline-share']){
    if(kind==='Song'&&scenario==='offline-share')continue
    const state={loggedIn:true,accept:scenario!=='cancel',hasPlugin:scenario==='existing',messages:[],confirmations:0,uploads:[],created:[],result:{id:'id',url:'https://example.test/share',template:'share'},exports:0}
    const resolver={code:'resolver only',md5:'md5',type:'cr',qualities:['128k','flac'],musicInfo:{source:'wy',songmid:'1',name:'song',singer:'artist'}}
    const context={state,console,queueMicrotask,setTimeout,window:{api:{share:{exportResolver:async()=>{state.exports++;return resolver},exportPlaylistResolver:async sources=>{state.exports++;assert.deepEqual(Array.from(sources),['wy','tx']);return resolver}},music:{requestSdk:async()=>({})}}}}
    const uploadModule={exports:{}};runInNewContext(uploadCode,{...context,module:uploadModule,exports:uploadModule.exports})
    state.uploadHelper=uploadModule.exports.ensureShareResolverUploaded
    const module={exports:{}};runInNewContext(code,{...context,module,exports:module.exports})
    const component=module.exports.default.setup({modelValue:true,song:{source:'wy',songmid:'1',name:'song',singer:'artist'},playlist:{name:'list',meta:{cloudId:'cloud'}},songCount:2},{expose(){},emit(){}})
    component.consented.value=scenario!=='no-consent'
    component.ttlDays.value=7
    if(scenario==='offline-share')component.allowWebPlayback.value=false
    await component.doShare()
    if(scenario==='no-consent'){assert.equal(state.exports,0);assert.equal(state.created.length,0)}
    else if(scenario==='cancel'){assert.equal(state.uploads.length,0);assert.equal(state.created.length,0);assert.equal(component.loading.value,false)}
    else {
      assert.equal(state.created.length,1)
      if(scenario==='offline-share'){assert.equal(state.exports,0);assert.equal(state.created[0].pluginMd5,undefined);assert.equal(state.created[0].allowWebPlayback,false)}
      else {assert.equal(state.created[0].pluginMd5,'md5');assert.equal(state.created[0].quality,'flac');assert.equal(state.created[0].ttlDays,7);assert.equal(state.uploads.length,scenario==='existing'?0:1);assert.equal(state.confirmations,scenario==='existing'?0:1)}
    }
  }
}
console.log('PASS: song/playlist agreement gate, upload consent/cancel/dedup, seven-day payload, multi-platform export and non-web sharing')

const ipcSource=await readFile('src/main/events/share.ts','utf8')
const ipcCode=await bundle(ipcSource,{
 electron:'export const ipcMain={handle:(name,handler)=>state.handlers[name]=handler};',
 crypto:'export const createHash=()=>({update:()=>({digest:()=>"fixture-md5"})});',
 '../services/plugin':`export default {getV2Provider:source=>state.providers[source]};`,
 '../services/plugin/sharing':'export const createShareDescriptor=()=>{};export const readShareDescriptor=()=>{};'
})
const state={handlers:{},providers:{}}
for(const source of ['wy','tx'])state.providers[source]={pluginId:source,host:{getSupportedSources:()=>({[source]:{qualitys:['128k','flac']}}),getShareResolverCode:async()=>`module.exports={pluginInfo:{name:'${source}',version:'1'},sources:{${source}:{name:'${source}',qualitys:['128k','flac']}},musicUrl:async(source,info,quality)=>'https://example.test/'+source+'/'+info.songmid+'/'+quality};`}}
const module={exports:{}};runInNewContext(ipcCode,{module,exports:module.exports,state,Buffer,console});module.exports.default()
const exported=await state.handlers['share:playlist-resolver:export']({},['wy','tx','wy'])
const serverModule={exports:{}};runInNewContext(exported.code,{module:serverModule,exports:serverModule.exports})
assert.equal(await serverModule.exports.musicUrl('wy',{songmid:'1'},'flac'),'https://example.test/wy/1/flac')
assert.equal(await serverModule.exports.musicUrl('tx',{songmid:'2'},'flac'),'https://example.test/tx/2/flac')
await assert.rejects(serverModule.exports.musicUrl('unknown',{},'flac'),/不支持/)
await assert.rejects(state.handlers['share:playlist-resolver:export']({},['local']),/本地歌曲/)
state.providers.tx.host.getSupportedSources=()=>({tx:{qualitys:['hires']}})
await assert.rejects(state.handlers['share:playlist-resolver:export']({},['wy','tx']),/共同支持/)
console.log('PASS: multi-plugin playlist resolver dispatch, unsupported platform/local tracks and incompatible quality checks')
