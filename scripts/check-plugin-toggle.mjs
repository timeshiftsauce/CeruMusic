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
  await page.route('**/src/services/pluginState.ts*', route => route.fulfill({contentType:'text/javascript',body:`import {ref} from '${vueModule}';export const pluginContributions=ref(window.fixtures.map(p=>({pluginId:p.pluginId,manifest:p.manifest,enabled:p.enabled})));export const refreshPluginContributions=async()=>{if(window.stallRefresh)return new Promise(()=>{})};`}))
  await page.route('**/src/store/LocalUserDetail.ts*', route => route.fulfill({contentType:'text/javascript',body:`export const LocalUserDetailStore=()=>window.testStore;`}))
  await page.route('**/src/components/ServicePlugin/ImportPlaylist.vue*', route => route.fulfill({contentType:'text/javascript',body:`export default {render(){return null}};`}))
  await page.addInitScript(() => {
    const platforms = ['QQ音乐','网易云音乐','酷狗音乐','酷我音乐','咪咕音乐','GitCode']
    window.fixtures = ['聆澜音源','洛雪兼容环境'].map((name,index) => {
      const providers = platforms.slice(0,index?5:6).map((name,i)=>({id:String(i),name,qualities:['128k','flac']}))
      return {pluginId:String(index),enabled:index===0,pluginInfo:{name,version:'0.1.0',author:'澜音',description:index?'导入洛雪音源，使用熟悉的搜索、歌单和排行榜。':'提供音乐搜索、歌单、排行榜与歌词，支持多平台音源。'},manifest:{name,version:'0.1.0',author:'澜音',contributes:{providers,...(index?{guestAdapters:[{id:"lx",format:"lx",title:"洛雪插件",badge:{label:"LX",backgroundColor:"#16875d",textColor:"#ffffff"}}]}:{})},permissions:[]},supportedSources:Object.fromEntries(providers.map(p=>[p.id,{name:p.name,qualitys:p.qualities}]))}
    })
    window.guestFixtures = ['洛雪音源 A','洛雪音源 B'].map((name,index)=>({id:String(index),adapterId:'lx',name,version:'1.0.0',author:'音源开发者',selected:false,state:'stopped',providers:[]}))
    window.testStore={initialization:true,userInfo:{pluginId:'0',pluginName:'聆澜音源',sourcePluginMap:{'0':'0','1':'0'},capabilityPluginMap:{'1:tracks.resolve':'0'}},init(){}}
    window.ownerWrites=[]
    window.api={plugins:{
      loadAllPlugins:async()=>window.stallRefresh?new Promise(()=>{}):structuredClone(window.fixtures),
      setActive:async id=>{await new Promise(r=>setTimeout(r,250));window.fixtures.find(p=>p.pluginId===id).enabled=true;return true},
      setEnabled:async(id,enabled)=>{await new Promise(r=>setTimeout(r,250));window.fixtures.find(p=>p.pluginId===id).enabled=enabled;return{success:true}},
      setProviderOwner:async(...args)=>{window.ownerWrites.push(args);return true},
      getManifest:async id=>({data:window.fixtures.find(p=>p.pluginId===id).manifest}),
      getPermissions:async()=>({data:[]}),
      guestList:async id=>id==='1'?structuredClone(window.guestFixtures):[],
      guestSelect:async(parentId,guestId)=>{window.fixtures.find(p=>p.pluginId===parentId).enabled=true;window.guestFixtures.forEach(g=>{g.selected=g.id===guestId;g.state=g.selected?'ready':'stopped'})}
    }}
  })
  await page.route('**/__plugin_design_preview', route => route.fulfill({contentType:'text/html',body:`<!doctype html><html lang="zh"><meta charset="utf-8"><style>body{margin:0;background:#f7f8fa;font-family:'Microsoft YaHei',sans-serif}</style><div id="app"></div><script type="module">import{createApp}from'${vueModule}';import Plugin from'/src/components/Settings/plugins.vue';createApp(Plugin).mount('#app');</script></html>`}))
  await page.goto(baseURL + '/__plugin_design_preview',{waitUntil:'domcontentloaded'})
  await page.locator('.plugin-item').first().waitFor({timeout:25000})
  await page.addStyleTag({content:':root,body{--td-brand-color:#ff527c;--td-brand-color-hover:#f57b98;--td-brand-color-active:#e64670;--td-brand-color-focus:#ffc9d6;--td-brand-color-light:#fff0f4;--td-text-color-primary:#20232b;--td-text-color-secondary:#737985;--td-text-color-placeholder:#9298a3}'})
  await page.evaluate(()=>document.fonts.ready)
  await page.locator('.plugin-item').nth(3).waitFor()
  const row=page.locator('.plugin-item').nth(1)
  await page.evaluate(()=>window.stallRefresh=true)
  for(let i=0;i<3;i++){
    await row.getByRole('button',{name:'使用',exact:true}).click()
    const close=row.getByRole('button',{name:'关闭',exact:true})
    await close.waitFor({timeout:2000})
    await page.waitForFunction(()=>!document.querySelectorAll('.plugin-use-button')[1].classList.contains('t-is-loading'),{},{timeout:2000})
    assert.equal(await close.isDisabled(),false)
    assert.deepEqual(await page.evaluate(()=>({owners:window.testStore.userInfo.sourcePluginMap,capabilities:window.testStore.userInfo.capabilityPluginMap,active:window.testStore.userInfo.pluginId,writes:window.ownerWrites,originalEnabled:window.fixtures[0].enabled})),
      {owners:{'0':'0','1':'0'},capabilities:{'1:tracks.resolve':'0'},active:'0',writes:[],originalEnabled:true},
      'enabling a second plugin preserves the original provider, capability choices, and running plugin')
    await close.click()
    await row.getByRole('button',{name:'使用',exact:true}).waitFor({timeout:2000})
    await page.waitForFunction(()=>!document.querySelectorAll('.plugin-use-button')[1].classList.contains('t-is-loading'),{},{timeout:2000})
  }
  const screenshot=join(tmpdir(),'ceru-toggle-unblocked.png')
  await page.screenshot({path:screenshot})
  assert.deepEqual(errors,[])
  console.log(JSON.stringify({screenshot,checks:'three use/close cycles preserve existing source/capability owners, including blocked background refresh'}))
} finally { await browser.close() }
