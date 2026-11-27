import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { once } from 'node:events'
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import PluginHost from '../src/main/services/plugin/v2/V2PluginHost'
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
const { default: InitPluginService } = await import('../src/main/events/plugins')
InitPluginService()
const hosts: PluginHost[] = []
const log = { log() {}, info() {}, warn() {}, error() {}, debug() {} }
const manifest = {
  manifestVersion: 2,
  id: 'test.dynamic-permissions',
  name: '权限回归测试',
  version: '1.0.0',
  engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1', uiSchema: '^1.0.0' },
  modules: {
    logic: { entry: 'logic.main' },
    surfaces: [{ id: 'settings', kind: 'schema', entry: 'schema.settings' }]
  },
  contributes: { commands: [{ id: 'request', title: '请求', action: 'request' }] },
  permissions: [{ key: 'network', name: 'network.request', reason: '测试网络请求' }]
}
const artifact = `exports.manifest = ${JSON.stringify(manifest)};
exports.resources = {
  'schema.settings': { type: 'json', value: {
    schemaVersion: '1.0', presentation: { kind: 'drawer', openOnFirstUse: true },
    root: { type: 'form', title: 'Test settings', submitAction: 'request', children: [] }
  } }
};
exports.activate = async function(ctx) {
  const http = ctx.http.create({permissionKey: 'network', requestPermission: true});
  ctx.actions.register('request', async (input, operation) => {
    if (input?.retry) await ctx.permissions.request({ key: 'network' });
    return http.get('https://example.test/data', {operation});
  });
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
    skipTaskbar: true,
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
  const connectMainUI = () => main.webContents.executeJavaScript(`
    window.requests = []; window.cancelled = []; window.answer = true;
    window.advanceCount = 0; window.drawerCount = 0;
    const ipc = require('electron').ipcRenderer;
    ipc.on('plugin:ui', (_, request) => {
      if (request.method === 'operation.default' && request.data.name === 'player.next') window.advanceCount++;
      if (request.method === 'ui.drawer.open') window.drawerCount++;
      if (request.method !== 'ui.permissions.request') {
        ipc.invoke('plugin:ui-result', { id: request.id, value: null }); return;
      }
      window.requests.push(request);
      if (window.answer !== null) setTimeout(() => ipc.invoke('plugin:ui-result', {id: request.id, value: window.answer}), 30);
    });
    ipc.on('plugin:ui-cancel', (_, request) => window.cancelled.push(request.id));
    ipc.invoke('plugin:ui-ready', true);
  `)
  assert.equal(await connectMainUI(), true)
  const host = await start('granted-test')
  const advancePlayback = () => main.webContents.executeJavaScript(`
    require('electron').ipcRenderer.invoke('plugin:run-playback-operation',
      require('node:crypto').randomUUID(), 'player.next', { reason: 'ended' }, undefined, true)
  `)
  await main.loadURL(main.webContents.getURL() + '#/home/find')
  if (process.platform === 'win32') {
    const minimized = once(main, 'minimize', { signal: AbortSignal.timeout(3000) })
    main.minimize()
    await minimized
    const restored = once(main, 'restore', { signal: AbortSignal.timeout(3000) })
    main.restore()
    await restored
    main.hide()
  }
  await advancePlayback()
  // The main window cancels in-app navigation when it hands sign-in to the browser.
  const beforeNavigation = main.webContents.getURL()
  const blockedNavigation = new Promise<void>((resolve) => {
    main.webContents.once('will-navigate', (event) => {
      event.preventDefault()
      resolve()
    })
  })
  await main.webContents.executeJavaScript("void (location.href = 'https://example.test/sign-in')")
  await blockedNavigation
  assert.equal(main.webContents.getURL(), beforeNavigation)
  await advancePlayback()
  assert.equal(await main.webContents.executeJavaScript('window.advanceCount'), 2)
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
  await assert.rejects(denied.invokeV2Action('request'), /未授权|Network permission network: denied/)
  assert.equal((globalThis as any).__permissionNetworkCalls, before, 'denial must prevent HTTP')
  await assert.rejects(denied.invokeV2Action('request'), /未授权|Network permission network: denied/)
  assert.equal(
    await main.webContents.executeJavaScript('window.requests.length'),
    2,
    'denial must not cause a prompt loop'
  )
  await denied.destroy()
  const retry = await start('denied-test')
  await main.webContents.executeJavaScript('window.answer = true')
  await assert.rejects(retry.invokeV2Action('request'), /Network permission network: denied/)
  assert.equal((globalThis as any).__permissionNetworkCalls, before)
  assert.deepEqual(
    await retry.invokeV2Action('request', { retry: true }),
    { ok: true },
    'explicit retry after restart can ask again'
  )

  const cancelled = await start('cancel-test')
  await main.webContents.executeJavaScript('window.answer = null')
  const request = cancelled.invokeV2Action('request')
  const rejected = assert.rejects(request, /停止|未授权|Network permission network: denied/)
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
  assert.equal(await main.webContents.executeJavaScript('window.drawerCount'), 0)
  assert.deepEqual(
    await main.webContents.executeJavaScript("require('electron').ipcRenderer.invoke('plugin:set-active', '333')"),
    { success: true, viewError: undefined }
  )
  assert.equal(await main.webContents.executeJavaScript('window.drawerCount'), 1)

  const staleRequest = assert.rejects(
    callPluginUI('test', 'ui.permissions.request', {}),
    /主界面正在重新加载/
  )
  await main.loadFile(page)
  await staleRequest
  await assert.rejects(callPluginUI('test', 'ui.toast', {}), /主界面加载/)
  assert.equal(await connectMainUI(), true)
  assert.equal(await callPluginUI('test', 'ui.toast', {}), null)
  console.log(
    'PASS: playback and plugin activation after navigation, UI reconnect after reload, dynamic permissions and cold-start restoration'
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
