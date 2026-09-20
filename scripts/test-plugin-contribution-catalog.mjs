import assert from 'node:assert/strict'
import { build } from 'esbuild'

const bundled = await build({
  entryPoints: ['src/renderer/src/utils/pluginContributionCatalog.ts'],
  bundle: true, write: false, platform: 'node', format: 'esm'
})
const { getPluginContributionGroups, CONTRIBUTION_TYPES } = await import(
  'data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64')
)

const contributions = {
  providers: [{ id: 'shared', name: '公共平台', protocols: ['music.resolve@1'] }],
  accountItems: [{ id: 'account', title: '个人账号', view: 'login', action: 'account.summary', logoutAction: 'logout' }],
  homeSections: [
    { id: 'lists', kind: 'playlists', title: '推荐歌单' },
    { id: 'daily', kind: 'custom', title: '每日推荐', view: 'daily' }
  ],
  playlistSections: [{ id: 'library', title: '我的歌单', view: 'library' }],
  playlistImporters: [{ id: 'import', title: '导入外部歌单' }],
  sidebarItems: [{ id: 'sidebar', title: '快捷入口', group: 'music', view: 'login' }],
  settingsPages: [{ id: 'settings', title: '登录设置', view: 'login' }],
  uiExtensions: [{ id: 'player', slot: 'player.actions', view: 'login', mode: 'append' }],
  menus: [{ id: 'menu', slot: 'track.actions', title: '歌曲操作', commandId: 'command' }],
  styles: [{ id: 'theme', resource: 'style.css', scope: 'surface' }],
  commands: [{ id: 'command', title: '插件自己的操作', action: 'own.action' }],
  lyricConverters: [{ id: 'lyrics', title: '歌词转换', formats: ['lrc', 'yrc'] }],
  guestAdapters: [{ id: 'adapter', title: '兼容环境', format: 'example' }]
}
assert.deepEqual(Object.keys(CONTRIBUTION_TYPES).sort(), Object.keys(contributions).sort(),
  'every SDK contribution type has a fixture; the typed descriptor map enforces SDK coverage')

const plugin = {
  pluginId: 'test-plugin',
  manifest: {
    name: '独立开发者插件', contributes: contributions,
    modules: {
      surfaces: [
        { id: 'login', title: '登录界面', kind: 'web', entry: 'web.login' },
        { id: 'daily', title: '推荐界面', kind: 'native', entry: 'render.daily' },
        { id: 'library', title: '歌单界面', kind: 'native', entry: 'render.library' }
      ],
      share: { entry: 'share.main' }
    }
  },
  providerMethods: { shared: ['tracks.resolve', 'tracks.future'] },
  registrations: {
    providers: ['shared'], actions: ['own.action', 'account.summary', 'render.daily', 'render.library', 'private.callback'],
    importers: ['import'], lyricConverters: ['lyrics', 'runtime-only-converter']
  }
}
const groups = getPluginContributionGroups([plugin])
const rows = groups.flatMap(group => group.rows)
const declarations = rows.flatMap(row => row.declarations)
for (const [type, items] of Object.entries(contributions)) {
  for (const item of items) {
    assert.equal(declarations.filter(d => d.type === type && d.id === item.id).length, 1,
      `declaration must be represented exactly once: ${type}/${item.id}`)
  }
}
assert.ok(groups.find(group => group.key === '__accounts').rows.some(row => row.label === '个人账号'))
assert.ok(groups.find(group => group.key === '__ui').rows.some(row => row.label === '每日推荐'))
assert.ok(groups.find(group => group.key === '__playlists').rows.some(row => row.label === '我的歌单'))
assert.ok(rows.some(row => row.label === '登录设置'), 'shared surfaces do not hide distinct settings entries')
assert.ok(rows.some(row => row.label === 'private.callback' && !row.selectable))
assert.ok(rows.some(row => row.label.includes('runtime-only-converter') && row.status === '已注册'))
assert.equal(declarations.filter(d => d.type === 'modules.surfaces').length, 3)
assert.equal(declarations.filter(d => d.type === 'modules.share').length, 1)

const second = structuredClone(plugin)
second.pluginId = 'another-plugin'
second.manifest.contributes = { homeSections: [{ id: 'other-lists', kind: 'playlists', title: '另一套推荐' }] }
const home = getPluginContributionGroups([plugin, second]).find(group => group.key === '__ui')
assert.equal(home.rows.filter(row => row.key === 'home:playlists').length, 1)
assert.equal(home.rows.find(row => row.key === 'home:playlists').implementations.length, 2)
assert.equal(home.rows.find(row => row.key === 'home:playlists').declarations.length, 2)
assert.ok(getPluginContributionGroups([second]).length, 'UI-only plugins appear without music providers')

const future = structuredClone(plugin)
future.registrations.futureRegistry = ['future-runtime-service']
future.manifest.contributes = {
  futureWidgets: [{ id: 'future', title: '新类型的服务' }],
  playlistSections: [{ id: 'bad-library', title: '未完成歌单界面', view: 'missing' }]
}
const futureRows = getPluginContributionGroups([future]).flatMap(group => group.rows)
assert.ok(futureRows.some(row => row.label === '新类型的服务' && row.status === '尚未识别' && !row.selectable))
assert.ok(futureRows.some(row => row.label === 'futureRegistry · future-runtime-service' && row.status === '已注册' && !row.selectable))
assert.ok(futureRows.some(row => row.label === '未完成歌单界面' && row.status === '缺少界面声明'))
console.log('PASS: all SDK contribution types, runtime-only services, UI-only plugins, shared slots, missing references and future types remain visible')
