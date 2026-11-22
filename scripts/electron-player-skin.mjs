import assert from 'node:assert/strict'
import { TTMLParser, toAmllLyrics } from '@applemusic-like-lyrics/ttml'
import { DOMParser } from '@xmldom/xmldom'
import { execFile } from 'node:child_process'
import { readFile, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { addPreviewFile, startProjectWatch, useAuthorSdk } from './electron-dev-preview.mjs'

async function watchArtworkPaint(application,page) {
  const sample = await page.locator('.plugin-artwork iframe').evaluate(frame => {
    const bounds = frame.getBoundingClientRect()
    return {left:bounds.left+bounds.width*.35, top:bounds.top+bounds.height*.28}
  })
  await application.evaluate(({webContents},sample) => {
    const contents = webContents.fromId(globalThis.runtimeTestMainId), result = {frames:0,hit:null}
    const zoom = contents.getZoomFactor(), rect = {x:Math.round((sample.left+3)*zoom),y:Math.round((sample.top+4)*zoom),width:Math.max(2,Math.round(13*zoom)),height:1}
    let stopped = false, timer
    async function samplePaint() {
      if (stopped) return
      try {
        const image = await contents.capturePage(rect), received = Date.now()
        if (image.isEmpty()) throw Error('Empty artwork capture')
        const strip = image.toBitmap(), last = strip.length / image.getSize().height - 4
        result.frames++
        const matches = (offset,red,green,blue) => Math.abs(strip[offset]-blue)<20 && Math.abs(strip[offset+1]-green)<20 && Math.abs(strip[offset+2]-red)<20
        if (matches(0,245,19,163) && matches(last,37,241,83)) { result.hit = received; return }
        if (!stopped) timer = setTimeout(samplePaint,40)
      } catch (error) { result.error = String(error) }
    }
    void samplePaint()
    globalThis.qaFinishArtworkPaint = () => { stopped = true; clearTimeout(timer); delete globalThis.qaFinishArtworkPaint; return result }
  },sample)
  return () => application.evaluate(() => globalThis.qaFinishArtworkPaint())
}

async function observeNewContent(page,region,previous,marker,started) {
  const session = await page.waitForFunction(({region,previous}) => {
    const frame = document.querySelector(`.plugin-${region} iframe`)
    return frame?.name && frame.name !== previous ? frame : false
  },{region,previous},{timeout:5000})
  try {
    while (performance.now()-started < 5000) {
      const visible = await inspectRegion(page,'.plugin-'+region,'visible',marker)
      if (visible) return Math.round(performance.now()-started)
      await new Promise(resolve => setTimeout(resolve,16))
    }
    return null
  } finally { await session.dispose() }
}

async function verifySkinReload(application, page, directory, toolchain, language = 'js') {
  const bin = resolve(toolchain, 'packages/cli/dist/bin.js')
  const project = join(directory, 'skin-preview')
  await promisify(execFile)(process.execPath, [bin, 'init', project, '--template', 'player-skin', '--lang', language], {windowsHide:true})
  await useAuthorSdk(project,toolchain)
  const configFile = join(project, 'ceru.plugin.json'), source = join(project, 'src/Lyrics.vue')
  const config = JSON.parse(await readFile(configFile, 'utf8'))
  config.manifest.id = 'local.qa-skin-preview'
  config.entries['view.lyrics'] = 'src/Lyrics.vue'
  config.manifest.ui.skins[0].title = '预览皮肤'
  await writeFile(configFile, JSON.stringify(config))
  const original = (await readFile(source, 'utf8')).replace('const { props, actions } = region', `const { props, actions } = region
const firstSnapshot = JSON.stringify([props.track?.title, props.lines.length, props.currentTime.value, props.playing.value, region.settings.useAml])`).replace('class="lines"', 'class="lines" :data-first-snapshot="firstSnapshot"')
  const edit = version => writeFile(source, original.replace('{{ line.text }}', `预览${version} {{ line.text }}`))
  await edit(1)
  const worker = await startProjectWatch(bin, project)
  let entry
  let devModeEnabled = false
  try {
    await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
    devModeEnabled = true
    entry = await addPreviewFile(application, page, worker.file)
    const panel = page.locator('.settings-panel'), trigger = page.getByRole('button',{name:'播放器个性化'})
    if (!(await panel.isVisible())) await trigger.press('Enter')
    await panel.getByRole('button',{name:'预览皮肤',exact:true}).press('Enter')
    await panel.getByRole('button',{name:'关闭个性化面板'}).press('Escape')
    const lines = page.frameLocator('.plugin-lyrics iframe')
    await lines.getByRole('button',{name:'预览1 第一行',exact:true}).waitFor()
    const siblingNames = () => Promise.all(['artwork','background'].map(region => page.locator(`.plugin-${region} iframe`).getAttribute('name')))
    const retained = await siblingNames()
    await page.evaluate(() => {
      const timeline = [], regions = ['lyrics','artwork','background'], names = new Map()
      const push = (event, region, value) => {
        const audio = Array.from(document.querySelectorAll('audio')).find(item => item.currentSrc.includes('transport.wav'))
        timeline.push({time:Date.now(),event,region,value,position:audio?.currentTime,ended:audio?.ended,visible:document.visibilityState})
        if (timeline.length > 80) timeline.shift()
      }
      const frames = () => regions.map(region => [region,document.querySelector(`.plugin-${region} iframe`)])
      const simulatorButton = () => document.querySelector('button[aria-label="皮肤模拟器"]')
      let simulatorState
      const record = () => { for (const [region,frame] of frames()) {
        const name=frame?.name ?? null
        if (names.get(region)!==name) {names.set(region,name);push('frame',region,name)}
      }
        const expanded=simulatorButton()?.getAttribute('aria-expanded') ?? null
        if (simulatorState!==expanded) { simulatorState=expanded;push('simulator-state','simulator',expanded) }
      }
      record()
      const observe=new MutationObserver(record)
      observe.observe(document.querySelector('.full-play.active'),{childList:true,subtree:true,attributes:true,attributeFilter:['aria-expanded']})
      const simulatorClick=event=>{if(event.composedPath().includes(simulatorButton()))push('simulator-click','simulator',{trusted:event.isTrusted,detail:event.detail})}
      document.addEventListener('click',simulatorClick,true)
      const receive=event=>{
        if(!['region-health','failed'].includes(event.data?.type))return
        const entry=frames().find(([,frame])=>frame?.contentWindow===event.source)
        if(entry)push(event.data.type,entry[0],event.data.type==='failed'?String(event.data.data?.message).slice(0,200):event.data.data)
      }
      window.addEventListener('message',receive,true)
      window.qaStopRegionTrace=()=>{observe.disconnect();window.removeEventListener('message',receive,true);document.removeEventListener('click',simulatorClick,true);return timeline}
    })
    const media = await page.evaluateHandle(() => Array.from(document.querySelectorAll('audio')).find(element => element.currentSrc.includes('transport.wav')))
    const read = () => media.evaluate(element => ({src:element.currentSrc, paused:element.paused, position:element.currentTime, connected:element.isConnected, sampledAt:performance.now()}))
    const overBudget = []
    if (process.argv.includes('--init-probe')) await page.addInitScript(() => {
      if (window === parent || !window.name.startsWith('ceru-plugin-surface-')) return
      let count = 0
      window.addEventListener('message', event => {
        if (event.source === parent && event.data?.type === 'init')
          parent.postMessage({type:'qa-init-count', count:++count}, '*')
      })
    })
    if (process.argv.includes('--startup-probe')) await page.addInitScript(() => {
      if (window===parent || !window.name.startsWith('ceru-plugin-surface-')) return
      const started=performance.now(), sheets=[]
      const replace=CSSStyleSheet.prototype.replaceSync
      CSSStyleSheet.prototype.replaceSync=function(source) {
        const before=performance.now()
        try { return replace.call(this,source) }
        finally { sheets.push({chars:source.length,at:Math.round(before-started),ms:Math.round(performance.now()-before)}) }
      }
      const observer=new MutationObserver(()=>{
        const shadow=document.querySelector('#plugin-root')?.shadowRoot
        if (!shadow?.querySelector('[data-v-app]')) return
        observer.disconnect()
        CSSStyleSheet.prototype.replaceSync=replace
        const scripts=performance.getEntriesByType('resource').filter(entry=>entry.initiatorType==='script').map(entry=>({at:Math.round(entry.startTime-started),ms:Math.round(entry.duration)}))
        parent.postMessage({type:'qa-component-startup',data:{scripts,sheets,rootMs:Math.round(performance.now()-started)}},'*')
      })
      const attach=Element.prototype.attachShadow
      Element.prototype.attachShadow=function(options) {
        const shadow=attach.call(this,options)
        if (this.id==='plugin-root') { observer.observe(shadow,{childList:true,subtree:true});Element.prototype.attachShadow=attach }
        return shadow
      }
    })
    await page.addInitScript(() => {
      if (window === parent || !window.name.startsWith('ceru-plugin-surface-')) return
      const deadline = performance.now() + 5000
      function sample() {
        const root = document.querySelector('#plugin-root')?.shadowRoot
        const marker = root && Array.from(root.querySelectorAll('span')).find(node =>
          ['新版artwork', '新版background'].includes(node.textContent) && node.checkVisibility({opacityProperty:true, visibilityProperty:true}))
        if (marker) {
          const rect = marker.getBoundingClientRect()
          if (rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight) {
            parent.postMessage({ type:'qa-layout-frame', marker:marker.textContent, time:Date.now() }, '*')
            return
          }
        }
        if (performance.now() < deadline) requestAnimationFrame(sample)
      }
      requestAnimationFrame(sample)
    })
    async function watchRefresh(region, previous) {
      await page.evaluate(([region, previous]) => {
        const selector = `.plugin-${region} iframe`, times = {}
        const frame = () => { const candidate = document.querySelector(selector); return candidate?.name !== previous ? candidate : null }
        const observe = new MutationObserver(() => {
          if (!document.querySelector(selector)) times.missing ??= Date.now()
          if (frame()) times.inserted ??= Date.now()
        })
        observe.observe(document.querySelector('.full-play.active'), {childList:true,subtree:true})
        const receive = event => {
          if (event.source !== frame()?.contentWindow) return
          if (event.data?.type === 'ready') times.ready ??= Date.now()
          if (event.data?.type === 'active') times.active ??= Date.now()
          if (event.data?.type === 'qa-component-startup') times.startup=event.data.data
          if (event.data?.type === 'qa-init-count') times.initCount=event.data.count
          if (event.data?.type === 'qa-layout-frame' && event.data.marker === `新版${region}`) times.layoutFrame ??= event.data.time
        }
        window.addEventListener('message',receive)
        window.qaFinishRefresh = () => { observe.disconnect(); window.removeEventListener('message',receive); return times }
      }, [region,previous])
    }
    async function logRefresh(start, region) {
      const times = await page.evaluate(() => window.qaFinishRefresh())
      if (times.startup) console.log(`${region} iframe startup:`,JSON.stringify(times.startup))
      if (process.argv.includes('--init-probe')) console.log(`${region} init snapshots observed: ${times.initCount ?? 'not observed'}`)
      assert.equal(times.missing,undefined,`The ${region} preview was removed while waiting for its replacement`)
      const keys = region === 'lyrics' ? ['inserted','ready','active'] : ['inserted','ready','active','layoutFrame']
      console.log(`${region} from save: ` + keys.map(key => `${key}=${times[key] == null ? 'not observed' : (times[key]-start)+'ms'}`).join(', '))
    }
    try {
      await media.evaluate(element => element.pause())
      await lines.getByRole('button',{name:'预览1 第二行',exact:true}).click()
      await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).some(element => element.currentSrc.includes('transport.wav') && element.paused && Math.abs(element.currentTime - 10) < .01))
      for (const version of [2,3]) {
        if (version === 3) await media.evaluate(element => element.play())
        const before = await read()
        const previousName = await page.locator('.plugin-lyrics iframe').getAttribute('name')
        await watchRefresh('lyrics', previousName)
        const saved = Date.now()
        const started = performance.now()
        await edit(version)
        const label = lines.getByRole('button',{name:`预览${version} 第一行`,exact:true})
        while (!(await label.isVisible()) && performance.now()-started < 5000) await new Promise(resolve => setTimeout(resolve,16))
        const elapsed = performance.now()-started, after = await read()
        await logRefresh(saved, 'lyrics')
        if (!(await label.isVisible())) console.error('Skin reload diagnostics:', {
          previousName, currentNames: await page.locator('.plugin-lyrics iframe').evaluateAll(elements => elements.map(element => element.name)),
          buttons: await lines.getByRole('button').allTextContents().catch(() => []),
          hostText: await page.locator('.plugin-lyrics').allTextContents(),
          state: await page.evaluate(() => window.ceruQa.plugins.devState())
        })
        assert.ok(await label.isVisible(), `Skin did not refresh to ${version}; CLI built at +${Math.round(worker.readyAt-started)}ms`)
        assert.notEqual(await page.locator('.plugin-lyrics iframe').getAttribute('name'), previousName)
        const [title,count,position,playing,useAml] = JSON.parse(await lines.locator('.lines').getAttribute('data-first-snapshot'))
        assert.equal(title,'皮肤验收')
        assert.equal(count,2)
        assert.ok(position >= (before.position - .25)*1000 && position <= (after.position + .25)*1000, `Initial lyrics position ${position} for ${JSON.stringify({before,after})}`)
        assert.equal(playing,!before.paused)
        assert.equal(useAml,false)
        assert.deepEqual(await siblingNames(), retained, 'Unchanged artwork/background were remounted')
        assert.ok(after.connected && after.src === before.src && before.paused === after.paused)
        const advanced = after.position - before.position
        assert.ok(before.paused ? advanced === 0 : advanced > 0 && Math.abs(advanced - (after.sampledAt-before.sampledAt)/1000) < .25, JSON.stringify({before,after,elapsed}))
        console.log(`${language.toUpperCase()} skin source save → visible lyrics: ${Math.round(elapsed)}ms (CLI ${Math.round(worker.readyAt-started)}ms); WAV ${before.position.toFixed(3)} → ${after.position.toFixed(3)}s, paused=${after.paused}`)
        if (elapsed > 1000) overBudget.push(`lyrics ${Math.round(elapsed)}ms`)
      }
      for (const [region,file] of [['artwork','Artwork.vue'],['background','Background.vue']]) {
        const sourceFile = join(project, 'src', file), contents = await readFile(sourceFile, 'utf8')
        const marker = `新版${region}`, probePaint = region === 'artwork' && process.argv.includes('--paint-probe')
        const paint = probePaint ? '<i aria-hidden="true" style="position:fixed;z-index:2147483647;left:35%;top:28%;width:20px;height:10px;background:linear-gradient(to right,#f513a3 50%,#25f153 50%)"></i>' : ''
        const replacement = contents.replace('</template>', `<span style="position:fixed;left:0;top:0">${marker}</span>${paint}</template>`)
        assert.notEqual(contents, replacement)
        const frameNames = () => Promise.all(['lyrics','artwork','background'].map(name => page.locator(`.plugin-${name} iframe`).getAttribute('name')))
        const prior = await frameNames(), before = await read()
        await watchRefresh(region,prior[region === 'artwork' ? 1 : 2])
        const finishPaint = probePaint ? await watchArtworkPaint(application,page) : undefined
        const saved = Date.now(), started = performance.now()
        await writeFile(sourceFile, replacement)
        const priorName = prior[region === 'artwork' ? 1 : 2]
        const changedFrame = page.locator(`.plugin-${region} iframe:not([name="${priorName}"])`)
        const label = changedFrame.contentFrame().getByText(marker, {exact:true})
        const [located,direct] = await Promise.all([
          (async () => {
            while (performance.now()-started < 5000) {
              if (await label.isVisible()) return performance.now()-started
              await new Promise(resolve => setTimeout(resolve,16))
            }
            return null
          })(),
          probePaint ? observeNewContent(page,region,priorName,marker,started) : null,
        ])
        const elapsed = located ?? performance.now()-started, after = await read()
        if (finishPaint) {
          await page.waitForTimeout(250)
          const paint = await finishPaint()
          console.log(`Artwork pixel capture: ${paint.hit === null ? (paint.error ?? 'marker not detected') : (paint.hit-saved)+'ms from save'}, ${paint.frames} samples; direct frame text ${direct === null ? 'not observed' : direct+'ms'}; external visibility ${Math.round(elapsed)}ms`)
          assert.ok(paint.hit !== null && paint.hit >= saved, 'The new artwork marker was not observed in a composited frame')
          if (paint.hit-saved > 1000) overBudget.push(`artwork paint ${paint.hit-saved}ms`)
        }
        await logRefresh(saved, region)
        assert.notEqual(located,null, `New ${region} marker not visible`)
        const current = await frameNames()
        for (const [index,name] of ['lyrics','artwork','background'].entries()) {
          if (region === name) assert.notEqual(prior[index],current[index]); else assert.equal(prior[index],current[index])
        }
        assert.ok(after.connected && !after.paused && after.src === before.src && after.position > before.position && Math.abs(after.position-before.position-(after.sampledAt-before.sampledAt)/1000)<.25,JSON.stringify({before,after,elapsed}))
        console.log(`${language.toUpperCase()} ${region} source save → visible: ${Math.round(elapsed)}ms (CLI ${Math.round(worker.readyAt-started)}ms); unchanged regions retained and WAV continued`)
        if (elapsed > 1000) overBudget.push(`${region} ${Math.round(elapsed)}ms`)
      }
    } finally {
      console.log('Region session timeline:',JSON.stringify(await page.evaluate(()=>window.qaStopRegionTrace())))
      if (process.argv.includes('--paint-probe')) await application.evaluate(() => globalThis.qaFinishArtworkPaint?.())
      await media.dispose()
    }
    const beforeManifest = await siblingNames()
    config.manifest.ui.skins[0].title = '更新后的预览皮肤'
    await writeFile(configFile, JSON.stringify(config))
    await trigger.press('Enter')
    await panel.getByRole('button',{name:'更新后的预览皮肤',exact:true}).waitFor()
    await page.waitForFunction(previous => ['artwork','background'].every((region,index) => {
      const name = document.querySelector(`.plugin-${region} iframe`)?.name
      return name && name !== previous[index]
    }), beforeManifest)
    await lines.getByRole('button',{name:'预览3 第一行',exact:true}).waitFor()
    await trigger.press('Enter')
    console.log('Lyrics edits retained artwork/background sessions; a manifest edit rebuilt both and preserved the latest lyrics.')
    const owner = await page.locator('.plugin-lyrics').getAttribute('data-region-owner')
    const leases = [], siblingsAtCapacity = await siblingNames()
    const reserve = () => page.evaluate(async owner => (await window.ceruQa.plugins.mountSurface(owner,'lyrics',undefined,undefined,'player.lyrics')).sessionId,owner)
    try {
      for (let count = 0; count < 13; count++) leases.push(await reserve())
      await assert.rejects(reserve,/插件页面数量超过限制/)
      await edit(4)
      await lines.getByRole('button',{name:'预览4 第一行',exact:true}).waitFor({timeout:5000})
      assert.deepEqual(await siblingNames(),siblingsAtCapacity)
      await assert.rejects(reserve,/插件页面数量超过限制/)
      console.log('At 16 live sessions the edited view reclaimed its own slot, siblings remained mounted and a 17th session was still refused.')
    } finally {
      await page.evaluate(async ({owner,leases}) => {
        for (const session of leases) await window.ceruQa.plugins.closeDrawer(owner,'lyrics',session)
      },{owner,leases})
    }
    return overBudget
  } finally {
    await worker.stop()
    if (entry) await page.evaluate(path => window.ceruQa.plugins.removeDevFile(path), entry.path)
    if (devModeEnabled) await page.evaluate(() => window.ceruQa.plugins.setDevMode(false))
  }
}

