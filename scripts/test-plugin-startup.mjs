import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { parse, compileScript } from '@vue/compiler-sfc'
import { readFile, mkdtemp, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRenderer, defineComponent, h, nextTick, ref, computed } from 'vue'
import { createPinia, defineStore, setActivePinia } from 'pinia'

// Execute the real page setup/watchers with a Vue renderer and deferred IPC responses.
const root = process.cwd()
const directory = await mkdtemp(join(root, '.startup-smoke-'))
const useStore = defineStore('startup-test', () => {
  const userInfo = ref({ selectSources: 'tx' })
  const userSource = computed(() => ({ source: userInfo.value.selectSources }))
  return { userInfo, userSource }
})
setActivePinia(createPinia())
const store = useStore()
const state = {
  store,
  ready: ref(false),
  revision: ref(0),
  sections: ref([]),
  events: [],
  restore: undefined,
  playback: undefined
}
globalThis.__startupTest = state
const calls = []
globalThis.window = {
  api: {
    music: {
      requestSdk: (method, args) => new Promise((resolve) => calls.push({ method, args, resolve }))
    }
  },
  electron: {
    ipcRenderer: {
      invoke: async (channel) => {
        state.events.push(channel)
        return channel === 'get-app-version' ? 'test' : null
      }
    }
  }
}
globalThis.document = { addEventListener() {}, removeEventListener() {} }
const renderer = createRenderer({
  createElement: (type) => ({ type, children: [] }),
  insert() {},
  remove() {},
  createText: (text) => ({ text }),
  createComment: (text) => ({ text }),
  setText() {},
  setElementText() {},
  parentNode: () => null,
  nextSibling: () => null,
  patchProp() {}
})
const apps = []
const flush = async () => {
  await nextTick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await nextTick()
}
const mount = (component) => {
  let instance
  const app = renderer.createApp(
    defineComponent({
      render: () =>
        h(component, {
          ref: (value) => {
            instance = value
          }
        })
    })
  )
  app.mount({ children: [] })
  apps.push(app)
  return () => instance.$.setupState
}
try {
  const output = join(directory, 'pages.mjs')
  await build({
    stdin: {
      contents: `export {default as Find} from './src/renderer/src/views/music/find.vue';
      export {default as Boards} from './src/renderer/src/components/Find/LeaderBord.vue';
      export {default as Welcome} from './src/renderer/src/views/welcome/index.vue';`,
      resolveDir: root
    },
    outfile: output,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    plugins: [
      {
        name: 'page-test',
        setup(builder) {
          builder.onResolve(
            { filter: /^(@renderer\/|vue-router$|tdesign-icons-vue-next$)/ },
            ({ path }) => ({ path, namespace: 'stub' })
          )
          builder.onLoad({ filter: /.*/, namespace: 'stub' }, ({ path }) => {
            const shared = 'const s = globalThis.__startupTest;'
            const modules = {
              '@renderer/store/LocalUserDetail':
                'export const LocalUserDetailStore = () => s.store;',
              '@renderer/store/Settings':
                "import {reactive,ref} from 'vue';const settings=reactive({settings:ref({autoUpdate:false}),shouldUseSpringFestivalTheme:()=>false});export const useSettingsStore=()=>settings;",
              '@renderer/services/pluginState':
                'export const contributionsLoaded=s.ready, contributionsRevision=s.revision, homeSections=s.sections; export const refreshPluginContributions=()=>{s.events.push("restore");return s.restore};',
              '@renderer/services/listenTogetherInvite':
                'export const tryShowListenTogetherInvite=async()=>{};',
              '@renderer/utils/audio/globaPlayList':
                'export const initPlayback=()=>{s.events.push("playback");return s.playback};',
              '@renderer/composables/useAutoUpdate':
                'export const useAutoUpdate=()=>({checkForUpdates(){}});',
              'vue-router':
                'export const useRouter=()=>({replace:async path=>s.events.push(path),push(){}});',
              'tdesign-icons-vue-next': 'export const ChevronDownIcon={}, PlayCircleIcon={};'
            }
            return { contents: shared + (modules[path] ?? 'export default {};'), resolveDir: root }
          })
          builder.onResolve({ filter: /\.vue$/ }, ({ path, resolveDir }) => ({
            path: resolve(resolveDir, path),
            namespace: 'sfc'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'sfc' }, async ({ path }) => {
            if (!/find\.vue$|LeaderBord\.vue$|welcome[\\/]index\.vue$/.test(path))
              return { contents: 'export default {};' }
            const { descriptor } = parse(await readFile(path, 'utf8'))
            const script = compileScript(descriptor, { id: path, genDefaultAs: 'Page' })
            return {
              contents: `import {onActivated,onDeactivated} from 'vue';\n${script.content}\nPage.render=()=>null; export default Page;`,
              loader: 'ts',
              resolveDir: root
            }
          })
        }
      }
    ]
  })
  const { Find, Boards, Welcome } = await import(pathToFileURL(output).href)
  const find = mount(Find)
  const boards = mount(Boards)
  await flush()
  assert.equal(calls.length, 0, 'no platform request before plugin readiness')
  state.sections.value = [
    { kind: 'playlists', pluginId: 'p' },
    { kind: 'charts', pluginId: 'p' }
  ]
  state.ready.value = true
  state.revision.value++
  await flush()
  assert.deepEqual(calls.map((c) => c.method).sort(), [
    'getCategoryPlaylists',
    'getLeaderboards',
    'getPlaylistTags'
  ])
  const stale = [...calls]
  store.userInfo.selectSources = 'wy'
  await flush()
  assert.equal(calls.length, 6, 'source switch must not be blocked by previous in-flight request')
  for (const call of calls.slice(3))
    call.resolve(
      call.method === 'getLeaderboards'
        ? [{ id: 'new' }]
        : { list: [{ id: 'new', name: 'new' }], total: 1, tags: [] }
    )
  await flush()
  for (const call of stale)
    call.resolve(
      call.method === 'getLeaderboards'
        ? [{ id: 'old' }]
        : { list: [{ id: 'old', name: 'old' }], total: 1, tags: [] }
    )
  await flush()
  assert.equal(find().recommendPlaylists[0].id, 'new')
  assert.equal(boards().boards[0].id, 'new')
  state.revision.value++
  await flush()
  assert.equal(calls.length, 9, 'new provider implementation reloads unchanged platform')

  let finishRestore, finishPlayback
  state.restore = new Promise((resolve) => {
    finishRestore = resolve
  })
  state.playback = new Promise((resolve) => {
    finishPlayback = resolve
  })
  state.events.length = 0
  mount(Welcome)
  await flush()
  assert.equal(state.events.includes('restore'), true)
  assert.equal(state.events.includes('playback'), false)
  assert.equal(
    state.events.some((e) => e.startsWith('/home')),
    false
  )
  finishRestore()
  await flush()
  assert.equal(state.events.includes('playback'), true)
  assert.equal(
    state.events.some((e) => e.startsWith('/home')),
    false
  )
  finishPlayback()
  await flush()
  assert.equal(
    state.events.at(-1),
    '/home/find',
    'welcome chooses discovery only after plugins and playback restore'
  )
  console.log(
    'PASS: deferred plugin registration reloads discovery, stale responses ignored, welcome waits for plugins and playback before navigation'
  )
} finally {
  for (const app of apps) app.unmount()
  delete globalThis.__startupTest
  delete globalThis.window
  delete globalThis.document
  await rm(directory, { recursive: true, force: true })
}
