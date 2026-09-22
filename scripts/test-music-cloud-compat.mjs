import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire, Module } from 'node:module'
import { gzipSync } from 'node:zlib'
import { build } from 'esbuild'

const root = resolve('.')
const require = createRequire(import.meta.url)
const fixture = JSON.parse(await readFile('scripts/fixtures/music-item-v1.json', 'utf8'))
const key = (song) => 'ceru-song:' + JSON.stringify(['public', song.source, String(song.songmid)])
const state = (globalThis.__musicCloudTest = {
  modern: false,
  failure: false,
  existing: [],
  calls: []
})
async function load(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    alias: { '@common': join(root, 'src/common'), '@renderer': join(root, 'src/renderer/src') },
    plugins: [
      {
        name: 'mock-network-only',
        setup(b) {
          b.onResolve({ filter: /^@renderer\/utils\/(request|file|nsfwCheck)$/ }, (args) => ({
            path: args.path,
            namespace: 'test'
          }))
          b.onLoad({ filter: /.*/, namespace: 'test' }, (args) => ({
            contents: args.path.endsWith('/request')
              ? `
        const state=globalThis.__musicCloudTest;
        export const unwrap=async value=>await value;
        export class Request {
          async get(path) {
            if(path.endsWith('/capabilities')) {
              if(state.failure) throw new Error('network unavailable');
              if(!state.modern) throw Object.assign(new Error('not found'),{status:404});
              return {songIdentity:2};
            }
            return {list:state.existing,total:state.existing.length};
          }
          async patch(path,data) {state.calls.push({method:'patch',path,data}); return {updatedAt:'saved'};}
          async delete(path,data) {state.calls.push({method:'delete',path,data}); return {updatedAt:'saved'};}
          async post(path,data) {state.calls.push({method:'post',path,data}); return {updatedAt:'saved'};}
        }`
              : 'export const isBase64=()=>false; export const base64ToFile=()=>{}; export const checkImageIsSafe=async()=>true;'
          }))
        }
      }
    ]
  })
  const mod = new Module(join(root, 'cloud-test.cjs'))
  mod.paths = require.resolve.paths('crypto-js')
  mod._compile(result.outputFiles[0].text, join(root, 'cloud-test.cjs'))
  return mod.exports
}

let api = (await load('src/renderer/src/api/cloudSongList.ts')).cloudSongListAPI
await api.addSongsToList('list', [{ ...fixture, types: [{ type: '320k' }], _types: {} }])
assert.equal(state.calls.at(-1).data.songs[0].types[0].size, '未知')
state.existing = [fixture]
state.calls = []
await assert.rejects(
  api.addSongsToList('list', [
    {
      ...fixture,
      pluginResource: {
        pluginId: 'private.library',
        providerId: 'tx',
        kind: 'track',
        id: fixture.songmid,
        connectionId: 'a'
      }
    }
  ]),
  /私有歌曲引用/
)
await assert.rejects(api.addSongsToList('list', [{ ...fixture, source: 'wy' }]), /升级后端/)
assert.equal(state.calls.length, 0)
await api.removeSongsFromList('list', [key(fixture)])
assert.deepEqual(state.calls.at(-1).data.data.songmids, [fixture.songmid])
state.existing.push({ ...fixture, source: 'wy' })
state.calls = []
await assert.rejects(api.removeSongsFromList('list', [key(fixture)]), /升级后端/)
assert.equal(state.calls.length, 0)

state.modern = true
api = (await load('src/renderer/src/api/cloudSongList.ts')).cloudSongListAPI
await api.removeSongsFromList('list', [key(fixture)])
assert.deepEqual(state.calls.at(-1).data.data.songKeys, [key(fixture)])
state.failure = true
state.calls = []
api = (await load('src/renderer/src/api/cloudSongList.ts')).cloudSongListAPI
await assert.rejects(api.addSongsToList('list', [fixture]), /network unavailable/)
assert.equal(state.calls.length, 0, 'network failure must not downgrade the backend')

const files = await load('src/renderer/src/utils/playlist/playlistExportImport.ts')
const legacy = files.encryptPlaylist([fixture, { ...fixture, source: 'wy' }])
for (const extension of ['cpl', 'cmpl']) {
  globalThis.window = {
    api: {
      file: { readFile: async () => (extension === 'cpl' ? Buffer.from(legacy) : gzipSync(legacy)) }
    }
  }
  const songs = await files.importPlaylistFromPath('fixture.' + extension)
  assert.equal(songs.length, 2)
  assert.equal(songs[0].interval, '03:59')
  assert.deepEqual(songs[0].types, fixture.types)
  assert.deepEqual(files.decryptPlaylist(files.encryptPlaylist(songs)), songs)
}
console.log(
  'Old/new backend requests, ambiguity protection, network errors and cpl/cmpl roundtrips passed'
)
