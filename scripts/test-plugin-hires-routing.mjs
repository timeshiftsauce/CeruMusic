import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const state = { calls: [] }
globalThis.__hiresRoutingTest = state

async function bundle(entry, stubs = {}, extra = '') {
  const file = await readFile(new URL('../' + entry, import.meta.url), 'utf8')
  const source = entry.endsWith('.vue')
    ? file.match(/<script setup lang="ts">([\s\S]*?)<\/script>/)[1]
    : file
  const result = await build({
    stdin: { contents: source + extra, sourcefile: entry, loader: 'ts', resolveDir: root },
    bundle: true,
    platform: 'node',
    format: 'esm',
    write: false,
    alias: {
      '@common': fileURLToPath(new URL('../src/common', import.meta.url)),
      '@renderer': fileURLToPath(new URL('../src/renderer/src', import.meta.url))
    },
    plugins: [
      {
        name: 'isolated-hires-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, ({ path }) =>
            Object.hasOwn(stubs, path) ? { path, namespace: 'fixture' } : undefined
          )
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
            contents: 'const s=globalThis.__hiresRoutingTest;' + stubs[path],
            resolveDir: root
          }))
        }
      }
    ]
  })
  return import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
  )
}

try {
  const { migratePluginCapabilitySelections } = await bundle('src/common/pluginCapabilities.ts')
  assert.deepEqual(
    migratePluginCapabilitySelections({
      'shared:action:artwork.hires': 'plugin-a'
    }),
    { 'shared:tracks.artworkHires': 'plugin-a' },
    'migrate the old action name to the real provider method'
  )
  assert.deepEqual(
    migratePluginCapabilitySelections({
      'shared:action:artwork.hires': 'plugin-a',
      'shared:tracks.artworkHires': 'plugin-b'
    }),
    { 'shared:tracks.artworkHires': 'plugin-b' },
    'preserve explicit provider choices during refresh'
  )

  state.uiStore = { userInfo: { sourcePluginMap: { shared: 'plugin-a' } } }
  state.contributions = {
    value: ['a', 'b'].map((name) => ({
      pluginId: 'plugin-' + name,
      manifest: { name, contributes: { providers: [{ id: 'shared', name: 'Shared' }] } },
      providerMethods: { shared: ['tracks.artworkHires', 'tracks.future'] },
      actionIds: ['artwork.hires']
    }))
  }
  const panel = await bundle(
    'src/renderer/src/components/Settings/PluginRoutingPanel.vue',
    {
      vue: "export { computed, ref, watch, nextTick } from 'vue/dist/vue.runtime.esm-bundler.js'; export const onActivated=()=>{}; export const onDeactivated=()=>{}",
      '@renderer/store/LocalUserDetail': 'export const LocalUserDetailStore=()=>s.uiStore',
      '@renderer/services/pluginState':
        'export const activePluginContributions=s.contributions; export const selectCapabilityImplementation=()=>{}; export const selectUIImplementation=()=>{}',
      'tdesign-vue-next': 'export const MessagePlugin={}'
    },
    '\nexport { rows, options };'
  )
  const row = panel.rows.value.find((row) => row.capability === 'tracks.artworkHires')
  assert.equal(row.label, '高清封面')
  assert.equal(row.selectable, true)
  assert.deepEqual(panel.options(row), [
    { label: '自动（a）', value: '' },
    { label: 'a', value: 'plugin-a' },
    { label: 'b', value: 'plugin-b' }
  ])
  assert.equal(
    panel.rows.value.some((row) => row.capability === 'action:artwork.hires'),
    false
  )
  assert.equal(panel.rows.value.find((row) => row.capability === 'tracks.future').selectable, false)

  const registry = await bundle(
    'src/main/services/plugin/index.ts',
    {
      electron: 'export const dialog={}',
      '../../utils/path': 'export const getAppDirPath=()=>"unused"',
      '../networkProxy': 'export const getRequestAgentsFor=()=>({})',
      axios: 'export default {}',
      './manager/PluginHost': 'export default class Host {}',
      './uiBridge': 'export const cancelPluginUI=()=>{}; export const pluginChanged=()=>{}',
      './logger': 'export default class Logger {}; export const getLog=()=>{}',
      './pluginConfig': [
        'getPluginConfig',
        'savePluginConfig',
        'deletePluginConfig',
        'getPluginPermissions',
        'savePluginPermissions',
        'getPluginStates',
        'savePluginState',
        'deletePluginState'
      ]
        .map((name) => `export const ${name}=()=>({})`)
        .join(';'),
      '@shiqianjiang/ceru-plugin-core': 'export const readPluginArtifact=()=>{}',
      '@shiqianjiang/ceru-plugin-core/guests': 'export class GuestStore {}',
      './storage': 'export const deletePluginStorage=()=>{}'
    },
    '\nexport const fixture = { loadedPlugins, installedPlugins };'
  )
  const { default: service, fixture } = registry
  state.service = service
  for (const [order, id] of ['plugin-a', 'plugin-b'].entries()) {
    fixture.loadedPlugins[id] = {
      supported: true,
      getPluginInfo: () => ({ id }),
      isDisabled: () => false,
      supportsV2Provider(source, method) {
        return (
          source === 'shared' && (!method || (this.supported && method === 'tracks.artworkHires'))
        )
      },
      async getHiresPic(source, song, artworkUrl, targetSize) {
        state.calls.push({ id, source, ref: song.pluginResource, artworkUrl, targetSize })
        return 'https://media.example/hires/' + id
      }
    }
    fixture.installedPlugins.set(id, { pluginId: id, state: { order } })
  }
  const { default: sdk } = await bundle('src/main/services/musicSdk/service.ts', {
    '../plugin/index': 'export default s.service',
    '../localLyrics': 'export const resolveLocalLyrics=()=>{}',
    '../LocalMusicIndex': 'export const localMusicIndexService={}',
    '../../utils/tagUtils': 'export const readTags=()=>({})',
    '../musicCache': 'export const musicCacheService={}',
    '../../utils/downloadSongs': 'export default ()=>{}'
  })
  const api = sdk('shared')
  const ref = { providerId: 'shared', kind: 'track', id: 'song-1', scope: 'provider' }
  const song = { source: 'shared', name: 'Song', pluginResource: ref }
  const request = { artworkUrl: 'https://media.example/cover', targetSize: 1024 }
  service.setProviderOwner('shared', 'plugin-a')
  for (const id of ['plugin-a', 'plugin-b']) {
    service.setCapabilityOwner('shared', 'tracks.artworkHires', id)
    assert.equal(
      await api.getHiresPic({ songInfo: song, ...request }),
      'https://media.example/hires/' + id,
      'the request reaches the selected plugin'
    )
    assert.deepEqual(state.calls.at(-1), {
      id,
      source: 'shared',
      ref: { pluginId: id, ...ref },
      ...request
    })
  }
  const privateRef = {
    pluginId: 'plugin-a',
    providerId: 'shared',
    kind: 'track',
    id: 'private-1',
    data: { token: 'private' }
  }
  await api.getHiresPic({ songInfo: { ...song, pluginResource: privateRef }, ...request })
  assert.equal(state.calls.at(-1).id, 'plugin-a', 'private resources stay with their owner')
  assert.deepEqual(state.calls.at(-1).ref, privateRef)
  service.setCapabilityOwner('shared', 'tracks.artworkHires', null)
  assert.equal(
    await api.getHiresPic({ songInfo: song, ...request }),
    'https://media.example/hires/plugin-a',
    'automatic routing follows the selected platform provider'
  )
  fixture.loadedPlugins['plugin-a'].supported = false
  fixture.loadedPlugins['plugin-b'].supported = false
  assert.throws(
    () => service.setCapabilityOwner('shared', 'tracks.artworkHires', 'plugin-b'),
    /未实现/
  )
  const before = state.calls.length
  assert.equal(
    await api.getHiresPic({ songInfo: song, ...request }),
    '',
    'missing optional capability falls back to the original artwork'
  )
  assert.equal(state.calls.length, before)
  console.log(
    'PASS: hires artwork label/selector, saved choice migration, actual request routing, automatic selection, private ownership and missing-capability fallback'
  )
} finally {
  delete globalThis.__hiresRoutingTest
}
