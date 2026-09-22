import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'

const root = fileURLToPath(new URL('../', import.meta.url))
const state = { calls: [], cacheKeys: [], cached: null }
globalThis.__resourceRoutingTest = state

async function bundle(entry, stubs, extra = '') {
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
        name: 'isolated-host-dependencies',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, ({ path }) =>
            Object.hasOwn(stubs, path) ? { path, namespace: 'fixture' } : undefined
          )
          builder.onLoad({ filter: /.*/, namespace: 'fixture' }, ({ path }) => ({
            contents: 'const s=globalThis.__resourceRoutingTest;' + stubs[path],
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
  const { migratePluginCapabilitySelections } = await bundle('src/common/pluginCapabilities.ts', {})
  assert.deepEqual(migratePluginCapabilitySelections({
    'shared:action:music.resolve': 'runtime-default',
    'shared:action:play': 'runtime-owner',
    'shared:action:render.library': 'runtime-owner',
    'shared:action:comments.get': 'runtime-default'
  }), {
    'shared:tracks.resolve': 'runtime-default',
    'shared:action:comments.get': 'runtime-default'
  }, 'old resolver choice becomes effective; internal actions do not become routing settings')
  assert.deepEqual(migratePluginCapabilitySelections({
    'shared:action:music.resolve': 'runtime-default',
    'shared:tracks.resolve': 'runtime-owner'
  }), { 'shared:tracks.resolve': 'runtime-owner' }, 'explicit provider choice wins over an alias')

  state.uiStore = { userInfo: { sourcePluginMap: { shared: 'runtime-owner' } } }
  state.uiContributions = { value: ['default', 'owner'].map(name => ({
    pluginId: 'runtime-' + name,
    manifest: { name, contributes: { providers: [{ id: 'shared', name: 'Shared' }] } },
    providerMethods: { shared: ['tracks.resolve', 'tracks.search', 'tracks.future'] },
    actionIds: name === 'default' ? ['music.resolve', 'search.tips'] : ['play', 'render.library']
  })) }
  const panel = await bundle('src/renderer/src/components/Settings/PluginRoutingPanel.vue', {
    vue: "export { computed, ref, watch, nextTick } from 'vue/dist/vue.runtime.esm-bundler.js'; export const onActivated=()=>{}; export const onDeactivated=()=>{}",
    '@renderer/store/LocalUserDetail': 'export const LocalUserDetailStore=()=>s.uiStore',
    '@renderer/services/pluginState': 'export const activePluginContributions=s.uiContributions; export const selectCapabilityImplementation=()=>{}; export const selectUIImplementation=()=>{}',
    'tdesign-vue-next': 'export const MessagePlugin={}'
  }, '\nexport { rows, options };')
  assert.deepEqual(panel.rows.value.map(row => row.capability),
    ['tracks.resolve', 'tracks.search', 'tracks.future', 'action:search.tips'],
    'settings show public capabilities once and omit private adapter/UI commands')
  const playbackRow = panel.rows.value.find(row => row.capability === 'tracks.resolve')
  assert.equal(playbackRow.label, '播放解析')
  assert.equal(panel.rows.value.find(row => row.capability === 'tracks.future').selectable, false,
    'a newly registered method remains visible without being falsely presented as routable')
  assert.deepEqual(panel.options(playbackRow), [
    { label: '自动（owner）', value: '' },
    { label: 'default', value: 'runtime-default' },
    { label: 'owner', value: 'runtime-owner' }
  ], 'both resolvers appear; automatic selection reflects the selected platform provider')
  const tipsRow = panel.rows.value.find(row => row.capability === 'action:search.tips')
  assert.equal(panel.options(tipsRow)[0].label, '自动（default）',
    'the source preference lacking a capability does not hide a working implementation')

  const registry = await bundle(
    'src/main/services/plugin/index.ts',
    {
      electron: 'export const dialog={}',
      '../../utils/path': 'export const getAppDirPath=()=>"unused"',
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
    '\nexport const fixture = { loadedPlugins, installedPlugins, providerOwners, capabilityOwners };'
  )
  const { default: service, fixture } = registry
  state.service = service
  const playlistRef = {
    pluginId: 'owner.plugin',
    providerId: 'shared',
    kind: 'playlist',
    id: 'list-1',
    connectionId: 'account-A',
    data: { playlistToken: 'opaque' }
  }
  const trackRef = {
    ...playlistRef,
    kind: 'track',
    id: 'track-1',
    data: { signedId: 'opaque-track' }
  }
  const entity = {
    ref: trackRef,
    title: 'Song',
    capabilities: [],
    metadata: { artists: ['Artist'] }
  }
  const host = (manifestId) => ({
    disabled: false,
    methods: new Set(['tracks.resolve', 'tracks.lyrics', 'playlists.get']),
    actions: new Set(['comments.get', 'artwork.get', 'album.list']),
    getPluginInfo() {
      return { id: manifestId }
    },
    isDisabled() {
      return this.disabled
    },
    supportsV2Provider(source, method) {
      return !this.disabled && source === 'shared' && (!method || this.methods.has(method))
    },
    supportsShareResolver() {
      return !this.disabled && manifestId === 'owner.plugin'
    },
    supportsAction(action) {
      return !this.disabled && this.actions.has(action)
    },
    async getMusicUrl(source, song, quality) {
      state.calls.push({
        manifestId,
        method: 'tracks.resolve',
        source,
        ref: song.pluginResource,
        quality
      })
      return 'https://media.example/' + manifestId
    },
    async getPic(source, song) {
      state.calls.push({ manifestId, method: 'artwork.get', source, ref: song.pluginResource })
      return 'https://media.example/cover'
    },
    async invokeV2Provider(source, method, args) {
      state.calls.push({ manifestId, source, method, args })
      if (method === 'playlists.get')
        return {
          items: [entity],
          name: 'Owner playlist',
          totalEstimate: 1,
          playlist: {
            artworkUrl: 'https://media.example/cover',
            author: 'Owner',
            description: 'Details'
          }
        }
      return { format: 'crlyric', version: 1, track: args[0], lines: [] }
    },
    async invokeV2Action(method, input) {
      state.calls.push({ manifestId, method, input })
      return { comments: [] }
    }
  })
  const defaultHost = host('default.plugin')
  const ownerHost = host('owner.plugin')
  for (const [id, value, order] of [
    ['runtime-default', defaultHost, 0],
    ['runtime-owner', ownerHost, 1]
  ]) {
    fixture.loadedPlugins[id] = value
    fixture.installedPlugins.set(id, { pluginId: id, state: { order } })
  }
  for (const pluginId of ['runtime-default', 'runtime-owner']) {
    service.setCapabilityOwner('shared', 'tracks.resolve', pluginId)
    assert.equal(service.getV2Provider('shared', undefined, 'tracks.resolve').pluginId, pluginId,
      'both plugins can be selected through the same playback capability')
  }
  for (const action of ['play', 'render.library', 'music.resolve']) {
    ownerHost.actions.add(action)
    assert.throws(() => service.setCapabilityOwner('shared', 'action:' + action, 'runtime-owner'),
      /内部操作/, 'an internal command is not a selectable shared capability')
    fixture.capabilityOwners.set('shared:action:' + action, 'runtime-owner')
    assert.equal(service.getV2Action('shared', action), null,
      'stale internal command settings cannot redirect another plugin')
    assert.equal(service.getV2Action('shared', action, 'owner.plugin').host, ownerHost,
      'the original plugin can still run its own commands')
    service.setCapabilityOwner('shared', 'action:' + action, null)
  }
  fixture.capabilityOwners.set('shared:tracks.resolve', 'runtime-default')
  fixture.capabilityOwners.set('shared:action:comments.get', 'runtime-default')
  assert.equal(service.getV2Provider('shared', 'owner.plugin', 'tracks.resolve').host, ownerHost)
  assert.equal(service.getV2Provider('shared', 'runtime-owner', 'tracks.resolve').host, ownerHost)
  assert.equal(service.getV2Provider('shared', undefined, 'tracks.resolve').host, defaultHost)
  assert.equal(service.getV2Action('shared', 'comments.get', 'owner.plugin').host, ownerHost)
  assert.equal(service.getV2Action('shared', 'comments.get').host, defaultHost)
  assert.equal(service.getV2Provider('shared', 'missing.plugin', 'tracks.resolve'), null)
  assert.equal(service.getV2Action('shared', 'comments.get', 'missing.plugin'), null)
  ownerHost.methods.delete('tracks.resolve')
  ownerHost.actions.delete('comments.get')
  assert.equal(service.getV2Provider('shared', 'owner.plugin', 'tracks.resolve'), null)
  assert.equal(service.getV2Action('shared', 'comments.get', 'owner.plugin'), null)
  ownerHost.methods.add('tracks.resolve')
  ownerHost.actions.add('comments.get')
  fixture.capabilityOwners.clear()
  fixture.providerOwners.set('shared', 'runtime-owner')
  assert.equal(service.getV2Provider('shared', undefined, 'tracks.resolve').host, ownerHost)
  assert.equal(service.getV2Action('shared', 'comments.get').host, ownerHost)
  ownerHost.methods.delete('tracks.resolve')
  ownerHost.actions.delete('comments.get')
  assert.equal(service.getV2Provider('shared', undefined, 'tracks.resolve').host, defaultHost,
    'a partial source provider is supplemented by another enabled resolver')
  assert.equal(service.getV2Action('shared', 'comments.get').host, defaultHost,
    'a partial source provider is supplemented by another enabled public action')
  assert.equal(service.getV2Provider('shared', 'owner.plugin', 'tracks.resolve'), null,
    'private owner-bound resources still never cross to the fallback plugin')
  assert.equal(service.getV2Action('shared', 'comments.get', 'owner.plugin'), null)
  ownerHost.methods.add('tracks.resolve')
  ownerHost.actions.add('comments.get')
  fixture.capabilityOwners.set('shared:tracks.resolve', 'runtime-default')
  assert.equal(service.getV2Provider('shared', undefined, 'tracks.resolve').host, defaultHost)
  assert.equal(service.getV2Provider('shared', 'owner.plugin', 'tracks.resolve').host, ownerHost)
  assert.equal(
    service.getV2Provider('shared', undefined, 'tracks.resolve', true).host,
    ownerHost,
    'public share routing skips a selected playback plugin without a share resolver'
  )
  assert.equal(
    service.getV2Provider('shared', 'default.plugin', 'tracks.resolve', true),
    null,
    'private resources stay bound when their owner lacks a share resolver'
  )
  fixture.capabilityOwners.clear()

  const { default: sdk, resolveDownloadUrl } = await bundle('src/main/services/musicSdk/service.ts', {
    '../plugin/index': 'export default s.service',
    '../localLyrics': 'export const resolveLocalLyrics=()=>{}',
    '../LocalMusicIndex': 'export const localMusicIndexService={}',
    '../../utils/tagUtils': 'export const readTags=()=>({})',
    '../musicCache':
      'export const musicCacheService={getCachedMusicUrl:async key=>{s.cacheKeys.push(key);return s.cached},cacheMusic:async()=>{}}',
    '../../utils/downloadSongs': 'export default ()=>{}'
  })
  const api = sdk('shared')
  const playlist = await api.getPlaylistDetail({ id: playlistRef.id, page: 1, ref: playlistRef })
  assert.deepEqual(state.calls.at(-1), {
    manifestId: 'owner.plugin',
    source: 'shared',
    method: 'playlists.get',
    args: [playlistRef, undefined]
  })
  await api.getPlaylistDetail({
    id: playlistRef.id,
    page: 2,
    ref: playlistRef,
    cursor: 'opaque-next-page'
  })
  assert.deepEqual(state.calls.at(-1).args, [playlistRef, 'opaque-next-page'])
  await api.getPlaylistDetail({ id: playlistRef.id, page: 2 })
  assert.equal(state.calls.at(-1).args[1], '2', 'legacy callers retain numeric page translation')
  assert.deepEqual(playlist.list[0].pluginResource, trackRef)
  assert.equal(playlist.info.img, 'https://media.example/cover')
  assert.equal(playlist.info.author, 'Owner')
  await assert.rejects(api.getPlaylistDetail({ id: 'wrong', page: 1, ref: playlistRef }), /不匹配/)
  await assert.rejects(
    api.getPlaylistDetail({
      id: playlistRef.id,
      page: 1,
      ref: { ...playlistRef, pluginId: 'missing.plugin' }
    }),
    /原插件/
  )

  const song = { name: 'Song', singer: 'Artist', source: 'stale-source', pluginResource: trackRef }
  const url = await api.getMusicUrl({
    pluginId: 'runtime-default',
    songInfo: song,
    quality: 'standard'
  })
  assert.equal(
    url,
    'https://media.example/owner.plugin',
    'resource owner outranks global audio preference'
  )
  assert.deepEqual(state.calls.at(-1).ref, trackRef)
  const firstCacheKey = state.cacheKeys.at(-1)
  await api.getMusicUrl({
    songInfo: { ...song, pluginResource: { ...trackRef, connectionId: 'account-B' } },
    quality: 'standard'
  })
  assert.notEqual(
    state.cacheKeys.at(-1),
    firstCacheKey,
    'account connections cannot share cached audio'
  )
  await api.getMusicUrl({
    songInfo: { ...song, pluginResource: { ...trackRef, pluginId: 'default.plugin' } },
    quality: 'standard'
  })
  assert.notEqual(state.cacheKeys.at(-1), firstCacheKey, 'plugin owners cannot share cached audio')

  await api.getLyric({ songInfo: song })
  assert.equal(state.calls.at(-1).manifestId, 'owner.plugin')
  assert.equal(state.calls.at(-1).source, 'shared')
  assert.deepEqual(state.calls.at(-1).args[0], trackRef)
  await api.getComment({ songInfo: song })
  assert.equal(state.calls.at(-1).manifestId, 'owner.plugin')
  assert.equal(state.calls.at(-1).input.source, 'shared')
  await api.getPic({ songInfo: song })
  assert.equal(state.calls.at(-1).manifestId, 'owner.plugin')
  await api.getAlbumList({ songInfo: song })
  assert.equal(state.calls.at(-1).manifestId, 'owner.plugin')
  const legacy = { name: 'Legacy', singer: 'Artist', source: 'shared' }
  assert.equal(
    await api.getMusicUrl({ pluginId: 'runtime-default', songInfo: legacy, quality: 'standard' }),
    'https://media.example/owner.plugin',
    'platform selection outranks stale global plugin preference'
  )

  const beforeMissing = state.calls.length
  ownerHost.disabled = true
  const failed = await api.getMusicUrl({
    pluginId: 'runtime-default',
    songInfo: song,
    quality: 'standard'
  })
  assert.match(failed.error, /安装/)
  assert.match((await api.getLyric({ songInfo: song })).error, /安装/)
  await api.getComment({ songInfo: song })
  assert.equal(
    state.calls.length,
    beforeMissing,
    'disabled resource owners never fall back to another plugin'
  )

  assert.equal(
    await api.getMusicUrl({ pluginId: 'runtime-default', songInfo: legacy, quality: 'standard' }),
    'https://media.example/default.plugin'
  )
  ownerHost.disabled = false
  const publicRef = {
    providerId: 'shared',
    kind: 'track',
    id: 'track-1',
    scope: 'provider'
  }
  const publicSong = { ...song, pluginResource: publicRef }
  ownerHost.actions.delete('comments.get')
  await api.getComment({ songInfo: publicSong })
  assert.equal(state.calls.at(-1).manifestId, 'default.plugin',
    'public account tracks use another implementation for missing comment capabilities')
  assert.equal(state.calls.at(-1).input.song.pluginResource.pluginId, 'default.plugin')
  assert.equal(state.calls.at(-1).input.song.pluginResource.data, undefined,
    'public action routing strips the original plugin private data')
  ownerHost.actions.add('comments.get')
  fixture.capabilityOwners.set('shared:tracks.resolve', 'runtime-default')
  assert.equal(await api.getMusicUrl({ songInfo: publicSong, quality: 'flac' }),
    'https://media.example/default.plugin')
  assert.deepEqual(state.calls.at(-1).ref, {
    pluginId: 'default.plugin', providerId: 'shared', kind: 'track', id: 'track-1', scope: 'provider',
  })
  assert.equal(state.calls.at(-1).quality, 'flac')
  assert.equal(await resolveDownloadUrl({ pluginId: 'runtime-owner', songInfo: publicSong, quality: 'flac' }),
    'https://media.example/default.plugin', 'batch downloads honor current playback routing')
  const alternateKey = state.cacheKeys.at(-1)
  fixture.capabilityOwners.set('shared:tracks.resolve', 'runtime-owner')
  await api.getMusicUrl({ songInfo: publicSong, quality: 'flac' })
  assert.deepEqual(state.calls.at(-1).ref, {
    pluginId: 'owner.plugin',
    ...publicRef
  })
  assert.notEqual(state.cacheKeys.at(-1), alternateKey, 'playback preference isolates cache')
  fixture.capabilityOwners.set('shared:tracks.lyrics', 'runtime-default')
  await api.getLyric({ songInfo: publicSong })
  assert.equal(state.calls.at(-1).manifestId, 'default.plugin')
  assert.equal(state.calls.at(-1).args[0].data, undefined)
  ownerHost.disabled = true
  fixture.capabilityOwners.set('shared:tracks.resolve', 'runtime-default')
  assert.equal(await api.getMusicUrl({ songInfo: publicSong, quality: 'flac' }),
    'https://media.example/default.plugin', 'public ID works without its origin plugin')
  const oldLinglanSong = {
    ...song,
    source: 'shared',
    pluginResource: {
      pluginId: 'local.linglan-source',
      providerId: 'shared',
      kind: 'track',
      id: 'track-1',
      data: { song: { source: 'shared', songmid: 'track-1' } }
    }
  }
  assert.equal(
    await api.getMusicUrl({ songInfo: oldLinglanSong, quality: 'flac' }),
    'https://media.example/default.plugin',
    'legacy Linglan playlist tracks are upgraded without the origin plugin'
  )
  assert.deepEqual(state.calls.at(-1).ref, {
    pluginId: 'default.plugin',
    providerId: 'shared',
    kind: 'track',
    id: 'track-1',
    scope: 'provider'
  })
  console.log(
    'PASS: private ownership, provider routing, ownerless public tracks and legacy Linglan playlists'
  )
} finally {
  delete globalThis.__resourceRoutingTest
}
