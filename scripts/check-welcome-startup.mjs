import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { runInNewContext } from 'node:vm'
import { compileScript, parse } from '@vue/compiler-sfc'
import { build } from 'esbuild'

const source = await readFile('src/renderer/src/views/welcome/index.vue', 'utf8')
const script = compileScript(parse(source).descriptor, { id: 'welcome-startup-test' })
const mocks = {
  vue: `const s=globalThis.state; export const defineComponent=x=>x; export const ref=value=>({value}); export const computed=f=>({get value(){return f()}}); export const onMounted=f=>s.mount=f; export const onUnmounted=()=>{};`,
  'vue-router': `export const useRouter=()=>({replace:async path=>{globalThis.state.route=path}});`,
  '@renderer/services/pluginState': `export const startupHomeAvailable={get value(){return globalThis.state.hasHome}}; export const refreshPluginContributions=async()=>{globalThis.state.pluginStarted=true};`,
  './pluginIntegrations': `export const pluginHomeTabs={value:[]};`,
  '@renderer/utils/audio/globaPlayList': `export const initPlayback=async()=>{globalThis.state.playbackStarted=true};`,
  '@renderer/composables/useAutoUpdate': `export const useAutoUpdate=()=>({checkForUpdates:()=>{}});`,
  '@renderer/store/Settings': `export const useSettingsStore=()=>({shouldUseSpringFestivalTheme:()=>false,settings:{autoUpdate:false}});`,
  pinia: `export const storeToRefs=s=>({settings:{value:s.settings}});`
}
const result = await build({
  stdin: { contents: script.content, loader: 'ts', resolveDir: process.cwd() },
  bundle: true, format: 'cjs', write: false,
  plugins: [{name: 'welcome-dependencies', setup(builder) {
    builder.onResolve({filter: /.*/}, args => ({path: args.path, namespace: 'mock'}))
    builder.onLoad({filter: /.*/, namespace: 'mock'}, args => {
      if (!mocks[args.path]) throw Error('Unexpected import: ' + args.path)
      return {contents:mocks[args.path],loader:'js'}
    })
  }}]
})
for (const hasHome of [false,true]) {
  const state = {hasHome}
  const module = {exports:{}}
  runInNewContext(result.outputFiles[0].text, {
    module, exports:module.exports, state, console,
    window:{electron:{ipcRenderer:{invoke:async channel=>channel==='get-app-version'?'test':true}}},
    setInterval,
    clearInterval
  })
  module.exports.default.setup({}, {expose(){}})
  await state.mount()
  assert.equal(state.route, hasHome ? '/home/find' : '/home/local')
  assert.notEqual(state.playbackStarted, true, 'welcome leaves playback restoration to the post-welcome repair gate')
}

// Exercise the real contribution state while the restored runtime is still pending.
const stateSource=await readFile('src/renderer/src/services/pluginState.ts','utf8')
const registryBuild=await build({stdin:{contents:stateSource,loader:'ts',resolveDir:process.cwd()},bundle:true,write:false,format:'cjs',plugins:[{name:'registry-mocks',setup(b){
 b.onResolve({filter:/.*/},args=>({path:args.path,namespace:'mock'}))
 b.onLoad({filter:/.*/,namespace:'mock'},args=>({loader:'js',contents:
   args.path==='vue' ? mocks.vue :
   args.path==='./pluginIntegrations' ? `export const pluginHomeTabs={value:[]};export const refreshNativeIntegrations=async()=>{};` :
   args.path==='@common/pluginCapabilities' ? `export const isRoutablePluginCapability=()=>true;export const migratePluginCapabilitySelections=value=>value||{};` :
   `export const LocalUserDetailStore=()=>globalThis.state.store;`
 }))
}}]})
for(const scenario of ['active-home','unused-home','no-home','failed-home']){
 let finishRestore
 const restore=new Promise(resolve=>{finishRestore=resolve})
 const entry={pluginId:'test',enabled:false,requestedEnabled:scenario!=='unused-home',manifest:{name:'test',contributes:{homeSections:scenario==='no-home'?[]:[{kind:'playlists'}],providers:[],menus:[{id:'custom-import',slot:'playlist.import',title:'自定义导入',description:'插件声明的说明',commandId:'open'}]}}}
 const state={store:{initialization:true,userInfo:{}},entries:[entry]}
 const module={exports:{}}
 const api={plugins:{restoreEnabled:()=>restore,contributions:async()=>structuredClone(state.entries),setProviderOwner:async()=>{},setCapabilityOwner:async()=>{}}}
 runInNewContext(registryBuild.outputFiles[0].text,{module,exports:module.exports,state,console,window:{api}})
 const registry=module.exports
 registry.markPluginUIReady()
 await registry.refreshPluginContributions()
 assert.equal(registry.startupHomeAvailable.value,scenario==='active-home'||scenario==='failed-home','saved usage decides entry during restoration')
 assert.equal(registry.homeSections.value.length,0,'pending plugins cannot register active UI')
 assert.equal(registry.playlistImportMenus.value.length,0,'unused plugin cannot inject import entries')
 entry.enabled=scenario==='active-home'
 entry.requestedEnabled=entry.enabled
 finishRestore()
 for(let i=0;i<40;i++)await Promise.resolve()
 assert.equal(registry.pluginRestorationComplete.value,true)
 assert.equal(registry.playlistImportMenus.value.length,scenario==='active-home'?1:0)
 if(scenario==='active-home')assert.equal(registry.playlistImportMenus.value[0].title,'自定义导入')
 assert.equal(registry.startupHomeAvailable.value,scenario==='active-home','failed/unused plugins cannot retain home')
}
console.log('PASS: saved home starts at discovery, unused/no-home plugins start locally, failed restoration falls back, pending playback cannot block entry')
