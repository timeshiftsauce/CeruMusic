import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import PluginHost from '../src/main/services/plugin/manager/PluginHost'
import pluginService from '../src/main/services/plugin'
import { savePluginState } from '../src/main/services/plugin/pluginConfig'
import {
  bindPluginUIWindow,
  cancelPluginUI,
  callPluginUI
} from '../src/main/services/plugin/uiBridge'

// Parent runner removes the profile after Electron exits and releases its file locks.
const temporary = fileURLToPath(new URL('./user-data/', import.meta.url))
await mkdir(temporary, { recursive: true })
app.setPath('userData', temporary)
app.on('window-all-closed', () => {})
await app.whenReady()
const hosts: PluginHost[] = []
const log = { log() {}, info() {}, warn() {}, error() {}, debug() {} }
const manifest = {
  manifestVersion: 2,
  id: 'test.dynamic-permissions',
  name: '权限回归测试',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
  modules: { logic: { entry: 'logic.main' } },
  contributes: { commands: [{ id: 'request', title: '请求', action: 'request' }] },
  permissions: [{ key: 'network', name: 'network.request', reason: '测试网络请求' }]
}
const artifact = `exports.manifest = ${JSON.stringify(manifest)};
exports.activate = async function(ctx) {
  const http = ctx.http.create({permissionKey: 'network', requestPermission: true});
  ctx.actions.register('request', async (_, operation) => http.get('https://example.test/data', {operation}));
};`
async function start(id: string) {
  const host = new PluginHost(artifact, log)
  host.pluginId = id
  hosts.push(host)
  await host.ensureReady()
  return host
}
try {
  const page = join(temporary, 'page.html')
  await writeFile(page, '<html><body>Permission test</body></html>')
  // nodeIntegration is only for this isolated test page, never the production window.
  const main = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  bindPluginUIWindow(main)
  await main.loadFile(page)
  const auxiliary = new BrowserWindow({
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  await auxiliary.loadFile(page)
  assert.equal(
    await auxiliary.webContents.executeJavaScript(
      "require('electron').ipcRenderer.invoke('plugin:ui-ready', true)"
    ),
    false
  )
  await assert.rejects(callPluginUI('test', 'ui.permissions.request', {}), /主界面加载/)
  await main.webContents.executeJavaScript(`
    window.requests = []; window.cancelled = []; window.answer = true;
    const ipc = require('electron').ipcRenderer;
    ipc.on('plugin:ui', (_, request) => {
      if (request.method !== 'ui.permissions.request') {
        ipc.invoke('plugin:ui-result', { id: request.id, value: null }); return;
      }
      window.requests.push(request);
      if (window.answer !== null) setTimeout(() => ipc.invoke('plugin:ui-result', {id: request.id, value: window.answer}), 30);
    });
    ipc.on('plugin:ui-cancel', (_, request) => window.cancelled.push(request.id));
    ipc.invoke('plugin:ui-ready', true);
  `)
  const host = await start('granted-test')
  await main.loadURL(main.webContents.getURL() + '#/home/find')
  assert.deepEqual(host.getGrantedPermissions(), [])
  assert.equal(
    await main.webContents.executeJavaScript('window.requests.length'),
    0,
    'activation must not pre-authorize'
  )
  assert.deepEqual(
    await Promise.all([host.invokeV2Action('request'), host.invokeV2Action('request')]),
    [{ ok: true }, { ok: true }]
  )
  assert.equal(
    await main.webContents.executeJavaScript('window.requests.length'),
    1,
    'concurrent requests share one prompt in main window'
  )
  assert.deepEqual(host.getGrantedPermissions(), ['network'])
  await host.destroy()
  const restored = await start('granted-test')
  await restored.invokeV2Action('request')
  assert.equal(
    await main.webContents.executeJavaScript('window.requests.length'),
    1,
    'persisted grant must not prompt'
  )

  const denied = await start('denied-test')
  await main.webContents.executeJavaScript('window.answer = false')
  const before = (globalThis as any).__permissionNetworkCalls
  await assert.rejects(denied.invokeV2Action('request'), /未授权/)
  assert.equal((globalThis as any).__permissionNetworkCalls, before, 'denial must prevent HTTP')
  await assert.rejects(denied.invokeV2Action('request'), /未授权/)
  assert.equal(
    await main.webContents.executeJavaScript('window.requests.length'),
    2,
    'denial must not cause a prompt loop'
  )
  await denied.destroy()
  const retry = await start('denied-test')
  await main.webContents.executeJavaScript('window.answer = true')
  assert.deepEqual(
    await retry.invokeV2Action('request'),
    { ok: true },
    'explicit retry after restart can ask again'
  )

  const cancelled = await start('cancel-test')
  await main.webContents.executeJavaScript('window.answer = null')
  const request = cancelled.invokeV2Action('request')
  const rejected = assert.rejects(request, /停止|未授权/)
  const deadline = Date.now() + 3000
  while ((await main.webContents.executeJavaScript('window.requests.length')) < 4) {
    assert.ok(Date.now() < deadline, 'permission dialog delivery timed out')
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
  cancelPluginUI('cancel-test')
  await rejected
  assert.equal(await main.webContents.executeJavaScript('window.cancelled.length'), 1)
  assert.deepEqual(cancelled.getGrantedPermissions(), [])
  // Simulate a cold start with multiple enabled plugins and an installed-but-disabled one.
  const pluginsDirectory = join(temporary, 'plugins')
  await mkdir(pluginsDirectory, { recursive: true })
  for (const [id, enabled, order] of [
    ['111', true, 0],
    ['222', true, 1],
    ['333', false, 2]
  ] as const) {
    const code = artifact.replace('test.dynamic-permissions', `test.restore-${id}`)
    await writeFile(join(pluginsDirectory, `${id}-plugin.js`), code)
    savePluginState(id, { enabled, order })
  }
  await pluginService.initializePlugins()
  assert.equal(
    (await pluginService.getPluginsList()).filter((p) => p.enabled).length,
    0,
    'scanning must not execute plugins'
  )
  await Promise.all([pluginService.restoreEnabledPlugins(), pluginService.restoreEnabledPlugins()])
  assert.deepEqual(
    (await pluginService.getPluginsList()).filter((p) => p.enabled).map((p) => p.pluginId),
    ['111', '222']
  )
  await pluginService.setPluginEnabled('111', false)
  await pluginService.restoreEnabledPlugins()
  assert.deepEqual(
    (await pluginService.getPluginsList()).filter((p) => p.enabled).map((p) => p.pluginId),
    ['222'],
    'a later refresh must not reactivate a disabled plugin'
  )
  console.log(
    'PASS: dynamic permissions after navigation, persistence, denial, cancellation; cold-start restores all enabled plugins and leaves disabled plugins stopped'
  )
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  for (const host of hosts) await host.destroy()
  await pluginService.disposeAll()
  for (const window of BrowserWindow.getAllWindows()) window.destroy()
  app.exit(process.exitCode ? 1 : 0)
}
