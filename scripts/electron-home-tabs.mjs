import assert from 'node:assert/strict'
import { readFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function verifyHomeTabs(page) {
  const installed = []
  const add = async (code, file) => {
    const added = await page.evaluate(([code, file]) => window.ceruQa.plugins.addPlugin(code, file), [code, file])
    assert.ok(added.pluginId, added.error)
    installed.push(added.pluginId)
    assert.equal((await page.evaluate(id => window.ceruQa.plugins.setEnabled(id, true), added.pluginId)).error, undefined)
  }
  const output = join(import.meta.dirname, '../dist/plugin-upgrade-local-2.5.0/qa')
  await mkdir(output, { recursive: true })
  try {
    const fixture = await readFile(new URL('../src/main/services/plugin/v3/__fixtures__/source-project.js', import.meta.url), 'utf8')
    // Only the dedicated native pages below contribute tabs in this scenario.
    const withoutHome = fixture.replace(/homeSections: \[[\s\S]*?\n    \]/, 'homeSections: []')
    assert.notEqual(withoutHome, fixture)
    await add(withoutHome, 'tabs-source.js')
    await add(withoutHome.replaceAll('source-project', 'alternate-source').replaceAll('"catalog"', '"alternate"'), 'tabs-alternate.js')
    const pages = [
      { id: 'account', title: '账号推荐', when: { selectedSource: 'catalog' } },
      { id: 'discovery', title: '发现', when: { selectedSource: 'catalog' } },
      { id: 'alternate', title: '其他推荐', when: { selectedSource: 'alternate' } },
      { id: 'playlists', title: '歌单' },
      { id: 'charts', title: '排行榜' }
    ].map((page, order) => ({ ...page, order, view: page.id, mount: 'home-tab' }))
    const manifest = {
      manifestVersion: 3, id: 'test.home-tabs', name: '首页选中条验收', version: '1.0.0',
      engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
      entry: { logic: { module: 'logic.main' }, views: pages.map(page => ({ id: page.id, kind: 'native', module: page.id })) },
      provides: { actions: pages.map(page => ({ id: page.id, title: page.title })) }, ui: { pages }
    }
    await add('exports.manifest=' + JSON.stringify(manifest) + ';exports.activate=ctx=>{' + pages.map(page => 'ctx.actions.register(' + JSON.stringify(page.id) + ',()=>({type:"page",title:' + JSON.stringify('内容 ' + page.id) + ',sections:[]}));').join('') + '}', 'home-tabs.js')
    const select = async name => {
      await page.getByRole('button', { name: '选择音源', exact: true }).click()
      await page.locator('.source-list').getByRole('button', { name, exact: typeof name === 'string' }).click()
      await page.locator('.source-list').waitFor({ state: 'detached' })
      await page.evaluate(() => { location.hash = '/home/find' })
      await page.locator('.find-tabs').waitFor()
    }
    const results = []
    const check = async (count, title, content) => {
      await page.waitForFunction(count => document.querySelectorAll('.find-tabs .n-tabs-tab[data-name]').length === count, count).catch(async error => {
        console.log('Tabs state:', await page.locator('.find-tabs').innerText(), await page.evaluate(() => localStorage.getItem('ceru-music-pending:userInfo') ?? localStorage.getItem('userInfo')))
        throw error
      })
      await page.locator('.find-tabs .n-tab-pane').getByRole('heading', { name: '内容 ' + content, exact: true }).waitFor()
      // Observe settled geometry over multiple frames so a stale capsule cannot pass.
      const samples = await page.locator('.find-tabs').evaluate(async root => {
        const samples = []
        for (let frame = 0; frame < 24; frame++) {
          await new Promise(requestAnimationFrame)
          const active = root.querySelector('.n-tabs-tab--active')
          const capsule = root.querySelector('.n-tabs-capsule')
          if (!active || !capsule) throw Error('Missing active tab or capsule')
          const a = active.getBoundingClientRect(), c = capsule.getBoundingClientRect()
          samples.push({ title: active.textContent.trim(), x: a.x - c.x, width: a.width - c.width })
        }
        return samples
      })
      for (const sample of samples) {
        assert.equal(sample.title, title)
        assert.ok(Math.abs(sample.x) <= 1 && Math.abs(sample.width) <= 1, JSON.stringify(sample))
      }
      results.push({ count, title, samples })
    }
    await select('source-project')
    await check(4, '账号推荐', 'account')
    await page.locator('.find-tabs .n-tabs-tab[data-name]').getByText('歌单', { exact: true }).click()
    // Normal tab clicks retain the library's content/capsule animation.
    await page.waitForTimeout(350)
    await check(4, '歌单', 'playlists')
    await select('alternate-source')
    await check(3, '歌单', 'playlists')
    await select(/本地/)
    await check(2, '歌单', 'playlists')
    for (let attempt = 0; attempt < 2; attempt++) {
      await select('source-project')
      await select('alternate-source')
      await select(/本地/)
    }
    await check(2, '歌单', 'playlists')
    await select('source-project')
    await check(4, '歌单', 'playlists')
    await page.locator('.find-tabs .n-tabs-tab[data-name]').getByText('账号推荐', { exact: true }).click()
    await page.waitForTimeout(350)
    await select('alternate-source')
    await check(3, '其他推荐', 'alternate')
    await select(/本地/)
    await check(2, '歌单', 'playlists')
    await page.locator('.find-tabs').screenshot({ path: join(output, 'home-tabs-two.png') })
    await writeFile(join(output, 'home-tabs-geometry.json'), JSON.stringify(results, null, 2) + '\n')
    console.log('Home tabs: 4→3→2→4, repeated source switching, retained middle selection, removed active tab fallback, correct capsule width/position and matching content passed.')
  } finally {
    for (const id of installed.reverse()) await page.evaluate(id => window.ceruQa.plugins.uninstallPlugin(id), id)
  }
}