// Test-only inspections use the normal window message loop. This avoids
// attaching a second debugger to Chromium's opaque-origin component frames.
const regionQueries = {
  visible: function(marker) {
        return Array.from(this.querySelectorAll('*')).some(element => {
          if (element.textContent.trim() !== marker || !element.checkVisibility({opacityProperty:true,visibilityProperty:true})) return false
          const rect = element.getBoundingClientRect()
          return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 && rect.left < innerWidth && rect.top < innerHeight
        })
      },
  background: function(){
      const element=this.querySelector('.backdrop')
      if (!element) return null
      const style=getComputedStyle(element)
      return {color:style.color,line:style.borderBottomStyle}
    },
  probe: function(aml){
      if (!aml) return this.querySelector('[data-skin-probe]')?.getAttribute('data-skin-probe')
      if (aml === true) {
        const texts=[], host=this.querySelector('.ceru-aml-player')
        if (!host) return
        const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT)
        while(walker.nextNode()) texts.push(walker.currentNode.nodeValue)
        return texts.join('|')
      }
      const element=this.querySelector('.'+aml)
      if (!element) return
      if (aml === 'ceru-hc-background') return element.querySelector('canvas') ? 'canvas' : 'fallback'
      if (aml === 'ceru-hc-vinyl' || aml === 'ceru-hc-square-cover') {
        const disc=element.querySelector('.cd-container')
        if (disc) {
          const style=getComputedStyle(disc), needle=element.querySelector('.pointer'), image=disc.querySelector('.vinyl-label img')
          return [style.animationDuration,style.animationPlayState,needle?.naturalWidth>0,image?.naturalWidth>0,!!disc.querySelector('.center-hole')].join(':')
        }
        const style=getComputedStyle(element),scale=new DOMMatrixReadOnly(style.transform).a
        return [Math.round(scale*100),style.borderTopLeftRadius,element.querySelector('img')?.naturalWidth>0].join(':')
      }
      return aml
    },
  canvas: function() {
      const canvas = this.querySelector('.ceru-hc-visualizer canvas')
      const rect = canvas?.getBoundingClientRect()
      return rect && {x:rect.x,y:rect.y,width:rect.width,height:rect.height}
    }
}
async function inspectRegion(page, selector, kind, argument) {
  return page.evaluate(({selector,kind,argument}) => new Promise((resolve,reject) => {
    const frame = document.querySelector(selector+' iframe')
    if (!frame) { resolve(undefined); return }
    const id = crypto.randomUUID()
    const finish = () => { clearTimeout(timer); window.removeEventListener('message',receive) }
    const receive = event => {
      if (event.source !== frame.contentWindow || event.data?.type !== 'ceru-qa-region-result' || event.data.id !== id) return
      finish()
      if (event.data.error) reject(Error(event.data.error)); else resolve(event.data.value)
    }
    const timer = setTimeout(() => { finish(); reject(Error(selector+': region inspection did not respond within 5 seconds')) },5000)
    window.addEventListener('message',receive)
    frame.contentWindow.postMessage({type:'ceru-qa-region-inspect',id,kind,argument},'*')
  }),{selector,kind,argument})
}

