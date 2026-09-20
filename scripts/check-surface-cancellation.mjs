import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { SurfaceSession } from '@shiqianjiang/ceru-plugin-core/surface'

const require = createRequire(import.meta.url)
const fixture = { handlers: new Map(), ipcFailures: [], window: {}, host: undefined }
const electron = `
export const app={}, BrowserWindow={}, clipboard={}, dialog={}, globalShortcut={}, nativeTheme={}, shell={};
export const ipcMain={handle:(channel,handler)=>fixture.handlers.set(channel,handler)};
export const contextBridge={};
export const ipcRenderer={invoke:async(channel,...args)=>{
  try { return await fixture.handlers.get(channel)({},...args) }
  catch(error) { fixture.ipcFailures.push(error); throw error }
}};`
const bridge = `export const pluginChanged=()=>{}, sendPluginNotice=()=>{},
  callPluginUI=async()=>{}, publishPluginSurface=()=>{}, publishPluginAccountChanged=()=>{},
  assertMainWindowRequest=()=>{}, assertPluginUIRequest=()=>{};`
async function load(path, mocks) {
  const output = await build({
    entryPoints: [path],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    alias: { '@common': resolve('src/common') },
    plugins: [
      {
        name: 'fixtures',
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined
          )
          b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
            contents: mocks[args.path]
          }))
        }
      }
    ]
  })
  const module = { exports: {} }
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    require,
    fixture,
    window: fixture.window,
    process,
    console,
    Buffer,
    DOMException,
    AbortController,
    URL,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval
  })
  return module.exports
}
const { default: PluginHost } = await load('src/main/services/plugin/manager/PluginHost.ts', {
  electron,
  '../../../utils/path': 'export const getAppDirPath=()=>"unused"',
  '../uiBridge': bridge,
  '../../../events/pluginNotice': bridge,
  '../pluginConfig':
    'export const getPluginConfig=()=>({}),savePluginConfig=()=>{},getPluginPermissions=()=>[],savePluginPermissions=()=>{}',
  '../shareResolver': 'export const exportShareResolver=()=>{}',
  '../storage': 'export class PluginStorage {}',
  '../webDrawer': 'export const protectPluginFrames=()=>{}',
  '../playbackRequests': 'export const registerPlaybackRequest=()=>{}',
  '../sharing': 'export const createShareDescriptor=()=>{},readShareDescriptor=()=>{}'
})
// Use the real host methods without creating plugin workers or touching user configuration.
fixture.host = Object.assign(Object.create(PluginHost.prototype), {
  pluginId: 'fixture',
  disposed: false,
  webSessions: new Map(),
  drawerSessions: new Map(),
  actionIds: new Set(['action']),
  logger: console
})
fixture.host.isDisabled = () => false
const { default: init } = await load('src/main/events/plugins.ts', {
  electron,
  '../services/plugin': 'export default { getPluginById:()=>fixture.host }',
  '../services/songList/ManageSongList': 'export default class ManageSongList {}',
  '../logger': 'export const pluginLog=console',
  '../services/plugin/uiBridge': bridge,
  '../services/plugin/externalInstall':
    'export const prepareExternalPlugin=()=>{},commitExternalPlugin=()=>{},discardExternalPlugin=()=>{}'
})
init()
await load('src/preload/index.ts', {
  electron,
  '@electron-toolkit/preload': 'export const electronAPI={}'
})
const api = fixture.window.api.plugins
function mount(sessionId, dispatch) {
  const surface = { id: 'view', kind: 'web' }
  const lifecycle = new SurfaceSession(
    surface,
    {
      contributes: { commands: [{ id: 'action', action: 'action' }] }
    },
    dispatch
  )
  fixture.host.webSessions.set(sessionId, {
    web: { surfaceId: 'view', sessionId, kind: 'web' },
    lifecycle
  })
}

for (let i = 0; i < 3; i++) {
  const id = `closed-${i}`
  let aborted = false
  mount(
    id,
    (_action, _input, signal) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener(
          'abort',
          () => {
            aborted = true
            reject(new Error('Plugin operation cancelled'))
          },
          { once: true }
        )
      })
  )
  const rejection = assert.rejects(
    api.surfaceAction('fixture', 'view', id, 'action', {}),
    (error) => error.name === 'AbortError'
  )
  await api.closeDrawer('fixture', 'view', id)
  await rejection
  assert.equal(aborted, true)
}
assert.equal(fixture.ipcFailures.length, 0, 'closing views must not reject the main IPC handler')
console.log('PASS: three close/cancel cycles abort pending work without IPC errors')

mount('success', async () => ({ cancelled: true, value: 'plugin data' }))
assert.deepEqual(await api.surfaceAction('fixture', 'view', 'success', 'action', {}), {
  cancelled: true,
  value: 'plugin data'
})
console.log('PASS: successful plugin payloads are preserved without cancellation-marker collisions')

mount('failure', async () => {
  throw new Error('real provider failure')
})
await assert.rejects(
  api.surfaceAction('fixture', 'view', 'failure', 'action', {}),
  /real provider failure/
)
assert.equal(fixture.ipcFailures.length, 1)
console.log('PASS: genuine errors from an open surface still propagate')
