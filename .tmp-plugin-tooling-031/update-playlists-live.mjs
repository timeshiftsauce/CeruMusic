import { chromium } from 'playwright'
import { readFile, writeFile, copyFile } from 'node:fs/promises'
import assert from 'node:assert/strict'
const id = '9832c5669052ac6dc0016bd42fea07f6'
const artifact = 'G:/code/pluginclitest/网易云账号/dist/plugin.js'
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
try {
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('#/home/'))
  assert.ok(page)
  const code = await readFile(artifact, 'utf8')
  const contributions = await page.evaluate(() => window.api.plugins.contributions())
  const installed = contributions.find(p => p.manifest?.id === 'ceru.netease-account')
  assert.equal(installed?.pluginId, id)
  if (installed.manifest.version !== '1.2.1') {
    await copyFile('C:/Users/Administrator/AppData/Roaming/ceru-music/plugins/' + id + '-plugin.js', 'G:/code/pluginclitest/网易云账号/.ceru-dev/backups/installed-1.2.0.js')
    const result = await page.evaluate(({id,code}) => window.api.plugins.addPlugin(code,'plugin.js',id), {id,code})
    assert.ok(!result.error, JSON.stringify(result))
  }
  await page.getByRole('button', { name: /歌单$/ }).first().click()
  const section = page.getByRole('region', {name:'网易云歌单'})
  await section.waitFor({timeout:30000})
  await section.locator('.playlist-card').first().waitFor({timeout:45000})
  const result = {
    page:page.url(),
    nativeCards:await section.locator('.playlist-card').count(),
    frames:await page.locator('iframe,webview').count(),
    extraLibraryButton:await page.getByRole('button',{name:'我的歌单',exact:true}).count(),
    scroll:await section.locator('.native-surface').evaluate(el => getComputedStyle(el).overflowY)
  }
  assert.match(result.page, /home\/songlist/)
  assert.ok(result.nativeCards > 0)
  assert.equal(result.frames,0)
  assert.equal(result.extraLibraryButton,0)
  assert.equal(result.scroll,'visible')
  await section.scrollIntoViewIfNeeded()
  await page.screenshot({path:'G:/code/CeruMusic/.tmp-plugin-tooling-031/live-inline-playlists.png'})
  await writeFile('G:/code/CeruMusic/.tmp-plugin-tooling-031/live-inline-playlists.json',JSON.stringify(result,null,2))
  console.log(result)
} finally { await browser.close() }
