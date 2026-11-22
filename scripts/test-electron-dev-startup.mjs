/* global process, innerWidth, location, setTimeout, window, document, fetch, console */
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, relative, resolve } from 'node:path'
import { resolveConfig } from 'electron-vite'
import { createServer } from 'vite'
import { _electron as electron } from 'playwright'

// Exercise the real Vite configuration and production preload/main bundle with
// a temporary profile. Neither the user's running app nor its protocol handler
// is changed. Run after yarn build, preferably in the disposable QA checkout.
const root = resolve(import.meta.dirname, '..')
const temporary = await mkdtemp(join(tmpdir(), 'ceru-dev-startup-'))
let application, server
try {
  const resolved = await resolveConfig({ root }, 'serve')
  assert.ok(resolved.config?.renderer)
  const renderer = resolved.config.renderer
  renderer.cacheDir = join(temporary, 'vite-cache')
  renderer.server = { ...renderer.server, host: '127.0.0.1', port: 0, strictPort: false }
  server = await createServer(renderer)
  await server.listen()
  const address = server.httpServer.address()
  assert.ok(address && typeof address !== 'string')
  const url = 'http://127.0.0.1:' + address.port
  const launcher = join(temporary, 'launch.cjs')
  await writeFile(
    launcher,
    `
    const {app}=require('electron');
    app.setPath('userData',${JSON.stringify(join(temporary, 'profile'))});
    app.setAsDefaultProtocolClient=()=>false;
    app.requestSingleInstanceLock=()=>true;
    app.getAppPath=()=>${JSON.stringify(root)};
    require(${JSON.stringify(join(root, 'out/main/index.js'))});
  `
  )
  const env = { ...process.env, NODE_ENV: 'development', ELECTRON_RENDERER_URL: url }
  delete env.ELECTRON_RUN_AS_NODE
  application = await electron.launch({ args: [launcher], env, timeout: 45000 })
  const errors = []
  application.on('window', (page) => page.on('pageerror', (error) => errors.push(error.message)))
  await application.firstWindow()
  let page
  const deadline = Date.now() + 45000
  while (!page && Date.now() < deadline) {
    for (const candidate of application.windows()) {
      const main = await candidate
        .evaluate(() => innerWidth >= 1000 && !location.hash.startsWith('#/desktop-lyric'))
        .catch(() => false)
      if (main) {
        page = candidate
        break
      }
    }
    if (!page) await new Promise((done) => setTimeout(done, 100))
  }
  assert.ok(page, 'No development main window')
  page.setDefaultTimeout(45000)
  page.on('pageerror', (error) => errors.push(error.message))
  await page.addInitScript(() => {
    window.__guide_initialized = true
  })
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForFunction(() => !!document.querySelector('.user-capsule'))
  assert.ok(page.url().startsWith(url), 'The main window must use the live Vite server')
  assert.equal(await page.locator('vite-error-overlay').count(), 0)
  assert.deepEqual(
    await page.evaluate(() => ({
      api: typeof window.api,
      electron: typeof window.electron,
      claim: window.ceruTakeDesktopBridge()
    })),
    { api: 'undefined', electron: 'undefined', claim: null }
  )
  const transformed = []
  for (const file of [
    'src/plugin/componentFrames.ts',
    'src/plugin/componentStyles.ts',
    'src/components/PluginComponentSurface.vue'
  ]) {
    const response = await fetch(url + '/' + file)
    const source = await response.text()
    assert.equal(response.status, 200, source.slice(0, 800))
    assert.ok(!source.includes('Missing "./component-runtime" specifier'))
    transformed.push(file)
  }
  const navigation = page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 })
  server.ws.send({ type: 'full-reload', path: '*' })
  await navigation
  await page.waitForFunction(() => !!document.querySelector('.user-capsule'))
  assert.equal(await page.locator('vite-error-overlay').count(), 0)
  assert.equal(await page.locator('meta[http-equiv="Content-Security-Policy"]').count(), 1)
  assert.deepEqual(errors, [])
  console.log(
    JSON.stringify({
      devStartup: true,
      cspEnabled: true,
      transformed,
      viteReload: true,
      privateBridge: true,
      rendererErrors: errors
    })
  )
} finally {
  if (application) {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await application.close().catch(() => {})
  }
  await server?.close()
  const withinTemp = relative(resolve(tmpdir()), resolve(temporary))
  assert.ok(!withinTemp.startsWith('..') && basename(temporary).startsWith('ceru-dev-startup-'))
  await rm(temporary, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
