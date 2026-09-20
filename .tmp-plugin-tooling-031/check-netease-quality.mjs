import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const code = await readFile('G:/code/pluginclitest/网易云账号/dist/plugin.js', 'utf8')
const browser = await chromium.connectOverCDP('http://127.0.0.1:9222')
try {
  const page = browser.contexts().flatMap(c => c.pages()).find(p => p.url().includes('/#/home'))
  assert.ok(page)
  const result = await page.evaluate(async code => {
    const id = '9832c5669052ac6dc0016bd42fea07f6'
    const installed = await window.api.plugins.addPlugin(code, '网易云账号', id)
    if (installed?.error) throw new Error(installed.error)
    {
      const ref = JSON.parse(new URLSearchParams(location.hash.split('?')[1]).get('resourceRef')) ?? {
        pluginId: 'ceru.netease-account', providerId: 'wy', kind: 'playlist', id: '3136952023'
      }
      const detail = await window.api.music.requestSdk('getPlaylistDetail', {
        source: 'wy', id: ref.id, ref, page: 1
      })
      const song = detail.list?.find(item => item.types?.some(t => t.size))
      if (!song) throw new Error('歌曲未返回音质大小')
      const { createQualityDialog } = await import('/src/utils/audio/download.ts')
      void createQualityDialog(song, 'flac')
      return { scope: song.pluginResource.scope, types: song.types, songId: song.songmid }
    }
  }, code)
  assert.equal(result.scope, 'provider')
  await page.locator('.quality-selector').last().waitFor()
  const rows = await page.locator('.quality-selector').last().locator('.quality-item').allTextContents()
  assert.ok(rows.some(row => row.includes('超清母带')), 'master is mapped and displayed')
  assert.ok(rows.some(row => /\d+(\.\d+)?\s*[KMG]?B/.test(row)), 'actual download dialog shows sizes')
  await page.screenshot({ path: '.tmp-plugin-tooling-031/netease-quality-sizes.png' })
  console.log(JSON.stringify({ songId: result.songId, sizes: result.types, downloadRows: rows, result: 'passed' }))
} finally {
  await browser.close()
}
