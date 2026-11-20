import assert from 'node:assert/strict'
import { join, resolve } from 'node:path'
import { build } from 'esbuild'

export async function attachQaDriver(application, page, directory) {
  await page.waitForFunction(() => !!document.querySelector('#app')?.children.length, undefined, { timeout: 45000 })
  assert.deepEqual(await page.evaluate(() => ({
    oldApi: 'api' in window, oldElectron: 'electron' in window,
    driver: 'ceruQa' in window, secondClaim: window.ceruTakeDesktopBridge()
  })), { oldApi: false, oldElectron: false, driver: false, secondClaim: null })
  const entry = new URL(page.url())
  entry.hash = entry.search = ''
  assert.equal(entry.protocol, 'file:')
  const filePath = join(directory, 'qa-preload.cjs')
  const selected = {
    plugins: ['accountConnections','accountChange','addDevFile','addPlugin','contributions','devState','getPluginLog','hookControls','hookSnapshot','loadAllPlugins','openPlaylistImportMenu','removeDevFile','saveConfig','savePermissions','setDevMode','setEnabled','strictMode','uninstallPlugin'],
    music: ['requestSdk'], songList: ['create','delete','getFavoritesId','setFavoritesId','addSongs','getSongs'], clipboard: ['readText'], musicDataRepair: ['begin','rollback','inspect']
  }
  if (['--skin-reload-only', '--skin-only','--qr-custom-only'].includes(process.argv[3])) selected.plugins.push('mountSurface','closeDrawer')
  if (process.argv[3] === '--qr-custom-only') selected.plugins.push('surfaceAction')
  if (process.argv[3] === '--playlist-create-only') selected.songList.push('getAll')
  if (process.argv[3] === '--downloads-only') selected.download=['getTasks']
  if (process.argv[3] === '--sharing-only') selected.share=['createDescriptor']
  // Test-only fixed channels, confined to the disposable main-frame preload.
  const trustedHelpers = process.argv[3] === '--trusted-only'
    ? "result.plugins.trustedDetail=id=>ipcRenderer.invoke('plugin:trusted-detail',id);result.plugins.setTrustedConsent=(id,allowed)=>ipcRenderer.invoke('plugin:trusted-set-consent',id,allowed);"
    : ''
  await build({ stdin: { resolveDir: resolve(import.meta.dirname, '..'), contents:
    "import { contextBridge, ipcRenderer } from 'electron'; import {desktopApi} from './src/preload/desktopApi';" +
    'if(process.isMainFrame && location.href.split(/[?#]/)[0] === ' + JSON.stringify(entry.href) + ') {' +
    'const selected = '+JSON.stringify(selected)+';const result=Object.fromEntries(Object.entries(selected).map(([group,keys])=>[group,Object.fromEntries(keys.map(key=>[key,desktopApi[group][key]]))]));'+trustedHelpers+'contextBridge.exposeInMainWorld("ceruQa",result) }' },
    platform: 'node', bundle: true, external: ['electron'], outfile: filePath })
  await application.evaluate(({ session }, filePath) => session.defaultSession.registerPreloadScript({ type:'frame', filePath }), filePath)
  await page.reload({waitUntil:'domcontentloaded'})
  await page.waitForFunction(() => !!window.ceruQa && !!document.querySelector('#app')?.children.length)
}
