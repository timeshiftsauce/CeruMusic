import { app, BrowserWindow } from 'electron'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import PluginHost from '../.plugin-host-smoke.mjs'

const temporary = await mkdtemp(join(tmpdir(), 'ceru-host-smoke-'))
app.setPath('userData', temporary)
await app.whenReady()
const plugin = process.argv[2]
let host = new PluginHost()
host.pluginId = 'smoke-plugin'
try {
  await host.loadPlugin(plugin)
  assert.equal(Object.keys(host.getSupportedSources()).length, 6)
  host.setGrantedPermissions(['network'])
  await host.destroy()
  host = new PluginHost()
  host.pluginId = 'smoke-plugin'
  await host.loadPlugin(plugin)
  assert.deepEqual(host.getGrantedPermissions(), ['network'])
  const ref = { pluginId: host.getPluginInfo().id, providerId: 'wy', kind: 'track', id: 'test' }
  const document = await host.convertLyrics('parse', {
    text: '[00:01.00]你好',
    format: 'lrc',
    track: ref
  })
  assert.equal(document.format, 'crlyric')
  await host.openSurface('studio')
  const surface = BrowserWindow.getAllWindows().find((win) =>
    win.webContents.getURL().startsWith('data:')
  )
  assert.ok(surface)
  assert.equal(await surface.webContents.executeJavaScript('typeof process'), 'undefined')
  assert.match(await surface.webContents.executeJavaScript('document.body.textContent'), /搜索歌曲/)
  surface.close()
  assert.equal(surface.isDestroyed(), false)
  await host.openSurface('studio')
  assert.equal(BrowserWindow.getAllWindows().length, 1)
  host.setGrantedPermissions([])
  assert.deepEqual(host.getGrantedPermissions(), [])
  console.log(
    'Electron Host: activation, durable/revoked grants, crlyric, Surface sandbox and cached reopen passed'
  )
} catch (error) {
  console.error(error)
  process.exitCode = 1
} finally {
  await host.destroy()
  await rm(temporary, { recursive: true, force: true })
  app.exit(process.exitCode || 0)
}
