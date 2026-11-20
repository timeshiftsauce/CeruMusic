import assert from 'node:assert/strict'

export async function verifyPageMounts(page) {
  const mounts = ['sidebar', 'settings', 'home-tab', 'playlist-section']
  const pages = mounts.flatMap((mount) =>
    [false, true].map((loggedIn) => ({
      id: (loggedIn ? 'member-' : 'guest-') + mount,
      title: (loggedIn ? '会员入口 ' : '访客入口 ') + mount,
      view: 'panel',
      mount,
      when: { loggedIn }
    }))
  )
  pages.push({ id: 'context', title: '歌单上下文验收', view: 'context', mount: 'playlist-section' })
  const manifest = {
    manifestVersion: 3,
    id: 'test.mount-visibility',
    name: '挂载验收',
    version: '1.0.0',
    engines: { hostApi: '^3.0.0', logicRuntime: 'ceru-js@1' },
    entry: {
      logic: { module: 'logic.main' },
      views: [
        { id: 'panel', kind: 'native', module: 'render' },
        { id: 'context', kind: 'component', module: 'view.context' }
      ]
    },
    provides: { actions: [{ id: 'render', title: '渲染' }] },
    ui: { pages }
  }
  const id = await page.evaluate(
    async (source) => {
      const { plugins } = window.ceruQa
      const added = await plugins.addPlugin(source, 'mount-visibility.js')
      if (!added.pluginId) throw Error(added.error)
      const enabled = await plugins.setEnabled(added.pluginId, true)
      if (enabled.error) throw Error(enabled.error)
      return added.pluginId
    },
    'exports.manifest = ' +
      JSON.stringify(manifest) +
      '; exports.activate = function(ctx){ctx.actions.register("render",()=>({type:"page",title:"挂载成功",sections:[]}))}' +
      "; exports.modules = {'view.context': function(){ return function(bridge){ const value=bridge.props.playlist; bridge.root.host.dataset.rootMode=bridge.root.mode; bridge.root.host.dataset.playlistContext=JSON.stringify({props:bridge.props,frozen:Object.isFrozen(bridge.props)&&(!value || (Object.isFrozen(value)&&Object.isFrozen(value.ref)))}); bridge.root.textContent='歌单区块'; } }};"
  )
  const navigate = (hash) =>
    page.evaluate((path) => {
      location.hash = path
    }, hash)
  const title = (mount, member = false) => (member ? '会员入口 ' : '访客入口 ') + mount
  const check = async (root, mount) => {
    const guest = root.getByText(title(mount), { exact: true })
    await guest.waitFor()
    assert.equal(await root.getByText(title(mount, true), { exact: true }).count(), 0)
    return guest
  }
  const content = (root) => root.getByRole('heading', { name: '挂载成功' }).waitFor()
  const developmentEnabled = await page.evaluate(async () => (await window.ceruQa.plugins.devState()).enabled)
  try {
    if (!developmentEnabled) await page.evaluate(() => window.ceruQa.plugins.setDevMode(true))
    const sidebar = page.locator('.sidebar .nav-section')
    await (await check(sidebar, 'sidebar')).click()
    await content(page.locator('.plugin-page'))
    await navigate('/plugin/' + id + '/member-sidebar')
    await page.locator('.plugin-page [role=status]').filter({ hasText: '页面不可用' }).waitFor()
    assert.equal(await page.locator('.plugin-page .native-heading').count(), 0)
    await navigate('/settings')
    await (await check(page.locator('.nav-group'), 'settings')).click()
    await content(page.locator('.section-container .plugin-page'))
    await navigate('/home/find')
    await (await check(page.locator('.find-tabs'), 'home-tab')).click()
    await content(page.locator('.find-tabs .plugin-page'))
    await navigate('/home/songlist')
    const sections = page.locator('.plugin-playlist-sections')
    await content(sections.getByRole('region', { name: title('playlist-section'), exact: true }))
    assert.equal(
      await sections
        .getByRole('region', { name: title('playlist-section', true), exact: true })
        .count(),
      0
    )
    const readContext = async () => {
      const section = page.getByRole('region', { name: '歌单上下文验收', exact: true })
      await section.locator('.component-root[data-playlist-context], iframe').waitFor({state:'attached'})
      const direct = section.locator('.component-root[data-playlist-context]')
      const root = await direct.count() ? direct : section.frameLocator('iframe').locator('#plugin-root[data-playlist-context]')
      await root.waitFor({ state: 'attached' })
      assert.equal(await root.getAttribute('data-root-mode'), 'closed')
      assert.equal(await root.evaluate(element => element.shadowRoot === null), true)
      return JSON.parse(await root.getAttribute('data-playlist-context'))
    }
    assert.deepEqual(await readContext(), { props: {}, frozen: true })
    const playlistId = await page.evaluate(async () => {
      const result = await window.ceruQa.songList.create('验收歌单', '只传摘要', 'local', {
        privateField: 'not-for-plugins'
      })
      if (!result.success) throw Error(result.error)
      return result.data.id
    })
    try {
      await navigate(
        '/home/list/' + encodeURIComponent(playlistId) + '?type=local&source=local&title=路由旧标题'
      )
      await page.locator('.detail-plugin-sections').waitFor()
      assert.deepEqual(await readContext(), {
        props: {
          playlist: {
            ref: { id: playlistId, location: 'local' },
            name: '验收歌单',
            description: '只传摘要',
            trackCount: 0,
            writable: true
          }
        },
        frozen: true
      })
    } finally {
      await navigate('/home/local')
      await page.evaluate((id) => window.ceruQa.songList.delete(id), playlistId)
    }
    console.log(
      'Playlist detail mounted a component with frozen, allowlisted metadata from the actual local library'
    )
    console.log(
      'Four v3 mounts rendered guest pages and omitted login-only pages; a direct link did not mount the hidden view'
    )
  } finally {
    await navigate('/home/local')
    await page.evaluate((id) => window.ceruQa.plugins.uninstallPlugin(id), id)
    if (!developmentEnabled) await page.evaluate(() => window.ceruQa.plugins.setDevMode(false))
  }
}