async function backgroundStyle(page, expectedLine, expectedColor) {
  const deadline = Date.now()+8000
  let drawn
  do {
    drawn = await inspectRegion(page,'.full-play.active .plugin-background','background')
    if (drawn?.line === expectedLine && (!expectedColor || drawn.color === expectedColor)) return drawn.color
    await new Promise(resolve=>setTimeout(resolve,40))
  } while (Date.now()<deadline)
  assert.fail('Unexpected skin background: '+JSON.stringify({drawn,expectedColor,expectedLine}))
}

async function assertRegionProbe(page, selector, expected, aml = false) {
  await page.locator(selector+' iframe').waitFor({state:'visible'})
  const deadline=Date.now()+8000
  let value
  do {
    value=await inspectRegion(page,selector,'probe',aml)
    if (value && expected.test(value)) return
    await new Promise(resolve=>setTimeout(resolve,80))
  } while(Date.now()<deadline)
  assert.fail(selector+': expected '+expected+', received '+value)
}

async function assertVisualizerPixels(application, page) {
  const trigger = page.getByRole('button', {name:'播放器个性化', exact:true})
  await page.getByRole('button', {name:'关闭个性化面板'}).press('Escape')
  await page.locator('.settings-panel').waitFor({state:'detached'})
  try {
    const inner = await inspectRegion(page, '.plugin-visualizer', 'canvas')
    assert.ok(inner && inner.width > 24 && inner.height > 0, 'Visible spectrum canvas bounds')
    const outer = await page.locator('.plugin-visualizer iframe').boundingBox()
    assert.ok(inner.y + inner.height <= outer.height + 1, 'Spectrum canvas is contained in its region')
    const rect = {x:outer.x+inner.x,y:outer.y+inner.y,width:inner.width,height:inner.height}
    let heights = []
    for (let attempt = 0; attempt < 20; attempt++) {
      const bitmap = await application.evaluate(async ({webContents}, rect) => {
        const contents = webContents.fromId(globalThis.runtimeTestMainId)
        const zoom = contents.getZoomFactor()
        const clip = Object.fromEntries(Object.entries(rect).map(([key,value]) => [key, Math.round(value*zoom)]))
        const image = await contents.capturePage(clip)
        return {...image.getSize(), data:image.toBitmap().toString('base64')}
      }, rect)
      const {width,height} = bitmap, data = Buffer.from(bitmap.data,'base64')
      heights = Array.from({length:24}, (_,column) => {
        const x = Math.min(width-1,Math.floor((column+.5)*width/24))
        for (let y=0; y<height; y++) {
          const offset = (y*width+x)*4
          if (data[offset] > data[offset+1]+50 && data[offset+2] > data[offset+1]+50) return height-y
        }
        return 0
      })
      if (heights.some(height=>height>2) && heights.every((height,index)=>Math.abs(height-heights[23-index])<=2)) {
        console.log('Mixed-region spectrum painted 24 symmetric columns in actual window pixels.')
        return
      }
      await page.waitForTimeout(80)
    }
    assert.fail('Window spectrum is blank or asymmetric: '+JSON.stringify(heights))
  } finally {
    await trigger.press('Enter')
    const regions = page.locator('.settings-panel .region-mixer')
    if (!(await regions.evaluate(element => element.open))) await regions.locator('summary').click()
  }
}

