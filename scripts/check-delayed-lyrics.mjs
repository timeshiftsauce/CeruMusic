import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const { createPinia, setActivePinia, disposePinia } = require('pinia')
const { createClock } = require('@sinonjs/fake-timers')
const mocks = {
  '@renderer/services/musicDataPersistence': `import { ref } from 'vue';
    export const musicStartupReady = ref(false);
    export const canPersistMusicData = () => false;
    export const getMusicStorage = () => null;
    export const setMusicStorage = () => {};`,
  '@renderer/store/LocalUserDetail':
    'export const LocalUserDetailStore = () => ({ userInfo: {}, list: [] })',
  '@renderer/services/pluginState':
    "import { ref } from 'vue'; export const contributionsRevision = ref(0)",
  '@renderer/utils/color/colorExtractor': 'export const analyzeImageColors = async () => null',
  '@renderer/utils/localMusicMetadata': 'export const readLocalMusicMetadata = async () => ({})',
  '@renderer/utils/audio/useSmtc': 'export default { updateMetadata() {} }',
  '@renderer/utils/audio/audioHelpers': 'export const parseInterval = () => 0',
  'tdesign-vue-next': 'export const MessagePlugin = { warning() {} }',
  './playSetting': 'export const playSetting = () => ({})',
  '/default-cover.png': 'export default "data:image/png;base64,"'
}
const output = await build({
  entryPoints: ['src/renderer/src/store/GlobalPlayStatus.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@common': resolve('src/common') },
  plugins: [
    {
      name: 'fixtures',
      setup(b) {
        b.onResolve({ filter: /.*/ }, (args) =>
          Object.hasOwn(mocks, args.path) ? { path: args.path, namespace: 'fixture' } : undefined
        )
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({
          contents: mocks[args.path],
          resolveDir: resolve('.')
        }))
      }
    }
  ]
})
const song = (id) => ({ songmid: id, source: 'fixture', name: id, singer: 'test' })
const lyric = (id) => ({
  version: 1,
  lines: [{ text: `歌词 ${id}`, startTimeMs: 1000, endTimeMs: 2000 }]
})
const flush = async () => {
  for (let i = 0; i < 40; i++) await Promise.resolve()
}

async function scenario(name, run) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const clock = createClock()
  const pending = new Map()
  const cache = new Map()
  const pluginCalls = []
  const module = { exports: {} }
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    require,
    setTimeout: clock.setTimeout,
    clearTimeout: clock.clearTimeout,
    performance: { now: () => clock.now },
    AbortSignal,
    URL,
    console: { ...console, log() {}, warn() {} },
    window: {
      api: {
        localMusic: { onTagsChanged: () => () => {} },
        musicCache: { getCoverFile: async () => '' },
        music: {
          requestSdk: async (method, input) => {
            if (method === 'getPic') return ''
            if (method !== 'getLyric') return { comments: [] }
            const id = input.songInfo.songmid
            if (cache.has(id)) return { crlyric: cache.get(id) }
            pluginCalls.push(id)
            const result = await new Promise((resolve) => pending.set(id, resolve))
            // Match the main-process service: cache before returning to the renderer.
            if (result.crlyric) cache.set(id, result.crlyric)
            return result
          }
        }
      }
    }
  })
  const store = module.exports.useGlobalPlayStatusStore()
  const finish = async (id) => {
    assert.ok(pending.has(id), `expected pending lyrics for ${id}`)
    pending.get(id)({ crlyric: lyric(id) })
    pending.delete(id)
    await flush()
  }
  const timedOut = async (id) => {
    const task = store.prepareSong(song(id))
    await flush()
    clock.tick(8000)
    await flush()
    const prepared = await task
    assert.equal(prepared.crlyric, undefined)
    return prepared
  }
  const expectLyrics = (id) => {
    assert.equal(store.player.songId, id)
    assert.equal(store.player.lyrics.crlyric?.lines[0].text, `歌词 ${id}`)
    assert.equal(store.player.lyrics.lines[0]?.words[0].word, `歌词 ${id}`)
  }
  try {
    await run({ store, finish, timedOut, expectLyrics, pluginCalls })
    console.log('PASS:', name)
  } finally {
    disposePinia(pinia)
  }
}

await scenario('lyrics arriving before the deadline commit normally', async (f) => {
  const task = f.store.prepareSong(song('A'))
  await f.finish('A')
  f.store.commitPrepared(await task)
  f.expectLyrics('A')
})

await scenario(
  'lyrics arriving after timeout but before audio readiness survive commit',
  async (f) => {
    const first = f.store.prepareSong(song('A'))
    await f.finish('A')
    f.store.commitPrepared(await first)
    const next = await f.timedOut('B')
    await f.finish('B')
    f.expectLyrics('A')
    f.store.commitPrepared(next)
    f.expectLyrics('B')
  }
)

await scenario('lyrics arriving after commit fill the current song', async (f) => {
  const prepared = await f.timedOut('A')
  f.store.commitPrepared(prepared)
  await f.finish('A')
  f.expectLyrics('A')
  // A subsequent commit must not erase lyrics already filled in.
  f.store.commitPrepared(prepared)
  f.expectLyrics('A')
})

await scenario('late lyrics for a skipped song cannot overwrite the next song', async (f) => {
  const old = await f.timedOut('A')
  f.store.commitPrepared(old)
  const next = f.store.prepareSong(song('B'))
  await f.finish('B')
  f.store.commitPrepared(await next)
  await f.finish('A')
  f.expectLyrics('B')
})

await scenario('a timed-out request with no lyrics clears the previous song', async (f) => {
  const first = f.store.prepareSong(song('A'))
  await f.finish('A')
  f.store.commitPrepared(await first)
  f.store.commitPrepared(await f.timedOut('B'))
  assert.equal(f.store.player.songId, 'B')
  assert.equal(f.store.player.lyrics.crlyric, undefined)
  assert.equal(f.store.player.lyrics.lines.length, 0)
})

await scenario(
  'next, previous, next displays lyrics on first entry and uses cache on return',
  async (f) => {
    const first = f.store.prepareSong(song('A'))
    await f.finish('A')
    f.store.commitPrepared(await first)
    const next = await f.timedOut('B')
    await f.finish('B')
    f.store.commitPrepared(next)
    f.expectLyrics('B')
    f.store.commitPrepared(await f.store.prepareSong(song('A')))
    f.expectLyrics('A')
    f.store.commitPrepared(await f.store.prepareSong(song('B')))
    f.expectLyrics('B')
    assert.deepEqual(f.pluginCalls, ['A', 'B'])
  }
)
