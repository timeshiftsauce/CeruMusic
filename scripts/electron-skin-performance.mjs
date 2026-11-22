import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { addPreviewFile, useAuthorSdk } from './electron-dev-preview.mjs'

async function workerProbe(application, id) {
  await application.evaluate((_, id) => {
    const {Worker} = globalThis.runtimeTestRequire('node:worker_threads')
    const original = Worker.prototype.postMessage, workers = new Set(), counts = {in:0, out:0, boots:0, active:0}
    let traffic = {}
    const record = (direction,message) => {
      const key = [direction,message?.type,message?.data?.event ?? message?.data?.name ?? message?.data?.method].filter(Boolean).join(':')
      const now = performance.now(), row = traffic[key] ??= {count:0,last:now,minGap:null}
      if (row.count) row.minGap = Math.min(row.minGap ?? Infinity,now-row.last)
      row.last = now; row.count++
    }
    Worker.prototype.postMessage = function(message, ...rest) {
      if (message?.type === 'boot' && message.manifest?.id === id && !workers.has(this)) {
        workers.add(this)
        counts.boots++
        this.on('message', incoming => { counts.in++; record('in',incoming); if (incoming?.type === 'active') counts.active++ })
        this.on('exit', () => workers.delete(this))
      }
      if (workers.has(this)) { counts.out++; record('out',message) }
      return original.call(this, message, ...rest)
    }
    globalThis.qaSkinTraffic = (reset = false) => { if (reset) traffic = {}; return { ...counts, live:workers.size, traffic } }
    globalThis.qaStopSkinTraffic = () => { Worker.prototype.postMessage = original }
  },id)
}