async function verifyPersonalizationLayout(page) {
  const trigger = page.getByRole('button', {name:'播放器个性化', exact:true})
  const panel = page.locator('.settings-panel'), summary = page.locator('.health-summary')
  await page.waitForFunction(() => document.querySelector('.full-play.active') && !document.querySelector('.full-play.active.animating'))
  await page.locator('.full-play.active').evaluate(async root => {
    await Promise.all(root.getAnimations().filter(animation => animation.effect?.getTiming().iterations !== Infinity).map(animation => animation.finished.catch(() => {})))
  })
  const anchor = await trigger.boundingBox()
  assert.ok(anchor)
  async function check(surface) {
    const {bounds, entry} = await surface.evaluate(element => {
      const rect = target => { const {x,y,width,height} = target.getBoundingClientRect(); return {x,y,width,height} }
      return {bounds:rect(element), entry:rect(element.closest('.float-action').querySelector('.skin-btn'))}
    })
    assert.ok(bounds.y >= 0 && bounds.y + bounds.height <= entry.y, 'Layout bounds: ' + JSON.stringify({bounds,entry}))
    assert.deepEqual(entry, anchor, 'Personalization entry moved')
  }
  async function report(region, state) {
    const iframe = page.locator('.plugin-' + region + ' iframe')
    const generation = (await iframe.getAttribute('name')).replace('ceru-plugin-surface-', '')
    const frame = await (await iframe.elementHandle()).contentFrame()
    await frame.evaluate(([generation, data]) => parent.postMessage({type:'region-health', generation, data}, '*'), [generation, state])
  }
  const player = page.locator('.full-play.active')
  async function checkNarrow(surface) {
    const originalWidth = await player.evaluate(element => {
      const original = element.style.width
      element.style.width = '420px'
      return original
    })
    try {
      const available = await player.boundingBox(), bounds = await surface.boundingBox(), entry = await trigger.boundingBox()
      assert.ok(available && bounds && entry)
      assert.equal(available.width, 420)
      assert.ok(bounds.x >= available.x && bounds.x + bounds.width <= available.x + available.width)
      assert.ok(bounds.y + bounds.height <= entry.y)
      assert.ok(await surface.evaluate(element => element.scrollWidth <= element.clientWidth))
    } finally { await player.evaluate((element, width) => { element.style.width = width }, originalWidth) }
    await check(surface)
  }
  await check(panel)
  await checkNarrow(panel)
  const appearance = panel.getByRole('radio', {name:'外观', exact:true})
  const playback = panel.getByRole('radio', {name:'播放与歌词', exact:true})
  assert.ok(await appearance.isChecked())
  await appearance.press('ArrowRight')
  assert.ok(await playback.isChecked())
  await panel.getByText('使用 Apple 风格歌词', {exact:true}).waitFor()
  await panel.locator('[data-section="appearance"]').waitFor({state:'detached'})
  assert.equal(await panel.locator('.style-card').count(), 0)
  await check(panel)
  await playback.press('ArrowLeft')
  assert.ok(await appearance.isChecked())
  await panel.getByRole('button', {name:'经典黑胶', exact:true}).waitFor()
  const originalHeight = await player.evaluate(element => {
    const original = element.style.height
    element.style.height = `calc(100% - 75px)`
    return original
  })
  try {
    const available = await player.boundingBox(), resizedPanel = await panel.boundingBox(), entry = await trigger.boundingBox()
    assert.ok(available && resizedPanel && entry && resizedPanel.y >= available.y && resizedPanel.y + resizedPanel.height <= entry.y, JSON.stringify({available,resizedPanel,entry}))
  } finally { await player.evaluate((element, original) => { element.style.height = original }, originalHeight) }
  await check(panel)
  await panel.getByRole('button', {name:'关闭个性化面板'}).click()
  await panel.waitFor({state:'detached'})
  if (await page.locator('.plugin-component-surface').count()) {
    console.log('Shared component personalization: fixed entry, 420px containment, short window and keyboard sections passed; live frame health uses the component region test.')
    return
  }
  // Keep the synthetic notice independent of the live monitor's next recovery
  // sample; continuous playback is checked separately by the performance run.
  const playingMedia = await page.evaluateHandle(() => [...document.querySelectorAll('audio')].filter(audio => !audio.paused))
  await playingMedia.evaluate(media => { for (const audio of media) audio.pause() })
  await page.waitForTimeout(150)
  try {
  await report('lyrics', 'warning')
  await summary.getByText('皮肤显示不够流畅').waitFor()
  await check(summary)
  await report('artwork', 'warning')
  await summary.getByText('2 个区域显示不够流畅').waitFor()
  await check(summary)
  await checkNarrow(summary)
  if (process.env.CERU_PLAYER_UI_SNAPSHOTS) await page.screenshot({path:join(process.env.CERU_PLAYER_UI_SNAPSHOTS,'player-notice.png')})
  await summary.getByRole('button', {name:'查看'}).click()
  await panel.locator('.region-warning').nth(1).waitFor()
  await check(panel)
  await panel.getByRole('button', {name:'关闭个性化面板'}).press('Escape')
  await panel.waitFor({state:'detached'})
  assert.ok(await trigger.evaluate(button => document.activeElement === button))
  await report('lyrics', 'recovered'); await report('artwork', 'recovered')
  await summary.waitFor({state:'detached'})
  await trigger.press('Enter'); await panel.waitFor()
  await check(panel)
  if (process.env.CERU_PLAYER_UI_SNAPSHOTS) await page.screenshot({path:join(process.env.CERU_PLAYER_UI_SNAPSHOTS,'player-personalization.png'), animations:'disabled'})
  console.log('Personalization: zero entry displacement with one/two notices; 420px player containment, shorter player, keyboard sections, mouse, Escape, focus return and Enter passed.')
  } finally {
    await playingMedia.evaluate(media => Promise.all(media.map(audio => audio.play().catch(() => {}))))
    await playingMedia.dispose()
  }
}

async function verifySkinSimulator(page, stage) {
  const launch = page.getByRole('button',{name:'皮肤模拟器'})
  assert.equal(await launch.count(), 0)
  const mediaPosition = () => page.evaluate(() => Array.from(document.querySelectorAll('audio')).find(audio => audio.currentSrc.includes('transport.wav')).currentTime)
  await page.evaluate(() => Array.from(document.querySelectorAll('audio')).find(audio => audio.currentSrc.includes('transport.wav')).pause())
  const original = await mediaPosition(), name = await page.locator('.plugin-stage iframe').getAttribute('name')
  await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
  await launch.click()
  const sample = page.getByLabel('测试曲目'), timeline = page.getByRole('slider',{name:'预览时间轴'})
  const probe = pattern => stage.waitForFunction(pattern => new RegExp(pattern).test(document.documentElement.dataset.qaSimulation || ''), pattern)
  await probe('^晚风[|]5[|]false[|]#202524[|]false[|]0$')
  await sample.selectOption('duet'); await probe('^隔岸[|]6[|]true[|]#202524')
  await stage.waitForFunction(() => document.documentElement.dataset.qaEnter === 'track' && Number(document.documentElement.dataset.qaLeaveMs) > 0)
  const leaveMs = await stage.evaluate(() => Number(document.documentElement.dataset.qaLeaveMs))
  assert.ok(leaveMs >= 550 && leaveMs < 850, `Hanging onLeave aborted after ${leaveMs}ms`)
  console.log(`Region animation: hanging stage onLeave aborted after ${leaveMs}ms and onEnter ran for the next track.`)
  await timeline.fill('5500'); await probe('[|]false[|]5500$')
  await page.getByRole('button',{name:'浅色预览'}).click(); await probe('[|]#f3f5f2[|]false[|]5500$')
  await page.getByRole('button',{name:'播放预览'}).click(); await probe('[|]true[|][6-9][0-9]{3}$')
  await page.getByRole('button',{name:'暂停预览'}).click(); await probe('[|]false[|][6-9][0-9]{3}$')
  await page.waitForFunction(() => parseFloat(document.querySelector('.skin-simulator output')?.textContent) > 0)
  await sample.selectOption('empty'); await probe('^余晖[|]0[|]false[|]#f3f5f2[|]false[|]0$')
  await page.evaluate(() => window.ceruQa.plugins.setDevMode(false))
  await launch.waitFor({state:'detached'}); await probe('^皮肤验收[|]')
  assert.equal(await page.locator('.plugin-stage iframe').getAttribute('name'),name)
  assert.equal(await mediaPosition(),original)
  console.log('Developer simulator: timed words, duet, empty track, independent scrub/play/pause, palette, frame interval and live-session restoration passed.')
}

async function verifyInnerMotion(panel) {
  const motion = async (button, selector, expanding, pseudo = null) => {
    const frames = await button.evaluate(async (trigger, {selector,pseudo,expanding}) => {
      const panel = trigger.closest('.settings-panel')
      const sample = () => {
        const node = panel.querySelector(selector)
        if (!node) return [0,0]
        const style = getComputedStyle(node,pseudo)
        return [pseudo ? parseFloat(style.blockSize) || 0 : node.offsetHeight, Number(style.opacity)]
      }
      const frames = [sample()], start = performance.now()
      trigger.click()
      do {
        await new Promise(resolve => requestAnimationFrame(resolve))
        frames.push(sample())
      } while (performance.now() - start < 1700 && !(frames.length > 2 && (expanding ? frames.at(-1)[1] === 1 && frames.at(-1)[0] > 0 && performance.now()-start > 350 : frames.at(-1)[0] === 0)))
      return frames
    },{selector,pseudo,expanding})
    const fullHeight = (expanding ? frames.at(-1) : frames[0])[0]
    assert.ok(fullHeight > 4 && (expanding ? frames[0] : frames.at(-1))[0] === 0, `Wrong endpoints for ${selector}: ${JSON.stringify(frames)}`)
    assert.ok(frames.some(([height,opacity]) => height > 0 && height < fullHeight && opacity > 0 && opacity < 1), `No visible intermediate frame for ${selector}: ${JSON.stringify(frames)}`)
  }
  const summary = panel.locator('.region-mixer summary')
  for (const open of [true,false]) await motion(summary,'.region-mixer',open,'::details-content')
  const renderer = value => panel.locator(`input[name="background-renderer"][value="${value}"]`)
  const previous = await panel.locator('input[name="background-renderer"]:checked').inputValue()
  await renderer('pixi').evaluate(node => node.click())
  await panel.locator('.beat-settings-reveal').waitFor({state:'detached'})
  await motion(renderer('mesh'),'.beat-settings-reveal',true)
  await motion(renderer('pixi'),'.beat-settings-reveal',false)
  await renderer(previous).evaluate(node => node.click())
  await motion(panel.getByRole('button',{name:'留声',exact:true}),'.skin-settings-reveal',true)
  await motion(panel.getByRole('button',{name:'经典黑胶'}),'.skin-settings-reveal',false)
  console.log('Inner panel: intermediate heights and opacity verified in both directions for region controls, beat controls and skin settings.')
}

