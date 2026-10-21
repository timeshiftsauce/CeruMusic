import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { createServer } from 'vite'
import { chromium } from 'playwright'

const directory = resolve('.tmp/amll-check')
await mkdir(directory, { recursive: true })
await writeFile(
  resolve(directory, 'index.html'),
  `<!doctype html>
<html><head><meta charset="utf-8"><style>
body { margin: 0; background: #181820; color: white; font-family: sans-serif }
#background { position: absolute; inset: 0 }
#lyrics { position: absolute; inset: 30px 5% 30px 48%; height: 650px;
  --amll-lp-font-size: 36px; --amll-lp-color: white }
canvas { z-index: 0 !important }
</style></head><body><div id="app"></div><script type="module">
import { createApp, ref, reactive, h, nextTick } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { LyricPlayer } from '@applemusic-like-lyrics/vue'
import '@applemusic-like-lyrics/core/style.css'
import { usePlayerBackground } from '/src/renderer/src/composables/usePlayerBackground.ts'
import { playSetting } from '/src/renderer/src/store/playSetting.ts'

const pinia = createPinia()
setActivePinia(pinia)
const settings = playSetting()
const state = reactive({ active: true, hasLyric: true, album: '', volume: 0,
  time: 1500, playing: true, disabled: false })
const lines = Array.from({ length: 40 }, (_, index) => ({
  startTime: index * 3000, endTime: index * 3000 + 2800,
  words: [{ word: '流动的', startTime: index * 3000, endTime: index * 3000 + 1200 },
    { word: '音乐与歌词 ' + index, startTime: index * 3000 + 1200, endTime: index * 3000 + 2800 }],
  translatedLyric: 'Music and lyrics ' + index, romanLyric: '', isBG: false, isDuet: false
}))
function cover(colors) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d'); const gradient = ctx.createLinearGradient(0, 0, 256, 256)
  colors.forEach((color, i) => gradient.addColorStop(i / (colors.length - 1), color))
  ctx.fillStyle = gradient; ctx.fillRect(0, 0, 256, 256); return canvas.toDataURL()
}
state.album = cover(['#ff651a', '#d52176', '#682dbe', '#131c62'])
createApp({ setup() {
  const host = ref(null); const lyric = ref(null)
  const { ready } = usePlayerBackground(host, {
    renderer: () => settings.getBackgroundRenderer, album: () => state.album,
    active: () => state.active, hasLyric: () => state.hasLyric,
    lowFreqVolume: () => settings.getIsBackgroundBeat ? state.volume : 0
  })
  window.fixture = { state, settings, ready, lyric, nextTick, cover,
    seek: (time) => { state.time = time; lyric.value.lyricPlayer.setCurrentTime(time, true) } }
  return () => [h('div', { id: 'background', ref: host }), h(LyricPlayer, {
    id: 'lyrics', ref: lyric, lyricLines: lines, currentTime: state.time,
    playing: state.playing, disabled: state.disabled,
    onLineClick: (event) => { state.time = event.line.getLine().startTime },
    style: { height: '650px' }
  })]
}}).use(pinia).mount('#app')
</script></body></html>`
)

const server = await createServer({
  configFile: false,
  cacheDir: resolve(directory, 'cache'),
  root: process.cwd(),
  resolve: { alias: { '@renderer': resolve('src/renderer/src') } },
  optimizeDeps: { entries: [resolve(directory, 'index.html')] },
  server: { host: '127.0.0.1', port: 0 }
})
let browser
try {
  await server.listen()
  browser = await chromium.launch({
    channel: process.env.AMLL_TEST_BROWSER || 'msedge',
    headless: true,
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
  })
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } })
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(server.resolvedUrls.local[0] + '.tmp/amll-check/index.html')
  await page.waitForFunction(() => window.fixture?.ready.value)

  for (const renderer of ['pixi', 'mesh', 'isolation', 'titanium', 'mesh', 'titanium']) {
    await page.evaluate((type) => {
      fixture.settings.setBackgroundRenderer(type)
      fixture.settings.setIsBackgroundBeat(true)
      fixture.state.volume = 0.85
    }, renderer)
    await page.waitForFunction(() => fixture.ready.value)
    await page.waitForTimeout(400)
    assert.equal(await page.locator('#background canvas').count(), 1)
    assert.deepEqual(
      await page.evaluate(() => ({
        renderer: fixture.settings.getBackgroundRenderer,
        beat: fixture.settings.getIsBackgroundBeat
      })),
      { renderer, beat: renderer === 'mesh' || renderer === 'titanium' }
    )
    console.log('PASS background:', renderer)
  }

  const readPixels = () => page.locator('#background canvas').screenshot()
  const initial = await readPixels()
  await page.evaluate(() => {
    fixture.state.hasLyric = false
    fixture.state.album = fixture.cover(['#047f90', '#21dc97', '#b9ee51'])
  })
  await page.waitForTimeout(2400)
  assert.notDeepEqual(await readPixels(), initial, 'Album change must update Titanium')
  await page.evaluate(() => {
    fixture.state.active = false
  })
  await page.waitForTimeout(100)
  const paused = await readPixels()
  await page.waitForTimeout(350)
  assert.deepEqual(await readPixels(), paused, 'Hidden background must stop drawing')
  await page.evaluate(() => {
    fixture.state.active = true
    fixture.state.hasLyric = true
  })
  await page.waitForTimeout(450)
  assert.notDeepEqual(await readPixels(), paused, 'Background must resume')
  console.log('PASS album transitions, lyric scrim, pause/resume')

  await page.evaluate(() => fixture.seek(46000))
  await page.waitForTimeout(700)
  assert.equal(await page.evaluate(() => fixture.lyric.value.lyricPlayer.getCurrentTime()), 46000)
  assert.ok(
    await page
      .locator('#lyrics')
      .innerText()
      .then((text) => text.includes('音乐与歌词'))
  )
  const brightnessCopies = await page.locator('#lyrics [class*="lyricMainLineDim"]').count()
  assert.ok(brightnessCopies > 0 && brightnessCopies < 40, 'Brightness copies must be windowed')
  await page.locator('#lyrics').hover()
  await page.mouse.wheel(0, 320)
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    fixture.lyric.value.lyricPlayer.resetScroll()
    fixture.seek(1500)
    fixture.state.playing = false
    fixture.state.disabled = true
  })
  await page.waitForTimeout(100)
  await page.evaluate(() => {
    fixture.state.disabled = false
    fixture.state.playing = true
  })
  await page.screenshot({ path: resolve(directory, 'titanium-lyrics.png') })
  console.log('PASS latest lyric renderer, seek, scroll and animation lifecycle')
  assert.deepEqual(errors, [], 'Browser errors')
} finally {
  await browser?.close()
  await server.close()
}
