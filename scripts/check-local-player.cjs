const assert = require('node:assert/strict')
const path = require('node:path')
const Module = require('node:module')
const { build } = require('esbuild')
const { effectScope } = require('vue')

async function main() {
  const stale = {
    source: 'local',
    songmid: '1',
    name: 'old',
    img: 'https://example.test/stale.jpg',
    lrc: 'stale'
  }
  const state = {
    store: { list: [stale], userInfo: {} },
    notices: [],
    text: 'fresh lyrics',
    cover: 'data:image/png;base64,AQID',
    fail: false
  }
  global.__localPlayerTest = state
  global.window = {
    api: {
      localMusic: {
        getTags: async () => ({
          name: 'fresh title',
          singer: 'artist',
          albumName: 'album',
          year: 2026,
          genre: '',
          hasCover: !!state.cover,
          lrc: state.text
        }),
        getCoverBase64: async () => state.cover,
        onTagsChanged: (callback) => {
          state.changed = callback
          return () => {
            state.changed = undefined
          }
        }
      },
      music: {
        requestSdk: async (method, input) => {
          assert.equal(method, 'parseLyrics')
          assert.equal(input.text, state.text, 'playlist text must not override file tags')
          if (state.fail) throw Error('转换插件不可用')
          return {
            format: 'crlyric',
            version: 1,
            track: input.track,
            offsetMs: 0,
            lines: [{ startTimeMs: 1000, endTimeMs: 2000, text: input.text }]
          }
        }
      }
    }
  }
  const stubs = {
    pinia: 'export const defineStore=(_id,setup)=>setup;',
    '@renderer/store/LocalUserDetail':
      'export const LocalUserDetailStore=()=>global.__localPlayerTest.store;',
    '@renderer/utils/color/colorExtractor': 'export const analyzeImageColors=async()=>null;',
    './playSetting': 'export const playSetting=()=>({});',
    'tdesign-vue-next':
      'export const MessagePlugin={warning:text=>global.__localPlayerTest.notices.push(text)};',
    '@renderer/services/pluginState':
      "import {ref} from 'vue';export const activePluginContributions=ref([]);",
    '/default-cover.png': "export default '/default-cover.png';"
  }
  const result = await build({
    entryPoints: ['src/renderer/src/store/GlobalPlayStatus.ts'],
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    alias: { '@common': path.resolve('src/common'), '@renderer': path.resolve('src/renderer/src') },
    plugins: [
      {
        name: 'local-player',
        setup(b) {
          b.onResolve({ filter: /.*/ }, (args) =>
            Object.hasOwn(stubs, args.path) ? { path: args.path, namespace: 'stub' } : undefined
          )
          b.onLoad({ filter: /.*/, namespace: 'stub' }, (args) => ({
            contents: stubs[args.path],
            loader: 'js',
            resolveDir: process.cwd()
          }))
        }
      }
    ]
  })
  const mod = new Module(path.resolve('scripts/.local-player.cjs'), module)
  mod.paths = module.paths
  mod._compile(result.outputFiles[0].text, path.resolve('scripts/.local-player.cjs'))
  const scope = effectScope()
  try {
    const store = scope.run(() => mod.exports.useGlobalPlayStatusStore())
    await store.updatePlayerInfo(stale)
    assert.equal(store.player.cover, state.cover)
    assert.equal(store.player.lyrics.lines[0].words[0].word, 'fresh lyrics')
    state.cover = ''
    state.text = 'edited lyrics'
    state.changed({ oldSongmid: '1', song: { ...stale, name: 'edited', img: '', lrc: state.text } })
    for (let i = 0; i < 4; i++) await new Promise((resolve) => setImmediate(resolve))
    assert.equal(store.player.cover, '/default-cover.png')
    assert.equal(store.player.lyrics.lines[0].words[0].word, 'edited lyrics')
    assert.equal(state.store.list[0].lrc, 'edited lyrics')
    state.fail = true
    await store.updatePlayerInfo(stale, true)
    assert.equal(store.player.lyrics.lines.length, 0)
    assert.match(state.notices[0], /本地歌词无法显示.*转换插件不可用/)
    state.fail = false
    state.text = ''
    await store.updatePlayerInfo(stale, true)
    assert.equal(store.player.lyrics.lines.length, 0, 'deleted tags do not resurrect old lyrics')
    console.log(
      'PASS: file tags override stale playlist, save refreshes same-track lyrics/artwork, removed artwork/lyrics clear, conversion errors are visible'
    )
  } finally {
    scope.stop()
    delete global.window
    delete global.__localPlayerTest
  }
}
main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
