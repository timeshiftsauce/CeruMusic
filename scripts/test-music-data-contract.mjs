import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { build } from 'esbuild'
import { assertContentPage } from '@shiqianjiang/ceru-plugin-sdk'

async function load(entry) {
  const result = await build({
    entryPoints: [entry],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    alias: { '@common': fileURLToPath(new URL('../src/common', import.meta.url)) }
  })
  return import(
    'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
  )
}
const fixture = JSON.parse(
  await readFile(new URL('./fixtures/music-item-v1.json', import.meta.url), 'utf8')
)
const music = await load('src/common/musicItem.ts')
const adapter = await load('src/common/pluginMusic.ts')
const cloud = await load('src/renderer/src/utils/playlist/cloudList.ts')
const migration = await load('src/common/musicDataMigration.ts')
const appearance = {
  ColorObject: { r: 217, g: 159, b: 118 },
  mainColor: 'rgba(217,159,118,1)',
  textColor: 'rgba(255,255,255,.6)',
  hoverColor: 'rgba(255,255,255,1)',
  useBlackText: false
}

const entity = adapter.toPluginTrack(fixture)
assertContentPage({ items: [entity] })
assert.equal(entity.metadata.durationMs, 239000)
assert.equal(entity.ref.pluginId, undefined)
assert.equal(entity.ref.scope, 'provider')
const roundtrip = adapter.toAppTrack(entity)
assert.equal(roundtrip.interval, '03:59')
assert.deepEqual(roundtrip.types, fixture.types)
assert.equal(roundtrip.pluginResource, undefined)
for (const types of [['320k'], [{ type: '320k' }], [{ type: '320k', size: '' }]]) {
  assert.equal(cloud.mapSongsToCloud([{ ...fixture, types }])[0].types[0].size, '未知')
}
assert.equal(cloud.mapSongsToCloud([fixture])[0].types[0].size, '3.65 MB')
assert.deepEqual(cloud.mapSongsToCloud([{ ...fixture, source: 'local' }]), [])
const legacyRef = {
  pluginId: 'local.library',
  providerId: 'tx',
  kind: 'track',
  id: fixture.songmid
}
assert.equal(
  music.normalizeMusicItem({ ...fixture, pluginResource: legacyRef }).pluginResource,
  undefined
)
assert.equal(music.songKey(fixture), music.songKey(legacyRef))
assert.equal(
  music.songKey({ ...fixture, songmid: 42 }),
  music.songKey({ ...fixture, songmid: '42' })
)
assert.notEqual(music.songKey(fixture), music.songKey({ ...fixture, source: 'wy' }))
const privateA = {
  ...legacyRef,
  pluginId: 'private.library',
  connectionId: 'a',
  data: { opaque: 'keep' }
}
const privateB = { ...privateA, connectionId: 'b' }
assert.deepEqual(
  music.normalizeMusicItem({ ...fixture, pluginResource: privateA }).pluginResource,
  privateA
)
assert.notEqual(music.songKey(privateA), music.songKey(privateB))
assert.throws(
  () => music.selectSong([fixture, { ...fixture, source: 'wy' }], fixture.songmid),
  /多个来源/
)
assert.equal(
  music.selectSong([fixture, { ...fixture, source: 'wy' }], music.songKey(fixture)),
  fixture
)

const damagedEntity = {
  ...entity,
  ref: legacyRef,
  metadata: { ...entity.metadata, durationMs: undefined, qualitySizeLabels: undefined }
}
const raw = {
  globalPlayStatus: JSON.stringify({
    songId: fixture.songmid,
    songInfo: fixture,
    coverDetail: appearance,
    comments: { large: true },
    cover: 'blob:expired'
  }),
  songList: JSON.stringify([fixture, { ...fixture, source: 'wy' }]),
  userInfo: JSON.stringify({ lastPlaySongId: fixture.songmid, currentTime: 12, volume: 80 }),
  'ceru-plugin-playback-history-v1': JSON.stringify([damagedEntity])
}
const repaired = migration.repairBrowserMusicData(raw)
const state = JSON.parse(repaired.values.globalPlayStatus)
assert.equal(state.player.songInfo.interval, '03:59')
assert.deepEqual(state.history[0].types, fixture.types)
assert.equal(state.player.comments, undefined)
assert.equal(state.player.cover, undefined)
assert.deepEqual(
  state.player.coverDetail,
  appearance,
  'restore the already calculated colors without waiting for artwork'
)
const changedSelection = migration.repairBrowserMusicData({
  ...raw,
  userInfo: JSON.stringify({ lastPlaySongKey: music.songKey({ ...fixture, source: 'wy' }) })
})
assert.equal(
  JSON.parse(changedSelection.values.globalPlayStatus).player.coverDetail,
  undefined,
  'colors must belong to the restored song'
)
assert.equal(JSON.parse(repaired.values.songList).length, 2)
assert.equal(JSON.parse(repaired.values.userInfo).currentTime, 12)
assert.deepEqual(migration.repairBrowserMusicData(repaired.values).values, repaired.values)
const broken = migration.repairBrowserMusicData({ ...raw, songList: '{broken' })
assert.ok(broken.issues.some((issue) => issue.includes('无法解析')))
assert.equal(JSON.parse(broken.values.globalPlayStatus).player.songInfo.songmid, fixture.songmid)
assert.throws(() => music.normalizeMusicItem({ ...fixture, songmid: '' }), /ID/)
console.log('MusicItem, plugin boundary, cloud compatibility and migration contracts passed')