async function verifyPanelMotion(page, application) {
  const player = page.locator('.full-play.active'), panel = player.locator('.settings-panel')
  const trigger = player.getByRole('button', { name:'播放器个性化' })
  await page.emulateMedia({reducedMotion:'no-preference'})
  await page.waitForFunction(() => document.querySelector('.full-play.active:not(.animating)'))
  await trigger.focus()
  const dimensions = await trigger.evaluate(button => [button.offsetWidth,button.offsetHeight,getComputedStyle(button).backdropFilter])
  assert.deepEqual(dimensions,[50,50,'blur(20px)'])
  for (const opening of [true,false]) {
    const samples = await trigger.evaluate(button => new Promise(resolve => {
      const values = [], deadline = performance.now()+850
      button.click()
      function sample(now) {
        const content = button.closest('.float-action').querySelector('.settings-panel')
        if (content) {
          const style = getComputedStyle(content)
          values.push([Number(style.opacity),new DOMMatrixReadOnly(style.transform === 'none' ? undefined : style.transform).m42])
        }
        if (now < deadline) requestAnimationFrame(sample); else resolve(values)
      }
      requestAnimationFrame(sample)
    }))
    assert.ok(samples.some(([opacity, offset]) => opacity > 0 && opacity < 1 && Math.abs(offset) > .1), 'No visible intermediate ' + (opening ? 'enter' : 'leave') + ' frame: ' + JSON.stringify(samples))
    if (opening) {
      assert.equal(samples.at(-1)[0],1)
      await panel.getByRole('button',{name:'经典黑胶'}).waitFor()
      await panel.getByRole('button',{name:'沉浸封面'}).waitFor()
      await panel.getByRole('button',{name:'关闭个性化面板'}).locator('svg').waitFor()
      const preview = title => panel.getByRole('button',{name:title,exact:true}).locator('.plugin-preview')
      for (const title of ['留声','宿主预览']) {
        const image = preview(title).locator('img')
        await image.evaluate(async node => { await node.decode() })
        assert.ok(await image.evaluate(node => node.naturalWidth > 0 && node.src.startsWith('data:image/')))
      }
      assert.deepEqual(await preview('留声').locator('img').evaluate(node => [node.naturalWidth,node.naturalHeight]),[240,160])
      for (const title of ['未声明预览','损坏预览']) await preview(title).locator('svg').waitFor()
      const previewSizes = await panel.locator('.plugin-preview').evaluateAll(nodes => nodes.map(node => [node.offsetWidth,node.offsetHeight]))
      assert.equal(previewSizes.length,4)
      assert.ok(previewSizes.every(([width,height]) => Math.abs(width-previewSizes[0][0]) <= 1 && Math.abs(height-previewSizes[0][1]) <= 1),JSON.stringify(previewSizes))
      console.log('Skin previews: decoded host and asset images; palette fallback for absent and corrupt images; equal preview box dimensions.')
      const zoom = factor => application.evaluate(({webContents}, factor) => {
        const window = webContents.fromId(globalThis.runtimeTestMainId), previous = window.getZoomFactor()
        window.setZoomFactor(factor)
        return previous
      },factor)
      const originalZoom = await zoom(.65)
      try {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      for (const target of ['playback','appearance']) {
        const result = await panel.evaluate(async (element, target) => {
          const start = element.offsetHeight, heights = [], pairs = [], items = []
          const itemMotion = node => {
            const style = getComputedStyle(node)
            return [Number(style.opacity), parseFloat(style.translate.split(' ')[1]) || 0]
          }
          element.querySelector(`input[value="${target}"]`).click()
          const deadline = performance.now() + 550
          do {
            await new Promise(resolve => requestAnimationFrame(resolve))
            heights.push(element.offsetHeight)
            const entering = element.querySelector(`[data-section="${target}"]`), leaving = element.querySelector('[data-section][inert]')
            if (entering && leaving) {
              pairs.push([Number(getComputedStyle(entering).opacity), Number(getComputedStyle(leaving).opacity)])
              const controls = entering.querySelectorAll(target === 'appearance' ? '.style-card' : '.control-row')
              const outgoing = leaving.querySelector(target === 'appearance' ? '.control-row' : '.style-card')
              items.push([itemMotion(controls[0]), itemMotion(controls[1]), itemMotion(outgoing)])
            }
          } while (performance.now() < deadline)
          return {start, end:element.offsetHeight, heights, pairs, items}
        },target)
        const {start,end,heights,pairs,items} = result
        assert.ok(heights.some(height => height > Math.min(start,end)+1 && height < Math.max(start,end)-1), `No intermediate panel height for ${target}: ${start} → ${end}; ${heights}`)
        assert.ok(pairs.some(pair => pair.every(opacity => opacity > 0 && opacity < 1)), `No content crossfade for ${target}: ${JSON.stringify(pairs)}`)
        assert.ok(items.some(([first, second]) => first[0] > 0 && first[0] < 1 && first[1] > 0 && Math.abs(first[0] - second[0]) > .03), `No staggered incoming items for ${target}: ${JSON.stringify(items)}`)
        assert.ok(items.some(([, , outgoing]) => outgoing[0] > 0 && outgoing[0] < 1 && outgoing[1] < 0), `No outgoing item motion for ${target}: ${JSON.stringify(items)}`)
        console.log(`Tab ${target}: ${start} → ${end}px, ${new Set(heights).size} measured heights, overlapping fade and verified item motion.`)
      }
      } finally { await zoom(originalZoom) }
      await verifyInnerMotion(panel)
      const scrolledFade = await panel.evaluate(async element => {
        const outgoing = element.querySelector('[data-section="appearance"]')
        outgoing.scrollTop = outgoing.scrollHeight
        const start = outgoing.scrollTop, height = outgoing.offsetHeight, frames = []
        element.querySelector('input[value="playback"]').click()
        while (outgoing.isConnected) {
          await new Promise(resolve => requestAnimationFrame(resolve))
          if (outgoing.isConnected) frames.push([outgoing.scrollTop, outgoing.offsetHeight, Number(getComputedStyle(outgoing).opacity)])
        }
        return {start,height,frames}
      })
      assert.ok(scrolledFade.start > 0 && scrolledFade.frames.some(([, ,opacity]) => opacity > 0 && opacity < 1), 'Scrolled content did not fade out')
      assert.ok(scrolledFade.frames.every(([top,height]) => Math.abs(top - scrolledFade.start) <= 1 && height === scrolledFade.height), `Outgoing scroller jumped: ${JSON.stringify(scrolledFade)}`)
      await panel.getByRole('radio',{name:'外观',exact:true}).check()
      await panel.locator('[data-section="playback"]').waitFor({state:'detached'})
      console.log(`Scrolled outgoing pane stayed at ${scrolledFade.start}px during fade at normal zoom.`)
      await panel.evaluate(async element => {
        element.querySelector('input[value="playback"]').click()
        await new Promise(resolve => setTimeout(resolve,75))
        element.querySelector('input[value="appearance"]').click()
      })
      await panel.locator('[data-section="playback"]').waitFor({state:'detached'})
      assert.equal(await panel.locator('[data-section="appearance"]:not([inert])').count(),1)
      const ball = page.locator('.float-ball.hidden-right:visible').first()
      if (await ball.count()) {
        const ballBox = await ball.boundingBox(), triggerBox = await trigger.boundingBox()
        assert.ok(ballBox && triggerBox && triggerBox.x + triggerBox.width + 4 <= ballBox.x, 'Personalization overlaps docked assistant')
      }
      if (process.env.CERU_PLAYER_UI_SNAPSHOTS) await player.screenshot({path:join(process.env.CERU_PLAYER_UI_SNAPSHOTS,'personalization-original.png')})
    } else await panel.waitFor({state:'detached'})
  }
  await page.emulateMedia({reducedMotion:'reduce'})
  await trigger.press('Enter')
  assert.equal(await panel.evaluate(element => getComputedStyle(element).transitionDuration),'0s')
  await panel.getByRole('radio',{name:'播放与歌词'}).check()
  await panel.locator('[data-section="appearance"]').waitFor({state:'detached'})
  assert.equal(await panel.locator('.section-viewport').evaluate(element => element.getAnimations({subtree:true}).length),0)
  await panel.getByRole('button',{name:'关闭个性化面板'}).press('Escape')
  await panel.waitFor({state:'detached'})
  assert.ok(await trigger.evaluate(button => document.activeElement === button))
  await page.emulateMedia({reducedMotion:'no-preference'})
  console.log('Original 50px glass trigger, actual intermediate enter/leave frames, reduced motion and Escape focus return passed.')
}

