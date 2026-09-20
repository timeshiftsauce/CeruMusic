import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Render the actual Vue component with isolated fixture data; never modify installed plugins.
const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true })
try {
  const baseURL = process.env.CERU_PREVIEW_URL || 'http://localhost:5173'
  const compiled = await (await fetch(baseURL + '/src/components/Settings/plugins.vue')).text()
  const vueModule = compiled.match(/from\s+["']([^"']+\/vue\.js[^"']*)["']/)?.[1]
  assert.ok(vueModule, 'Vite must expose its resolved Vue module')
  const page = await browser.newPage({viewport:{width:1100,height:720}})
  const errors = []
  page.on('pageerror', error => { errors.push(error.message); console.error(error.message) })
  page.on('response', response => { if(response.status()>=400) console.error(response.status(),response.url()) })
  await page.route('**/src/services/pluginState.ts*', route => route.fulfill({contentType:'text/javascript',body:`import {ref} from '${vueModule}';export const pluginContributions=ref(window.fixtures.map(p=>({pluginId:p.pluginId,manifest:p.manifest,enabled:p.enabled})));export const refreshPluginContributions=async()=>{}; export const activePluginContributions=ref(window.fixtures.filter(p=>p.enabled)); export const selectCapabilityImplementation=async()=>{};export const selectUIImplementation=()=>{};`}))
  await page.route('**/src/store/LocalUserDetail.ts*', route => route.fulfill({contentType:'text/javascript',body:`export const LocalUserDetailStore=()=>window.testStore;`}))
  await page.route('**/src/components/ServicePlugin/ImportPlaylist.vue*', route => route.fulfill({contentType:'text/javascript',body:`export default {render(){return null}};`}))
  await page.addInitScript(() => {
    const platforms = ['QQ音乐','网易云音乐','酷狗音乐','酷我音乐','咪咕音乐','GitCode']
    window.fixtures = ['聆澜音源','洛雪兼容环境'].map((name,index) => {
      const providers = platforms.slice(0,index?5:6).map((name,i)=>({id:String(i),name,qualities:['128k','flac']}))
      return {pluginId:String(index),enabled:index===0,pluginInfo:{name,version:'0.1.0',author:'澜音',description:index?'导入洛雪音源，使用熟悉的搜索、歌单和排行榜。':'提供音乐搜索、歌单、排行榜与歌词，支持多平台音源。'},manifest:{name,version:'0.1.0',author:'澜音',contributes:{providers,...(index?{guestAdapters:[{id:"lx",format:"lx",title:"洛雪插件",badge:{label:"LX",backgroundColor:"#16875d",textColor:"#ffffff"}}]}:{})},permissions:[]},supportedSources:Object.fromEntries(providers.map(p=>[p.id,{name:p.name,qualitys:p.qualities}]))}
    })
    window.guestFixtures = ['洛雪音源 A','洛雪音源 B'].map((name,index)=>({id:String(index),adapterId:'lx',name,version:'1.0.0',author:'音源开发者',selected:false,state:'stopped',providers:[]}))
    window.fixtures[0].providerMethods=Object.fromEntries(window.fixtures[0].manifest.contributes.providers.map(p=>[p.id,['tracks.search','tracks.resolve','tracks.lyrics','playlists.search','playlists.categories','playlists.list','playlists.get','charts.list','charts.getTracks']]))
    window.fixtures[0].actionIds=['search.tips','search.hot','comments.hot','comments.get','artwork.get','playlist.parse','recognize','album.list']
    window.testStore={initialization:true,userInfo:{pluginId:'0'},init(){}}
    window.api={plugins:{
      loadAllPlugins:async()=>structuredClone(window.fixtures),
      setActive:async id=>{await new Promise(r=>setTimeout(r,250));window.fixtures.forEach(p=>p.enabled=p.pluginId===id);return true},
      setEnabled:async(id,enabled)=>{await new Promise(r=>setTimeout(r,250));window.fixtures.find(p=>p.pluginId===id).enabled=enabled;return{success:true}},
      setProviderOwner:async()=>true,
      getManifest:async id=>({data:window.fixtures.find(p=>p.pluginId===id).manifest}),
      getPermissions:async()=>({data:[]}),
      guestList:async id=>id==='1'?structuredClone(window.guestFixtures):[],
      guestSelect:async(parentId,guestId)=>{window.fixtures.find(p=>p.pluginId===parentId).enabled=true;window.guestFixtures.forEach(g=>{g.selected=g.id===guestId;g.state=g.selected?'ready':'stopped'})}
    }}
  })
  await page.route('**/__plugin_design_preview', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh"><meta charset="utf-8"><style>html,body{height:100%;margin:0;overflow:hidden}body{background:#f7f8fa;font-family:'Microsoft YaHei',sans-serif}#app{height:100%;min-height:0}</style><div id="app"></div><script type="module">import{createApp}from'${vueModule}';import Plugin from'/src/views/settings/sections/PluginSection.vue';createApp(Plugin).mount('#app');</script></html>`}))
  await page.goto(baseURL + '/__plugin_design_preview', {waitUntil:'domcontentloaded'})
  await page.locator('.plugin-item').first().waitFor({timeout:25000})
  console.log(await page.locator('.plugin-view-tabs').innerText())
  await page.addStyleTag({content:':root,body{--td-brand-color:#ff527c;--td-brand-color-hover:#f57b98;--td-brand-color-active:#e64670;--td-brand-color-focus:#ffc9d6;--td-brand-color-light:#fff0f4;--td-text-color-primary:#20232b;--td-text-color-secondary:#737985;--td-text-color-placeholder:#9298a3}'})
  await page.evaluate(()=>document.fonts.ready)
  await page.locator('.plugin-item').nth(3).waitFor()
  const header=page.locator('.plugins-title-row')
  const toolbar=page.locator('.plugin-toolbar')
  const headerBefore=await header.boundingBox(),toolbarBefore=await toolbar.boundingBox()
  await page.locator('.plugin-list').evaluate(el=>{el.scrollTop=300;el.dispatchEvent(new Event('scroll'))})
  assert.ok(await page.locator('.plugin-list').evaluate(el=>el.scrollTop>0),'list scrolls')
  assert.equal((await header.boundingBox()).y,headerBefore.y)
  assert.equal((await toolbar.boundingBox()).y,toolbarBefore.y)
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0)
  const listTop=await page.locator('.plugin-list').evaluate(el=>el.scrollTop)
  await page.locator('.plugin-view-tabs').getByText('能力分配',{exact:true}).click()
  await page.locator('.routing-row').first().waitFor()
  const nav=await page.locator('.routing-nav').boundingBox()
  const title=await page.locator('.routing-group-title').boundingBox()
  await page.locator('.routing-rows').evaluate(el=>{el.scrollTop=400;el.dispatchEvent(new Event('scroll'))})
  assert.equal((await page.locator('.routing-nav').boundingBox()).y,nav.y)
  assert.equal((await page.locator('.routing-group-title').boundingBox()).y,title.y)
  assert.equal(await page.evaluate(()=>document.scrollingElement.scrollTop),0)
  const saved=await page.locator('.routing-rows').evaluate(el=>el.scrollTop)
  await page.locator('.routing-nav button').nth(1).click()
  assert.equal(await page.locator('.routing-rows').evaluate(el=>el.scrollTop),0)
  await page.locator('.routing-nav button').first().click()
  assert.equal(await page.locator('.routing-rows').evaluate(el=>el.scrollTop),saved)
  const screenshot=join(tmpdir(),'ceru-routing-scroll.png')
  await page.screenshot({path:screenshot})
  await page.locator('.plugin-view-tabs').getByText('插件管理',{exact:true}).click()
  assert.equal(await page.locator('.plugin-list').evaluate(el=>el.scrollTop),listTop,'tab restores scroll position')
  assert.equal(await page.getByText('扩展中心',{exact:true}).count(),0)
  await page.screenshot({path:join(tmpdir(),'ceru-plugin-scroll.png')})
  await page.setViewportSize({width:660,height:600})
  await page.locator('.plugin-view-tabs').getByText('能力分配',{exact:true}).click()
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))
  assert.ok(await page.locator('.routing-rows').evaluate(el=>el.clientHeight>100))
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({screenshot,checks:'fixed header/search/platform navigation, independent scrolling, tab/source position restoration, narrow viewport'}))
} finally { await browser.close() }
