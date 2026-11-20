import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { join, resolve, dirname } from 'node:path'
import { pathToFileURL } from 'node:url'
import { _electron as electron } from 'playwright'

const cli = resolve(process.argv[2])
const builtin = process.argv.includes('--builtin')
const options = process.argv.includes('--options')
const load = name => import(pathToFileURL(join(cli, name)).href)
const { buildProject, scaffoldProject } = await load('packages/cli/dist/project.js')
const { readArtifact } = await load('packages/issuer/dist/index.js')
const { createWebSurfaceDocument } = await load('packages/core/dist/surface-document.js')
const scratch = await mkdtemp(join(cli, '.test-tmp-skin-'))
let application
try {
  const project = join(scratch, 'studio')
  await scaffoldProject(project, { template: 'player-skin', language: 'ts' })
  if (!builtin) {
    const configPath = join(project, 'ceru.plugin.json')
    const config = JSON.parse(await readFile(configPath, 'utf8'))
    config.entries['view.lyrics'] = 'src/Lyrics.vue'
    await writeFile(configPath, JSON.stringify(config))
  }
  if (options) {
    assert.ok(!builtin)
    await writeFile(join(project,'src','Lyrics.vue'),`<script lang="ts">
import {defineComponent} from 'vue'
import {useRegion} from '@shiqianjiang/ceru-plugin-sdk/vue'
export default defineComponent({setup(){return {region:useRegion('player.lyrics')}},computed:{activeIndex(){return this.region.props.lines.reduce((active,line,index)=>line.startTimeMs<=this.region.props.currentTime.value ? index : active,-1)}}})
</script><template><button v-for="(line,index) in region.props.lines" :key="index" :aria-current="index===activeIndex ? 'true' : undefined" @click="region.actions.seek(line.startTimeMs)">{{ line.text }}</button></template>`)
  }
  const artifact = readArtifact(await readFile((await buildProject(project)).path))
  const generation = 'studio-session'
  const props = { playing: false, positionMs: 0, content: { lines: [
    { text: '第一行', startTimeMs: 0, endTimeMs: 240 }, { text: '第二行', startTimeMs: 240, endTimeMs: 10000,
      isDuet: true, words: [{ text: '第二', startTimeMs: 240, endTimeMs: 440 }, { text: '行', startTimeMs: 440, endTimeMs: 10000 }] },
  ] } }
  const library = builtin ? JSON.parse(await readFile(resolve('out/main/desktop-components.json'), 'utf8')) : undefined
  const surface = await createWebSurfaceDocument(artifact, 'lyrics', generation, props, undefined, 'player.lyrics', library)
  if (builtin) surface.init.inspectComponent = true
  const launcher = join(scratch, 'app.cjs')
  await writeFile(launcher, `const {app,BrowserWindow}=require('electron');app.setPath('userData',${JSON.stringify(join(scratch,'profile'))});app.whenReady().then(()=>{global.win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,backgroundThrottling:false}});return win.loadURL('about:blank')})`)
  application = await electron.launch({ args: [launcher], timeout: 30000 })
  const page = await application.firstWindow()
  const errors = []
  page.on('pageerror', error => errors.push(String(error)))
  await page.evaluate(({ html, init, generation }) => {
    const frame = document.createElement('iframe')
    frame.setAttribute('sandbox', 'allow-scripts')
    window.results = []
    window.sendRegion = (type, data) => frame.contentWindow.postMessage({type, data, generation}, '*')
    window.addEventListener('message', event => {
      if (event.source !== frame.contentWindow) return
      const { type, data } = event.data
      if (type === 'ready') window.sendRegion('init', init)
      if (type === 'region-seek') window.sendRegion('region-seek-result', { id: data.id, ok: true })
      window.results.push({ type, data })
    })
    frame.srcdoc = html; document.body.append(frame)
  }, { ...surface, generation })
  await page.waitForFunction(() => window.results.some(item => ['active','failed'].includes(item.type)))
  assert.deepEqual(await page.evaluate(() => window.results.filter(item => item.type === 'failed')), [])
  const guest = page.frames().find(frame => frame !== page.mainFrame())
  const debuggerSession = await page.context().newCDPSession(guest)
  async function currentLine() {
    if (builtin) return guest.locator('.lrc-line.on .content').first().textContent({ timeout: 2500 }).then(text => text.replace(/\s/g, ''))
    const { root } = await debuggerSession.send('DOM.getDocument', { depth: -1, pierce: true })
    function visit(node) {
      if (node.localName === 'button' && node.attributes?.includes('aria-current')) return node.children?.[0]?.nodeValue
      for (const child of [...(node.children ?? []), ...(node.shadowRoots ?? []), ...(node.contentDocument ? [node.contentDocument] : [])]) {
        const value = visit(child); if (value) return value
      }
    }
    return visit(root)
  }
  assert.equal(await currentLine(), '第一行')
  await page.evaluate(() => window.sendRegion('region-update', { positionMs: 0, playing: true }))
  const timeout = Date.now() + 5000
  while ((await currentLine()) !== '第二行' && Date.now() < timeout) await new Promise(resolve => setTimeout(resolve, 25))
  assert.equal(await currentLine(), '第二行')
  await page.evaluate(() => window.sendRegion('region-update', { positionMs: 0, playing: false }))
  await new Promise(resolve => setTimeout(resolve, 450))
  assert.equal(await currentLine(), '第一行')
  if (builtin) {
    const duet = guest.locator('.is-duet.is-yrc')
    assert.equal(await duet.locator('.yrc-word').count(), 2)
    const first = guest.getByRole('button',{name:'第一行'})
    assert.equal(await first.getAttribute('tabindex'),'0')
    await page.keyboard.press('Tab')
    assert.ok(await first.evaluate(element => element.matches(':focus')))
    await page.keyboard.press('ArrowDown')
    assert.ok(await duet.evaluate(element => element.matches(':focus')))
    await page.keyboard.press('Enter')
    await page.keyboard.press('ArrowUp')
    await page.keyboard.press('Space')
    await duet.click()
    await page.waitForFunction(() => window.results.filter(item => item.type === 'region-seek').length >= 3)
    assert.deepEqual(await page.evaluate(() => window.results.filter(item => item.type === 'region-seek').map(item => item.data.milliseconds)),[240,0,240])
  } else {
    await page.keyboard.press('Tab'); await page.keyboard.press('Tab'); await page.keyboard.press('Enter')
  }
  await page.waitForFunction(() => window.results.some(item => item.type === 'region-seek'), null, {timeout:5000})
  assert.equal(await page.evaluate(() => window.results.find(item => item.type === 'region-seek').data.milliseconds), 240)
  await page.evaluate(() => window.sendRegion('dispose', {}))
  await page.waitForFunction(() => window.results.some(item => item.type === 'disposed'))
  if (builtin) assert.equal(await guest.locator('.lyric-scroll-container').count(), 0)
  assert.deepEqual(errors, [])
  console.log('Sandboxed player-skin TS (' + (options ? 'ordinary script' : 'script setup') + '): initial line, advancing clock, paused clock, ' + (builtin ? 'desktop duet words, keyboard and pointer' : 'keyboard') + ' seek at 240ms and disposal passed.')
} finally {
  await application?.close()
  if (dirname(scratch) !== cli) throw Error('Unexpected temporary directory')
  await rm(scratch, { recursive: true, force: true, maxRetries: 3 })
}
