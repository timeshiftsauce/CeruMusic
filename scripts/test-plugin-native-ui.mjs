import assert from 'node:assert/strict'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import AutoImport from 'unplugin-auto-import/vite'
import { chromium } from 'playwright'

// Actual application components, isolated host API fixtures, no live accounts or external APIs.
const root = fileURLToPath(new URL('../', import.meta.url))
const workspace = await mkdtemp(path.join(root, '.tmp-plugin-native-ui-'))
const artifacts = path.join(root, '.tmp-plugin-tooling-031')
await mkdir(artifacts, { recursive: true })
let server
let browser
const issues = []
const settleAnimations = (page) =>
  page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => {}))
    )
  )
try {
  await writeFile(
    path.join(workspace, 'index.html'),
    '<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><link rel="icon" href="data:,"><title>Native plugin UI verification</title></head><body><div id="app"></div><script type="module" src="/main.js"></script></body></html>'
  )
  await writeFile(
    path.join(workspace, 'auth.js'),
    `import { reactive } from 'vue'
const state=reactive({isAuthenticated:false,user:null,login(){window.__nativeUI.calls.push({method:'login'})},logout(){},outlogin(){}})
export const useAuthStore=()=>state
`
  )
  await writeFile(
    path.join(workspace, 'contributions.js'),
    `import { ref } from 'vue'
export const activePluginContributions=ref([{pluginId:'fixture-installation',manifest:{contributes:{accountItems:[{id:'account',title:'网易云音乐',view:'account',action:'account.summary',logoutAction:'logout'}]}}}])
export const pluginImportRequest=ref(null),libraryRevision=ref(0),playlistSections=ref([])
export const markPluginUIReady=()=>{},refreshPluginContributions=async()=>{}
`
  )
  await writeFile(
    path.join(workspace, 'unused-services.js'),
    'export default {};export const cloudSongListAPI={};export const mapSongsToCloud=value=>value'
  )
  await writeFile(
    path.join(workspace, 'playback.js'),
    `export async function playSong(song){
      const state=window.__nativeUI
      state.calls.push({method:'playSong',ref:JSON.parse(JSON.stringify(song.pluginResource))})
      if(state.holdPlayback)await new Promise(resolve=>{state.releasePlayback=resolve})
      if(state.failPlayback)throw Error('测试播放失败')
    }
    export const handlePlay=async()=>{}`
  )
  await writeFile(
    path.join(workspace, 'playback-stores.js'),
    `import { reactive } from 'vue'
    const store=reactive({initialization:true,list:[]})
    export const LocalUserDetailStore=()=>store
    export const useListenTogetherStore=()=>({isInRoom:false})
    export const useGlobalPlayStatusStore=()=>({player:{}})`
  )
  await writeFile(
    path.join(workspace, 'main.js'),
    `
import { createApp, defineComponent, h, ref } from 'vue'
import { createPinia } from 'pinia'
import { createRouter, createMemoryHistory } from 'vue-router'
import TDesign from 'tdesign-vue-next'
import 'tdesign-vue-next/es/style/index.css'
import { NDropdown, NIcon } from 'naive-ui'
import UserCapsule from '@renderer/components/Auth/UserCapsule.vue'
import PluginSurface from '@renderer/components/PluginSurface.vue'
import PluginPlaylistSections from '@renderer/components/PluginPlaylistSections.vue'
import PluginHostBridge from '@renderer/components/PluginHostBridge.vue'
import SImage from '@renderer/components/sImage.vue'
import { refreshPluginAccounts } from '@renderer/services/pluginAccounts'
import { activePluginContributions, playlistSections } from '@renderer/services/pluginState'
import './style.css'
const cover=(label,color)=>'data:image/svg+xml;charset=utf-8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400"><rect width="400" height="400" fill="'+color+'"/><circle cx="300" cy="110" r="155" fill="#ffffff" opacity=".12"/><circle cx="70" cy="360" r="175" fill="#17213c" opacity=".17"/><text x="40" y="310" font-size="48" font-family="sans-serif" fill="#fff">'+label+'</text></svg>')
const resource=(kind,id)=>({pluginId:'fixture.plugin',providerId:'wy',connectionId:'account-123',kind,id,data:{opaqueToken:'private-provider-reference',nested:{revision:2}}})
const colors=['#8090ab','#a4858b','#879e90','#867f9e','#b19175','#7c99a4']
const playlistNames=['今天也要好好听歌','散步时的温柔旋律','夜晚留给自己','让心情慢下来','城市里的微光','周末去海边']
const playlists=playlistNames.map((title,index)=>({ref:resource('playlist','playlist-'+index),title,subtitle:'来自你的音乐偏好',capabilities:['music.playlist.tracks@1'],playlist:{artworkUrl:cover('PLAYLIST '+(index+1),colors[index]),trackCount:24+index,description:'精选推荐 · 适合此刻的声音'}}))
const tracks=['微风经过','暮色里的回声','片刻宁静'].map((title,index)=>({ref:resource('track','track-'+index),title,subtitle:'测试歌手',playable:true,capabilities:['music.resolve@1'],metadata:{artists:['测试歌手'],album:{title:'今天的音乐'},artworkUrl:cover('SONG',colors[index]),qualities:['standard']}}))
let revision=0
let serial=0
const shown=ref(true)
const listeners=new Set()
const accountListeners=new Set(),uiListeners=new Set(),responses=new Map(),changeListeners=new Set()
const sessions=new Map()
const state=window.__nativeUI={calls:[],playlists,tracks,summary:{signedIn:false},refreshAccounts:refreshPluginAccounts,shown,playlistSections}
const router=createRouter({history:createMemoryHistory(),routes:[{path:'/',component:{render:()=>null}},{path:'/home/songlist',component:{render:()=>null}},{name:'list',path:'/home/list/:id',component:{render:()=>null}}]})
state.route=()=>router.currentRoute.value
const installedContributions=activePluginContributions.value
state.togglePlugin=enabled=>{activePluginContributions.value=enabled?installedContributions:[]}
const loggedIn=(badge='VIP')=>({signedIn:true,displayName:'澜音测试账号',avatarUrl:cover('N','#ba91a6'),badge})
const loginHTML='<!doctype html><html lang="zh-CN"><body style="margin:0;padding:20px;text-align:center;font-family:sans-serif;background:white"><h2>扫码登录</h2><img id="fixture-qr" style="width:160px;height:160px" src="'+cover('QR FIXTURE','#967c9b')+'"><p>请使用网易云音乐 App 扫码</p><small>二维码为测试数据</small><script>window.addEventListener("message",event=>{if(event.data.type==="init"){window.__fixtureGeneration=event.data.generation;parent.postMessage({type:"active",generation:event.data.generation},"*")}});parent.postMessage({type:"ready"},"*")</script></body></html>'
function session(surfaceId){const value={kind:surfaceId==='account'?'web':'native',pluginId:'fixture-installation',surfaceId,sessionId:'session-'+(++serial),title:surfaceId==='account'?'网易云音乐登录':'插件原生抽屉',renderAction:surfaceId==='daily'?'render.daily':'render.drawer',presentation:{kind:surfaceId==='account'?'modal':'drawer',placement:'right',size:surfaceId==='account'?420:560},state:{},...(surfaceId==='account'?{html:loginHTML,init:{}}:{})};sessions.set(value.sessionId,value);return value}
function page(){return {type:'page',title:revision?'为你推荐 · 已刷新':'为你推荐',description:'账号和内容由插件提供，歌单与播放使用澜音原生功能。',actions:[{label:'播放全部',action:'play',input:{refs:tracks.map(item=>item.ref)},primary:true},{label:'刷新推荐',action:'refresh'}],sections:[{id:'playlists',title:'推荐歌单',layout:'grid',items:playlists,onOpen:'playlist.open',itemActions:[{label:'导入歌单',action:'playlist.import',input:{mode:'picker'}}]},{id:'songs',title:'每日歌曲',layout:'list',items:tracks,onPlay:'play'}]}}
state.refreshView=()=>{revision++;for(const value of sessions.values())for(const listener of listeners)listener({pluginId:value.pluginId,sessionId:value.sessionId,state:{revision}})}
state.listenerCount=()=>listeners.size
state.updatePlugin=()=>{for(const listener of changeListeners)listener({type:'updated',pluginId:'fixture-installation'})}
state.emitUI=(method,data)=>new Promise((resolve,reject)=>{const id='ui-'+(++serial);responses.set(id,{resolve,reject});for(const listener of uiListeners)listener({id,pluginId:'fixture-installation',method,data})})
state.completeLogin=()=>{state.summary=loggedIn();for(const listener of accountListeners)listener({pluginId:'fixture-installation'})}
state.openNativeDrawer=()=>state.emitUI('ui.drawer.open',session('native-drawer'))
window.api={plugins:{
  async mountSurface(pluginId,surfaceId){state.calls.push({method:'mountSurface',pluginId,surfaceId});return session(surfaceId)},
  async surfaceReady(pluginId,surfaceId,sessionId){state.calls.push({method:'surfaceReady',pluginId,surfaceId,sessionId});return {}},
  async surfaceAction(pluginId,surfaceId,sessionId,action,input){
    // Electron IPC rejects Vue proxies, including nested ResourceRefs and action inputs.
    const payload=structuredClone({method:'surfaceAction',pluginId,surfaceId,sessionId,action,input});
    state.calls.push(payload);
    if(action==='render.daily')return structuredClone(page());
    if(action==='render.drawer')return {type:'page',title:'原生抽屉内容',description:'插件声明通过同一套原生组件渲染。',sections:[]};
    if(action==='play'){
      const refs=input.refs??[input.ref],items=refs.map(ref=>tracks.find(track=>track.ref.id===ref.id));
      state.queue=await state.emitUI('services.queue.replace',{args:[items]});
      await state.emitUI('services.player.play',{args:[input.ref??refs[0]]});
    }
    if(action==='playlist.open')await state.emitUI('ui.navigation.open',{page:'playlist',ref:input.ref});
    if(action==='refresh')revision++;
    return null
  },
  async closeDrawer(pluginId,surfaceId,sessionId){state.calls.push({method:'closeDrawer',pluginId,surfaceId,sessionId});sessions.delete(sessionId);for(const listener of listeners)listener({pluginId,surfaceId,sessionId,closed:true})},
  onSurfaceState(listener){listeners.add(listener);return()=>listeners.delete(listener)},
  async accountSummary(pluginId,id){state.calls.push({method:'accountSummary',pluginId,id});return {...state.summary}},
  async accountLogout(pluginId,id){state.calls.push({method:'accountLogout',pluginId,id});state.summary={signedIn:false};for(const listener of accountListeners)listener({pluginId})},
  onAccountChanged(listener){accountListeners.add(listener);return()=>accountListeners.delete(listener)},
  onUI(listener){uiListeners.add(listener);return()=>uiListeners.delete(listener)},
  onUICancel(){return()=>{}},onChanged(listener){changeListeners.add(listener);return()=>changeListeners.delete(listener)},async uiReady(){return true},
  async respondUI(result){
    const {id,value,error}=structuredClone(result);
    if(state.rejectNextResponse&&!error){state.rejectNextResponse=false;throw Error('测试传输失败')}
    const response=responses.get(id);responses.delete(id);if(error)response.reject(Error(error));else response.resolve(value)
  },
  async openSurface(pluginId,surfaceId){state.calls.push({method:'openSurface',pluginId,surfaceId});await state.emitUI('ui.drawer.open',session(surfaceId))}
}}
const app=createApp(defineComponent({setup(){return()=>h('div',{class:'verification-app'},[
 h('header',{'data-app-titlebar':'',class:'titlebar'},[h('strong','澜音'),h('span',{class:'fixture-marker'},'原生组件验证 · 使用测试数据'),h(UserCapsule)]),
 h('div',{class:'workspace'},[h('aside',{class:'sidebar'},[h('div',{class:'active'},'发现音乐'),h('div','我的音乐'),h('div','歌单'),h('div','插件')]),h('main',[h('h1','发现音乐'),h('div',{class:'tab'},'每日推荐'),shown.value?h(PluginSurface,{pluginId:'fixture-installation',surfaceId:'daily'}):null])]),
 h('div',{class:'playlist-page',style:{maxHeight:'400px',overflow:'auto'}},[h('h2','歌单'),h('p','本地歌单与云歌单'),h(PluginPlaylistSections)]),
 h('footer',{class:'player-fixture'},'原生播放控制区 · 播放动作由主进程 API 接收'),
 h(PluginHostBridge)
])}}))
app.use(createPinia()).use(router).use(TDesign)
app.component('NDropdown',NDropdown).component('NIcon',NIcon).component('SImage',SImage)
app.mount('#app')
state.unmount=()=>app.unmount()
`
  )
  await writeFile(
    path.join(workspace, 'style.css'),
    `
:root{font-family:Inter,"Microsoft Yahei",sans-serif;color:#302a30;background:#fdf9fc;--td-brand-color:#b86d96;--td-brand-color-hover:#a65d84;--find-card-bg:#fff;--find-card-info-bg:#fff;--find-text-primary:#302a30;--find-text-secondary:#8b7d86;--find-card-shadow-hover:0 0 0 1px #dab6c9;--titlebar-btn-text-color:#302a30}*{box-sizing:border-box}body{margin:0}h1,h4,p{margin:0}.titlebar{height:52px;display:flex;align-items:center;gap:24px;padding:0 28px;border-bottom:1px solid #eadfe6;background:#f7edf3}.fixture-marker{font-size:12px;color:#968391;flex:1}.workspace{height:calc(100vh - 122px);display:flex}.sidebar{width:164px;flex-shrink:0;padding:28px 16px;background:#faf5f8;color:#887681;font-size:14px}.sidebar>div{padding:12px 16px;margin:4px 0}.sidebar .active{background:#eed9e5;border-radius:8px;color:#965976}main{padding:24px 32px;flex:1;min-width:0;display:flex;flex-direction:column;overflow:hidden}main>h1{font-size:26px;margin-bottom:18px}.tab{border-bottom:2px solid #d9b6ca;margin-bottom:22px;padding-bottom:12px;font-size:14px;color:#a25e84}.player-fixture{height:70px;display:flex;align-items:center;justify-content:center;border-top:1px solid #eadfe6;background:#f7edf3;font-size:12px;color:#968391}.plugin-surface{flex:1}.playlist-info{min-height:118px}.native-tracks{padding-bottom:12px}
`
  )
  server = await createServer({
    configFile: false,
    root: workspace,
    cacheDir: path.join(workspace, '.vite'),
    logLevel: 'warn',
    plugins: [vue(), AutoImport({ imports: ['vue'], dts: false })],
    resolve: {
      alias: [
        { find: '@renderer/store/Auth', replacement: path.join(workspace, 'auth.js') },
        {
          find: '@renderer/utils/audio/globaPlayList',
          replacement: path.join(workspace, 'playback.js')
        },
        {
          find: /^@renderer\/store\/(LocalUserDetail|ListenTogether|GlobalPlayStatus)$/,
          replacement: path.join(workspace, 'playback-stores.js')
        },
        {
          find: /^@renderer\/(api\/(songList|cloudSongList)|utils\/playlist\/cloudList)$/,
          replacement: path.join(workspace, 'unused-services.js')
        },
        {
          find: /^(?:@renderer\/services\/pluginState|\.\/pluginState)$/,
          replacement: path.join(workspace, 'contributions.js')
        },
        { find: '@renderer', replacement: path.join(root, 'src/renderer/src') },
        { find: '@assets', replacement: path.join(root, 'src/renderer/src/assets') },
        { find: '@common', replacement: path.join(root, 'src/common') }
      ],
      dedupe: ['vue', 'pinia']
    },
    server: { host: '127.0.0.1', port: 0, fs: { allow: [root] } }
  })
  await server.listen()
  const address = server.httpServer.address()
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce'
  })
  page.on('pageerror', (error) => issues.push(error.message))
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(message.text())
  })
  await page.goto('http://127.0.0.1:' + address.port, { waitUntil: 'networkidle' })
  await page.locator('.playlist-card').first().waitFor({ state: 'visible', timeout: 45000 })
  assert.equal(await page.locator('.playlist-card').count(), 6)
  assert.equal(
    await page.locator('iframe,webview').count(),
    0,
    'native surfaces must render actual components'
  )
  const columns = await page
    .locator('.playlist-grid')
    .evaluate((element) => getComputedStyle(element).gridTemplateColumns.split(' ').length)
  assert.ok(columns >= 4, 'native grid should fill the application content width')
  const fullRef = await page.evaluate(() => window.__nativeUI.playlists[0].ref)
  await page.locator('.playlist-open').first().click()
  await page.waitForFunction(() =>
    window.__nativeUI.calls.some((call) => call.action === 'playlist.open')
  )
  assert.deepEqual(
    await page.evaluate(
      () => window.__nativeUI.calls.find((call) => call.action === 'playlist.open').input.ref
    ),
    fullRef
  )
  await page.getByRole('button', { name: '今天也要好好听歌的更多操作' }).click()
  await page.getByText('导入歌单', { exact: true }).click()
  await page.waitForFunction(() =>
    window.__nativeUI.calls.some((call) => call.action === 'playlist.import')
  )
  const importInput = await page.evaluate(
    () => window.__nativeUI.calls.find((call) => call.action === 'playlist.import').input
  )
  assert.deepEqual(importInput, { mode: 'picker', ref: fullRef })
  await page.evaluate(() => {
    window.__nativeUI.holdPlayback = true
  })
  await page.locator('.native-track').nth(1).dblclick()
  await page.waitForFunction(() => window.__nativeUI.calls.some((call) => call.action === 'play'))
  await page.waitForFunction(
    () => window.__nativeUI.calls.some((call) => call.method === 'playSong'),
    null,
    { timeout: 5000 }
  )
  assert.equal(
    await page.evaluate(
      () => window.__nativeUI.calls.filter((call) => call.action === 'play').length
    ),
    1,
    'double click must send only one in-flight playback command'
  )
  const playInput = await page.evaluate(
    () => window.__nativeUI.calls.find((call) => call.action === 'play').input
  )
  const expectedTracks = await page.evaluate(() =>
    window.__nativeUI.tracks.slice(1).map((item) => item.ref)
  )
  assert.deepEqual(playInput, { ref: expectedTracks[0], refs: expectedTracks })
  assert.deepEqual(
    await page.evaluate(() => window.__nativeUI.queue.items.map((item) => item.ref)),
    expectedTracks,
    'reactive queue reply must cross IPC with nested resource data intact'
  )
  assert.deepEqual(
    await page.evaluate(
      () => window.__nativeUI.calls.find((call) => call.method === 'playSong').ref
    ),
    expectedTracks[0],
    'queue replacement must continue to the selected song playback'
  )
  await page.getByRole('button', { name: '刷新推荐', exact: true }).click({ timeout: 3000 })
  await page.locator('.playlist-open').nth(1).click({ timeout: 3000 })
  await page.waitForFunction(() => window.__nativeUI.route().params.id === 'playlist-1')
  await page.evaluate(() => {
    window.__nativeUI.holdPlayback = false
    window.__nativeUI.releasePlayback()
  })
  await page.waitForFunction(() => !document.querySelector('.native-track').disabled)
  const verifyPlaybackFailure = async (flag, message) => {
    await page.evaluate((flag) => {
      window.__nativeUI[flag] = true
    }, flag)
    await page.getByRole('button', { name: '播放全部', exact: true }).click()
    await page
      .locator('.native-error')
      .getByText(message, { exact: true })
      .waitFor({ timeout: 3000 })
    await page.waitForFunction(() => !document.querySelector('.native-track').disabled)
    await page.evaluate((flag) => {
      window.__nativeUI[flag] = false
    }, flag)
    await page.locator('.playlist-open').first().click({ timeout: 3000 })
    await page.waitForFunction(() => window.__nativeUI.route().params.id === 'playlist-0')
  }
  await verifyPlaybackFailure('failPlayback', '测试播放失败')
  await verifyPlaybackFailure('rejectNextResponse', '测试传输失败')
  await page.locator('.native-tracks').scrollIntoViewIfNeeded()
  await settleAnimations(page)
  await page.screenshot({ path: path.join(artifacts, 'native-playback.png'), fullPage: true })
  const trackLayout = await page
    .locator('.native-track')
    .first()
    .evaluate((element) => {
      const row = element.getBoundingClientRect()
      const cover = element.querySelector('.track-cover').getBoundingClientRect()
      return { rowHeight: row.height, coverWidth: cover.width, coverHeight: cover.height }
    })
  await writeFile(
    path.join(artifacts, 'native-track-layout.json'),
    JSON.stringify(trackLayout, null, 2)
  )
  assert.ok(
    trackLayout.rowHeight <= 84 && trackLayout.coverWidth <= 48 && trackLayout.coverHeight <= 48,
    'native songs must keep compact rows and thumbnails'
  )
  await page.getByRole('button', { name: '播放全部', exact: true }).click()
  const playAll = await page.evaluate(
    () => window.__nativeUI.calls.filter((call) => call.action === 'play').at(-1).input
  )
  assert.deepEqual(playAll, {
    refs: await page.evaluate(() => window.__nativeUI.tracks.map((item) => item.ref))
  })
  await page.evaluate(() => window.__nativeUI.refreshView())
  await page.getByRole('heading', { name: '为你推荐 · 已刷新', exact: true }).waitFor()
  await page.locator('.native-surface').evaluate((element) => {
    element.scrollTop = 0
  })
  await page.locator('.user-capsule').hover()
  const account = page.locator('[data-plugin-account]')
  await account.waitFor({ state: 'visible' })
  assert.equal(await account.locator('.plugin-account-name').textContent(), '未登录')
  assert.ok(
    (await account.locator('img').getAttribute('src')).includes('user.webp'),
    'logged-out account uses the application default avatar'
  )
  assert.equal(await account.locator('.t-tag').count(), 0)
  await account.click()
  const loginFrame = page.frameLocator('iframe[title="网易云音乐登录"]')
  await loginFrame.locator('#fixture-qr').waitFor({ state: 'visible' })
  await page.waitForFunction(() =>
    window.__nativeUI.calls.some(
      (call) => call.method === 'surfaceReady' && call.surfaceId === 'account'
    )
  )
  assert.equal(
    await page.locator('.plugin-native-modal iframe').count(),
    1,
    'account page must open as a modal'
  )
  assert.deepEqual(
    await page.evaluate(() =>
      window.__nativeUI.calls.find((call) => call.method === 'openSurface')
    ),
    { method: 'openSurface', pluginId: 'fixture-installation', surfaceId: 'account' }
  )
  await settleAnimations(page)
  const modalBounds = await page.locator('.plugin-native-modal').boundingBox()
  await writeFile(
    path.join(artifacts, 'native-modal-layout.json'),
    JSON.stringify(modalBounds, null, 2)
  )
  await writeFile(
    path.join(artifacts, 'native-modal-elements.json'),
    JSON.stringify(
      await page.locator('.plugin-native-modal').evaluate((element) =>
        [element, ...element.querySelectorAll('div,iframe')].map((el) => ({
          tag: el.tagName,
          class: el.className,
          style: el.getAttribute('style'),
          height: getComputedStyle(el).height,
          minHeight: getComputedStyle(el).minHeight,
          maxHeight: getComputedStyle(el).maxHeight,
          position: getComputedStyle(el).position
        }))
      ),
      null,
      2
    )
  )
  await page.screenshot({ path: path.join(artifacts, 'native-account-modal.png'), fullPage: true })
  assert.ok(
    modalBounds && modalBounds.height < 850 && modalBounds.width <= 440,
    'login modal should keep its declared width and a bounded height'
  )
  // The framed plugin reports content size; only the active session may resize its modal.
  await loginFrame
    .locator('body')
    .evaluate(() =>
      parent.postMessage(
        { type: 'resize', generation: window.__fixtureGeneration, data: { height: 300 } },
        '*'
      )
    )
  await page.waitForFunction(
    () =>
      Math.abs(
        document.querySelector('.plugin-native-modal .t-dialog__body').getBoundingClientRect()
          .height - 300
      ) < 2
  )
  await loginFrame
    .locator('body')
    .evaluate(() =>
      parent.postMessage({ type: 'resize', generation: 'old-session', data: { height: 800 } }, '*')
    )
  assert.ok(
    Math.abs(
      (await page
        .locator('.plugin-native-modal .t-dialog__body')
        .evaluate((el) => el.getBoundingClientRect().height)) - 300
    ) < 2
  )
  await page.evaluate(() => window.__nativeUI.completeLogin())
  await loginFrame
    .locator('body')
    .evaluate(() =>
      parent.postMessage({ type: 'close-view', generation: window.__fixtureGeneration }, '*')
    )
  await page.locator('.plugin-native-modal').waitFor({ state: 'hidden' })
  await page.waitForFunction(() =>
    window.__nativeUI.calls.some(
      (call) => call.method === 'closeDrawer' && call.surfaceId === 'account'
    )
  )
  assert.equal(await page.locator('iframe,webview').count(), 0)
  await page.locator('.user-capsule').hover()
  await account.waitFor({ state: 'visible' })
  assert.equal(await account.locator('.plugin-account-name').textContent(), '澜音测试账号')
  assert.equal(await account.locator('.t-tag').textContent(), 'VIP')
  assert.ok((await account.locator('img').getAttribute('src')).startsWith('data:image/svg+xml'))
  await page.evaluate(async () => {
    window.__nativeUI.summary.badge = 'SVIP'
    await window.__nativeUI.refreshAccounts()
  })
  await account.getByText('SVIP', { exact: true }).waitFor()
  await settleAnimations(page)
  await page.screenshot({ path: path.join(artifacts, 'native-preview.png'), fullPage: true })
  const accountBounds = await account.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    const menu = element.closest('.n-dropdown-menu')?.getBoundingClientRect()
    return { top: rect.top, bottom: rect.bottom, menuTop: menu?.top, menuBottom: menu?.bottom }
  })
  await writeFile(
    path.join(artifacts, 'native-account-layout.json'),
    JSON.stringify(accountBounds, null, 2)
  )
  assert.ok(
    accountBounds.top >= accountBounds.menuTop &&
      accountBounds.bottom <= accountBounds.menuBottom + 1,
    'account nickname, avatar and membership badge must fit inside the native menu'
  )
  await page.evaluate(async () => {
    delete window.__nativeUI.summary.badge
    await window.__nativeUI.refreshAccounts()
  })
  assert.equal(
    await account.locator('.t-tag').count(),
    0,
    'non-members must not inherit a membership tag'
  )
  await account.hover()
  await page.getByText('退出登录', { exact: true }).waitFor({ state: 'visible' })
  await page.getByText('退出登录', { exact: true }).click()
  await page.waitForFunction(() =>
    window.__nativeUI.calls.some((call) => call.method === 'accountLogout')
  )
  assert.deepEqual(
    await page.evaluate(() =>
      window.__nativeUI.calls.find((call) => call.method === 'accountLogout')
    ),
    { method: 'accountLogout', pluginId: 'fixture-installation', id: 'account' }
  )
  await page.locator('.user-capsule').hover()
  await account.getByText('未登录', { exact: true }).waitFor()
  assert.ok((await account.locator('img').getAttribute('src')).includes('user.webp'))
  assert.equal(await account.locator('.t-tag').count(), 0)
  await page.evaluate(() => window.__nativeUI.togglePlugin(false))
  await page.waitForFunction(() => document.querySelectorAll('[data-plugin-account]').length === 0)
  await page.evaluate(() => window.__nativeUI.togglePlugin(true))
  await page.locator('.user-capsule').hover()
  await account.getByText('未登录', { exact: true }).waitFor()
  await page.locator('main > h1').hover()
  await account.waitFor({ state: 'hidden' })
  await page.evaluate(() => window.__nativeUI.openNativeDrawer())
  await page.getByRole('heading', { name: '原生抽屉内容', exact: true }).waitFor()
  assert.equal(
    await page.locator('.t-drawer iframe,.t-drawer form').count(),
    0,
    'native drawer must not take the web or schema branch'
  )
  assert.equal(await page.locator('.t-drawer .native-surface').count(), 1)
  await page.locator('.t-drawer__header').hover()
  await settleAnimations(page)
  await page.screenshot({ path: path.join(artifacts, 'native-drawer.png'), fullPage: true })
  await page.locator('.t-drawer__close-btn').click()
  await page.waitForFunction(() =>
    window.__nativeUI.calls.some(
      (call) => call.method === 'closeDrawer' && call.surfaceId === 'native-drawer'
    )
  )
  await page.evaluate(() => {
    window.__nativeUI.shown.value = false
  })
  await page.waitForFunction(() =>
    window.__nativeUI.calls.some(
      (call) => call.method === 'closeDrawer' && call.surfaceId === 'daily'
    )
  )
  await page.evaluate(() => {
    window.__nativeUI.playlistSections.value = [
      {
        pluginId: 'fixture-installation',
        id: 'library',
        title: '账号歌单',
        view: 'daily',
        key: 'fixture-library'
      }
    ]
  })
  const inlineSection = page.getByRole('region', { name: '账号歌单' })
  await inlineSection.locator('.playlist-card').first().waitFor()
  assert.equal(await inlineSection.locator('.playlist-card').count(), 6)
  assert.equal(await page.locator('iframe,webview,.t-drawer--open').count(), 0)
  assert.equal(
    await inlineSection.locator('.native-surface').evaluate((el) => getComputedStyle(el).overflowY),
    'visible'
  )
  await page.evaluate(() =>
    window.__nativeUI.emitUI('ui.navigation.open', { page: 'playlist', sectionId: 'library' })
  )
  assert.deepEqual(
    await page.evaluate(() => ({
      path: window.__nativeUI.route().path,
      query: window.__nativeUI.route().query
    })),
    { path: '/home/songlist', query: { pluginId: 'fixture-installation', sectionId: 'library' } }
  )
  await page.waitForFunction(
    () => document.activeElement?.getAttribute('aria-label') === '账号歌单'
  )
  const mountsBeforeUpdate = await page.evaluate(
    () => window.__nativeUI.calls.filter((call) => call.method === 'mountSurface').length
  )
  await page.evaluate(() => window.__nativeUI.updatePlugin())
  await page.waitForFunction(
    (count) =>
      window.__nativeUI.calls.filter((call) => call.method === 'mountSurface').length > count,
    mountsBeforeUpdate
  )
  await inlineSection.locator('.playlist-card').first().waitFor()
  const closedBefore = await page.evaluate(
    () => window.__nativeUI.calls.filter((c) => c.method === 'closeDrawer').length
  )
  await page.evaluate(() => {
    window.__nativeUI.playlistSections.value = []
  })
  await inlineSection.waitFor({ state: 'detached' })
  await page.waitForFunction(
    (count) => window.__nativeUI.calls.filter((c) => c.method === 'closeDrawer').length > count,
    closedBefore
  )
  await page.evaluate(() => window.__nativeUI.unmount())
  await page.waitForFunction(() => window.__nativeUI.listenerCount() === 0)
  assert.deepEqual(issues, [], 'browser runtime must have no component errors')
  const result = {
    passed: true,
    checks: [
      'actual native grid without iframe',
      'complete playlist ResourceRef',
      'Electron-compatible structured clone of all native action payloads',
      'item action import',
      'native track playback action',
      'reactive queue response reaches selected playback through the actual host bridge',
      'pending playback leaves refresh and playlist navigation available',
      'playback and reply failures release action controls without remounting',
      'compact native track rows and cover dimensions',
      'play all action',
      'state refresh',
      'account avatar and nickname',
      'VIP/SVIP/non-member badges',
      'account menu layout',
      'account openSurface',
      'default logged-out avatar',
      'account modal opens immediately',
      'close-view and closed event dismiss login modal',
      'nested logout menu and refreshed account state',
      'account contribution disappears when plugin is disabled',
      'native drawer union',
      'surface cleanup',
      'inline playlist page contribution without nested scroll or drawer',
      'playlist section navigation includes trusted installation identity',
      'playlist section disable closes its surface',
      'modal resizes only from the active frame session',
      'updating a plugin remounts the visible surface'
    ],
    columns,
    accountBounds,
    screenshots: [
      'native-preview.png',
      'native-playback.png',
      'native-drawer.png',
      'native-account-modal.png'
    ],
    calls: await page.evaluate(() => window.__nativeUI.calls)
  }
  await writeFile(path.join(artifacts, 'native-ui-results.json'), JSON.stringify(result, null, 2))
  await rm(path.join(artifacts, 'native-ui-failure.json'), { force: true })
  console.log(
    'PASS: actual Vue native grid, account menu, full resource actions, state refresh, drawer and cleanup'
  )
  console.log('Screenshots: ' + artifacts)
} catch (error) {
  await writeFile(
    path.join(artifacts, 'native-ui-failure.json'),
    JSON.stringify({ error: String(error), issues }, null, 2)
  )
  throw error
} finally {
  await browser?.close()
  await server?.close()
  // mkdtemp is inside this workspace; never remove any user project path.
  assert.ok(workspace.startsWith(path.join(root, '.tmp-plugin-native-ui-')))
  await rm(workspace, { recursive: true, force: true })
}
