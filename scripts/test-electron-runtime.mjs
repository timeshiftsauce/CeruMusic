import { verifyCustomAccountQr } from './electron-account-qr-custom.mjs'
import { verifyComponentSkinAuthor } from './electron-component-skin-author.mjs'
import { verifyComponentStage } from './electron-component-stage.mjs'
import { verifyRendererCsp } from './electron-renderer-csp.mjs'
import { attachQaDriver } from './electron-qa-driver.mjs'
import { verifyRouter } from './electron-router.mjs'
import { verifyAccountForm, verifyAccountTab } from './electron-account-form.mjs'
import { verifyAccountQr } from './electron-account-qr.mjs'
import { verifyAccountOAuth } from './electron-account-oauth.mjs'
import { verifyBrowserLogin } from './electron-account-browser.mjs'
import { verifyPlayerSkin } from './electron-player-skin.mjs'
import { verifySkinPerformance } from './electron-skin-performance.mjs'
import { verifyMusicSourceSelection } from './electron-source-selection.mjs'
import { verifySearchQuery } from './electron-search-query.mjs'
import { verifyTrackLike } from './electron-track-like.mjs'
import { verifyPlaylistCreate, verifyWindowClose } from './electron-playlist-create.mjs'
import { verifyLyricsHooks } from './electron-lyrics-hooks.mjs'
import { verifyDownloadHooks } from './electron-download-hooks.mjs'
import { verifyShareHooks } from './electron-share-hooks.mjs'
import { verifySystemHooks } from './electron-system-hooks.mjs'
import { verifyTrustedRuntime } from './electron-trusted-runtime.mjs'
import { verifyComponentRuntime } from './electron-component-runtime.mjs'
import { verifyComponentRegions } from './electron-component-regions.mjs'
import { verifyComponentAuthor } from './electron-component-author.mjs'
import { verifyResolveHook } from './electron-resolve-hook.mjs'
import { verifyShuffle } from './electron-shuffle.mjs'
import { verifyNeteaseDaily, verifyNeteaseHostAccounts } from './electron-netease-daily.mjs'
import { verifyHomeTabs } from './electron-home-tabs.mjs'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { createServer } from 'node:http'
import { build } from 'esbuild'
import { _electron as electron } from 'playwright'
import { startVueWatch, addPreviewFile, verifyV2Preview } from './electron-dev-preview.mjs'
import { verifyPageMounts } from './electron-plugin-pages.mjs'
import { verifyServiceCycles, verifyServicePreviews } from './electron-plugin-services.mjs'
import { verifyPlaybackHooks } from './electron-playback-hooks.mjs'

// Run after yarn build. All database writes use a disposable profile.
const require = createRequire(import.meta.url)
const root = resolve(import.meta.dirname, '..')
const appRoot = process.argv[2] ? resolve(process.argv[2]) : root
const directory = await mkdtemp(join(root, '.electron-runtime-'))
let application, sourceWatch
const wave = Buffer.alloc(44 + 44100 * 2)
wave.write('RIFF')
wave.writeUInt32LE(wave.length - 8, 4)
wave.write('WAVEfmt ', 8)
wave.writeUInt32LE(16, 16)
wave.writeUInt16LE(1, 20)
wave.writeUInt16LE(1, 22)
wave.writeUInt32LE(44100, 24)
wave.writeUInt32LE(88200, 28)
wave.writeUInt16LE(2, 32)
wave.writeUInt16LE(16, 34)
wave.write('data', 36)
wave.writeUInt32LE(wave.length - 44, 40)
for (let frame = 0; frame < 44100; frame++)
  wave.writeInt16LE(Math.round(512 * Math.sin((frame * 2 * Math.PI * 440) / 44100)), 44 + frame * 2)
async function selectMainWindow(application) {
  await application.firstWindow()
  const deadline = Date.now() + 30000
  while (Date.now() < deadline) {
    for (const candidate of application.windows()) {
      if (candidate.isClosed()) continue
      const handle = await application.browserWindow(candidate)
      try {
        if (await handle.evaluate(window => window.getBounds().width >= 1100)) return candidate
      } finally {
        await handle.dispose()
      }
    }
    await new Promise(resolve => setTimeout(resolve, 100))
  }
  assert.fail('没有找到运行时验收所需的主窗口')
}

async function verifySidebarAlignment(page, application) {
  const sidebar = page.locator('.sidebar .nav-section')
  const measure = () => sidebar.locator('button.nav-button').evaluateAll(buttons =>
    buttons.map(button => {
      const glyph = button.querySelector('.nav-icon, .sidebar-page-icon > *').getBoundingClientRect()
      const label = button.querySelector('.nav-label')
      const range = document.createRange()
      range.selectNodeContents(label)
      const text = range.getBoundingClientRect()
      const row = button.getBoundingClientRect()
      const middle = rect => rect.top + rect.height / 2
      return {
        title: label.textContent.trim(),
        iconX: glyph.left + glyph.width / 2 - row.left,
        iconY: middle(glyph) - middle(row),
        labelX: text.left - row.left,
        labelY: middle(text) - middle(row)
      }
    })
  )
  const setZoom = factor => application.evaluate(({ webContents }, value) => {
    const main = webContents.fromId(globalThis.runtimeTestMainId)
    const previous = main.getZoomFactor()
    main.setZoomFactor(value)
    return previous
  }, factor)
  await page.evaluate(() => document.fonts.ready.then(() => true))
  const previous = await setZoom(1)
  try {
    for (const factor of [1, 1.25]) {
      await setZoom(factor)
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      if (factor === 1 && process.env.CERU_SIDEBAR_SNAPSHOT) {
        await sidebar.screenshot({ path: process.env.CERU_SIDEBAR_SNAPSHOT, animations: 'disabled' })
      }
      const measurements = await measure()
      const reference = measurements.find(row => row.title === '本地')
      assert.ok(reference)
      for (const row of measurements) {
        assert.ok(Math.abs(row.iconY) <= 1, row.title + ': icon is off center')
        assert.ok(Math.abs(row.labelY) <= 1.5, row.title + ': text is off center')
        assert.ok(Math.abs(row.labelY - reference.labelY) <= 1, row.title + ': text is off baseline')
        assert.ok(Math.abs(row.iconX - reference.iconX) <= 1, row.title + ': icon column moved')
        assert.ok(Math.abs(row.labelX - reference.labelX) <= 1, row.title + ': text column moved')
      }
      console.log('Sidebar at ' + factor + 'x: ' + measurements.length + ' rows; max icon center offset: ' +
        Math.max(...measurements.map(row => Math.abs(row.iconY))).toFixed(3) + ' CSS px')
    }
  } finally {
    await setZoom(previous)
  }
}