export async function verifyPlayerSkin(application, page, directory, toolchain, reloadOnly = false, language = 'js', panelOnly = false) {
  await page.context().addInitScript({content:`(() => {
    if (window === parent) return
    const queries = {${Object.entries(regionQueries).map(([name,query]) => JSON.stringify(name)+':'+query.toString()).join(',')}}
    let capturedRoot
    const original = Element.prototype.attachShadow
    Element.prototype.attachShadow = function(options) {
      const root = original.call(this, options)
      if (this.id === 'plugin-root') { capturedRoot = root; Element.prototype.attachShadow = original }
      return root
    }
    addEventListener('message',event => {
      const request = event.data
      if (event.source !== parent || request?.type !== 'ceru-qa-region-inspect') return
      let value,error
      try { value = capturedRoot && queries[request.kind]?.call(capturedRoot,request.argument) }
      catch (failure) { error = String(failure) }
      parent.postMessage({type:'ceru-qa-region-result',id:request.id,value,error},'*')
    })
  })()`})
  if (process.env.CERU_SKIN_FRAME_DIAGNOSTICS) {
    console.log('GPU diagnostics:', await application.evaluate(({app}) => app.getGPUFeatureStatus()))
    await page.addInitScript(() => {
      const samples = []
      const contexts = []
      const getContext = HTMLCanvasElement.prototype.getContext
      HTMLCanvasElement.prototype.getContext = function(...args) {
        const context = getContext.apply(this, args)
        if (context && /^webgl/.test(args[0])) contexts.push({canvas:this,gl:context})
        return context
      }
      window.qaGraphics = () => contexts.map(({canvas,gl}) => {
        const extension = gl.getExtension('WEBGL_debug_renderer_info')
        return {width:canvas.width,height:canvas.height,clientWidth:canvas.clientWidth,clientHeight:canvas.clientHeight,renderer:extension && gl.getParameter(extension.UNMASKED_RENDERER_WEBGL)}
      })
      let last, sum = 0, count = 0
      window.qaFrameDiagnostics = samples
      function tick(time) {
        if (last !== undefined) { sum += time - last; count++ }
        last = time
        if (sum >= 1000) {
          samples.push({ms: Math.round(sum / count * 100) / 100, hidden: document.hidden, focus: document.hasFocus()})
          if (samples.length > 20) samples.shift()
          sum = count = 0
        }
        requestAnimationFrame(tick)
      }
      requestAnimationFrame(tick)
    })
  }
  const bin = resolve(toolchain, 'packages/cli/dist/bin.js'), project = join(directory, 'studio')
  const run = args => promisify(execFile)(process.execPath, [bin, ...args], { windowsHide: true })
  await run(['init', project, '--template', 'player-skin', '--lang', 'ts'])
  if (panelOnly) {
    const path = join(project,'ceru.plugin.json'), config = JSON.parse(await readFile(path,'utf8'))
    const regions = config.manifest.ui.skins[0].regions
    config.manifest.ui.skins.push(
      {id:'no-preview',title:'未声明预览',regions},
      {id:'host-preview',title:'宿主预览',regions,preview:{kind:'host',name:'music-note'}},
      {id:'broken-preview',title:'损坏预览',regions,preview:{kind:'asset',resource:'broken-image'}}
    )
    config.resources = {...config.resources,'broken-image':{path:'broken.png',type:'base64',mime:'image/png'}}
    await writeFile(join(project,'broken.png'),'not an image')
    await writeFile(path,JSON.stringify(config))
  }
  await useAuthorSdk(project,toolchain)
  await run(['build', '--project', project])
  const added = await page.evaluate(code => window.ceruQa.plugins.addPlugin(code, 'studio.js'), await readFile(join(project,'dist/plugin.js'),'utf8'))
  assert.ok(added.pluginId, added.error)
  let secondId
  const enable = enabled => page.evaluate(([id, value]) => window.ceruQa.plugins.setEnabled(id, value), [added.pluginId,enabled])
  await writeFile(join(directory, 'profile', 'transport.lrc'), '[00:00.00]第一行\n[00:10.00]第二行\n')
  await application.evaluate(({app,BrowserWindow}) => {
    const {MusicDatabase} = globalThis.runtimeTestRequire('./databases.cjs')
    const music = new MusicDatabase()
    music.upsertTrack({songmid:'skin-qa',path:globalThis.runtimeTestRequire('node:path').join(app.getPath('userData'),'transport.wav'),url:null,singer:'QA',name:'皮肤验收',albumName:'皮肤专辑',albumId:0,source:'local',interval:'00:30',hasCover:0,coverKey:null,year:2026,lrc:'[00:00.00]第一行\n[00:10.00]第二行',types:'[]',_types:'{}',typeUrl:'{}',bitrate:705600,sampleRate:44100,channels:1,duration:30,size:2646044,mtime_ms:1,hash:null,updated_at:Date.now()})
    for (const window of BrowserWindow.getAllWindows()) window.webContents.setAudioMuted(true)
  })
  await page.reload({waitUntil:'domcontentloaded'})
  const open = async () => {
    await page.getByRole('button',{name:'播放全部'}).click()
    await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).some(audio => audio.currentSrc.includes('transport.wav') && !audio.paused))
    await page.locator('.player-container').dispatchEvent('click')
    await page.locator('.full-play.active').waitFor()
  }
  const verifyRegions = async () => {
    for (const region of ['background','artwork','lyrics']) {
      const direct = page.locator('.full-play.active .plugin-component-surface.plugin-'+region)
      if (await direct.count()) {
        await direct.waitFor({state:'visible',timeout:15000})
        const bounds = await direct.boundingBox()
        assert.ok(bounds && bounds.width > 50 && bounds.height > 50, region+' bounds '+JSON.stringify(bounds))
        continue
      }
      const frame = page.locator('.full-play.active .plugin-'+region+' iframe')
      await frame.waitFor({state:'attached', timeout:15000})
      assert.equal(await frame.getAttribute('sandbox'), 'allow-scripts')
      const bounds = await frame.boundingBox()
      assert.ok(bounds && bounds.width > 50 && bounds.height > 50, region+' bounds '+JSON.stringify(bounds))
    }
  }
  try {
    assert.equal((await enable(true)).error, undefined)
    await open()
    if (panelOnly) {
      await page.evaluate(() => { for (const audio of document.querySelectorAll('audio')) audio.pause() })
      await verifyPanelMotion(page, application)
      await page.getByRole('button',{name:'播放器个性化'}).press('Enter')
      await page.getByRole('button',{name:'留声',exact:true}).click()
      await verifyRegions()
      await verifyPersonalizationLayout(page)
      return
    }
    if (reloadOnly) {
      const overBudget = await verifySkinReload(application, page, directory, toolchain, language)
      assert.deepEqual(overBudget, [], 'Skin reloads exceeding 1000ms')
      return
    }
    await page.locator('.full-play.active .skin-btn').click()
    const skin = page.getByRole('button', {name:'留声', exact:true})
    await skin.click()
    await verifyRegions()
    assert.equal(await skin.getAttribute('aria-pressed'), 'true')
    for (const [layout, playing, css, expected] of [
      ['cd',false,'ceru-hc-vinyl',/^33s:paused:true:true:true$/], ['cd',true,'ceru-hc-vinyl',/^33s:running:true:true:true$/],
      ['cover',false,'ceru-hc-square-cover',/^80:24px:true$/], ['cover',true,'ceru-hc-square-cover',/^100:24px:true$/]
    ]) {
      await page.evaluate(async playing => {
        const audio = Array.from(document.querySelectorAll('audio')).find(element => element.currentSrc.includes('transport.wav'))
        if (playing) await audio.play(); else audio.pause()
      },playing)
      await page.locator('.plugin-artwork iframe').evaluate((iframe, {layout,playing}) => {
        const canvas=document.createElement('canvas'); canvas.width=canvas.height=32
        const context=canvas.getContext('2d'); context.fillStyle='#47867a'; context.fillRect(0,0,32,32)
        iframe.contentWindow.postMessage({type:'region-update', generation:iframe.name.replace('ceru-plugin-surface-',''), data:{positionMs:0, playing, content:{layout,artwork:canvas.toDataURL()}}}, '*')
      },{layout,playing})
      await assertRegionProbe(page,'.plugin-artwork',expected,css)
    }
    await page.locator('.plugin-background iframe').evaluate(iframe => {
      const canvas = document.createElement('canvas'); canvas.width = 32; canvas.height = 32
      const context = canvas.getContext('2d'); context.fillStyle = '#47867a'; context.fillRect(0,0,32,32)
      iframe.contentWindow.postMessage({type:'region-update', generation:iframe.name.replace('ceru-plugin-surface-',''), data:{positionMs:0, playing:true, content:{artwork:canvas.toDataURL(), settings:{accent:'#47867a'}}}}, '*')
    })
    await assertRegionProbe(page,'.plugin-background',/^canvas$/, 'ceru-hc-background')
    assert.deepEqual((await page.consoleMessages()).filter(message => /connect-src.*none|Refused to connect/i.test(message.text()) && message.text().includes('data:image')).map(message=>message.type()), [], 'The renderer attempted a network fetch for a projected cover')
    console.log('Packed host visuals: TS scaffold switched vinyl and square artwork and mounted an AML mesh canvas for a projected cover.')
    if (process.env.CERU_SKIN_FRAME_DIAGNOSTICS) {
      for (const diagnosticFrame of page.frames()) {
        console.log('Frame diagnostics:', diagnosticFrame.name(), await diagnosticFrame.evaluate(() => ({samples:window.qaFrameDiagnostics, graphics:window.qaGraphics?.()})).catch(() => 'detached'))
      }
    }
    await verifyPersonalizationLayout(page)
    const color = page.getByLabel('装饰颜色',{exact:true}), lineSwitch = page.getByRole('checkbox',{name:'显示装饰线'})
    const bgSession = await page.locator('.plugin-background iframe').getAttribute('name')
    const amlSwitch = page.getByRole('checkbox',{name:'逐字歌词',exact:true})
    await amlSwitch.check()
    await assertRegionProbe(page,'.plugin-lyrics',/第一行/,true)
    const parser = new TTMLParser({domParser:new DOMParser()})
    const {lines} = toAmllLyrics(parser.parse('<tt xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xmlns="http://www.w3.org/ns/ttml"><body><div><p itunes:key="L1" begin="00:00:00.000" end="00:00:03.000"><span begin="00:00:00.000" end="00:00:01.000">春</span><span begin="00:00:01.000" end="00:00:03.000">风</span></p></div></body></tt>'))
    assert.deepEqual(lines[0].words.map(word => word.startTime),[0,1000])
    const fixture = lines.map(line => ({startTimeMs:line.startTime,endTimeMs:line.endTime,text:line.words.map(word=>word.word).join(''),words:line.words.map(word=>({text:word.word,startTimeMs:word.startTime,endTimeMs:word.endTime}))}))
    await page.locator('.plugin-lyrics iframe').evaluate((iframe,lines) => iframe.contentWindow.postMessage({type:'region-update',generation:iframe.name.replace('ceru-plugin-surface-',''),data:{playing:true,positionMs:100,content:{lines,settings:{useAml:true}}}},'*'),fixture)
    await assertRegionProbe(page,'.plugin-lyrics',/春\|.*风/,true)
    await amlSwitch.uncheck()
    console.log('Generated TS skin rendered the live track with AMLL, then displayed two independently timed words from a parsed TTML fixture.')
    await backgroundStyle(page,'solid','rgb(71, 134, 122)')
    await color.fill('#ab1234'); await color.dispatchEvent('change'); await lineSwitch.uncheck()
    await backgroundStyle(page,'none','rgb(171, 18, 52)')
    assert.equal(await page.locator('.plugin-background iframe').getAttribute('name'),bgSession)
    await page.locator('.full-play.active .skin-btn').press('Enter')
    const frame = await (await page.locator('.plugin-lyrics iframe').elementHandle()).contentFrame()
    const protocol = await page.context().newCDPSession(frame)
    function findLine(node) {
      if (node.attributes?.includes('data-lyric-index') && node.children?.some(child => child.children?.some(text => text.nodeValue.trim() === '第二行'))) return node
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) {
        const found = findLine(child); if (found) return found
      }
    }
    const end = Date.now()+8000
    let line
    while (!line && Date.now()<end) {
      line = findLine((await protocol.send('DOM.getDocument',{depth:-1,pierce:true})).root)
      if (!line) await new Promise(resolve => setTimeout(resolve,50))
    }
    if (!line) {
      const snapshot = (await protocol.send('DOM.getDocument',{depth:-1,pierce:true})).root
      const texts = []
      function collect(node) {
        if (node.nodeType === 3 && node.nodeValue.trim() && node.nodeValue.length < 150) texts.push(node.nodeValue)
        for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) collect(child)
      }
      collect(snapshot)
      assert.fail('Missing second timed lyric; region text: ' + JSON.stringify(texts.slice(-35)))
    }
    await page.evaluate(() => { const media = Array.from(document.querySelectorAll('audio')).find(audio=>audio.currentSrc.includes('transport.wav')); media.pause(); media.currentTime = 1 })
    await protocol.send('DOM.focus',{nodeId:line.nodeId})
    await page.keyboard.press('Enter')
    await page.waitForFunction(() => Array.from(document.querySelectorAll('audio')).some(audio=>audio.currentSrc.includes('transport.wav') && Math.abs(audio.currentTime-10)<1), null, {timeout:5000})
    console.log('Pressing Enter on the desktop lyric component sought the actual local WAV to 10 seconds.')
    await page.reload({waitUntil:'domcontentloaded'})
    await open(); await verifyRegions()
    await backgroundStyle(page,'none','rgb(171, 18, 52)')
    const other = join(directory, 'background-qa')
    await run(['init', other, '--template','player-skin','--lang','js'])
    await useAuthorSdk(other,toolchain)
    const configFile = join(other,'ceru.plugin.json'), config = JSON.parse(await readFile(configFile,'utf8'))
    config.manifest.name = '背景验收'
    config.manifest.ui.regions = config.manifest.ui.regions.filter(item => item.region === 'player.background')
    for (const view of ['songInfo','visualizer','stage','desktopLyric']) {
      const regionName = view === 'desktopLyric' ? view : 'player.'+view
      config.manifest.entry.views.push({id:view,kind:'component',module:'view.'+view})
      config.manifest.ui.regions.push({view,region:regionName})
      config.entries['view.'+view] = `src/${view}.vue`
      const transitions = view === 'stage' ? `<script>
export function onEnter({reason}) { document.documentElement.dataset.qaEnter = reason }
export function onLeave({signal,reason}) {
  if (reason === 'skin') {
    parent.postMessage({type:'qa-stage-skin-leave'}, '*')
    return new Promise(resolve => setTimeout(resolve, 80))
  }
  const start = performance.now()
  signal.addEventListener('abort', () => { document.documentElement.dataset.qaLeaveMs = String(Math.round(performance.now()-start)) }, {once:true})
  return new Promise(() => {})
}
</script>` : view === 'desktopLyric' ? `<script>
export function onEnter({reason}) { if (reason === 'track') document.documentElement.dataset.qaTrackEnters = String(Number(document.documentElement.dataset.qaTrackEnters || 0) + 1) }
export function onLeave({reason}) { if (reason === 'track') document.documentElement.dataset.qaTrackLeaves = String(Number(document.documentElement.dataset.qaTrackLeaves || 0) + 1) }
</script>` : ''
      await writeFile(join(other,config.entries['view.'+view]),`${transitions}<script setup>
import { ref } from 'vue'
import { useRegion, useFrame, useHostComponents } from '@shiqianjiang/ceru-plugin-sdk/vue'
const {AudioVisualizer} = useHostComponents()
const region = useRegion('${regionName}')
const peak = ref(0)
useFrame(() => {
  document.documentElement.dataset.qaFrameCount = String(Number(document.documentElement.dataset.qaFrameCount || 0) + 1)
  if (document.documentElement.dataset.qaFrame === 'throw') throw Error('QA frame failure')
  if (document.documentElement.dataset.qaFrame === 'slow') {
    const until = performance.now()+40
    while (performance.now()<until) {}
  }
  document.documentElement.dataset.qaSize = region.size.value.width+'x'+region.size.value.height
  document.documentElement.dataset.qaSimulation = [region.props.track?.title,region.props.lines?.[0]?.words?.length ?? 0,!!region.props.lines?.some(item=>item.isDuet),region.props.palette?.background,region.props.playing?.value,Math.round(region.props.currentTime?.value ?? 0)].join('|')
  if (region.props.spectrum) peak.value = Math.max(peak.value, ...region.props.spectrum)
})
</script><template><output ${view === 'visualizer' ? 'style="display:none"' : ''} :data-skin-probe="${view === 'desktopLyric' ? `[region.props.track?.title,region.props.current?.text,region.props.next?.text,region.props.locked.value].join('|')` : `[region.props.track?.title,region.props.track?.artists?.join(','),region.props.track?.album,region.props.lines?.map(line=>line.text).join(','),region.props.spectrum?.length,peak>0].join('|')`}">{{ region.props.track?.title }}</output>${view === 'visualizer' ? '<AudioVisualizer :bar-count="24" :height="64" color="#ff00ff" :playing="region.props.playing.value" />' : ''}</template>`)
    }
    delete config.manifest.ui.skins
    await writeFile(configFile,JSON.stringify(config))
    await run(['build','--project',other])
    const second = await page.evaluate(code => window.ceruQa.plugins.addPlugin(code,'background.js'),await readFile(join(other,'dist/plugin.js'),'utf8'))
    assert.ok(second.pluginId,second.error)
    secondId = second.pluginId
    assert.equal((await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,true),secondId)).error,undefined)
    await page.locator('.full-play.active .skin-btn').press('Enter')
    await page.getByText('按区域选择',{exact:true}).click()
    const background = page.getByRole('combobox',{name:'背景区域'}), artwork = page.getByRole('combobox',{name:'封面区域'})
    const owner = (region,id) => page.waitForFunction(([region,id]) => document.querySelector('.full-play .plugin-'+region)?.getAttribute('data-region-owner') === id,[region,id])
    const originalLyrics = await page.locator('.plugin-lyrics iframe').getAttribute('name')
    await background.selectOption({label:'背景验收 · background'}); await owner('background',secondId)
    assert.notEqual(await backgroundStyle(page,'solid'), 'rgb(171, 18, 52)')
    await artwork.selectOption('default'); await page.locator('.plugin-artwork iframe').waitFor({state:'detached'})
    assert.equal(await page.locator('.plugin-lyrics iframe').getAttribute('name'),originalLyrics)
    const choose = (name,view) => page.getByRole('combobox',{name}).selectOption({label:'背景验收 · '+view})
    const resumeTrack = async () => {
      await application.evaluate(({webContents}) => webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow().focus())
      await page.waitForFunction(() => document.hasFocus())
      return page.evaluate(async () => {
      const media = Array.from(document.querySelectorAll('audio')).find(audio => audio.currentSrc.includes('transport.wav'))
      media.currentTime = 1
      await media.play()
      })
    }
    await choose('歌曲信息区域','songInfo')
    await assertRegionProbe(page,'.plugin-song-info',/^皮肤验收\|QA\|皮肤专辑\|/)
    console.log('Mixed-region song information rendered.')
    await choose('频谱区域','visualizer'); await resumeTrack()
    await assertRegionProbe(page,'.plugin-visualizer',/\|128\|true$/)
    console.log('Mixed-region spectrum received live bins.')
    await assertVisualizerPixels(application, page)
    await choose('全屏舞台区域','stage'); await resumeTrack()
    await assertRegionProbe(page,'.plugin-stage',/^皮肤验收\|QA\|皮肤专辑\|.*第二行.*\|128\|true$/)
    const stageFrame = async () => (await page.locator('.plugin-stage iframe').elementHandle()).contentFrame()
    const stage = await stageFrame()
    await verifySkinSimulator(page, stage); await resumeTrack()
    await stage.waitForFunction(() => Number(document.documentElement.dataset.qaFrameCount) > 2)
    // Playwright emulates an always-focused document by default. Disable that
    // before testing actual native window focus changes.
    const focusProtocol = await page.context().newCDPSession(page)
    await focusProtocol.send('Emulation.setFocusEmulationEnabled', {enabled:false})
    await application.evaluate(async ({BrowserWindow,webContents}) => {
      const main = webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow()
      const focusWindow = new BrowserWindow({width:240,height:160,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}})
      globalThis.qaRegionFocusWindow = focusWindow
      await focusWindow.loadURL('about:blank')
      main.blur()
      focusWindow.show()
      focusWindow.focus()
      focusWindow.webContents.focus()
    })
    try {
      await page.waitForFunction(() => !document.hasFocus())
      // Let the authenticated region-active message and the final scheduled frame settle.
      await page.waitForTimeout(150)
      const beforeBlur = await stage.evaluate(() => Number(document.documentElement.dataset.qaFrameCount))
      await page.waitForTimeout(250)
      const afterBlur = await stage.evaluate(() => Number(document.documentElement.dataset.qaFrameCount))
      assert.equal(afterBlur, beforeBlur, 'Region frames must stop while the host loses focus')
    } finally {
      await application.evaluate(({webContents}) => {
        globalThis.qaRegionFocusWindow?.destroy()
        delete globalThis.qaRegionFocusWindow
        const main = webContents.fromId(globalThis.runtimeTestMainId).getOwnerBrowserWindow()
        main.restore()
        main.focus()
      })
    }
    await page.waitForFunction(() => document.hasFocus())
    const beforeFocus = await stage.evaluate(() => Number(document.documentElement.dataset.qaFrameCount))
    await stage.waitForFunction(count => Number(document.documentElement.dataset.qaFrameCount) > count, beforeFocus)
    await focusProtocol.send('Emulation.setFocusEmulationEnabled', {enabled:true})
    await focusProtocol.detach()
    console.log('Region frame callbacks paused on host blur and resumed after refocus.')
    const box = await page.locator('.plugin-stage iframe').boundingBox()
    await stage.waitForFunction(([width,height]) => document.documentElement.dataset.qaSize === width+'x'+height,[Math.round(box.width),Math.round(box.height)])
    await page.locator('.plugin-stage iframe').evaluate(element => {element.style.width='320px'; element.style.height='180px'})
    await stage.waitForFunction(() => document.documentElement.dataset.qaSize === '320x180')
    const setLoad = async mode => {
      const activeFrame = await stageFrame()
      await activeFrame.waitForFunction(() => !!document.documentElement.dataset.qaSize)
      await activeFrame.evaluate(value => {document.documentElement.dataset.qaFrame = value},mode)
    }
    const slowWarning = page.locator('.region-warning').filter({hasText:'该皮肤可能影响流畅度'})
    await setLoad('slow')
    const detailsButton = page.locator('.health-summary').getByRole('button',{name:'查看'})
    await detailsButton.waitFor({state:'visible',timeout:8000}); await detailsButton.click()
    await slowWarning.waitFor({state:'visible',timeout:8000})
    await slowWarning.getByRole('button',{name:'换回默认'}).click()
    await page.locator('.plugin-stage iframe').waitFor({state:'detached'}); await owner('lyrics',added.pluginId)
    await page.getByText('按区域选择',{exact:true}).click()
    await choose('全屏舞台区域','stage'); await owner('stage',secondId); await setLoad('slow')
    await slowWarning.waitFor({state:'visible',timeout:8000})
    await page.locator('.plugin-stage iframe').waitFor({state:'detached',timeout:16000})
    await page.getByText(/全屏舞台：持续卡顿，已换回默认/).waitFor()
    await owner('lyrics',added.pluginId)
    await page.getByRole('combobox',{name:'全屏舞台区域'}).selectOption('default')
    await choose('全屏舞台区域','stage'); await owner('stage',secondId); await setLoad('throw')
    await page.getByText(/全屏舞台：出错已停用/).waitFor()
    await owner('lyrics',added.pluginId)
    await page.getByRole('combobox',{name:'全屏舞台区域'}).selectOption('default')
    await choose('全屏舞台区域','stage'); await owner('stage',secondId)
    console.log('Region size tracked iframe resize. Real 40ms frame callbacks triggered manual and automatic fallback; a throwing frame restored host UI with a status label.')
    assert.equal(await page.locator('.full-play iframe').count(),1)
    await page.locator('.full-play.active .putawayscreen-btn').click()
    await page.locator('.full-play.active').waitFor({state:'detached'})
    await page.locator('.player-container').dispatchEvent('click')
    await page.locator('.plugin-stage iframe').waitFor({state:'visible'})
    await page.reload({waitUntil:'domcontentloaded'}); await open()
    await owner('stage',secondId)
    const observeLeave = () => page.locator('.plugin-stage iframe').evaluate(frame => {
      const source = frame.contentWindow
      const events = []
      const record = event => { if (event.source === source && event.data?.type === 'qa-stage-skin-leave') events.push(frame.isConnected) }
      window.addEventListener('message',record)
      window.qaReadStageLeave = () => { window.removeEventListener('message',record); return events }
    })
    await observeLeave()
    await page.locator('.full-play.active .skin-btn').click(); await page.getByText('按区域选择',{exact:true}).click()
    await page.getByRole('combobox',{name:'全屏舞台区域'}).selectOption('default')
    await owner('background',secondId); await owner('lyrics',added.pluginId); await owner('song-info',secondId); await owner('visualizer',secondId)
    assert.deepEqual(await page.evaluate(() => window.qaReadStageLeave()), [true], 'Manual default must notify the old stage while mounted')
    await choose('桌面歌词区域','desktopLyric')
    await resumeTrack()
    await page.locator('.control-btn.lyric-btn').dispatchEvent('click')
    const deadline = Date.now()+12000
    let lyricWindow
    do {
      lyricWindow = application.windows().find(window => window !== page && URL.canParse(window.url()) && new URL(window.url()).hash === '#/desktop-lyric')
      if (!lyricWindow) await new Promise(resolve => setTimeout(resolve,80))
    } while (!lyricWindow && Date.now()<deadline)
    assert.ok(lyricWindow,'Desktop lyric window did not open')
    try {
      await assertRegionProbe(lyricWindow,'.plugin-desktop-lyric',/^皮肤验收\|第一行\|第二行\|false$/)
      const guest = await (await lyricWindow.locator('.plugin-desktop-lyric iframe').elementHandle()).contentFrame()
      const snapshot = (revision, name) => application.evaluate(({BrowserWindow},data) => {
        const target = BrowserWindow.getAllWindows().find(win => win.webContents.getURL().endsWith('#/desktop-lyric'))
        target.webContents.send('play-song-change', data)
      }, {revision, name, artist:'QA'})
      const counts = () => guest.evaluate(() => [Number(document.documentElement.dataset.qaTrackLeaves || 0),Number(document.documentElement.dataset.qaTrackEnters || 0)])
      const initial = await counts()
      await snapshot(9001, '皮肤验收')
      await guest.waitForFunction(initial => Number(document.documentElement.dataset.qaTrackEnters) === initial+1, initial[1])
      assert.deepEqual(await counts(),initial.map(count => count+1))
      await snapshot(9001, '同一曲目改名')
      await assertRegionProbe(lyricWindow,'.plugin-desktop-lyric',/^同一曲目改名\|/)
      assert.deepEqual(await counts(),initial.map(count => count+1))
      console.log('Desktop lyric window: equal metadata with a new revision ran one leave/enter pair; same revision with new metadata updated without animation.')
    } catch (error) {
      console.error('Lyric window diagnostics:', await lyricWindow.evaluate(() => ({hash:location.hash,hidden:document.hidden,
        host:!!document.querySelector('.desktop-lyric'),frames:document.querySelectorAll('iframe').length,text:document.body.innerText.slice(0,120)})),
        (await lyricWindow.pageErrors()).map(error=>error.message), (await lyricWindow.consoleMessages()).filter(message=>['warning','error'].includes(message.type())).map(message=>message.text().slice(0,300)))
      throw error
    }
    await page.locator('.settings-panel').waitFor({state:'detached'})
    await page.getByRole('button',{name:'播放器个性化'}).press('Enter')
    await page.getByText('按区域选择',{exact:true}).click()
    await choose('全屏舞台区域','stage'); await owner('stage',secondId)
    await page.locator('.full-play.active .skin-btn').press('Enter')
    assert.equal(await page.locator('.plugin-artwork iframe').count(),0)
    await observeLeave()
    assert.equal((await page.evaluate(id=>window.ceruQa.plugins.setEnabled(id,false),secondId)).error,undefined)
    await page.locator('.plugin-background iframe').waitFor({state:'detached'}); await owner('lyrics',added.pluginId)
    assert.equal(await page.locator('.plugin-stage iframe,.plugin-song-info iframe,.plugin-visualizer iframe').count(),0)
    await lyricWindow.locator('.plugin-desktop-lyric iframe').waitFor({state:'detached'})
    await lyricWindow.locator('.lyric-container').waitFor({state:'visible'})
    assert.deepEqual(await page.evaluate(() => window.qaReadStageLeave()), [], 'Disabling a provider must skip its leave hook')
    await page.locator('.control-btn.lyric-btn').dispatchEvent('click')
    console.log('Desktop lyric window displayed current/next real timed lyrics and restored the host lyric renderer on disable.')
    console.log('Stage restored child selections on default and provider disable; projected album, timed lyrics, 128 live bins and host exit verified.')
    await page.locator('.full-play.active .skin-btn').press('Enter'); await page.getByText('按区域选择',{exact:true}).click()
    await background.selectOption('inherit'); await owner('background',added.pluginId)
    await backgroundStyle(page,'none','rgb(171, 18, 52)')
    await page.getByRole('button',{name:'重置装饰颜色'}).click()
    await backgroundStyle(page,'none','rgb(71, 134, 122)')
    await page.getByRole('button',{name:'重置显示装饰线'}).click()
    await backgroundStyle(page,'solid','rgb(71, 134, 122)')
    console.log('Skin settings: host controls changed the drawn background without remount, survived reload, stayed private during mixing, and reset individually.')
    await skin.click(); await verifyRegions()
    assert.equal(await artwork.inputValue(),'inherit')
    console.log('Region mix: independent JS background, built-in cover, untouched TS lyric session; reload, provider disable, inherit and whole-skin reset passed.')
    assert.equal((await enable(false)).error, undefined)
    await page.waitForFunction(() => !document.querySelector('.full-play iframe'))
    const overBudget = await verifySkinReload(application, page, directory, toolchain)
    await page.mouse.move(110, 45)
    await page.locator('.full-play.active.idle').waitFor({state:'detached'})
    await page.locator('.full-play.active .putawayscreen-btn').click()
    await page.locator('.full-play.active').waitFor({state:'detached'})
    console.log('Desktop theme panel: selected generated skin; three isolated regions mounted, survived reload, restored defaults on disable, host exit stayed usable.')
    assert.deepEqual(overBudget, [], 'Skin reloads exceeding 1000ms')
  } catch (error) {
    console.error('Skin panel diagnostics:', await page.locator('.health-list, .health-summary').allTextContents())
    throw error
  } finally {
    if (secondId) await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), secondId)
    await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), added.pluginId)
  }
}
