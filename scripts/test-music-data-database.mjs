import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { createRequire, Module } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const Database = require('better-sqlite3')
const root = resolve('.')
await mkdir(join(root, '.tmp'), { recursive: true })
const directory = await mkdtemp(join(root, '.tmp', 'music-database-'))
globalThis.__musicTestDirectory = directory
const source = await build({
  entryPoints: ['src/main/services/songList/PlaylistDatabase.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@common': join(root, 'src/common') },
  plugins: [
    {
      name: 'isolated-electron-profile',
      setup(b) {
        b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test' }))
        b.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
          contents: 'export const app={getPath:()=>globalThis.__musicTestDirectory}'
        }))
      }
    }
  ]
})
const mod = new Module(join(root, 'database-test.cjs'))
mod.paths = require.resolve.paths('better-sqlite3')
mod._compile(source.outputFiles[0].text, join(root, 'database-test.cjs'))
const { PlaylistDatabase } = mod.exports
const fixture = JSON.parse(await readFile('scripts/fixtures/music-item-v1.json', 'utf8'))
const key = (song) => 'ceru-song:' + JSON.stringify(['public', song.source, String(song.songmid)])
let database
try {
  const legacy = new Database(join(directory, 'playlists.db'))
  legacy.exec(`CREATE TABLE playlists (id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT, coverImgUrl TEXT, source TEXT NOT NULL, meta TEXT, createTime TEXT, updateTime TEXT);
    CREATE TABLE playlist_songs (playlist_id TEXT NOT NULL, songmid TEXT NOT NULL, position INTEGER NOT NULL, data TEXT NOT NULL, name TEXT, singer TEXT, albumName TEXT, img TEXT, PRIMARY KEY(playlist_id, songmid), FOREIGN KEY(playlist_id) REFERENCES playlists(id));`)
  legacy
    .prepare('INSERT INTO playlists VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run('list', '旧歌单', '', '', 'local', '{"cloudId":"keep"}', 'old', 'old')
  legacy
    .prepare('INSERT INTO playlist_songs VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(
      'list',
      fixture.songmid,
      1250,
      JSON.stringify(fixture),
      fixture.name,
      fixture.singer,
      fixture.albumName,
      fixture.img
    )
  legacy.close()
  database = new PlaylistDatabase()
  assert.equal(database.hasSongKeys(), false, 'inspection must not migrate without consent')
  assert.throws(
    () => database.addSongsHead('list', [{ ...fixture, source: 'wy' }], false),
    /先修复/
  )
  const backup = join(directory, 'backup.db')
  await database.backup(backup)
  database.repairSongs()
  assert.equal(database.hasSongKeys(), true)
  assert.equal(database.getPlaylist('list').meta.cloudId, 'keep')
  database.addSongsHead('list', [{ ...fixture, source: 'wy' }], false)
  assert.equal(database.countSongs('list'), 2)
  assert.throws(() => database.removeSong('list', fixture.songmid), /多个来源/)
  assert.equal(database.getSong('list', key(fixture)).source, 'tx')
  database.reorderSongs('list', [key(fixture), key({ ...fixture, source: 'wy' })])
  assert.deepEqual(
    database.listSongs('list').map((s) => s.source),
    ['tx', 'wy']
  )
  database.moveSong('list', key(fixture), 1)
  assert.deepEqual(
    database.listSongs('list').map((s) => s.source),
    ['wy', 'tx']
  )
  assert.throws(() => database.replaceSongs('list', [{ ...fixture, songmid: '' }]), /ID/)
  assert.equal(database.countSongs('list'), 2, 'failed replacement cannot clear songs')
  database.repairSongs()
  assert.equal(database.countSongs('list'), 2, 'repair is idempotent')
  database.restoreBackup(backup)
  assert.equal(database.hasSongKeys(), false)
  assert.equal(database.countSongs('list'), 1)
  assert.equal(database.listSongs('list')[0].interval, '03:59')
  const legacyDirectory = join(directory, 'songList')
  await mkdir(legacyDirectory)
  await writeFile(
    join(legacyDirectory, 'index.json'),
    JSON.stringify([{ id: 'json-list', name: 'JSON 歌单', source: 'local' }])
  )
  await writeFile(join(legacyDirectory, 'json-list.json'), JSON.stringify([fixture]))
  assert.equal(database.getPlaylist('json-list').name, 'JSON 歌单')
  assert.equal(database.countSongs('json-list'), 1, 'deferred JSON data remains readable')
  assert.equal(database.getSong('json-list', key(fixture)).name, fixture.name)
  assert.throws(() => database.clearSongs('json-list'), /先修复/)
  assert.throws(() => database.deletePlaylist('json-list'), /先修复/)
  database.repairSongs()
  database.importLegacyPlaylists()
  assert.equal(database.countSongs('json-list'), 1)
  database.deletePlaylist('json-list')
  database.repairSongs()
  database.importLegacyPlaylists()
  assert.equal(
    database.getPlaylist('json-list'),
    null,
    'repeated repairs must not resurrect deliberate deletions'
  )
  console.log('SQLite consent, composite identity, transaction safety and rollback passed')
} finally {
  database?.close()
  await rm(directory, { recursive: true, force: true })
}
