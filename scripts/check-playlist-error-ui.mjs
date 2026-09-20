import assert from 'node:assert/strict'
import { chromium } from 'playwright'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const base = process.env.CERU_PREVIEW_URL || 'http://127.0.0.1:5187'
const compiled = await (await fetch(base + '/src/components/Music/PlaylistLoadError.vue')).text()
const vueModule = compiled.match(/from\s+["']([^"']+\/vue\.js[^"']*)["']/)?.[1]
assert.ok(vueModule)
const browser = await chromium.launch({
  executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  headless: true
})
try {
  const page = await browser.newPage({ viewport: { width: 1180, height: 720 } })
  const errors = []
  page.on('pageerror', error => errors.push(error.message))
  await page.route('**/__playlist_error_preview', route => route.fulfill({
    contentType: 'text/html',
    body: `<!doctype html><html lang="zh"><meta charset="utf-8"><style>
      html,body,#app{height:100%;margin:0}body{font-family:'Microsoft YaHei',sans-serif;background:#fff}
      #app{display:flex;padding:24px;box-sizing:border-box}.content{flex:1;display:flex;border-radius:10px;background:#fff;box-shadow:0 2px 12px #0000000d}
      :root{--td-brand-color:#ff527c;--td-text-color-primary:#1f2329;--td-text-color-secondary:#6b7280;--td-text-color-placeholder:#9ca3af;--td-bg-color-secondarycontainer:#f4f5f7}
    </style><div id="app"><div class="content"><playlist-error /></div></div>
    <script type="module">import{createApp}from'${vueModule}';import ErrorState from'/src/components/Music/PlaylistLoadError.vue';
    createApp({components:{PlaylistError:ErrorState},template:'<playlist-error message="音源暂时未能读取这张歌单，请重试或更换音源插件。" />'}).mount('#app');</script></html>`
  }))
  await page.goto(base + '/__playlist_error_preview', { waitUntil: 'domcontentloaded' })
  await page.locator('.playlist-load-error').waitFor()
  const state = await page.locator('.playlist-load-error').boundingBox()
  const title = await page.locator('h3').boundingBox()
  assert.ok(Math.abs(title.x + title.width / 2 - (state.x + state.width / 2)) < 3)
  assert.equal(await page.getByText(/Cannot read|undefined|TypeError/).count(), 0)
  assert.equal(await page.getByRole('button', { name: /重新加载/ }).count(), 1)
  assert.deepEqual(errors, [])
  const screenshot = join(tmpdir(), 'ceru-playlist-error.png')
  await page.screenshot({ path: screenshot })
  console.log('PASS: centered semantic playlist error, no raw JavaScript exception; ' + screenshot)
} finally {
  await browser.close()
}