const server = createServer((request, response) => {
  if (request.url === '/csp-script.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript' })
      .end('globalThis.ceruCspRemote = true')
    return
  }
  if (process.argv[3] === '--shuffle-only' && /^\/preview\.wav\?shuffle=[abcd]$/.test(request.url)) {
    const duration = {a:29,b:2,c:30,d:4}[request.url.at(-1)]
    const samples = Buffer.concat([wave.subarray(0,44), ...Array(duration).fill(wave.subarray(44))])
    samples.writeUInt32LE(samples.length-8,4)
    samples.writeUInt32LE(samples.length-44,40)
    response.writeHead(200,{'Content-Type':'audio/wav','Content-Length':samples.length}).end(samples)
    return
  }
  if (request.url !== '/preview.wav') {
    response.writeHead(404).end()
    return
  }
  const audio=process.argv[3]==='--lyrics-only'?Buffer.concat([wave.subarray(0,44),...Array(30).fill(wave.subarray(44))]):wave
  if(audio!==wave){audio.writeUInt32LE(audio.length-8,4);audio.writeUInt32LE(audio.length-44,40)}
  response.writeHead(200, { 'Content-Type': 'audio/wav', 'Content-Length': audio.length })
  response.end(audio)
})
try {
  if (appRoot.endsWith('.asar')) {
    const { extractFile, listPackage, statFile } = require('@electron/asar')
    for (const path of listPackage(appRoot)) {
      const file = path.slice(1)
      const entry = statFile(appRoot, file, false)
      if (entry.files || entry.link || entry.unpacked) continue
      assert.equal(entry.integrity?.algorithm, 'SHA256', `Missing packed integrity: ${file}`)
      assert.equal(createHash('sha256').update(extractFile(appRoot, file)).digest('hex'), entry.integrity.hash, `Corrupt packed file: ${file}`)
    }
    for (const core of ['@shiqianjiang/ceru-plugin-core', 'ceru-plugin-core-v2']) {
      assert.ok(
        extractFile(appRoot, join('node_modules', core, 'assets', 'sandbox.js')).length,
        core
      )
    }
  }
  const profile = join(directory, 'profile')
  await mkdir(profile)
  await writeFile(join(profile,'test.wav'),wave)
  const transportWave = Buffer.concat([wave.subarray(0, 44), ...Array(['--skin-performance', '--component-stage'].includes(process.argv[3]) ? 90 : 30).fill(wave.subarray(44))])
  transportWave.writeUInt32LE(transportWave.length - 8, 4)
  transportWave.writeUInt32LE(transportWave.length - 44, 40)
  await writeFile(join(profile, 'transport.wav'), transportWave)
  await build({
    stdin: {
      contents: `
        export { verifyRuntimePackages } from './scripts/check-plugin-runtime-deps.mjs'
        export { MusicDatabase } from './src/main/services/MusicDatabase'
        export { PlaylistDatabase } from './src/main/services/songList/PlaylistDatabase'
      `,
      resolveDir: root
    },
    outfile: join(directory, 'databases.cjs'),
    bundle: true,
    alias: { '@common': join(root, 'src/common') },
    platform: 'node',
    format: 'cjs',
    packages: 'external'
  })
  const launcher = join(directory, 'launch.cjs')
  await writeFile(
    launcher,
    `
      const { app } = require('electron')
      app.setPath('userData', ${JSON.stringify(profile)})
      app.getAppPath = () => ${JSON.stringify(appRoot)}
      // Test startup must not replace the user's cerumusic:// registration.
      app.setAsDefaultProtocolClient = () => false
      globalThis.runtimeTestRequire = require
      ${process.argv[3] === '--netease-daily' ? `require(${JSON.stringify(join(root,'scripts/netease-daily-transport.cjs'))}).install(${JSON.stringify(appRoot)},${JSON.stringify(directory)}).then(() => require(${JSON.stringify(join(appRoot,'out/main/index.js'))})).catch(error => { console.error(error); app.exit(1) })` : `require(${JSON.stringify(join(appRoot, 'out/main/index.js'))})`}
    `
  )
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  delete env.ELECTRON_RENDERER_URL
  const diagnosticArgs = process.env.CERU_QA_DISABLE_FRAME_THROTTLING === '1'
    ? ['--disable-features=ThrottleRepeatedNoDamageFrames,ThrottleUndrawnFrames,ThrottleUnimportantFrameTimers'] : []
  application = await electron.launch({ args: [...diagnosticArgs, launcher], env, timeout: 30000 })
  await application.evaluate(
    (_electron, root) =>
      globalThis.runtimeTestRequire('./databases.cjs').verifyRuntimePackages(root),
    appRoot
  )
  if (process.platform === 'win32' && appRoot.endsWith('.asar')) {
    const registryAvailable = await application.evaluate((_electron, root) => {
      const registry = globalThis.runtimeTestRequire(
        globalThis.runtimeTestRequire('node:path').join(root, 'node_modules', 'registry-js')
      )
      return Array.isArray(registry.enumerateValues(
        registry.HKEY.HKEY_CURRENT_USER,
        'SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Themes\\Personalize'
      ))
    }, appRoot)
    assert.equal(registryAvailable, true, 'Packaged Windows registry native module must load')
    console.log('Packaged registry-js native module loaded in Electron')
  }
  let page = await selectMainWindow(application)
  if (['--component-only', '--component-regions', '--component-stage'].includes(process.argv[3])) {
    page.on('pageerror', error => console.error('Component startup:', error.stack))
    page.on('console', message => { if (message.type() === 'error') console.error('Component console:', message.text().slice(0, 1600)) })
  }
  if (['--skin-only','--skin-reload-only','--panel-only','--skin-performance'].includes(process.argv[3])) {
    page.on('pageerror', error => console.error('Startup:', error.stack))
    page.on('console', message => { if (message.type() === 'error') console.error('Console:', message.text().slice(0, 1200)) })
  }
  await attachQaDriver(application, page, directory)
  await application.evaluate(({ BrowserWindow }) => {
    globalThis.runtimeTestMainId = BrowserWindow.getAllWindows().find(
      (w) => w.getBounds().width >= 1100
    ).webContents.id
  })
  const analyticsElement=page.locator('iframe[title="访问统计"]')
  assert.equal(await analyticsElement.getAttribute('sandbox'),'allow-scripts')
  const analyticsFrame=await (await analyticsElement.elementHandle()).contentFrame()
  await analyticsFrame.waitForFunction(()=>Object.hasOwn(window,'localStorage') && Object.isFrozen(window.localStorage))
  const isolation=await analyticsFrame.evaluate(()=>{
    localStorage.setItem('ceru.qa.frame','temporary')
    let parentDenied=false
    try { void parent.document.title } catch { parentDenied=true }
    return {stored:localStorage.getItem('ceru.qa.frame'),parentDenied,bridge:typeof window.ceruQa}
  })
  assert.deepEqual(isolation,{stored:'temporary',parentDenied:true,bridge:'undefined'})
  assert.equal(await page.evaluate(()=>localStorage.getItem('ceru.qa.frame')),null)
  const rendererErrors = []
  page.on('pageerror', (error) => { rendererErrors.push(error.message); console.error(error.stack) })

  await page.waitForFunction(
    () => !!window.ceruQa && !!document.querySelector('#app')?.children.length
  )

  await new Promise((resolve, reject) =>
    server.once('error', reject).listen(0, '127.0.0.1', resolve)
  )
  const previewUrl = 'http://127.0.0.1:' + server.address().port + '/preview.wav'
  if (['--qr-custom-only','--home-tabs-only','--csp-only','--component-stage','--component-skin-author','--component-author','--component-regions','--component-only','--trusted-only','--system-only','--netease-daily','--account-tab','--services-only','--track-like-only','--playlist-create-only','--window-close-only','--lyrics-only','--downloads-only','--sharing-only','--resolve-only','--shuffle-only','--search-query-only','--source-selection-only','--skin-only','--skin-reload-only','--panel-only','--skin-performance','--account-only','--qr-only','--oauth-only','--browser-only'].includes(process.argv[3])) {
    await page.addInitScript(()=>{window.__guide_initialized=true})
    await page.evaluate(()=>{localStorage.setItem('ceru_music_has_seen_first_run_notice_tips','true'); location.hash='/home/local'})
    await page.reload({waitUntil:'domcontentloaded'})
    await page.waitForFunction(()=>!!window.ceruQa && !!document.querySelector('.user-capsule'))
    const restartSourceTest = async () => {
      await application.evaluate(({session}) => session.defaultSession.flushStorageData())
      await application.close()
      application = await electron.launch({args:[launcher],env,timeout:30000})
      const restarted = await selectMainWindow(application)
      if (['--netease-daily', '--account-tab'].includes(process.argv[3])) {
        await restarted.addInitScript(()=>{window.__guide_initialized=true})
        await restarted.evaluate(()=>{window.__guide_initialized=true})
      }
      restarted.on('pageerror', error => rendererErrors.push(error.message))
      await restarted.waitForFunction(() => !!document.querySelector('#app')?.children.length,undefined,{timeout:45000})
      if (process.argv[3]==='--account-tab' || (process.argv[3]==='--netease-daily' && process.argv[5]==='--host-accounts')) await attachQaDriver(application,restarted,directory)
      return restarted
    }
    if (process.argv[3] === '--home-tabs-only') await verifyHomeTabs(page)
    else if (process.argv[3] === '--csp-only') await verifyRendererCsp(page, 'http://127.0.0.1:' + server.address().port + '/csp-script.js')
    else if (process.argv[3] === '--component-stage') await verifyComponentStage(application,page,directory)
    else if (process.argv[3] === '--component-skin-author') await verifyComponentSkinAuthor(application,page,directory,process.argv[4])
    else if (process.argv[3] === '--component-author') await verifyComponentAuthor(application,page,directory,process.argv[4])
    else if (process.argv[3] === '--component-regions') await verifyComponentRegions(application, page, directory)
    else if (process.argv[3] === '--component-only') await verifyComponentRuntime(application, page)
    else if (process.argv[3] === '--trusted-only') await verifyTrustedRuntime(application, page)
    else if (process.argv[3] === '--source-selection-only') await verifyMusicSourceSelection(page, restartSourceTest)
    else if (process.argv[3] === '--search-query-only') await verifySearchQuery(page)
    else if (process.argv[3] === '--track-like-only') await verifyTrackLike(application,page)
    else if (process.argv[3] === '--playlist-create-only') await verifyPlaylistCreate(page,application)
    else if (process.argv[3] === '--window-close-only') await verifyWindowClose(page,application)
    else if (process.argv[3] === '--lyrics-only') await verifyLyricsHooks(application,page,previewUrl)
    else if (process.argv[3] === '--downloads-only') await verifyDownloadHooks(application,page,previewUrl)
    else if (process.argv[3] === '--sharing-only') await verifyShareHooks(application,page,previewUrl)
    else if (process.argv[3] === '--system-only') await verifySystemHooks(application,page)
    else if (process.argv[3] === '--resolve-only') await verifyResolveHook(page,previewUrl)
    else if (process.argv[3] === '--shuffle-only') await verifyShuffle(page,previewUrl)
    else if (process.argv[3] === '--services-only') {
      await verifyServiceCycles(page)
      await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
      try { await verifyServicePreviews(application,page,directory) }
      finally { await page.evaluate(() => window.ceruQa.plugins.setDevMode(false)) }
    }
    else if (process.argv[3] === '--account-tab') await verifyAccountTab(page, restartSourceTest, process.argv[4])
    else if (process.argv[3] === '--netease-daily') await (process.argv[5]==='--host-accounts' ? verifyNeteaseHostAccounts : verifyNeteaseDaily)(page,restartSourceTest,process.argv[4],directory)
    else if (process.argv[3] === '--skin-performance') await verifySkinPerformance(application,page,directory,process.argv[4])
    else if (['--skin-only','--skin-reload-only','--panel-only'].includes(process.argv[3])) await verifyPlayerSkin(application,page,directory,process.argv[4],process.argv[3] === '--skin-reload-only',process.argv[5],process.argv[3] === '--panel-only')
    else if (process.argv[3] === '--qr-custom-only') await verifyCustomAccountQr(page,directory)
    else if (process.argv[3] === '--qr-only') await verifyAccountQr(page)
    else if (process.argv[3] === '--oauth-only') await verifyAccountOAuth(application,page,directory)
    else if (process.argv[3] === '--browser-only') await verifyBrowserLogin(application,page,directory)
    else await verifyAccountForm(page,directory,profile,process.argv[4])
    assert.deepEqual(rendererErrors,[])
  } else {
  const earlySource = await readFile(
    join(root, 'src/main/services/plugin/v2/__fixtures__/earliest-source.js'),
    'utf8'
  )
  const installed = await page.evaluate(
    (code) => window.ceruQa.plugins.addPlugin(code, 'earliest-source.js'),
    earlySource.replace('https://example.invalid/one.mp3',previewUrl)
  )
  assert.ok(installed.pluginId, installed.error)
  const enabled = await page.evaluate(
    (id) => window.ceruQa.plugins.setEnabled(id, true),
    installed.pluginId
  )
  assert.equal(enabled.error, undefined)
  const entry = await page.evaluate(
    async (id) => (await window.ceruQa.plugins.contributions()).find((row) => row.pluginId === id),
    installed.pluginId
  )
  assert.equal(entry?.descriptor?.runtime, 2)
  assert.equal(entry.descriptor.providers[0]?.id, 'early')
  assert.equal(entry.enabled, true)
  const lyrics = await page.evaluate(() =>
    window.ceruQa.music.requestSdk('getLyric', {
      source: 'early',
      songInfo: { source: 'early', songmid: 'one' }
    })
  )
  assert.equal(lyrics.crlyric?.format, 'crlyric', lyrics.error)
  assert.equal(lyrics.crlyric.lines[0].text, '第一行')
  console.log(
    'Early v2 plugin installed, activated, and returned player lyrics:',
    lyrics.crlyric.lines[0].text
  )

  const sourceFixture = await readFile(
    join(root, 'src/main/services/plugin/v3/__fixtures__/source-project.js'),
    'utf8'
  )
  // v3 may only return loopback ports registered to its own service. Exercise
  // that public API instead of granting a fixture access to an arbitrary port.
  const sourceCode = sourceFixture
    .replace('permissions: []', 'permissions: [{name:"network.serve",key:"qa-serve",reason:"提供本地验收音频"}]')
    .replace('const config = await ctx.config.get();', `
      const server = await ctx.server.serve(() => {
        const bytes = new Uint8Array(${wave.length});
        bytes.set(${JSON.stringify([...wave.subarray(0,44)])});
        return new Response(bytes, {headers:{'Content-Type':'audio/wav'}});
      }, {permissionKey:'qa-serve'});
      ctx.effects.add(() => server.close());
      const config = {...await ctx.config.get(), previewUrl:server.url + '/preview.wav'};
    `)
  const v3 = await page.evaluate(
    async ({ sourceCode, previewUrl }) => {
      const { plugins, music } = window.ceruQa
      const installed = await plugins.addPlugin(sourceCode, 'source-project.js')
      if (!installed.pluginId) throw new Error(installed.error)
      await plugins.saveConfig(installed.pluginId, { previewUrl })
      await plugins.savePermissions(installed.pluginId, ['qa-serve'])
      await plugins.setEnabled(installed.pluginId, true)
      const item = (await plugins.contributions()).find(
        (row) => row.pluginId === installed.pluginId
      )
      const found = await music.requestSdk('search', {
        source: 'catalog',
        keyword: 'Morning',
        limit: 5
      })
      const songInfo = found.list[0]
      const request = { source: 'catalog', songInfo, quality: '128k', isCache: false }
      const url = await music.requestSdk('getMusicUrl', request)
      const lyrics = await music.requestSdk('getLyric', request)
      return {
        runtime: item?.descriptor?.runtime,
        title: songInfo.name,
        url,
        text: lyrics.crlyric?.lines[0]?.text
      }
    },
    { sourceCode, previewUrl }
  )
  assert.deepEqual({ ...v3, url: undefined }, {
    runtime: 3,
    title: 'Morning Light',
    url: undefined,
    text: 'Morning Light'
  })
  assert.match(v3.url,/^http:\/\/127\.0\.0\.1:\d+\/preview\.wav$/)
  console.log('v3 searched, resolved and returned timed lyrics alongside v2:', v3.title)

  const result = await application.evaluate(async ({ BrowserWindow, app, screen, ipcMain }) => {
    const assert = globalThis.runtimeTestRequire('node:assert/strict')
    const { MusicDatabase, PlaylistDatabase } = globalThis.runtimeTestRequire('./databases.cjs')
    const playlist = new PlaylistDatabase()
    const now = new Date().toISOString()
    playlist.insertPlaylist({
      id: 'upgrade-test',
      name: '升级测试歌单',
      description: '',
      coverImgUrl: '',
      source: 'local',
      meta: { preserved: true },
      createTime: now,
      updateTime: now
    })
    const songs = [1, 2].map((id) => ({
      songmid: String(id),
      name: `测试歌曲${id}`,
      singer: '测试歌手',
      albumName: '测试专辑',
      source: 'local',
      interval: '00:01',
      types: [],
      _types: {},
      typeUrl: {}
    }))
    assert.equal(playlist.appendSongs('upgrade-test', songs), 2)
    assert.equal(playlist.moveSong('upgrade-test', '2', 0), true)
    assert.deepEqual(
      playlist.listSongs('upgrade-test').map((s) => s.songmid),
      ['2', '1']
    )
    assert.equal(playlist.searchSongs('upgrade-test', '歌曲').length, 2)
    const reopened = new PlaylistDatabase()
    assert.equal(reopened.getPlaylist('upgrade-test').meta.preserved, true)
    assert.equal(reopened.countSongs('upgrade-test'), 2)
    assert.equal(reopened.removeSong('upgrade-test', '1'), true)
    reopened.deletePlaylist('upgrade-test')
    assert.equal(reopened.countSongs('upgrade-test'), 0)
    const music = new MusicDatabase()
    music.upsertTrack({
      songmid: 'runtime-test',
      path: globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'test.wav'),
      url: null,
      singer: '测试歌手',
      name: '测试歌曲',
      albumName: '',
      albumId: 0,
      source: 'local',
      interval: '00:01',
      hasCover: 0,
      coverKey: null,
      year: 2026,
      lrc: '[00:00]测试歌词',
      types: '[]',
      _types: '{}',
      typeUrl: '{}',
      bitrate: 128000,
      sampleRate: 44100,
      channels: 2,
      duration: 1,
      size: 10,
      mtime_ms: 1,
      hash: null,
      updated_at: Date.now()
    })
    music.upsertTrack({ ...music.getTrackById('runtime-test'), songmid: 'transport-test',
      name: '传输控制验收', path: globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'), 'transport.wav'),
      interval: '00:30', duration: 30, size: 44 + 88200 * 30 })
    music.setDirs(['test-music', 'test-music'])
    const reopenedMusic = new MusicDatabase()
    assert.equal(reopenedMusic.getTrackById('runtime-test').lrc, '[00:00]测试歌词')
    assert.deepEqual(reopenedMusic.getDirs(), ['test-music'])
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setAudioMuted(true)

    const win = BrowserWindow.getAllWindows().find(
      (w) => w.webContents.id === globalThis.runtimeTestMainId
    )
    function windowDecoration() {
      if (process.platform !== 'win32') return null
      const hwnd = win.getNativeWindowHandle().readBigUInt64LE().toString()
      const script = `
        Add-Type -TypeDefinition @'
        using System;
        using System.Runtime.InteropServices;
        public class WindowDecoration {
          [DllImport("dwmapi.dll")]
          public static extern int DwmGetWindowAttribute(IntPtr h, int a, out int v, int s);
          [DllImport("user32.dll", EntryPoint="GetWindowLongW")]
          public static extern int GetWindowLong(IntPtr h, int i);
        }
'@
        $corner = 0
        $result = [WindowDecoration]::DwmGetWindowAttribute([IntPtr]${hwnd}, 33, [ref]$corner, 4)
        $style = [WindowDecoration]::GetWindowLong([IntPtr]${hwnd}, -16)
        @{ corner = $corner; result = $result; thickFrame = (($style -band 0x40000) -ne 0) } | ConvertTo-Json -Compress
      `
      return JSON.parse(
        globalThis
          .runtimeTestRequire('node:child_process')
          .execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
            encoding: 'utf8',
            windowsHide: true
          })
      )
    }
    const pause = () => new Promise((resolve) => setTimeout(resolve, 200))
    async function toggle(key) {
      const event = win.isFullScreen() ? 'leave-full-screen' : 'enter-full-screen'
      const done = new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timed out: ${event}`)), 5000)
        win.once(event, () => {
          clearTimeout(timer)
          resolve()
        })
      })
      if (key) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: key })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: key })
      } else {
        ipcMain.emit('app-toggle-fullscreen-internal')
      }
      await done
      await pause()
    }
    await pause()
    const bounds = win.getBounds()
    const decoration = windowDecoration()
    if (decoration) {
      assert.equal(decoration.thickFrame, true, 'Native resizing frame must remain enabled')
      if (decoration.result === 0)
        assert.equal(decoration.corner, 2, 'Win11 rounded corners enabled')
    }
    const display = screen.getDisplayMatching(bounds)
    await toggle('F11')
    assert.equal(win.isFullScreen(), true)
    for (let attempt = 0; attempt < 10; attempt++) {
      const content = win.getContentBounds()
      if (Object.keys(display.bounds).every(key => content[key] === display.bounds[key])) break
      await pause()
    }
    assert.deepEqual(win.getContentBounds(), display.bounds)
    assert.equal(win.isAlwaysOnTop(), false)
    await toggle('ESC')
    assert.deepEqual(win.getBounds(), bounds)
    win.maximize()
    await pause()
    await toggle()
    await toggle()
    assert.equal(win.isMaximized(), true)
    win.unmaximize()
    await pause()
    for (let i = 0; i < 2; i++) {
      await toggle()
      await toggle()
    }
    assert.deepEqual(win.getBounds(), bounds)
    assert.deepEqual(windowDecoration(), decoration, 'Window decoration restored after fullscreen')
    return {
      electron: process.versions.electron,
      node: process.versions.node,
      chromium: process.versions.chrome,
      sqlite: globalThis.runtimeTestRequire('better-sqlite3/package.json').version,
      decoration,
      nativeHandle: win.getNativeWindowHandle().readBigUInt64LE().toString(),
      fullscreen: display.bounds,
      profile: app.getPath('userData')
    }
  })

  const consumerCode = await readFile(join(root,'src/main/services/plugin/v3/__fixtures__/music-consumer.js'),'utf8')
  const consumerId = await page.evaluate(async code => {
    const {plugins} = window.ceruQa
    const installed = await plugins.addPlugin(code,'music-consumer.js')
    if (!installed.pluginId) throw Error(installed.error || 'consumer not installed')
    await plugins.savePermissions(installed.pluginId,['catalog','listen','read-player','read-route','control'])
    await plugins.setEnabled(installed.pluginId,true)
    window.testMusicPlayback = []
    const play = HTMLMediaElement.prototype.play
    HTMLMediaElement.prototype.play = function(...args) {
      const media = this
      media.addEventListener('timeupdate',() => {
        if (media.currentTime > 0) window.testMusicPlayback.push(media.currentSrc)
      }, {once:false})
      return play.apply(media,args)
    }
    return installed.pluginId
  },consumerCode)
  const aggregate = action => page.evaluate(([id,action]) => window.ceruQa.plugins.openPlaylistImportMenu(id,action),[consumerId,action])
  const sources = await aggregate('sources')
  for (const [id,runtime] of [['early',2],['catalog',3],['local','host']]) assert.ok(sources.some(source => source.id === id && source.runtime === runtime),id)
  const local = await aggregate('resolve-local')
  assert.equal(local.item.title,'测试歌曲'); assert.equal(local.lyrics.lines[0].text,'测试歌词')
  assert.match(local.result.url,/^ceru-local:\/\/track\/[a-f0-9-]+$/)
  assert.ok(!JSON.stringify(local).includes('test.wav'))
  const playLocalMedia = await page.evaluate(async url => {
    const audio = new Audio(url);audio.muted=true
    try { await audio.play(); await new Promise(resolve => setTimeout(resolve,200));return audio.currentTime } finally {audio.pause()}
  },local.result.url)
  assert.ok(playLocalMedia > 0)
  const localSearch = await page.evaluate(() => window.ceruQa.music.requestSdk('search',{source:'local',keyword:'测试歌曲',limit:10,page:1}))
  assert.equal(localSearch.list[0].songmid,'runtime-test')
  assert.equal(await aggregate('play-early'),'第一首歌')
  await page.waitForFunction(url => window.testMusicPlayback.includes(url),previewUrl,{timeout:15000})
  assert.equal(await aggregate('play-local'),'测试歌曲')
  await page.waitForFunction(() => window.testMusicPlayback.some(url => /test\.wav/.test(url)),undefined,{timeout:15000})
  const waitObservations = async predicate => {
    const deadline = Date.now() + 15000
    let records
    do {
      records = await aggregate('observations')
      if (records.some(predicate)) return records
      await new Promise(resolve => setTimeout(resolve, 150))
    } while (Date.now() < deadline)
    throw Error('Plugin event not received: ' + JSON.stringify(records))
  }
  const records = await waitObservations(({event,value}) => event === 'track.finished' && value.track.title === '测试歌曲' && value.completed)
  assert.ok(records.some(({event,value}) => event === 'track.started' && value.track.title === '测试歌曲'))
  assert.ok(records.some(({event,value}) => event === 'player.progress' && value.positionMs > 0))
  const finished = records.find(({event,value}) => event === 'track.finished' && value.track.title === '测试歌曲' && value.completed).value
  assert.ok(finished.playedMs > 500 && finished.playedMs <= 1100, JSON.stringify(finished))
  assert.deepEqual(Object.keys(finished.track).sort(), ['artist','source','title'])
  console.log('Local WAV listening events verified:', finished)
  if (process.argv[3]==='--cli') await verifyPlaybackHooks(application,page,directory,process.argv[4],aggregate)
  await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id),installed.pluginId)
  const latest = await aggregate('latest'); assert.ok(latest.some(source => source.id === 'local')); assert.ok(!latest.some(source => source.id === 'early'))
  console.log('Provider-free v3 consumer searched and played v2 and local tracks; source removal observed')
  const media = await page.evaluate(async (previewUrl) => {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    const audio = new Audio()
    audio.muted = true
    audio.src = previewUrl
    try {
      await audio.play()
      await new Promise((resolve) => setTimeout(resolve, 250))
      const clipboardText = await window.ceruQa.clipboard.readText()
      return { webgl2: !!gl, playing: audio.currentTime > 0, clipboardType: typeof clipboardText }
    } finally {
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      gl?.getExtension('WEBGL_lose_context')?.loseContext()
    }
  }, v3.url)
  assert.equal(media.playing, true)
  assert.equal(media.webgl2, true)
  assert.equal(media.clipboardType, 'string')
  await page.evaluate(() => {
    localStorage.setItem('ceru_music_has_seen_first_run_notice_tips', 'true')
    window.__guide_initialized = true
    location.hash = '/home/recent'
  })
  const notice = page.getByRole('button', { name: '我已了解，开始使用' })
  if (await notice.isVisible()) await notice.click()
  const sidebar = page.locator('.sidebar .nav-section')
  const fixture = await readFile(join(root, 'src/main/services/plugin/v3/__fixtures__/sidebar-icons.js'), 'utf8')
  const fixtureId = await page.evaluate(async code => {
    const added = await window.ceruQa.plugins.addPlugin(code, 'icons.js')
    if (!added.pluginId) throw Error(added.error)
    const enabled = await window.ceruQa.plugins.setEnabled(added.pluginId, true)
    if (enabled.error) throw Error(enabled.error)
    return added.pluginId
  }, fixture)
  try {
    const icon = title => sidebar.getByRole('button', { name: title, exact: true }).locator('.sidebar-page-icon')
    const host = icon('宿主图标').locator('.tinted-icon')
    assert.match(await host.evaluate(node => getComputedStyle(node).maskImage), /data:image\/svg\+xml;base64,/)
    const custom = icon('资源图标').locator('img')
    assert.equal(await custom.evaluate(async img => { await img.decode(); return img.naturalWidth }), 16)
    for (const title of ['默认图标', '损坏图标']) await icon(title).locator('.fallback-icon').waitFor()
    console.log('Sidebar fixture ready at', await page.evaluate(() => location.hash))
    await page.waitForURL(url => url.hash === '#/home/recent')
    await sidebar.getByRole('button',{name:'本地',exact:true}).click()
    await page.waitForURL(url => url.hash === '#/home/local')
    await waitObservations(({event,value}) => event === 'route.changed' && value.from === 'recent' && value.to === 'local')
    for (const record of (await aggregate('observations')).filter(record => record.event === 'route.changed'))
      assert.deepEqual(Object.keys(record.value).sort(), ['from','to'])
    assert.equal(await sidebar.locator('button.active').innerText(), '本地')
    await page.mouse.move(0, 0)
    await verifySidebarAlignment(page, application)
    console.log('Sidebar icons passed: themed host, packaged asset, missing and undecodable icons')
  } finally {
    await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), fixtureId)
  }
  await verifyPageMounts(page)
  if (process.argv[3]) {
    await page.evaluate(async () => {
      for (const row of await window.ceruQa.plugins.contributions())
        if (row.enabled && row.descriptor.providers.length) await window.ceruQa.plugins.setEnabled(row.pluginId, false)
      await window.ceruQa.plugins.setDevMode(true)
    })
    await verifyV2Preview(application, page, directory, earlySource)
    await verifyServicePreviews(application, page, directory)
    if (process.argv[3] === '--cli') sourceWatch = await startVueWatch(process.argv[4], directory)
    const preview = sourceWatch?.file ?? join(directory, 'page-extension.js')
    const built = await readFile(sourceWatch?.file ?? resolve(process.argv[3]), 'utf8')
    if (!sourceWatch) await writeFile(preview, built)
    const { id } = await addPreviewFile(application, page, preview)
    await page.evaluate(id => window.ceruQa.plugins.savePermissions(id, ['catalog', 'listen']), id)
    const navigate=async hash=>{await page.evaluate(value=>{location.hash=value},hash)}
    const frameSelector='iframe[name^="ceru-plugin-surface-"]'
    async function inspectFrame(locator){
      await locator.waitFor({timeout:15000})
      assert.equal(await locator.getAttribute('sandbox'),'allow-scripts')
      await locator.contentFrame().locator('#plugin-root').waitFor({ state: 'visible', timeout: 15000 })
      const surface=await (await locator.elementHandle()).contentFrame()
      await surface.waitForFunction(() => document.querySelector('#plugin-root')?.shadowRoot?.mode === 'open')
      assert.ok(await surface.evaluate(() => !window.ceruQa && !window.ceruTakeDesktopBridge && !window.api && !window.electron && !window.process &&
        !window.__ceruContext && !window.__ceruRequire && !window.require && !window.__ceruStart), 'Component frames expose only the view bridge')
      return page.context().newCDPSession(surface)
    }
    async function control(client,role,name){
      const deadline=Date.now()+12000
      let nodes
      do {({nodes}=await client.send('Accessibility.getFullAXTree'));const item=nodes.find(node=>(role===null || node.role?.value===role) && (name===undefined || node.name?.value===name));if(item?.backendDOMNodeId)return item.backendDOMNodeId;await new Promise(done=>setTimeout(done,60))}while(Date.now()<deadline)
      throw Error('缺少控件 '+role+' '+name+': '+nodes.map(node=>node.name?.value).filter(Boolean).join(', ').slice(0,480))
    }
    const activate=async(client,role,name)=>{
      const backendNodeId=await control(client,role,name)
      const {object}=await client.send('DOM.resolveNode',{backendNodeId})
      try {await client.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){this.click()}'})} finally {await client.send('Runtime.releaseObject',{objectId:object.objectId})}
    }
    const searchEntry=page.getByRole('button',{name:'音源搜索',exact:true}).first()
    await searchEntry.waitFor()
    assert.match(await searchEntry.locator('.tinted-icon').evaluate(node=>getComputedStyle(node).maskImage),/data:image\/svg\+xml;base64,/)
    await searchEntry.click()
    await page.waitForURL(url=>url.hash.includes('/plugin/'+id+'/search'))
    assert.equal(await sidebar.locator('button.active').innerText(), '音源搜索')
    if (process.env.CERU_SIDEBAR_SNAPSHOT) {
      await page.mouse.move(0, 0)
      await sidebar.screenshot({ path: join(dirname(process.env.CERU_SIDEBAR_SNAPSHOT), 'sidebar-selected.png'), animations: 'disabled' })
    }
    const surfaceLocator=page.locator('.plugin-page '+frameSelector).first()
    let client=await inspectFrame(surfaceLocator)
    await control(client,'heading','音源搜索')
    await control(client,'StaticText','搜索你的第一首歌')
    const input=await control(client,'textbox')
    await client.send('DOM.focus',{backendNodeId:input});await page.keyboard.insertText('没有匹配的验收曲名')
    await page.keyboard.press('Enter');await control(client,'StaticText','没有找到歌曲')
    await client.send('DOM.focus',{backendNodeId:input});await page.keyboard.press('Control+a');await page.keyboard.insertText('测试歌曲')
    await activate(client,'button','搜索')
    await control(client,'StaticText','测试歌手');await control(client,'StaticText','本地');await control(client,'StaticText','0:01')
    const previousQueue=await aggregate('queue-state')
    await activate(client,null,'测试歌曲的操作')
    await activate(client,'button','加入队列')
    await control(client,'StaticText','加入队列：测试歌曲')
    const updatedQueue=await aggregate('queue-state')
    assert.notEqual(previousQueue.revision,updatedQueue.revision)
    assert.equal(updatedQueue.items.at(-1)?.title,'测试歌曲')
    const componentFrame=await (await surfaceLocator.elementHandle()).contentFrame()
    const originalTheme=await page.locator('html').getAttribute('data-theme')
    try {
      for (const scheme of ['dark','light']) {
        await page.evaluate(value=>document.documentElement.setAttribute('data-theme',value),scheme)
        await componentFrame.waitForFunction(value=>document.documentElement.getAttribute('theme-mode')===value,scheme,{timeout:5000})
        if(process.env.CERU_HOST_COMPONENTS_SNAPSHOT) {
          const image=process.env.CERU_HOST_COMPONENTS_SNAPSHOT
          await surfaceLocator.screenshot({path:scheme==='light'?image:join(dirname(image),'host-components-dark.png')})
        }
      }
    } finally {
      await page.evaluate(value=>value===null?document.documentElement.removeAttribute('data-theme'):document.documentElement.setAttribute('data-theme',value),originalTheme)
    }
    console.log('Component scaffold: empty search, local artist/source, queue action and host queue revision verified')
    await page.evaluate(()=>{window.testMusicPlayback.length=0})
    await activate(client,'button','测试歌曲')
    try {await page.waitForFunction(()=>window.testMusicPlayback.some(url=>/test\.wav/.test(url)),undefined,{timeout:15000})} catch(error){console.error('页面播放诊断',await page.evaluate(()=>({urls:window.testMusicPlayback.slice(-5),media:[...document.querySelectorAll('audio')].map(audio=>[audio.currentSrc,audio.paused,audio.currentTime]),alerts:[...document.querySelectorAll('[role=alert]')].map(node=>node.textContent).slice(-4)})),rendererErrors,JSON.stringify(await page.evaluate(id=>window.ceruQa.plugins.getPluginLog(id),id)).slice(-2500));throw error}
    console.log('Sidebar page played the selected local track again; media time advanced')
    const before=await surfaceLocator.getAttribute('name');await client.detach()
    const paintStart = await page.evaluate(({ before, selector }) => {
      const started = performance.now()
      window.testPreviewPaint = null
      const observe = event => {
        const frame = document.querySelector(selector)
        if (!frame || frame.name === before || !frame.getBoundingClientRect().height || event.source !== frame.contentWindow || event.data?.type !== 'active' || frame.name !== 'ceru-plugin-surface-' + event.data.generation) return
        window.removeEventListener('message', observe)
        requestAnimationFrame(() => requestAnimationFrame(() => { window.testPreviewPaint = performance.now() }))
      }
      window.addEventListener('message', observe)
      return started
    }, { before, selector: '.plugin-page ' + frameSelector })
    const reloadStart = performance.now()
    if (sourceWatch) await sourceWatch.edit()
    else await writeFile(preview,built+'\n')
    await page.waitForFunction(({selector,before})=>{const frame=document.querySelector(selector);return !!frame && frame.name!==before},{selector:'.plugin-page '+frameSelector,before},{timeout:15000})
    const frameAt = performance.now()
    const searchTitle = sourceWatch ? '重新搜索' : '搜索'
    client=await inspectFrame(surfaceLocator);await control(client,'button',searchTitle)
    await page.waitForFunction(() => window.testPreviewPaint !== null)
    const reloadMs = Math.round((await page.evaluate(() => window.testPreviewPaint)) - paintStart)
    await client.detach()
    console.log('Development ' + (sourceWatch ? 'Vue source' : 'artifact') + ' save to visible control: ' + reloadMs + 'ms')
    if (sourceWatch) {
      console.log('Source to CLI ready: ' + Math.round(sourceWatch.readyAt - reloadStart) + 'ms; source to new iframe: ' + Math.round(frameAt - reloadStart) + 'ms')
      assert.ok(reloadMs <= 1000, 'Vue source reload exceeded one second: ' + reloadMs + 'ms')
    }
    await navigate('/settings')
    await page.locator('.nav-group').getByRole('button',{name:'音源搜索',exact:true}).click()
    client=await inspectFrame(page.locator('.section-container .plugin-page '+frameSelector));await control(client,'button',searchTitle);await client.detach()
    await page.evaluate(() => {
      window.testSlotDurations = []
      window.addEventListener('message', event => {
        const frame = document.querySelector('[data-plugin-slot] iframe')
        if (frame && frame.contentWindow === event.source && event.data?.type === 'active' && frame.name === 'ceru-plugin-surface-' + event.data.generation) window.testSlotDurations.push(event.data.data?.mountMs)
      })
    })
    await navigate('/home/songlist')
    console.log('Plugin settings page rendered its search control')
    const slot=page.locator('[data-plugin-slot="playlist.header.actions"] '+frameSelector).first()
    client=await inspectFrame(slot)
    await control(client,'button','音源搜索')
    const durations = await page.evaluate(() => window.testSlotDurations)
    assert.ok(durations.some(elapsed => Number.isFinite(elapsed) && elapsed >= 0), 'Missing component mount measurement: ' + durations)
    if (sourceWatch) {
      const frame = await (await slot.elementHandle()).contentFrame()
      assert.equal(await frame.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--ceru-qa-slot').trim()), 'present')
      console.log('Declared slot received frozen props, scoped CSS and a component mount measurement:', durations)
      const initial = await slot.boundingBox()
      const name = await slot.getAttribute('name')
      const opener = await control(client, 'button', '歌曲详情')
      const shell = page.locator('.component-overlay-shell')
      for (const count of [1,2]) {
        await client.send('DOM.focus', {backendNodeId:opener})
        await page.keyboard.press('Enter')
        await shell.waitFor({timeout:8000})
        assert.equal(await shell.locator('iframe').getAttribute('name'),name)
        const dialog = frame.locator('.t-dialog').filter({visible:true})
        await dialog.getByText('打开次数 '+count).waitFor()
        await dialog.evaluate(async el => {
          await new Promise(done => requestAnimationFrame(() => requestAnimationFrame(done)))
          const animations = el.getAnimations({subtree:true}).filter(item => Number.isFinite(item.effect?.getComputedTiming().endTime))
          await Promise.allSettled(animations.map(item=>item.finished))
        })
        const rect = await dialog.boundingBox(), outer = await shell.boundingBox()
        console.log('Slot overlay geometry:', {count, initial, rect, outer, frame:await shell.locator('iframe').boundingBox(), viewport:await frame.evaluate(()=>({width:innerWidth,height:innerHeight}))})
        assert.ok(rect.width > initial.width * 2 && rect.height > initial.height && rect.x >= outer.x && rect.x+rect.width <= outer.x+outer.width+1)
        assert.ok(outer.y >= 48 && rect.y >= outer.y && rect.y+rect.height <= outer.y+outer.height+1)
        if(count===1) await page.keyboard.press('Escape'); else await shell.getByRole('button',{name:'关闭插件弹层'}).click()
        await shell.waitFor({state:'detached',timeout:8000})
        await slot.waitFor()
        assert.equal(await slot.getAttribute('name'),name)
        await dialog.waitFor({state:'hidden',timeout:4000})
        const after = await control(client,'button','歌曲详情')
        assert.equal(after,opener)
        const {object}=await client.send('DOM.resolveNode',{backendNodeId:opener})
        try { assert.equal((await client.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:'function(){return this.getRootNode().activeElement===this}',returnByValue:true})).result.value,true) } finally { await client.send('Runtime.releaseObject',{objectId:object.objectId}) }
      }
      console.log('Slot dialog escaped its 144×42 container, kept Vue state, and restored keyboard focus twice')
    }
    await activate(client,'button','音源搜索');await client.detach()
    const previewDrawer=page.locator('.plugin-web-drawer.t-drawer--open')
    await previewDrawer.locator('iframe').waitFor({timeout:12000})
    await previewDrawer.locator('.t-drawer__close-btn, .t-drawer__close').filter({visible:true}).first().click()
    await previewDrawer.waitFor({state:'hidden'})
    await navigate('/settings?category=plugins')
    await page.getByRole('button',{name:'管理设置',exact:true}).click()
    const settingsDialog=page.getByRole('dialog',{name:'插件管理设置'})
    await settingsDialog.getByRole('switch',{name:'插件严格模式'}).click();await page.waitForFunction(()=>window.ceruQa.plugins.strictMode())
    await settingsDialog.getByRole('button',{name:'关闭插件管理设置'}).click();await settingsDialog.waitFor({state:'detached'})
    await navigate('/home/songlist');await page.locator('.page-header .header-actions').waitFor();assert.equal(await slot.count(),0)
    await page.getByRole('button',{name:'音源搜索',exact:true}).first().click();client=await inspectFrame(surfaceLocator);await client.detach()
    await page.evaluate(async file=>{await window.ceruQa.plugins.removeDevFile(file);await window.ceruQa.plugins.setDevMode(false)},preview)
    if (!sourceWatch) assert.equal(await readFile(preview,'utf8'),built+'\n')
    console.log('Development template: sidebar search and local playback, settings page, slot opens drawer, hot reload and strict mode passed')
  }
  await verifyRouter(page,profile)
  if (process.argv[3] === '--cli') { await verifyAccountForm(page,directory,profile,process.argv[4]); await verifyAccountQr(page); await verifyAccountOAuth(application,page,directory); await verifyBrowserLogin(application,page,directory) }
  assert.deepEqual(rendererErrors, [])
  // A rejected async read must still take the IPC handler's empty-string fallback.
  await application.evaluate(({ clipboard }) => {
    globalThis.runtimeTestReadText = clipboard.readText
    clipboard.readText = async () => {
      throw new Error('Simulated clipboard failure')
    }
  })
  try {
    assert.equal(await page.evaluate(() => window.ceruQa.clipboard.readText()), '')
  } finally {
    await application.evaluate(({ clipboard }) => {
      clipboard.readText = globalThis.runtimeTestReadText
    })
  }
  console.log(JSON.stringify({ ...result, ...media, rendererErrors }, null, 2))
  }
} finally {
  if (sourceWatch) await sourceWatch.stop()
  if (application) {
    await application.evaluate(({ app }) => app.exit(0)).catch(() => {})
    await application.close().catch(() => {})
  }
  server.closeAllConnections()
  if (server.listening) await new Promise((resolve) => server.close(resolve))
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 })
}