async function measure(application, page, skin, diagnostic = false) {
  const durationMs = diagnostic ? 15000 : 60000
  const sessions = () => page.locator('.full-play.active iframe[name^="ceru-plugin-surface-"], .full-play.active .plugin-component-surface[data-component-instance]').evaluateAll(frames => frames.map(frame => frame.getAttribute('name') || frame.getAttribute('data-component-instance')).sort())
  const before = await sessions()
  assert.equal(before.length,skin ? 3 : 0)
  const audio = await page.evaluateHandle(() => [...document.querySelectorAll('audio')].find(item => item.currentSrc.includes('transport.wav')))
  await audio.evaluate(async media => { media.currentTime = 1; await media.play() })
  await page.waitForTimeout(2000)
  const pids = await application.evaluate(({webContents}) => {
    const root = webContents.fromId(globalThis.runtimeTestMainId).mainFrame
    return { main:root.osProcessId, frames:root.framesInSubtree.filter(frame => frame.name.startsWith('ceru-plugin-surface-')).map(frame => frame.osProcessId) }
  })
  assert.ok(pids.frames.length <= before.length)
  const targets = new Set([pids.main, ...pids.frames]), totals = new Map(), pending = new Map(), names = new Set(), costs = new Map()
  const protocol = await page.context().newCDPSession(page)
  protocol.on('Tracing.dataCollected', ({value}) => {
    for (const event of value) {
      if (diagnostic && targets.has(event.pid) && event.ph === 'X' && event.dur) {
        const key = event.pid + ':' + event.name, row = costs.get(key) ?? {count:0,us:0,max:0}
        row.count++; row.us+=event.dur; row.max=Math.max(row.max,event.dur); costs.set(key,row)
      }
      if (!targets.has(event.pid) || !/BeginMainFrame/.test(event.name)) continue
      names.add(event.name)
      if (event.name !== 'ProxyMain::BeginMainFrame') continue
      const key = `${event.pid}:${event.tid}`
      if (event.ph === 'B') { pending.set(key,event.ts); continue }
      const duration = event.ph === 'X' ? event.dur : event.ph === 'E' && pending.has(key) ? event.ts-pending.get(key) : undefined
      if (event.ph === 'E') pending.delete(key)
      if (!Number.isFinite(duration)) continue
      const total = totals.get(event.pid) ?? {count:0,us:0}
      total.count++; total.us += duration; totals.set(event.pid,total)
    }
  })
  const traffic = (reset = false) => application.evaluate((_,reset) => globalThis.qaSkinTraffic(reset),reset)
  const initial = await traffic(true)
  assert.ok(initial.boots && initial.active && initial.live === 1, JSON.stringify(initial))
  try {
    await protocol.send('Tracing.start',{categories:diagnostic ? 'cc,benchmark,devtools.timeline,blink' : 'cc,benchmark',transferMode:'ReportEvents'})
    const playback = await audio.evaluate((media,durationMs) => new Promise((done, reject) => {
      const start = performance.now(), position = media.currentTime, source = media.currentSrc
      const timer = setTimeout(() => reject(Error('No foreground frame for 65 seconds')),65000)
      let frames = 0
      function sample(now) {
        if (document.hidden || !media.isConnected || media.paused || media.currentSrc !== source) { clearTimeout(timer); reject(Error('Playback or visibility changed')); return }
        frames++
        if (now-start < durationMs) requestAnimationFrame(sample)
        else { clearTimeout(timer); done({ frames, wall:now-start, advanced:media.currentTime-position }) }
      }
      requestAnimationFrame(sample)
    }),durationMs)
    const finished = new Promise(resolve => protocol.once('Tracing.tracingComplete',resolve))
    await protocol.send('Tracing.end'); await finished
    const end = await traffic(), hostFrames = totals.get(pids.main)?.count ?? 0
    if (diagnostic) console.log('Diagnostic rendering costs:',JSON.stringify([...costs].sort((a,b)=>b[1].us-a[1].us).slice(0,30)))
    console.log('Playback measurement:',JSON.stringify({skin,diagnostic,playback,hostFrames,processes:Object.fromEntries(totals),regions:await sessions(),expectedRegions:before}))
    assert.deepEqual(await sessions(),before,'Region changed or fell back during playback')
    assert.ok(playback.advanced >= durationMs/1000-.25 && Math.abs(playback.advanced-playback.wall/1000)<.25, JSON.stringify(playback))
    for (const pid of targets) assert.ok(totals.get(pid)?.count > 0, `Missing main-frame spans for PID ${pid}; events=${[...names]}`)
    const mean = [...totals.values()].reduce((sum,item) => sum+item.us,0)/hostFrames/1000
    const messages = {in:end.in-initial.in,out:end.out-initial.out}
    console.log(JSON.stringify({skin,playback,hostFrames,processes:Object.fromEntries(totals),mean,messages,types:end.traffic}))
    assert.ok(end.live === initial.live && end.boots === initial.boots, 'Plugin worker restarted')
    return {mean,traffic:end.traffic}
  } finally { await protocol.detach(); await audio.dispose() }
}

