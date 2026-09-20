import { app, BrowserWindow, ipcMain } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createServer } from 'node:http'
import assert from 'node:assert/strict'
import {
  PluginHost,
  PluginStorage,
  deletePluginStorage,
  bindPluginUIWindow,
  savePluginConfig,
  readDrawerSchema,
  drawerAction
} from '../.plugin-drawer-smoke.mjs'

const temporary = await mkdtemp(join(tmpdir(), 'ceru-drawer-storage-'))
app.setPath('userData', temporary)
const windows = []
const hosts = []
const requests = []
const server = createServer((_request, response) => {
  response.setHeader('content-type', 'application/json')
  response.end(JSON.stringify({ 'subsonic-response': { status: 'ok', serverVersion: 'fixture' } }))
})
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
const endpoint = `http://127.0.0.1:${server.address().port}`
try {
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      preload: resolve('scripts/plugin-drawer-smoke-preload.cjs')
    }
  })
  windows.push(win)
  bindPluginUIWindow(win)
  ipcMain.on('drawer-test:request', (_event, request) => requests.push(request))
  await win.loadURL('data:text/html,<html><body>Drawer Host fixture</body></html>')
  await win.webContents.executeJavaScript('window.drawerTest.ready()')
  const host = new PluginHost()
  hosts.push(host)
  host.pluginId = 'drawer-test'
  await host.loadPlugin(resolve('../CeruMusic-Plugin-Template/plugins/ceru.navidrome/plugin.js'))
  assert.equal(requests.length, 0, 'restoring a runtime never opens onboarding')
  await host.openInitialView()
  let open = requests.findLast((request) => request.method === 'ui.drawer.open')
  assert.equal(open.data.schema.presentation.placement, 'right')
  assert.equal(open.data.state.connected, false)
  assert.equal(BrowserWindow.getAllWindows().length, 1, 'no standalone plugin window')
  await host.openInitialView()
  assert.equal(requests.filter((request) => request.method === 'ui.drawer.open').length, 1)
  const schema = open.data.schema
  for (const placement of ['left', 'right', 'top', 'bottom']) {
    assert.equal(
      readDrawerSchema({ ...schema, presentation: { ...schema.presentation, placement } }, [
        'connection.open',
        'source.status'
      ]).presentation.placement,
      placement
    )
  }
  assert.throws(
    () =>
      readDrawerSchema({ ...schema, presentation: { kind: 'drawer', placement: 'diagonal' } }, [
        'connection.open'
      ]),
    /无效/
  )
  assert.throws(() => drawerAction(schema, 99, {}), /未声明/)
  assert.throws(() => drawerAction(schema, -1, {}), /请填写/)
  host.setGrantedPermissions(['navidrome.http', 'navidrome.lan'])
  const state = await host.invokeDrawer('connection', open.data.sessionId, -1, {
    serverUrl: endpoint,
    username: 'fixture-user',
    password: 'fixture-password',
    quality: 'original',
    allowLocal: true,
    remember: true,
    showCovers: false,
    mode: 'disconnect'
  })
  assert.equal(state.connected, true, 'form values cannot override the declared action input')
  assert.equal(JSON.stringify(state).includes('fixture-password'), false)
  host.closeDrawer('connection', open.data.sessionId)
  await assert.rejects(host.invokeDrawer('connection', open.data.sessionId, -1, {}), /已关闭/)
  await host.invokeV2Action('connection.open', {})
  for (let i = 0; i < 100 && requests.filter((r) => r.method === 'ui.drawer.open').length < 2; i++)
    await new Promise((resolve) => setTimeout(resolve, 10))
  open = requests.findLast((request) => request.method === 'ui.drawer.open')
  assert.equal(open.data.state.connected, true)
  await host.destroy()
  const restored = new PluginHost()
  restored.pluginId = 'drawer-test'
  hosts.push(restored)
  await restored.loadPlugin(
    resolve('../CeruMusic-Plugin-Template/plugins/ceru.navidrome/plugin.js')
  )
  const count = requests.filter((r) => r.method === 'ui.drawer.open').length
  await restored.openInitialView()
  assert.equal(
    requests.filter((r) => r.method === 'ui.drawer.open').length,
    count,
    'first-use marker survives restart'
  )

  const registry = new Map([
    ['example.owner', 'owner'],
    ['example.reader', 'reader'],
    ['example.stranger', 'stranger']
  ])
  async function storageHost(id) {
    const manifest = {
      manifestVersion: 2,
      id,
      name: id,
      version: '1.0.0',
      engines: { hostApi: '^2.0.0', logicRuntime: 'ceru-js@1' },
      modules: { logic: { entry: 'main' } },
      contributes: { commands: [{ id: 'test', title: 'test', action: 'test' }] }
    }
    const code =
      'exports.manifest = ' +
      JSON.stringify(manifest) +
      ';\nexports.activate = function(ctx) { ctx.actions.register("test", function(input) { return ctx.storage[input.method](input.key, input.value); }); };\n'
    const instance = new PluginHost(code)
    instance.pluginId = registry.get(id)
    instance.resolveStorageOwner = (id) => registry.get(id)
    hosts.push(instance)
    await instance.ensureReady()
    return instance
  }
  const owner = await storageHost('example.owner')
  const reader = await storageHost('example.reader')
  const stranger = await storageHost('example.stranger')
  const invoke = (host, method, key, value) =>
    host.invokeV2Action('test', { method, key, ...(value === undefined ? {} : { value }) })
  await invoke(owner, 'set', 'secret', { token: 'fixture-token' })
  await invoke(owner, 'set', 'large', 'x'.repeat(3 * 1024 * 1024))
  assert.equal(
    (await invoke(owner, 'get', 'large')).length,
    3 * 1024 * 1024,
    'sandbox supports data above the old 2 MiB quota'
  )
  await invoke(owner, 'delete', 'large')
  assert.deepEqual(await invoke(owner, 'get', { pluginId: 'example.owner', key: 'secret' }), {
    token: 'fixture-token'
  })
  await assert.rejects(
    invoke(reader, 'get', { pluginId: 'example.owner', key: 'secret' }),
    /未授权/
  )
  await invoke(owner, 'set', { key: 'catalog', readableBy: ['example.reader'] }, { count: 12 })
  assert.deepEqual(await invoke(reader, 'get', { pluginId: 'example.owner', key: 'catalog' }), {
    count: 12
  })
  await assert.rejects(
    invoke(stranger, 'get', { pluginId: 'example.owner', key: 'catalog' }),
    /未授权/
  )
  await assert.rejects(
    invoke(reader, 'set', { pluginId: 'example.owner', key: 'catalog', readableBy: '*' }, {}),
    /不能修改/
  )
  await assert.rejects(
    invoke(reader, 'delete', { pluginId: 'example.owner', key: 'catalog' }),
    /不能修改/
  )
  await invoke(owner, 'set', { key: 'catalog', readableBy: '*' }, [1, 2])
  assert.deepEqual(
    await invoke(stranger, 'get', { pluginId: 'example.owner', key: 'catalog' }),
    [1, 2]
  )
  await invoke(owner, 'set', { key: 'catalog', readableBy: [] }, [3])
  await assert.rejects(
    invoke(reader, 'get', { pluginId: 'example.owner', key: 'catalog' }),
    /未授权/
  )
  await invoke(owner, 'set', { key: 'catalog', readableBy: ['example.reader'] }, [4])
  await owner.destroy()
  assert.deepEqual(
    await invoke(reader, 'get', { pluginId: 'example.owner', key: 'catalog' }),
    [4],
    'shared data persists without activating its owner'
  )
  await assert.rejects(invoke(reader, 'get', { pluginId: '../owner', key: 'catalog' }), /ID/)
  await assert.rejects(invoke(reader, 'get', 'constructor'), /存储键/)
  await assert.rejects(invoke(reader, 'get', { pluginId: 'missing.plugin', key: 'x' }), /未安装/)
  const quota = new PluginStorage('quota', 'example.quota', () => undefined)
  quota.invoke('set', 'large', '字'.repeat(2000000))
  assert.throws(() => quota.invoke('set', 'large', '字'.repeat(3600000)), /10 MiB/)
  assert.equal(
    quota.invoke('get', 'large').length,
    2000000,
    'failed quota writes preserve existing data'
  )
  savePluginConfig('legacy.storage', { existing: { value: 42 } })
  const legacy = new PluginStorage('legacy', 'example.legacy', () => undefined)
  assert.deepEqual(legacy.invoke('get', 'existing'), { value: 42 })
  legacy.invoke('set', 'other', true)
  assert.equal(existsSync(join(temporary, 'plugins/config/legacy.storage.json')), false)
  assert.deepEqual(legacy.invoke('get', 'existing'), { value: 42 })
  deletePluginStorage('legacy')
  assert.equal(existsSync(join(temporary, 'plugins/storage/legacy.json')), false)
  console.log(
    'PASS: native drawer first use/reopen/restart/close, four placements, form validation, no extra window; real sandbox storage isolation, owner ACL, public/allowlist/revocation, cross-write denial, offline reads, migration and UTF-8 quota.'
  )
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  for (const host of hosts) await host.destroy()
  for (const win of windows) if (!win.isDestroyed()) win.destroy()
  await new Promise((resolve) => server.close(resolve))
  assert.ok(temporary.startsWith(join(tmpdir(), 'ceru-drawer-storage-')))
  await rm(temporary, { recursive: true, force: true })
  app.exit(process.exitCode || 0)
}
