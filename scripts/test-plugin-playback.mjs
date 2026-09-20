import assert from 'node:assert/strict'
import { build } from 'esbuild'

const resource = (providerId, connectionId) => ({
  pluginId: 'test.plugin',
  providerId,
  connectionId,
  kind: 'track',
  id: 'same-id'
})
const entity = (ref) => ({
  ref,
  title: 'Song',
  playable: true,
  capabilities: ['music.resolve@1'],
  metadata: { artists: ['Artist'] }
})
const state = {
  store: { initialization: true, list: [], userInfo: { lastPlaySongId: 'same-id' } },
  inRoom: false,
  player: { songInfo: { pluginResource: resource('second', 'b') } },
  calls: []
}
globalThis.__pluginPlaybackTest = state
try {
  const result = await build({
    entryPoints: ['src/renderer/src/services/pluginPlaybackBridge.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    alias: {
      '@common': new URL('../src/common', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1')
    },
    plugins: [
      {
        name: 'host-services',
        setup(builder) {
          builder.onResolve({ filter: /^@renderer\// }, ({ path }) => ({
            path,
            namespace: 'services'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'services' }, ({ path }) => {
            const implementations = {
              '@renderer/store/LocalUserDetail': 'export const LocalUserDetailStore=()=>s.store',
              '@renderer/store/ListenTogether':
                'export const useListenTogetherStore=()=>({isInRoom:s.inRoom})',
              '@renderer/store/GlobalPlayStatus':
                'export const useGlobalPlayStatusStore=()=>({player:s.player})',
              '@renderer/utils/audio/globaPlayList':
                'export const playSong=async song=>s.calls.push(song);export const handlePlay=async()=>s.calls.push("resume")'
            }
            assert.ok(implementations[path], 'Unexpected renderer dependency: ' + path)
            return { contents: 'const s=globalThis.__pluginPlaybackTest;' + implementations[path] }
          })
        }
      }
    ]
  })
  const { handlePluginPlayback, openPluginPlaylist, readPluginPlaylistRef } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(
        result.outputFiles[0].text + '\n//# sourceURL=pluginPlaybackBridge.test.js'
      ).toString('base64')
  )
  const first = entity(resource('first', 'a'))
  first.metadata.qualities = ['128k', 'flac', 'hires']
  first.metadata.qualitySizes = { '128k': 1048576, flac: 22000789 }
  const second = entity(resource('second', 'b'))
  const anotherConnection = entity(resource('second', 'c'))
  const queue = await handlePluginPlayback('services.queue.replace', [
    [first, first, second, anotherConnection]
  ])
  assert.equal(queue.items.length, 3, 'deduplicate complete resource identity only')
  assert.deepEqual(queue.items[0].metadata.qualitySizes, first.metadata.qualitySizes,
    'queue round trips preserve exact byte counts')
  assert.deepEqual(state.store.list[0].types, [
    { type: '128k', size: '1 MB', sizeBytes: 1048576 },
    { type: 'flac', size: '20.98 MB', sizeBytes: 22000789 },
    { type: 'hires' },
  ])
  assert.equal(
    queue.currentIndex,
    1,
    'current song must match provider and connection, not just id'
  )
  await handlePluginPlayback('services.player.play', [anotherConnection.ref])
  assert.deepEqual(state.calls[0].pluginResource, anotherConnection.ref)
  await assert.rejects(
    handlePluginPlayback('services.player.play', [resource('missing', 'a')]),
    /不在播放队列/
  )
  const previous = state.store.list
  state.inRoom = true
  await assert.rejects(handlePluginPlayback('services.queue.replace', [[first]]), /一起听/)
  assert.equal(state.store.list, previous)
  state.inRoom = false
  await assert.rejects(
    handlePluginPlayback('services.queue.replace', [[entity({ ...first.ref, kind: 'playlist' })]])
  )
  const playlistRef = {
    ...first.ref,
    kind: 'playlist',
    data: { cursorToken: 'opaque-provider-data' }
  }
  await openPluginPlaylist(
    { push: async (location) => state.calls.push(location) },
    playlistRef,
    { title: 'Native playlist', cover: 'https://media.example/cover', total: 20 }
  )
  const destination = state.calls.at(-1)
  assert.equal(destination.name, 'list')
  assert.equal(destination.query.title, 'Native playlist')
  assert.equal(destination.query.cover, 'https://media.example/cover')
  assert.deepEqual(
    readPluginPlaylistRef(
      destination.query.resourceRef,
      destination.params.id,
      destination.query.source
    ),
    playlistRef,
    'native playlist navigation must preserve owner, connection and opaque provider data'
  )
  assert.equal(readPluginPlaylistRef(undefined, '123', 'legacy'), undefined)
  assert.throws(() => readPluginPlaylistRef(destination.query.resourceRef, 'different-id', 'first'))
  assert.throws(() =>
    readPluginPlaylistRef(destination.query.resourceRef, 'same-id', 'different-source')
  )
  assert.throws(() => readPluginPlaylistRef('{invalid json}', 'same-id', 'first'))
  assert.throws(() => readPluginPlaylistRef([destination.query.resourceRef], 'same-id', 'first'))
  await assert.rejects(openPluginPlaylist({ push() {} }, first.ref), /歌单资源/)
  console.log(
    'PASS: complete playback identity, deduplication, room guard, validation and playlist navigation'
  )
} finally {
  delete globalThis.__pluginPlaybackTest
}
