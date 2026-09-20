import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { reactive, ref, nextTick } from 'vue'

const require = createRequire(import.meta.url)
const { createPinia, setActivePinia, disposePinia } = require('pinia')
const mocks = {
  '@renderer/store/LocalUserDetail': 'export const LocalUserDetailStore = () => fixture.local',
  '@renderer/services/pluginState': `export const contributionsRevision = fixture.revision;
    export const activePluginContributions = fixture.active;`,
  '@renderer/utils/color/colorExtractor': 'export const analyzeImageColors = async () => null',
  '@renderer/utils/localMusicMetadata':
    'export const readLocalMusicMetadata = async () => ({ lrc: "[00:01]本地歌词", img: "data:image/png;base64," })',
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
        b.onLoad({ filter: /.*/, namespace: 'fixture' }, (args) => ({ contents: mocks[args.path] }))
      }
    }
  ]
})
const flush = async () => {
  for (let i = 0; i < 40; i++) await nextTick()
}
const song = (id, source = 'fixture') => ({
  songmid: id,
  source,
  name: id,
  singer: 'test',
  img: 'data:image/png;base64,'
})
const lyric = (id) => ({
  format: 'crlyric',
  version: 1,
  lines: [{ text: `歌词 ${id}`, startTimeMs: 1000, endTimeMs: 2000 }]
})

async function scenario(name, run, source = 'fixture', initiallyEmpty = false) {
  const pinia = createPinia()
  setActivePinia(pinia)
  const fixture = {
    local: reactive({
      userInfo: { lastPlaySongId: 'A' },
      list: initiallyEmpty ? [] : [song('A', source), song('B', source)]
    }),
    revision: ref(0),
    active: ref([]),
    available: false,
    calls: [],
    handler: undefined
  }
  const module = { exports: {} }
  runInNewContext(output.outputFiles[0].text, {
    module,
    exports: module.exports,
    require,
    fixture,
    setTimeout,
    clearTimeout,
    AbortSignal,
    URL,
    console: { ...console, log() {} },
    window: {
      api: {
        localMusic: { onTagsChanged: () => () => {} },
        music: {
          requestSdk: async (method, input) => {
            if (method !== 'getLyric' && method !== 'parseLyrics') return { comments: [] }
            const id = method === 'getLyric' ? input.songInfo.songmid : input.track.id
            fixture.calls.push(id)
            const result = fixture.handler
              ? await fixture.handler(id)
              : fixture.available
                ? lyric(id)
                : undefined
            return method === 'getLyric' ? { crlyric: result } : result
          }
        }
      }
    }
  })
  const store = module.exports.useGlobalPlayStatusStore()
  try {
    await run(fixture, store)
    console.log('PASS:', name)
  } finally {
    disposePinia(pinia)
  }
}

await scenario(
  'network lyrics recover after plugin restoration; loaded lyrics are retained',
  async (f, store) => {
    await flush()
    assert.equal(store.player.lyrics.lines.length, 0)
    f.available = true
    f.revision.value++
    await flush()
    assert.equal(store.player.lyrics.lines[0]?.words[0].word, '歌词 A')
    const calls = f.calls.length
    f.revision.value++
    await flush()
    assert.equal(f.calls.length, calls)
  }
)
await scenario(
  'plugin readiness while initial metadata is pending cannot lose lyrics',
  async (f, store) => {
    // The first request has started but its continuation is still pending.
    f.available = true
    f.revision.value++
    await flush()
    assert.equal(store.player.lyrics.lines[0]?.words[0].word, '歌词 A')
  }
)
await scenario(
  'late lyrics from a restored song never overwrite a new selection',
  async (f, store) => {
    await flush()
    let finishOld
    f.handler = (id) =>
      id === 'A'
        ? new Promise((resolve) => {
            finishOld = resolve
          })
        : lyric(id)
    f.revision.value++
    await flush()
    assert.equal(typeof finishOld, 'function')
    f.local.userInfo.lastPlaySongId = 'B'
    await flush()
    finishOld(lyric('A'))
    await flush()
    assert.equal(store.player.songId, 'B')
    assert.equal(store.player.lyrics.lines[0]?.words[0].word, '歌词 B')
  }
)
await scenario(
  'local lyrics recover when their converter becomes available',
  async (f, store) => {
    await flush()
    f.available = true
    f.revision.value++
    await flush()
    assert.equal(store.player.lyrics.lines[0]?.words[0].word, '歌词 A')
  },
  'local'
)
await scenario(
  'playlist hydration after the saved song ID restores its lyrics',
  async (f, store) => {
    await flush()
    f.available = true
    f.local.list = [song('A')]
    await flush()
    assert.equal(store.player.lyrics.lines[0]?.words[0].word, '歌词 A')
  },
  'fixture',
  true
)