export async function verifySkinPerformance(application,page,directory,toolchain) {
  const diagnostic = process.env.CERU_SKIN_PERFORMANCE_DIAGNOSTIC === '1'
  const project = join(directory,'performance-skin'), bin = resolve(toolchain,'packages/cli/dist/bin.js')
  const run = args => promisify(execFile)(process.execPath,[bin,...args],{windowsHide:true})
  await run(['init',project,'--template','player-skin','--lang','ts'])
  await useAuthorSdk(project,toolchain)
  const file = join(project,'ceru.plugin.json'), config = JSON.parse(await readFile(file,'utf8'))
  config.manifest.entry.logic = {module:'logic.main'}; config.entries['logic.main'] = 'src/qa-logic.ts'
  await writeFile(join(project,'src/qa-logic.ts'),'export default () => {}\n')
  await writeFile(file,JSON.stringify(config))
  await run(['build','--project',project])
  const lyrics = Array.from({length:30},(_,index) => `[${String(Math.floor(index*3/60)).padStart(2,'0')}:${String(index*3%60).padStart(2,'0')}.00]歌词 ${index+1}`).join('\n')
  await writeFile(join(directory,'profile','transport.lrc'),lyrics)
  await application.evaluate(({app,BrowserWindow},lyrics) => {
    const {MusicDatabase} = globalThis.runtimeTestRequire('./databases.cjs')
    new MusicDatabase().upsertTrack({songmid:'skin-performance',path:globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'transport.wav'),url:null,singer:'QA',name:'皮肤性能验收',albumName:'QA',albumId:0,source:'local',interval:'01:30',hasCover:0,coverKey:null,year:2026,lrc:lyrics,types:'[]',_types:'{}',typeUrl:'{}',bitrate:705600,sampleRate:44100,channels:1,duration:90,size:7938044,mtime_ms:1,hash:null,updated_at:Date.now()})
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setAudioMuted(true)
  },lyrics)
  await workerProbe(application,config.manifest.id)
  try {
    await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
    await addPreviewFile(application,page,join(project,'dist/plugin.js'))
    await page.reload({waitUntil:'domcontentloaded'})
    await page.getByRole('button',{name:'播放全部'}).click()
    await page.waitForFunction(() => [...document.querySelectorAll('audio')].some(media => media.currentSrc.includes('transport.wav') && !media.paused))
    await page.locator('.player-container').dispatchEvent('click')
    const player = page.locator('.full-play.active'); await player.waitFor()
    await player.locator('.skin-btn').press('Enter')
    await page.getByRole('button',{name:'经典黑胶',exact:true}).click()
    await page.getByRole('button',{name:'关闭个性化面板'}).press('Escape')
    await player.locator('.plugin-component-surface, iframe[name^="ceru-plugin-surface-"]').first().waitFor({state:'detached'})
    const baseline = diagnostic ? null : await measure(application,page,false)
    await player.locator('.skin-btn').press('Enter')
    await page.getByRole('button',{name:'留声',exact:true}).press('Enter')
    assert.equal(await page.getByRole('button',{name:'留声',exact:true}).getAttribute('aria-pressed'),'true')
    await page.getByRole('button',{name:'关闭个性化面板'}).press('Escape')
    try {
      for (const region of ['lyrics','artwork','background']) await player.locator(`iframe.plugin-${region}, .plugin-${region} iframe, .plugin-component-surface.plugin-${region}`).waitFor({timeout:10000})
    } catch(error) {
      await page.screenshot({path:join(process.cwd(),'component-performance-failure.png')})
      console.error('Skin mount diagnostic:', await page.evaluate(()=>({text:document.querySelector('.full-play.active')?.textContent?.slice(-3000),surfaces:[...document.querySelectorAll('.plugin-component-surface')].map(el=>({text:el.textContent,html:el.outerHTML.slice(0,500)}))})))
      throw error
    }
    if (diagnostic) console.log('Diagnostic bounds:',await page.locator('.full-play.active iframe[name^="ceru-plugin-surface-"]').evaluateAll(frames=>frames.map(frame=>({title:frame.title,rect:frame.getBoundingClientRect().toJSON(),styles:{opacity:getComputedStyle(frame).opacity,visibility:getComputedStyle(frame).visibility}}))))
    const skin = await measure(application,page,true,diagnostic)
    if (diagnostic) { console.log('Diagnostic only: the full one-minute performance gate was not run.'); return }
    const difference = Math.abs(skin.mean-baseline.mean)
    console.log(`Renderer main-frame time: default ${baseline.mean.toFixed(3)} ms, skin ${skin.mean.toFixed(3)} ms, difference ${difference.toFixed(3)} ms`)
    for (const sample of [baseline,skin]) for (const [key,row] of Object.entries(sample.traffic)) {
      const limit = key === 'out:host-event:player.changed' ? 65 :
        ['out:lifecycle:onWindowBlur','out:lifecycle:onWindowFocus','out:host-event:ui.views.mounted','out:host-event:ui.views.unmounted'].includes(key) ? 6 :
        key === 'out:host-event:settings.changed' ? 1 : 0
      assert.ok(row.count <= limit, `Unexpected worker messages: ${key} ${JSON.stringify(row)}`)
    }
    assert.ok(difference <= 2, 'Default/skin main-frame time differs by more than 2 ms')
  } finally { await application.evaluate(() => globalThis.qaStopSkinTraffic()) }
}
