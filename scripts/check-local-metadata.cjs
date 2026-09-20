const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const Module = require('node:module')
const { build } = require('esbuild')
const taglib = require('node-taglib-sharp')

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'ceru-local-metadata-'))
  const handlers = new Map(),
    songs = new Map(),
    events = []
  global.__localMetadataTest = { root, handlers, songs, events }
  const mocks = {
    electron: `const s=global.__localMetadataTest; export const app={getPath:()=>s.root}; export const ipcMain={handle:(k,f)=>s.handlers.set(k,f),on(){}}; export const dialog={}; export const BrowserWindow={getAllWindows:()=>[{isDestroyed:()=>false,webContents:{send:(...args)=>s.events.push(args)}}]}; export default {app};`,
    '@electron-toolkit/utils': 'export const is={dev:false}',
    '../services/LocalMusicIndex': `const s=global.__localMetadataTest;export const localMusicIndexService={getSongById:id=>s.songs.get(String(id)),getAllSongs:()=>[...s.songs.values()],upsertSong:async item=>s.songs.set(item.songmid,item),removeSongByPath:async p=>{for(const [id,v]of s.songs)if(v.path===p)s.songs.delete(id)}};`,
    '../services/musicSdk/service': 'export default ()=>({})',
    '../services/plugin': 'export default {}',
    '../utils/request': 'export const httpFetch=()=>{throw Error("unexpected request")}',
    worker_threads:
      'export const isMainThread=false; export const parentPort={on(){},postMessage(){}};'
  }
  async function compile(contents, resolveDir) {
    const result = await build({
      stdin: { contents, resolveDir, loader: 'ts' },
      bundle: true,
      write: false,
      platform: 'node',
      format: 'cjs',
      packages: 'external',
      alias: { '@common': path.resolve('src/common') },
      plugins: [
        {
          name: 'test-services',
          setup(b) {
            b.onResolve({ filter: /.*/ }, (args) =>
              Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'mock' } : undefined
            )
            b.onLoad({ filter: /.*/, namespace: 'mock' }, (args) => ({
              contents: mocks[args.path],
              loader: 'js'
            }))
          }
        }
      ]
    })
    const mod = new Module(path.resolve('scripts/.local-metadata-test.cjs'), module)
    mod.filename = path.resolve('scripts/.local-metadata-test.cjs')
    mod.paths = module.paths
    mod._compile(result.outputFiles[0].text, mod.filename)
    return mod.exports
  }
  let sandbox
  try {
    const { NodePluginSandbox } = await import(
      '../node_modules/@shiqianjiang/ceru-plugin-core/dist/node.js'
    )
    const { readArtifact } = await import(
      '../node_modules/@shiqianjiang/ceru-plugin-issuer/dist/index.js'
    )
    const artifact = readArtifact(
      await fs.readFile('G:/code/pluginclitest/洛雪兼容环境/dist/plugin.js')
    )
    sandbox = new NodePluginSandbox(
      async (method) => {
        if (method === 'config.get') return {}
        throw Error('unexpected ' + method)
      },
      () => {}
    )
    await sandbox.start(artifact)
    const track = { pluginId: 'local.library', providerId: 'local', kind: 'track', id: 'fixture' }
    const original =
      '[00:01.000]<00:01.000>你<00:01.500>好<00:02.000>\n[00:03.000]<00:03.000>世<00:03.500>界<00:04.000>'
    const document = await sandbox.invoke('lyric-converter', 'lyrics', 'parse', [
      { track, format: 'auto', text: original }
    ])
    assert.equal(document.lines[0].startTimeMs, 1000)
    const exported = await sandbox.invoke('lyric-converter', 'lyrics', 'export', [
      { document, format: 'enhanced-lrc' }
    ])
    const file = path.join(root, 'sample.mp3')
    const frame = Buffer.alloc(417)
    frame.set([255, 251, 144, 100])
    await fs.writeFile(file, Buffer.concat(Array.from({ length: 200 }, () => frame)))
    const workerSource = await fs.readFile('src/main/workers/downloadWorker.ts', 'utf8')
    const worker = await compile(
      workerSource + '\nexport { processSongFiles };',
      path.resolve('src/main/workers')
    )
    await worker.processSongFiles(
      file,
      { name: '测试歌曲', singer: '测试歌手', lrc: exported.text },
      { lyrics: true, downloadLyrics: true }
    )
    const api = await compile(
      `export {readTags} from './src/main/utils/tagUtils';export {parseLocalLrc} from './src/common/localLyrics';export {toPlayerLyrics} from './src/common/pluginMusic';export {genId,normPath} from './src/main/utils/fileUtils';export {coverCacheService} from './src/main/services/CoverCache';import './src/main/events/localMusic';`,
      process.cwd()
    )
    assert.equal(api.readTags(file, true).lrc, exported.text, 'download embeds exported text')
    assert.equal(await fs.readFile(path.join(root, 'sample.lrc'), 'utf8'), exported.text)
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=',
      'base64'
    )
    const picture = path.join(root, 'cover.png')
    await fs.writeFile(picture, png)
    let f = taglib.File.createFromPath(file)
    f.tag.pictures = [taglib.Picture.fromPath(picture)]
    f.save()
    f.dispose()
    const id = api.genId(api.normPath(file))
    songs.set(id, {
      songmid: id,
      path: file,
      source: 'local',
      name: 'stale',
      lrc: '[00:00.00]stale',
      img: 'https://example.test/stale.jpg',
      hasCover: false
    })
    const invoke = (name, ...args) =>
      handlers.get('local-music:' + name)({ sender: { send() {} } }, ...args)
    const tags = await invoke('get-tags', id, true)
    assert.equal(tags.lrc, exported.text)
    assert.equal(tags.hasCover, true)
    assert.deepEqual(
      Buffer.from((await invoke('get-cover', id)).split(',')[1], 'base64'),
      png,
      'ByteVector cover bytes survive extraction'
    )
    const parsed = await sandbox.invoke('lyric-converter', 'lyrics', 'parse', [
      { track, format: 'auto', text: tags.lrc }
    ])
    assert.deepEqual(
      parsed.lines.map((l) => l.startTimeMs),
      [1000, 3000],
      'download/tag/read/parse preserves milliseconds'
    )
    const local = api.parseLocalLrc(tags.lrc, track)
    assert.deepEqual(
      local.lines.map((l) => l.startTimeMs),
      [1000, 3000],
      'local LRC works without a converter plugin'
    )
    const malformed =
      '[offset:-100]\n[00:01.000]<00:00.990>你<00:01.500>好\n[00:03.00]<00:03.00>世界'
    const repaired = api.parseLocalLrc(malformed, track)
    assert.equal(
      repaired.lines[0].words[0].startTimeMs,
      1000,
      'word before line no longer fails validation'
    )
    assert.ok(repaired.lines[1].words[0].endTimeMs > 3000, 'missing final word end is inferred')
    assert.equal(api.toPlayerLyrics(repaired)[0].startTime, 900, 'offset is applied once')
    assert.equal(
      api.parseLocalLrc('[00:01.00]你[00:01.50]好[00:02.00]', track).lines[0].words.length,
      2
    )
    assert.equal(api.parseLocalLrc('[00:01.00][00:03.00]副歌', track).lines.length, 2)
    assert.equal(
      api.parseLocalLrc('<tt><body>test</body></tt>', track),
      null,
      'TTML stays in converter plugin'
    )
    const saved = await invoke('write-tags', {
      filePath: file,
      songInfo: { name: '修改后的歌曲', singer: '测试歌手', lrc: '' },
      tagWriteOptions: { lyrics: true }
    })
    assert.equal(saved.success, true)
    assert.equal(await invoke('get-lyric', id), '', 'empty lyrics remove old embedded text')
    assert.equal(songs.get(id).lrc, '')
    assert.equal(songs.get(id).hasCover, true)
    assert.ok(
      events.some(
        ([name, data]) =>
          name === 'local-music:tags-changed' && data.oldSongmid === id && data.song.lrc === ''
      )
    )
    // External editor removes the picture; new mtime must bypass previous cached art.
    f = taglib.File.createFromPath(file)
    f.tag.pictures = []
    f.save()
    f.dispose()
    await fs.utimes(file, new Date(), new Date(Date.now() + 2000))
    assert.equal(await invoke('get-cover', id), '')
    const renderer = await compile(
      `export {readLocalMusicMetadata} from './src/renderer/src/utils/localMusicMetadata';`,
      process.cwd()
    )
    const metadata = await renderer.readLocalMusicMetadata(id, {
      getTags: (...a) => invoke('get-tags', ...a),
      getCoverBase64: (...a) => invoke('get-cover', ...a)
    })
    assert.equal(metadata.img, '')
    assert.equal(metadata.lrc, '')
    console.log(
      'PASS: plugin lyric export → real download tag write → fresh local tags/cover → plugin parse; empty lyrics, ByteVector art, cache invalidation and save notification'
    )
  } finally {
    sandbox?.dispose()
    delete global.__localMetadataTest
    await fs.rm(root, { recursive: true, force: true })
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
