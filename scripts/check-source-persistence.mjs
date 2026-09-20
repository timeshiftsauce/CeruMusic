import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { runInNewContext } from 'node:vm'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const {createPinia,setActivePinia}=require('pinia')
const {nextTick}=require('vue')
const output=await build({stdin:{contents:`export {LocalUserDetailStore} from './src/renderer/src/store/LocalUserDetail.ts';export * from './src/renderer/src/services/pluginState.ts';`,resolveDir:process.cwd(),loader:'ts'},bundle:true,write:false,platform:'node',format:'cjs',packages:'external',plugins:[{name:'store-fixture',setup(b){
  b.onResolve({filter:/^@renderer\/store\/LocalUserDetail$/},()=>({path:process.cwd()+'/src/renderer/src/store/LocalUserDetail.ts'}))
  b.onResolve({filter:/^@renderer\/store\/ControlAudio$/},()=>({path:'audio',namespace:'mock'}))
  b.onLoad({filter:/.*/,namespace:'mock'},()=>({contents:'export const ControlAudioStore=()=>({setVolume(){}})',loader:'js'}))
}}]})
const saved={pluginId:'music',pluginName:'音源',selectSources:'wy',selectQuality:'flac',sourceQualityMap:{wy:'flac'},sourcePluginMap:{wy:'music'},capabilityPluginMap:{'wy:tracks.search':'music'},volume:80}
const disk=new Map([['userInfo',JSON.stringify(saved)],['songList','[]']])
const entry=(id,providers,enabled)=>({pluginId:id,enabled,manifest:{name:id,contributes:{providers:providers.map(p=>({id:p,name:p,qualities:id==='music'?['128k','flac']:['128k']}))}},providerMethods:{wy:['tracks.search']},actionIds:[]})
async function boot({fail=false,userSelect=false}={}){
  setActivePinia(createPinia())
  let finish
  const restoration=new Promise(resolve=>{finish=resolve})
  let entries=[]
  const module={exports:{}}
  const calls=[]
  let routeFailure=false, delayed, holdRoute=false
  const api={plugins:{restoreEnabled:()=>restoration,contributions:async()=>entries,
    setProviderOwner:async(source,id)=>{calls.push([source,id]);if(routeFailure)throw Error('routing failed');if(holdRoute){holdRoute=false;await new Promise(resolve=>{delayed=resolve})}},
    setCapabilityOwner:async()=>{if(routeFailure)throw Error('routing failed')}}}

  runInNewContext(output.outputFiles[0].text,{module,exports:module.exports,require,console,localStorage:{getItem:key=>disk.get(key)??null,setItem:(key,value)=>disk.set(key,value)},window:{api}})
  const registry=module.exports
  const store=registry.LocalUserDetailStore();store.init();registry.markPluginUIReady()
  await registry.refreshPluginContributions();await nextTick()
  assert.equal(store.userInfo.selectSources,'wy','empty initial registry must preserve selected platform')
  assert.equal(JSON.parse(disk.get('userInfo')).selectSources,'wy')
  entries=[entry('navidrome',['navidrome','wy'],true)]
  await registry.refreshPluginContributions(true);await nextTick()
  assert.equal(store.userInfo.selectSources,'wy','earlier plugin must not become the selection')
  assert.equal(store.userInfo.sourcePluginMap.wy,'music','preferred provider survives partial restore')
  assert.equal(store.userInfo.selectQuality,'flac','temporary provider must not change quality')
  assert.equal(store.userInfo.capabilityPluginMap['wy:tracks.search'],'music')
  assert.ok(calls.every(([,id])=>id==='navidrome'),'unavailable saved provider must not be sent to Host')
  if(userSelect){store.userInfo.selectSources='navidrome';await nextTick();store.init();assert.equal(store.userInfo.selectSources,'navidrome')}
  entries=fail?[entry('navidrome',['navidrome'],true)]:[entry('navidrome',['navidrome'],true),entry('music',['wy'],true)]
  finish()
  for(let i=0;i<50;i++)await Promise.resolve()
  await nextTick()
  assert.equal(registry.pluginRestorationComplete.value,true)
  assert.equal(store.userInfo.selectSources,fail||userSelect?'navidrome':'wy')
  if(!fail&&!userSelect){assert.equal(store.userInfo.selectQuality,'flac');assert.equal(store.userInfo.sourcePluginMap.wy,'music')}
  assert.equal(JSON.parse(disk.get('userInfo')).selectSources,store.userInfo.selectSources)
  assert.equal(JSON.parse(disk.get('userInfo')).supportedSources,undefined,'runtime inventory is not persisted as a preference')
  if(!fail&&!userSelect){
    const prior=JSON.stringify(store.userInfo)
    routeFailure=true
    await assert.rejects(registry.selectCapabilityImplementation('wy','tracks.search','navidrome'),/routing failed/)
    await assert.rejects(registry.selectProviderImplementation('navidrome','navidrome'),/routing failed/)
    await assert.rejects(registry.refreshPluginContributions(true),/routing failed/)
    assert.equal(JSON.stringify(store.userInfo),prior,'failed routing cannot commit preference changes')
    routeFailure=false;holdRoute=true
    const refresh=registry.refreshPluginContributions(true)
    for(let i=0;i<10;i++)await Promise.resolve()
    store.userInfo.selectSources='navidrome'
    store.userInfo.sourceQualityMap.navidrome='128k'
    store.userInfo.selectQuality='128k'
    store.userInfo.uiPluginMap={'home:playlists':'music'}
    assert.equal(JSON.parse(disk.get('userInfo')).selectSources,'navidrome','selection persists before nextTick')
    delayed();await refresh
    assert.equal(store.userInfo.selectSources,'navidrome','delayed refresh cannot replace a newer selection')
    assert.equal(store.userInfo.uiPluginMap['home:playlists'],'music')
    store.userInfo.selectSources='wy';store.userInfo.selectQuality='flac'
    await nextTick()
  }

}
await boot();await boot() // another launch reads the settings persisted by the first launch
disk.set('userInfo',JSON.stringify(saved));await boot({userSelect:true})
disk.set('userInfo',JSON.stringify(saved));await boot({fail:true})
console.log('PASS: actual Pinia/localStorage restart, empty/partial restore, platform/quality/owner preservation, user override and unavailable-source fallback')
