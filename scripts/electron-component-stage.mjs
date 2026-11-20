import assert from 'node:assert/strict'
import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Exercise the real shared-renderer path; inspect only attributes written by the
// fixture itself, without opening or changing the production closed ShadowRoot.
export async function verifyComponentStage(application, page, directory) {
  page.setDefaultTimeout(15000)
  const names = ['lyrics', 'stage', 'desktopLyric']
  const manifest = {
    manifestVersion: 3, id: 'test.component-stage', name: '共享舞台验收', version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: { logic: { module: 'main' }, views: names.map(id => ({ id, kind: 'component', module: 'view.' + id })) },
    ui: {
      regions: names.map(view => ({ view, region: view === 'desktopLyric' ? view : 'player.' + view })),
      skins: [{ id: 'base', title: '共享舞台底层', regions: ['player.lyrics'] }]
    }
  }
  const factory = `function(deps) {
    const entry = bridge => {
      const region = bridge.region, host = bridge.root.host;
      const update = () => {
        host.dataset.track = region.props.track?.title || '';
        host.dataset.lines = (region.props.lines || []).map(line => line.text).join('|');
        host.dataset.current = region.props.current?.text || '';
        host.dataset.next = region.props.next?.text || '';
        host.dataset.locked = String(region.props.locked?.value || false);
        host.dataset.size = region.size.value.width + 'x' + region.size.value.height;
        host.dataset.simulation = [region.props.track?.title,
          region.props.lines?.[0]?.words?.length || 0,
          !!region.props.lines?.some(line => line.isDuet), region.props.palette?.background,
          region.props.playing.value, Math.round(region.props.currentTime.value)].join('|');
      };
      const View = deps.vue.defineComponent({setup() {
        deps.vue.watchEffect(update);
        deps.sdk.useFrame(() => {
          host.dataset.frames = String(Number(host.dataset.frames || 0) + 1);
          if (region.props.spectrum) host.dataset.peak = String(Math.max(...region.props.spectrum));
        });
        return () => deps.vue.h('div', {style: {height: '100%', background: '#283b35'}}, region.name);
      }});
      return deps.sdk.mountComponent(View, bridge);
    };
    entry.onEnter = ({root, reason}) => {
      root.host.dataset.enter = reason;
      if (reason === 'track') root.host.dataset.enters = String(Number(root.host.dataset.enters || 0) + 1);
    };
    entry.onLeave = ({root, reason, signal}) => {
      if (reason === 'track') {
        root.host.dataset.leaves = String(Number(root.host.dataset.leaves || 0) + 1);
        if (root.host.dataset.hang === 'true') return new Promise(resolve => {
          const began = performance.now();
          signal.addEventListener('abort', () => {root.host.dataset.abortMs = String(performance.now() - began); resolve()}, {once:true});
        });
      } else {
        root.host.dataset.leaveConnected = String(root.host.isConnected);
        return new Promise(resolve => setTimeout(resolve, 80));
      }
    };
    return entry;
  }`
  const code = 'exports.manifest=' + JSON.stringify(manifest) + ';exports.activate=()=>{};exports.modules={' +
    names.map(name => JSON.stringify('view.' + name) + ':' + factory).join(',') + '};'
  const installed = await page.evaluate(code => window.ceruQa.plugins.addPlugin(code, 'component-stage.js'), code)
  assert.ok(installed.pluginId, installed.error)
  const id = installed.pluginId
  let lyricWindow
  const root = (name, target = page) => target.locator('.plugin-' + name + ' .component-root')
  const trigger = page.getByRole('button', { name: '播放器个性化', exact: true })
  const panel = page.locator('.settings-panel')
  const openPanel = async () => {
    if (!await panel.isVisible()) await trigger.press('Enter')
    await panel.waitFor({ state: 'visible' })
    const summary = panel.getByText('按区域选择', { exact: true })
    if (!await summary.evaluate(element => element.parentElement.open)) await summary.press('Enter')
  }
  const closePanel = async () => {
    if (await panel.isVisible()) {
      await panel.getByRole('button', { name: '关闭个性化面板' }).press('Escape')
      await panel.waitFor({ state: 'hidden' })
    }
  }
  const choose = async (label, view) => {
    await openPanel()
    await panel.getByRole('combobox', { name: label, exact: true }).selectOption(
      view === 'default' ? 'default' : { label: '共享舞台验收 · ' + view }
    )
    await closePanel()
  }
  const focusMain = () => application.evaluate(({ webContents }) => webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow().focus())
  const media = () => page.evaluate(() => {
    const audio = [...document.querySelectorAll('audio')].find(item => item.currentSrc.includes('transport.wav'))
    return { time: audio.currentTime, paused: audio.paused, src: audio.currentSrc }
  })
  await writeFile(join(directory, 'profile', 'transport.lrc'), '[00:00.00]第一行\n[00:10.00]第二行\n')
  await application.evaluate(({ app, BrowserWindow }) => {
    const { MusicDatabase } = globalThis.runtimeTestRequire('./databases.cjs')
    new MusicDatabase().upsertTrack({ songmid:'stage-qa', path:globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'transport.wav'), url:null, singer:'QA', name:'舞台验收', albumName:'舞台专辑', albumId:0, source:'local', interval:'01:30', hasCover:0, coverKey:null, year:2026, lrc:'[00:00.00]第一行\n[00:10.00]第二行', types:'[]', _types:'{}', typeUrl:'{}', bitrate:705600, sampleRate:44100, channels:1, duration:90, size:7938044, mtime_ms:1, hash:null, updated_at:Date.now() })
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setAudioMuted(true)
  })
  const probePreload = join(directory, 'stage-mode-probe.cjs')
  const entryUrl = new URL(page.url())
  entryUrl.hash = entryUrl.search = ''
  await writeFile(probePreload, `const {contextBridge,ipcRenderer}=require('electron');
    if(process.isMainFrame && location.href.split(/[?#]/)[0]===${JSON.stringify(entryUrl.href)})
      contextBridge.exposeInMainWorld('ceruRegionProbe',{mode:value=>ipcRenderer.invoke('plugin:strict-mode',value)});`)
  await application.evaluate(({ session }, filePath) => session.defaultSession.registerPreloadScript({type:'frame',filePath}), probePreload)
  await application.evaluate(({ app }) => {
    globalThis.qaStagePreloadErrors = []
    app.on('web-contents-created', (_event, contents) => contents.on('preload-error', (_event, filePath, error) => globalThis.qaStagePreloadErrors.push({ filePath, error: String(error) })))
  })
  try {
    assert.equal((await page.evaluate(id => window.ceruQa.plugins.setEnabled(id, true), id)).error, undefined)
    await page.reload({ waitUntil: 'domcontentloaded' })
    console.log('Mode probe in primary document:', await page.evaluate(() => typeof window.ceruRegionProbe))
    await page.getByText('舞台验收', { exact: true }).first().waitFor()
    await page.waitForFunction(() => window.musicEmitter?.all?.get('replacePlaylist')?.length > 0)
    await page.getByRole('button', { name: '播放全部' }).click()
    await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(audio => audio.currentSrc.includes('transport.wav') && !audio.paused))
    await page.locator('.player-container').dispatchEvent('click')
    await trigger.press('Enter')
    await panel.getByRole('button', { name: '共享舞台底层', exact: true }).click()
    await closePanel()
    await root('lyrics').waitFor()
    await choose('全屏舞台区域', 'stage')
    await root('stage').waitFor()
    await root('lyrics').waitFor({ state: 'detached' })
    assert.equal(await page.locator('.full-play.active iframe').count(), 0)
    await page.waitForFunction(() => Number(document.querySelector('.plugin-stage .component-root')?.dataset.peak) > 0)
    assert.equal(await root('stage').getAttribute('data-track'), '舞台验收')
    assert.equal(await root('stage').getAttribute('data-lines'), '第一行|第二行')
    assert.equal(await root('stage').evaluate(host => host.shadowRoot), null)
    const stageId = await page.locator('.plugin-stage').getAttribute('data-component-instance')
    console.log('Shared stage mounted with real lyrics, track and spectrum; child regions suppressed.')

    // Simulator changes must reach the existing stage instance and must never
    // seek or resume the real audio element.
    assert.equal(await page.getByRole('button', { name: '皮肤模拟器', exact: true }).count(), 0)
    await page.evaluate(() => [...document.querySelectorAll('audio')].find(audio => audio.currentSrc.includes('transport.wav')).pause())
    const original = await media()
    await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
    await page.getByRole('button', { name: '皮肤模拟器', exact: true }).click()
    const expectSimulation = pattern => page.waitForFunction(pattern => new RegExp(pattern).test(document.querySelector('.plugin-stage .component-root')?.dataset.simulation || ''), pattern)
    await expectSimulation('^晚风[|]5[|]false[|]#202524[|]false[|]0$')
    await root('stage').evaluate(host => { host.dataset.hang = 'true' })
    await page.getByLabel('测试曲目').selectOption('duet')
    await expectSimulation('^隔岸[|]6[|]true[|]#202524')
    await page.waitForFunction(() => Number(document.querySelector('.plugin-stage .component-root')?.dataset.abortMs) >= 550)
    const abortMs = Number(await root('stage').getAttribute('data-abort-ms'))
    assert.ok(abortMs < 1000, 'Stage transition did not respect its deadline: ' + abortMs)
    await root('stage').evaluate(host => { delete host.dataset.hang })
    await page.getByRole('slider', { name: '预览时间轴' }).fill('5500')
    await page.getByRole('button', { name: '浅色预览', exact: true }).click()
    await expectSimulation('[|]#f3f5f2[|]false[|]5500$')
    await page.getByRole('button', { name: '播放预览', exact: true }).click()
    await expectSimulation('[|]true[|][6-9][0-9]{3}$')
    await page.getByRole('button', { name: '暂停预览', exact: true }).click()
    await expectSimulation('[|]false[|][6-9][0-9]{3}$')
    await page.waitForFunction(() => parseFloat(document.querySelector('.skin-simulator output')?.textContent) > 0)
    await page.getByLabel('测试曲目').selectOption('empty')
    await expectSimulation('^余晖[|]0[|]false[|]#f3f5f2[|]false[|]0$')
    await page.evaluate(() => window.ceruQa.plugins.setDevMode(false))
    await page.getByRole('button', { name: '皮肤模拟器', exact: true }).waitFor({ state: 'detached' })
    await expectSimulation('^舞台验收[|]')
    assert.deepEqual(await media(), original)
    assert.equal(await page.locator('.plugin-stage').getAttribute('data-component-instance'), stageId)
    console.log('Shared stage simulator and bounded transition passed; real audio and instance unchanged.')

    // The real native blur pauses the stage's shared frame subscription.
    const cdp = await page.context().newCDPSession(page)
    try {
      await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: false })
      await application.evaluate(({ webContents }) => webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow().blur())
      await page.waitForFunction(() => !document.hasFocus())
      const frames = await root('stage').getAttribute('data-frames')
      await page.waitForTimeout(200)
      assert.equal(await root('stage').getAttribute('data-frames'), frames)
      await focusMain()
      await page.waitForFunction(frames => Number(document.querySelector('.plugin-stage .component-root')?.dataset.frames) > Number(frames), frames)
    } finally { await cdp.send('Emulation.setFocusEmulationEnabled', { enabled: true }); await cdp.detach() }
    const beforeSize = await root('stage').getAttribute('data-size')
    await application.evaluate(({ webContents }) => {
      const window = webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow()
      globalThis.qaStageBounds = window.getBounds()
      window.setBounds({ ...globalThis.qaStageBounds, width: globalThis.qaStageBounds.width + 100 })
    })
    await page.waitForFunction(before => document.querySelector('.plugin-stage .component-root')?.dataset.size !== before, beforeSize)
    await application.evaluate(({ webContents }) => webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow().setBounds(globalThis.qaStageBounds))

    const stage = await root('stage').elementHandle()
    await choose('全屏舞台区域', 'default')
    await root('stage').waitFor({ state: 'detached' })
    assert.equal(await stage.getAttribute('data-leave-connected'), 'true')
    await stage.dispose()
    await root('lyrics').waitFor()
    await choose('全屏舞台区域', 'stage')
    await root('stage').waitFor()
    await page.locator('.full-play.active .putawayscreen-btn').click()
    await page.locator('.full-play.active').waitFor({ state: 'detached' })
    await page.locator('.player-container').dispatchEvent('click')
    await root('stage').waitFor()

    // Selection persists across a renderer reload, including the underlying
    // lyric choice which the stage temporarily replaces.
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.getByText('舞台验收', { exact: true }).first().waitFor()
    await page.waitForFunction(() => window.musicEmitter?.all?.get('replacePlaylist')?.length > 0)
    await page.getByRole('button', { name: '播放全部' }).click()
    await page.locator('.player-container').dispatchEvent('click')
    await root('stage').waitFor()
    await choose('全屏舞台区域', 'default')
    await root('lyrics').waitFor()
    await choose('桌面歌词区域', 'desktopLyric')
    console.log('Stage resize, focus, exit, restored children and persisted selection passed.')
    await page.locator('.control-btn.lyric-btn').dispatchEvent('click')
    for (let attempt = 0; attempt < 100 && !lyricWindow; attempt++) {
      lyricWindow = application.windows().find(window => window !== page && URL.canParse(window.url()) && new URL(window.url()).hash === '#/desktop-lyric')
      if (!lyricWindow) await page.waitForTimeout(100)
    }
    assert.ok(lyricWindow, 'Desktop lyric window did not open')
    lyricWindow.setDefaultTimeout(15000)
    lyricWindow.on('pageerror', error => console.error('Desktop lyric error:', error.stack))
    lyricWindow.on('console', message => { if (message.type() === 'error') console.error('Desktop lyric console:', message.text().slice(0, 1500)) })
    // The app creates this hidden window during startup, before our probe was
    // registered. A real reload applies the test preload and also exercises
    // restoration of its selected plugin view.
    await lyricWindow.reload({ waitUntil: 'domcontentloaded' })
    await lyricWindow.waitForFunction(() => !!window.ceruRegionProbe)
    assert.equal(await lyricWindow.evaluate(() => window.ceruRegionProbe.mode()), false)
    assert.match(await lyricWindow.evaluate(() => window.ceruRegionProbe.mode(true).then(() => '', error => String(error))), /只有澜音主界面/)
    assert.equal(await lyricWindow.evaluate(() => window.ceruRegionProbe.mode()), false)
    console.log('Desktop policy read allowed, policy mutation rejected, selected mode unchanged.')
    const desktop = root('desktop-lyric', lyricWindow)
    await desktop.waitFor()
    await focusMain()
    await page.getByRole('slider', { name: '播放进度', exact: true }).press('Home')
    await lyricWindow.waitForFunction(() => {
      const host = document.querySelector('.plugin-desktop-lyric .component-root')
      return host?.dataset.track === '舞台验收' && host.dataset.current === '第一行' && host.dataset.next === '第二行'
    })
    assert.equal(await lyricWindow.locator('.plugin-desktop-lyric iframe').count(), 0)
    assert.equal(await desktop.evaluate(host => host.shadowRoot), null)
    await page.getByRole('slider', { name: '播放进度', exact: true }).press('ArrowRight')
    await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(audio => audio.currentSrc.includes('transport.wav') && audio.currentTime >= 5))
    await page.getByRole('slider', { name: '播放进度', exact: true }).press('ArrowRight')
    await lyricWindow.waitForFunction(() => document.querySelector('.plugin-desktop-lyric .component-root')?.dataset.current === '第二行')
    await page.getByRole('slider', { name: '播放进度', exact: true }).press('Home')
    await lyricWindow.waitForFunction(() => document.querySelector('.plugin-desktop-lyric .component-root')?.dataset.current === '第一行')
    await lyricWindow.locator('.lock-btn').click()
    await lyricWindow.waitForFunction(() => document.querySelector('.plugin-desktop-lyric .component-root')?.dataset.locked === 'true')
    const counts = () => desktop.evaluate(host => [Number(host.dataset.leaves || 0), Number(host.dataset.enters || 0)])
    const initial = await counts()
    const snapshot = (revision, name) => application.evaluate(({ BrowserWindow }, data) => {
      BrowserWindow.getAllWindows().find(window => window.webContents.getURL().endsWith('#/desktop-lyric')).webContents.send('play-song-change', data)
    }, { revision, name, artist: 'QA' })
    await snapshot(9001, '舞台验收')
    await lyricWindow.waitForFunction(enters => Number(document.querySelector('.plugin-desktop-lyric .component-root')?.dataset.enters) === enters + 1, initial[1])
    assert.deepEqual(await counts(), initial.map(count => count + 1))
    await snapshot(9001, '同一曲目改名')
    await lyricWindow.waitForFunction(() => document.querySelector('.plugin-desktop-lyric .component-root')?.dataset.track === '同一曲目改名')
    assert.deepEqual(await counts(), initial.map(count => count + 1))

    await focusMain()
    await choose('全屏舞台区域', 'stage')
    await root('stage').waitFor()
    const disabled = await root('stage').elementHandle()
    assert.equal((await page.evaluate(id => window.ceruQa.plugins.setEnabled(id, false), id)).error, undefined)
    await root('stage').waitFor({ state: 'detached' })
    assert.equal(await disabled.getAttribute('data-leave-connected'), null, 'Disabling a plugin called its leave hook')
    await disabled.dispose()
    await desktop.waitFor({ state: 'detached' })
    await lyricWindow.locator('.lyric-container').waitFor({ state: 'visible' })
    await page.waitForFunction(() => !document.querySelector('.full-play.active .plugin-component-surface'))
    assert.equal((await media()).paused, false)
    console.log(JSON.stringify({ directStage:true, simulator:true, realPlaybackUnaffected:true, retainedSimulatorSession:true, transitionTimeoutMs:Math.round(abortMs), focusPause:true, resize:true, childSelectionsRestored:true, hostExit:true, persistedStage:true, directDesktopLyrics:true, desktopModeReadOnly:true, desktopSeekUpdates:true, lockState:true, trackRevisionTransitions:true, disableSkipsLeave:true, defaultsRestored:true }))
  } catch (error) {
    console.error('Mode probe diagnostics:', await application.evaluate(({ BrowserWindow, session }) => ({ errors: globalThis.qaStagePreloadErrors, windows:BrowserWindow.getAllWindows().map(window => ({ url:window.webContents.getURL(), defaultSession:window.webContents.session === session.defaultSession, preload:window.webContents.getLastWebPreferences().preload, scripts:window.webContents.session.getPreloadScripts() })) })))
    console.error('Shared stage diagnostic:', await page.locator('.health-list,.health-summary').allTextContents(), await root('stage').evaluateAll(nodes => nodes.map(node => ({ ...node.dataset }))))
    console.error('Playback diagnostic:', await page.evaluate(() => ({ text:document.body.innerText.slice(-1800), audio:[...document.querySelectorAll('audio')].map(audio => ({ src:audio.currentSrc, paused:audio.paused, time:audio.currentTime, error:audio.error?.message })) })))
    if (lyricWindow) console.error('Desktop lyric diagnostic:', await lyricWindow.evaluate(() => ({ text:document.body.innerText, roots:[...document.querySelectorAll('.component-root')].map(node => ({ ...node.dataset })) })))
    throw error
  } finally {
    await page.evaluate(() => window.ceruQa.plugins.setDevMode(false))
    await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), id)
  }
}
