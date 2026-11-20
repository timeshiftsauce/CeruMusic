import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { addPreviewFile } from './electron-dev-preview.mjs'
import { verifyManagerMotion } from './electron-manager-motion.mjs'

export async function verifyPlaybackHooks(application, page, directory, toolchain, action) {
  const project = join(directory, 'playback-hook'),
    bin = resolve(toolchain, 'packages/cli/dist/bin.js')
  const cli = (args) => promisify(execFile)(process.execPath, [bin, ...args], { windowsHide: true })
  async function capture(name) {
    if (!process.env.CERU_MANAGER_SNAPSHOT_DIR) return
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)))
    )
    const png = await application.evaluate(async ({ webContents }) =>
      (await webContents.fromId(globalThis.runtimeTestMainId).capturePage())
        .toPNG()
        .toString('base64')
    )
    await writeFile(join(process.env.CERU_MANAGER_SNAPSHOT_DIR, name), Buffer.from(png, 'base64'))
  }
  await cli(['init', project, '--template', 'playback-hook', '--lang', 'js'])
  const cases = JSON.parse(await readFile(join(project,'tests/hooks.json'),'utf8'))
  assert.ok(cases.length >= 14)
  const lines = (await cli(['test-hooks', '--project', project])).stdout.trim().split(/\r?\n/)
  assert.deepEqual(lines.filter(line => line.startsWith('PASS ')), cases.map(row => 'PASS '+row.name))
  assert.ok(lines.some(line => line.startsWith(cases.length+' hook scenarios passed ')))
  const path = join(project, 'src/index.js'),
    code = await readFile(path, 'utf8')
  assert.ok(code.includes('[拦截示例]') && code.includes('[优先示例]'))
  await writeFile(path, code.replace('[拦截示例]', '测试歌曲').replace('[优先示例]', '第一首歌')
    .replace("    if (op.input.tracks.some(track => track.title.startsWith('[保护示例]'))) op.preventDefault()", '    op.preventDefault()')
    .replace("ctx.hooks.on('player.play'", "ctx.hooks.on('player.setMode', op => { if(op.input.mode === 'single') op.preventDefault(); else if(op.input.mode === 'random') return {mode:'single'} }); ctx.hooks.on('player.seek', () => ({positionMs:9000})); ctx.hooks.on('player.setVolume', op => {if(op.input.volume < 0.2) op.preventDefault(); else return {volume:0.22}}); for (const name of ['player.pause','player.resume','player.next','player.previous','queue.clear']) ctx.hooks.on(name, op => op.preventDefault());\n  ctx.hooks.on('player.play'"))
  await cli(['build', '--project', project])
  const file = join(project, 'dist/plugin.js')
  await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
  const entry = await addPreviewFile(application, page, file)
  try {
    await action('play-early')
    const original = await action('playing')
    assert.equal(original.track?.title, '第一首歌')
    const unchanged = await action('enqueue-end')
    assert.equal(unchanged.at(-1), '第一首歌')
    assert.ok(unchanged.includes('测试歌曲'))
    await page.evaluate((id) => window.ceruQa.plugins.savePermissions(id, ['intercept']), entry.id)
    await page.waitForFunction(async () =>
      (await window.ceruQa.plugins.hookSnapshot()).names.includes('player.play')
    )
    await action('play-local')
    const blocked = await action('playing')
    assert.deepEqual(blocked.track.ref, original.track.ref)
    const next = await action('enqueue-end')
    assert.equal(next[0], '第一首歌')
    assert.equal(next.filter((name) => name === '第一首歌').length, 1)
    const controls = await page.evaluate(() => window.ceruQa.plugins.hookControls())
    assert.ok(
      controls.activity.some(
        (row) =>
          row.pluginId === 'local.playback-hook' &&
          row.name === 'player.play' &&
          row.action === 'cancel' &&
          row.source === 'plugin'
      )
    )
    assert.ok(controls.activity.some((row) => row.name === 'queue.add' && row.action === 'rewrite'))
    await page.evaluate(() => {
      location.hash = '/settings?category=plugins'
    })
    const settings = page.getByRole('button', { name: '管理设置', exact: true })
    const dialog = page.getByRole('dialog', { name: '插件管理设置' })
    const list = page.getByRole('region', { name: '已安装的插件' })
    await list.locator('.plugin-item').first().waitFor()
    const viewport = await list.evaluate((el) => {
      const rect = el.getBoundingClientRect(),
        card = el.firstElementChild.getBoundingClientRect()
      return {
        width: innerWidth,
        height: innerHeight,
        listHeight: rect.height,
        top: rect.top,
        bottom: rect.bottom,
        cardBottom: card.bottom,
        cardTop: card.top
      }
    })
    assert.ok(
      viewport.listHeight >= viewport.height / 3 &&
        viewport.cardTop >= viewport.top - 1 &&
        viewport.cardBottom <= Math.min(viewport.bottom, viewport.height) + 1,
      JSON.stringify(viewport)
    )
    assert.equal(await dialog.count(), 0)
    await settings.locator('svg').waitFor()
    await page.evaluate(() => document.fonts.ready.then(() => true))
    await capture('plugin-manager.png')
    await settings.click()
    await dialog.waitFor()
    const preview = dialog.locator('.preview-entry').filter({ hasText: 'playback-hook' })
    const pathSummary = preview.locator('summary')
    await pathSummary.focus()
    await pathSummary.press('Enter')
    assert.equal(await preview.locator('code:visible').innerText(), file)
    assert.ok(
      await dialog.evaluate(
        (el) =>
          el.scrollWidth <= el.clientWidth &&
          Array.from(el.querySelectorAll('section, article, code')).every(
            (child) => child.getBoundingClientRect().right <= el.getBoundingClientRect().right
          )
      )
    )
    await pathSummary.press('Enter')
    await capture('plugin-manager-settings.png')
    const swapZoom = (factor) =>
      application.evaluate(({ webContents }, value) => {
        const main = webContents.fromId(globalThis.runtimeTestMainId),
          before = main.getZoomFactor()
        main.setZoomFactor(value)
        return before
      }, factor)
    const originalTheme = await page.locator('html').getAttribute('data-theme')
    const originalZoom = await swapZoom(1.25)
    try {
      const light = await dialog.evaluate((el) => {
        document.documentElement.dataset.theme = 'light'
        return getComputedStyle(el).backgroundColor
      })
      const dark = await dialog.evaluate((el) => {
        document.documentElement.dataset.theme = 'dark'
        return getComputedStyle(el).backgroundColor
      })
      assert.notEqual(dark, light)
      assert.ok(
        await dialog.evaluate(
          (el) =>
            el.scrollWidth === el.clientWidth && el.getBoundingClientRect().right <= innerWidth
        )
      )
      await capture('plugin-manager-dark-125.png')
    } finally {
      await page.evaluate((theme) => {
        if (theme) document.documentElement.dataset.theme = theme
        else delete document.documentElement.dataset.theme
      }, originalTheme)
      await swapZoom(originalZoom)
    }
    console.log('Plugin manager viewport:', JSON.stringify(viewport))
    const toggle = dialog.getByRole('switch', { name: '暂停所有插件拦截' })
    await toggle.press('Space')
    await page.waitForFunction(async () => (await window.ceruQa.plugins.hookControls()).paused)
    assert.deepEqual((await page.evaluate(() => window.ceruQa.plugins.hookSnapshot())).names, [])
    await toggle.click()
    await page.waitForFunction(async () =>
      (await window.ceruQa.plugins.hookSnapshot()).names.includes('queue.add')
    )
    await page.keyboard.press('Escape')
    await dialog.waitFor({ state: 'detached' })
    assert.ok(await settings.evaluate((el) => el === document.activeElement))
    const hookCard = list
      .locator('.plugin-item')
      .filter({ has: page.getByRole('heading', { name: 'playback-hook', exact: true }) })
    await hookCard.getByRole('button', { name: '权限', exact: true }).click()
    const activity = page.locator('details.activity').filter({ hasText: '此插件的拦截活动' })
    await activity.locator('summary').click()
    await activity.getByText('取消点播', { exact: true }).first().waitFor()
    await activity.getByText('改写入队', { exact: true }).first().waitFor()
    const displayedRows = await activity.locator('li').allInnerTexts()
    for (const label of ['取消点播', '改写入队']) {
      assert.ok(displayedRows.some(row => row.includes(label) && row.includes('来源：插件')), JSON.stringify(displayedRows))
    }
    const ledger = (await page.evaluate(() => window.ceruQa.plugins.hookControls())).activity.filter(row => row.pluginId === 'local.playback-hook')
    const operationLabels = { 'player.play': '点播', 'queue.add': '入队', 'player.next': '下一首', 'player.previous': '上一首', 'player.resume': '继续播放', 'player.pause': '暂停', 'player.seek': '跳转进度', 'player.setVolume': '调节音量' }
    const sourceLabels = { plugin: '插件', system: '系统', ui: '界面' }
    for (const text of displayedRows) assert.ok(ledger.some(row => text.startsWith((row.action === 'cancel' ? '取消' : '改写') + operationLabels[row.name]) && text.includes('来源：' + sourceLabels[row.source])), text)
    await page
      .getByRole('button', { name: '取消', exact: true })
      .filter({ visible: true })
      .last()
      .click()
    await activity.waitFor({ state: 'detached' })
    await verifyManagerMotion(page)
    await page.evaluate(() => {
      location.hash = '/home/local'
    })
    await page.evaluate((id) => window.ceruQa.plugins.savePermissions(id, []), entry.id)
    await page.waitForFunction(async () => !(await window.ceruQa.plugins.hookSnapshot()).names.length)
    await action('play-local')
    const resumed = await action('playing')
    assert.equal(resumed.track?.title, '测试歌曲')
    const grants = async (enabled) => {
      await page.evaluate(([id, enabled]) => window.ceruQa.plugins.savePermissions(id, enabled ? ['intercept'] : []), [entry.id, enabled])
      await page.waitForFunction(async enabled => (await window.ceruQa.plugins.hookSnapshot()).names.includes('player.pause') === enabled, enabled)
    }
    await action('long-play')
    const advancing = after => page.waitForFunction(after => Array.from(document.querySelectorAll('audio')).some(audio => audio.currentSrc.includes('transport.wav') && !audio.paused && audio.currentTime > after), after, {timeout: 10000})
    const position = () => page.evaluate(() => Array.from(document.querySelectorAll('audio')).find(audio => audio.currentSrc.includes('transport.wav')).currentTime)
    await advancing(0.1)
    await grants(true)
    await action('pause')
    await advancing((await position()) + 0.25)
    await grants(false)
    await action('pause')
    await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).some(audio => audio.currentSrc.includes('transport.wav') && audio.paused))
    await grants(true)
    const mediaVolume = () => page.evaluate(() => Array.from(document.querySelectorAll('audio')).find(audio => audio.currentSrc.includes('transport.wav')).volume)
    await action('seek-four')
    await action('volume-high')
    assert.equal(await position(), 9)
    assert.equal(await mediaVolume(), 0.22)
    const bar = page.getByRole('slider', {name:'播放进度'})
    const box = await bar.boundingBox()
    assert.ok(box && box.width > 50)
    const horizontal = Math.floor(box.width / 2)
    const coveringDialog = await bar.evaluate(el => {
      const rect = el.getBoundingClientRect(), hit = document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2)
      return hit?.closest('.t-dialog__position')?.innerText
    })
    if (coveringDialog?.includes('欢迎使用 Ceru Music')) {
      const acknowledge = page.getByRole('button', {name:'我已了解，开始使用',exact:true})
      await acknowledge.click()
      await acknowledge.waitFor({state:'hidden'})
      const skipGuide = page.locator('.t-guide__skip:visible')
      await skipGuide.click()
      await skipGuide.waitFor({state:'hidden'})
    } else if (coveringDialog) throw Error('Progress slider covered by desktop dialog: ' + coveringDialog)
    await bar.click({position:{x:horizontal,y:Math.max(1,Math.floor(box.height / 2))}})
    const undo = page.getByRole('button', {name:'撤销本次',exact:true})
    await undo.last().waitFor()
    assert.equal(await position(), 9)
    await undo.last().click()
    assert.ok(Math.abs((await position()) - 30 * horizontal / box.width) < 0.15)
    const fromBar = (await page.evaluate(() => window.ceruQa.plugins.hookControls())).activity.filter(row => row.name === 'player.seek' && row.source === 'ui')
    assert.equal(fromBar.length, 1)
    await action('volume-low')
    assert.equal(await mediaVolume(), 0.15)
    const numericRows = (await page.evaluate(() => window.ceruQa.plugins.hookControls())).activity
    for (const name of ['player.seek', 'player.setVolume']) assert.ok(numericRows.some(row => row.name === name && row.action === 'rewrite' && row.source === 'plugin'))
    assert.ok(!numericRows.some(row => row.name === 'player.setVolume' && row.action === 'cancel'))
    await grants(false)
    await action('seek-four')
    await action('volume-high')
    assert.equal(await position(), 4)
    assert.equal(await mediaVolume(), 0.8)
    console.log('Real media: authorized seek and volume rewrites, non-cancelable volume, and revoked defaults verified')
    await action('mode-sequence')
    await grants(true)
    await action('mode-single-muted')
    let mode = await action('playing')
    assert.equal(mode.repeat, 'all')
    assert.equal(mode.muted, true)
    await action('unmute')
    await action('mode-random')
    mode = await action('playing')
    assert.equal(mode.repeat, 'one')
    assert.equal(mode.shuffle, false)
    assert.equal(mode.muted, false)
    await action('mode-sequence')
    await page.getByRole('button', {name:'切换播放模式，当前顺序播放'}).click()
    await page.getByRole('button', {name:'切换播放模式，当前单曲循环'}).waitFor()
    await page.getByRole('button', {name:'撤销本次',exact:true}).filter({visible:true}).and(page.locator(':enabled')).last().click()
    await page.getByRole('button', {name:'切换播放模式，当前随机播放'}).waitFor()
    await grants(false)
    await action('mode-sequence')
    await action('mode-random')
    assert.equal((await action('playing')).shuffle,true)
    await action('mode-sequence')
    console.log('Playback mode rewrite, cancellation independent of mute, toolbar undo and revoked default verified')
    const stopped = await position()
    await grants(true)
    await action('resume')
    await new Promise(resolve => setTimeout(resolve, 350))
    assert.equal(await position(), stopped)
    const rows = (await page.evaluate(() => window.ceruQa.plugins.hookControls())).activity
    for (const name of ['player.pause','player.resume']) assert.ok(rows.some(row => row.name === name && row.pluginId === 'local.playback-hook' && row.action === 'cancel' && row.source === 'plugin'))
    await grants(false)
    await action('resume')
    await advancing(stopped + 0.25)
    await action('pause')
    console.log('Verified real media pause/resume cancellation, grant revocation and plugin attribution')
    await action('resume')
    await grants(true)
    for (const command of ['next', 'previous']) {
      await action(command)
      assert.equal((await action('playing')).track.title, '传输控制验收')
    }
    const beforeEnding = await page.evaluate(async () => Math.max(0, ...(await window.ceruQa.plugins.hookControls()).activity.map(row => row.time)))
    await page.evaluate(() => {
      const audio = Array.from(document.querySelectorAll('audio')).find(audio => audio.currentSrc.includes('transport.wav') && !audio.paused)
      audio.currentTime = audio.duration - 0.2
    })
    await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).some(audio => audio.currentSrc.includes('transport.wav') && audio.ended))
    await page.waitForFunction(async before => (await window.ceruQa.plugins.hookControls()).activity.some(row => row.time > before && row.name === 'player.next' && row.action === 'cancel' && row.source === 'system'), beforeEnding, {timeout:10000})
    const advanceRows = (await page.evaluate(() => window.ceruQa.plugins.hookControls())).activity
    for (const name of ['player.next','player.previous']) assert.ok(advanceRows.some(row => row.name === name && row.action === 'cancel' && row.source === 'plugin'))
    assert.equal((await action('playing')).track.title, '传输控制验收')
    await grants(false)
    console.log('Plugin requests and natural media ending honored next/previous interception')
    await action('enqueue-end')
    const beforeRemoval = await action('queue-state')
    await grants(true)
    const refused = await action('remove-early')
    assert.deepEqual(refused.items, beforeRemoval.items)
    assert.equal(refused.revision, beforeRemoval.revision)
    await page.evaluate(() => window.dispatchEvent(new Event('open-playlist')))
    const drawer = page.locator('.playlist-container:visible')
    const earlyRow = drawer.locator('.playlist-song').filter({hasText:'第一首歌'})
    await earlyRow.hover()
    await drawer.getByRole('button',{name:'移除 第一首歌',exact:true}).click()
    const clear = async () => {
      const confirm = page.getByRole('button',{name:'确认清空',exact:true})
      await confirm.waitFor({state:'hidden'})
      await drawer.getByRole('button',{name:'清空播放列表',exact:true}).click()
      await confirm.click()
      await confirm.waitFor({state:'hidden'})
    }
    await clear()
    await page.waitForFunction(async () => {
      const rows = (await window.ceruQa.plugins.hookControls()).activity
      return ['queue.remove','queue.clear'].every(name => rows.some(row => row.name === name && row.action === 'cancel' && row.source === 'ui'))
    })
    assert.deepEqual((await action('queue-state')).items,beforeRemoval.items)
    await grants(false)
    const reduced = await action('remove-early')
    assert.equal(reduced.items.length,beforeRemoval.items.length-1)
    assert.ok(!reduced.items.some(song => song.title === '第一首歌'))
    await earlyRow.waitFor({state:'detached'})
    await clear()
    await drawer.locator('.playlist-empty').waitFor()
    assert.deepEqual((await action('queue-state')).items,[])
    await drawer.locator('.playlist-close').click()
    console.log('Queue drawer and plugin removal: cancellation preserved tracks, revoke restored remove and clear')
    console.log(
      'Generated playback hook: default end, authorized play cancelled, next rewrite applied once, revoked permission restored local playback'
    )
  } finally {
    await page.evaluate((file) => window.ceruQa.plugins.removeDevFile(file), file)
  }
}
