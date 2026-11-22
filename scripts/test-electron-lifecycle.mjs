import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'
import { _electron as electron } from 'playwright'
import { attachQaDriver } from './electron-qa-driver.mjs'

const root = resolve(import.meta.dirname, '..')
const appRoot = resolve(process.argv[2] ?? root)
const directory = await mkdtemp(join(root, '.electron-lifecycle-'))
const profile = join(directory, 'profile')
let application
try {
  await mkdir(profile)
  const launcher = join(directory, 'launch.cjs')
  await writeFile(launcher, [
    "const {app,ipcMain} = require('electron')",
    'const restoreGate = new Promise(resolve => {globalThis.qaResumeRestore = resolve})',
    'const handle = ipcMain.handle.bind(ipcMain)',
    'ipcMain.handle = (name,fn) => handle(name,name === "plugin:restore-enabled" ? async (...args) => {globalThis.qaRestorePending=true;await restoreGate;return fn(...args)} : fn)',
    'app.setPath("userData", '+JSON.stringify(profile)+')',
    'app.setAsDefaultProtocolClient = () => false',
    'app.once("will-quit",()=>require("node:fs").writeFileSync('+JSON.stringify(join(directory,'elapsed'))+',String(Date.now()-globalThis.qaQuitStart)))',
    'require('+JSON.stringify(join(appRoot,'out/main/index.js'))+')'
  ].join('\n'))
  const env = {...process.env}
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  application = await electron.launch({args:[launcher],env,timeout:30000})
  const page = await application.firstWindow()
  await attachQaDriver(application,page,directory)
  const options = await build({stdin:{contents:
    "import {definePlugin} from '@shiqianjiang/ceru-plugin-sdk';let count=0,permissionEvents=0;export default definePlugin({async setup(ctx){await ctx.storage.set('setup',true);ctx.lifecycle.onWindowFocus(()=>ctx.storage.set('focus',true));ctx.lifecycle.onWindowBlur(()=>ctx.storage.set('blur',true))},onInstall(ctx){return ctx.storage.set('installed',true)},onEnable(ctx){return ctx.storage.set('enabled',true)},onConfigChange(ctx,keys){return ctx.storage.set('configKeys',keys.join(','))},onPermissionChange(ctx,keys){return ctx.storage.set('permissionKeys',++permissionEvents+':'+keys.join(','))},onOffline(ctx){return ctx.storage.set('offline',true)},onOnline(ctx){return ctx.storage.set('online',true)},onLocaleChange(ctx,locale){return ctx.storage.set('locale',locale)},onAppReady(ctx){return ctx.storage.set('ready',++count)},onWindowShow(ctx){return ctx.storage.set('show',true)},onWindowHide(ctx){return ctx.storage.set('hide',true)},onThemeChange(ctx,theme){return ctx.storage.set('theme',theme)},async onBeforeQuit(ctx){await ctx.storage.set('flushed',true)}})",
    resolveDir:root},bundle:true,treeShaking:true,format:'iife',globalName:'lifecycleEntry',platform:'browser',write:false,minify:true})
  async function install(id, entry) {
    const manifest = {manifestVersion:3,id,name:id,version:'1.0.0',engines:{hostApi:'^3.0.0',logicRuntime:'ceru-js@1'},entry:{logic:{module:'logic.main'}}}
    if(id==='qa.lifecycle') manifest.uses={permissions:[{key:'listen',name:'player.read',reason:'测试权限变更'}]}
    const code = 'exports.manifest='+JSON.stringify(manifest)+';exports.activate='+entry
    const result = await page.evaluate(async code=>{
      const installed = await window.ceruQa.plugins.addPlugin(code,'lifecycle.js')
      if (!installed.pluginId) throw Error(installed.error)
      return installed.pluginId
    },code)
    const file = join(profile,'plugins','storage',result+'.json')
    if (id === 'qa.lifecycle') {
      const values = JSON.parse(await readFile(file,'utf8')).values
      assert.equal(values.installed,true)
      assert.equal(values.setup,undefined)
      assert.equal(values.enabled,undefined)
    }
    const enabled = await page.evaluate(id => window.ceruQa.plugins.setEnabled(id,true), result)
    assert.equal(enabled.error,undefined)
    return {file,pluginId:result}
  }
  const {file:record,pluginId} = await install('qa.lifecycle', 'async ctx=>{'+options.outputFiles[0].text+';return lifecycleEntry.default(ctx)}')
  const {file:stuck} = await install('qa.stalled','ctx=>{ctx.lifecycle.onBeforeQuit(async()=>{await ctx.storage.set("called",true);await new Promise(()=>{})})}')
  async function expectStored(key, value) {
    for (let attempt=0;attempt<60;attempt++) {
      const stored = await readFile(record,'utf8').then(JSON.parse).catch(()=>null)
      if (stored?.values?.[key] === value) return
      await delay(50)
    }
    assert.fail('Missing lifecycle value: '+key+'='+value)
  }
  assert.equal(await application.evaluate(()=>globalThis.qaRestorePending),true)
  assert.equal(JSON.parse(await readFile(record,'utf8')).values.ready,undefined)
  await application.evaluate(()=>globalThis.qaResumeRestore())
  await expectStored('ready',1)
  await expectStored('setup',true)
  await expectStored('enabled',true)
  assert.equal((await page.evaluate(id=>window.ceruQa.plugins.saveConfig(id,{example:'private'}),pluginId)).success,true)
  await expectStored('configKeys','example')
  for (const [keys,expected] of [[['listen'],'1:listen'],[[],'2:listen']]) {
    assert.equal((await page.evaluate(([id,keys])=>window.ceruQa.plugins.savePermissions(id,keys),[pluginId,keys])).error,undefined)
    await expectStored('permissionKeys',expected)
  }
  const protocol = await page.context().newCDPSession(page)
  const network = offline => protocol.send('Network.overrideNetworkState',{offline,latency:0,downloadThroughput:-1,uploadThroughput:-1})
  await protocol.send('Network.enable')
  await network(false)
  await page.waitForFunction(()=>navigator.onLine)
  await network(true)
  try {
    await page.waitForFunction(()=>!navigator.onLine,undefined,{timeout:3000})
    await expectStored('offline',true)
  } finally { await network(false) }
  await expectStored('online',true)
  const originalLocale = await page.evaluate(()=>document.documentElement.lang)
  try {
    await page.evaluate(()=>{document.documentElement.lang='de-DE'})
    await expectStored('locale','de-DE')
  } finally { await page.evaluate(language=>{document.documentElement.lang=language},originalLocale) }
  await expectStored('locale',originalLocale)
  const original = await application.evaluate(({nativeTheme})=>nativeTheme.themeSource)
  try {
    for (const theme of ['light','dark','light']) {
      await application.evaluate(({nativeTheme},theme)=>{nativeTheme.themeSource=theme},theme)
      if (theme === 'dark') await expectStored('theme',theme)
    }
    await expectStored('theme','light')
  } finally { await application.evaluate(({nativeTheme},original)=>{nativeTheme.themeSource=original},original) }
  const windowHandle = await application.browserWindow(page)
  await windowHandle.evaluate(win=>{globalThis.qaWindow=win;win.show();win.focus()})
  await delay(150)
  console.log('Before hide:', await windowHandle.evaluate(win=>({url:win.webContents.getURL(),visible:win.isVisible(),focused:win.isFocused()})))
  await windowHandle.evaluate(win=>win.hide())
  console.log('After hide:', await windowHandle.evaluate(win=>({visible:win.isVisible(),focused:win.isFocused()})))
  await expectStored('hide',true)
  await application.evaluate(()=>{globalThis.qaWindow.show();globalThis.qaWindow.focus()})
  await expectStored('show',true)
  await expectStored('focus',true)
  await expectStored('blur',true)
  const closed = application.waitForEvent('close',{timeout:12000})
  await application.evaluate(({app})=>{setTimeout(()=>{globalThis.qaQuitStart=Date.now();app.quit();app.quit()},50)})
  await closed
  assert.equal(JSON.parse(await readFile(record,'utf8')).values.flushed,true)
  assert.equal(JSON.parse(await readFile(stuck,'utf8')).values.called,true)
  const elapsed=Number(await readFile(join(directory,'elapsed'),'utf8'))
  assert.ok(elapsed>=2850 && elapsed<5000,'quit elapsed '+elapsed)
  console.log('Packaged lifecycle: ready once, window visibility and focus, theme, shutdown persisted; stalled worker released in '+elapsed+' ms')
} finally {
  await application?.close().catch(()=>{})
  if(dirname(await realpath(directory))===await realpath(root)) await rm(directory,{recursive:true,force:true,maxRetries:3})
}
