import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import vm from 'node:vm'

const project = resolve(
  process.argv[2] ?? 'docs/public/plugins/v2/tutorial/account-native',
)
const require = createRequire(join(project, 'package.json'))
const ts = require('typescript')
const { buildProject } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-cli'))
)
const { readArtifact } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-issuer'))
)
const manifestFile = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
const manifest = manifestFile.manifest

const moduleCache = new Map()
const sdk = {
  assertResourceRef(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      throw new Error('Invalid resource ref')
    }
    for (const key of ['pluginId', 'providerId', 'kind', 'id']) {
      if (typeof value[key] !== 'string' || !value[key]) throw new Error('Invalid resource ref')
    }
  },
  defineNativeView: (render) => async (input, operation) => render(input, operation),
  definePlugin: (entry) => entry,
}

async function loadModule(name) {
  if (moduleCache.has(name)) return moduleCache.get(name)
  const file = join(project, 'src', name + '.ts')
  const source = await readFile(file, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const exports = {}
  const imports = {
    '@shiqianjiang/ceru-plugin-sdk': sdk,
    './data': name === 'data' ? undefined : await loadModule('data'),
    './account': ['account', 'data'].includes(name) ? undefined : await loadModule('account'),
    './provider': ['provider', 'account', 'data'].includes(name)
      ? undefined
      : await loadModule('provider'),
    './native': name === 'index' ? await loadModule('native') : undefined,
  }
  vm.runInNewContext(
    js,
    {
      exports,
      URL,
      AbortController,
      setTimeout,
      clearTimeout,
      require: (id) => {
        assert.ok(Object.hasOwn(imports, id) && imports[id], `Unexpected import ${id} in ${name}`)
        return imports[id]
      },
    },
    { filename: file },
  )
  moduleCache.set(name, exports)
  return exports
}

function operation() {
  const controller = new AbortController()
  return {
    id: 'account-native-check',
    deadlineAt: Date.now() + 10_000,
    signal: controller.signal,
    userIntent: { kind: 'user-intent', id: 'check' },
  }
}

const storage = new Map()
async function activate(initialPermission = 'granted') {
  const actions = new Map()
  const providers = new Map()
  const importers = new Map()
  const states = []
  const navigation = []
  const importWindows = []
  const queue = []
  const player = []
  let permission = initialPermission

  const ctx = {
    plugin: { id: manifest.id },
    effects: { add: () => {} },
    actions: {
      register(id, handler) {
        assert.ok(manifest.contributes.commands.some((item) => item.action === id))
        actions.set(id, handler)
        return () => {}
      },
    },
    providers: {
      register(id, implementation) {
        assert.ok(manifest.contributes.providers.some((item) => item.id === id))
        providers.set(id, implementation)
        return () => {}
      },
    },
    playlistImporters: {
      register(id, implementation) {
        assert.ok(manifest.contributes.playlistImporters.some((item) => item.id === id))
        importers.set(id, implementation)
        return () => {}
      },
    },
    storage: {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => storage.set(key, structuredClone(value)),
      delete: async (key) => storage.delete(key),
    },
    ui: {
      openView: async (id) => states.push({ openView: id }),
      closeView: async (id) => states.push({ closeView: id }),
      setState: async (id, state) => states.push({ id, state: structuredClone(state) }),
      navigation: { open: async (request) => navigation.push(structuredClone(request)) },
      playlistImport: { open: async (request) => importWindows.push(structuredClone(request)) },
    },
    permissions: {
      query: async () => ({ status: permission }),
      request: async () => ({ status: permission }),
    },
    queue: {
      replace: async (items) => queue.push(structuredClone(items)),
    },
    player: {
      play: async (ref) => player.push(structuredClone(ref)),
    },
    playback: { failure: (error) => ({ ok: false, error }) },
  }

  await (await loadModule('index')).default(ctx)
  return {
    actions,
    providers,
    importers,
    states,
    navigation,
    importWindows,
    queue,
    player,
    setPermission: (value) => {
      permission = value
    },
  }
}

const output = await buildProject(project)
const artifact = readArtifact(await readFile(output.path))
assert.equal(artifact.header.manifest.id, 'tutorial.account-native')
assert.deepEqual(Object.keys(artifact.modules).sort(), ['logic.main', 'view.account'])
console.log('PASS: types, build and artifact entries')

let runtime = await activate()
assert.deepEqual(
  JSON.parse(JSON.stringify(await runtime.actions.get('account.summary')())),
  { signedIn: false, displayName: '演示音乐账号' },
)
let view = await runtime.actions.get('render.library')({}, operation())
assert.equal(view.sections.length, 0)
assert.equal(view.actions[0].action, 'account.open')

const started = await runtime.actions.get('account.start')({ attemptId: 'first' })
assert.equal(started.status, 'waiting')
await runtime.actions.get('account.cancel')({ attemptId: 'first' })
assert.equal((await runtime.actions.get('account.poll')({ attemptId: 'first' })).status, 'expired')

await runtime.actions.get('account.start')({ attemptId: 'second' })
await runtime.actions.get('account.approve')({ attemptId: 'second' })
const loggedIn = await runtime.actions.get('account.poll')({ attemptId: 'second' })
assert.equal(loggedIn.status, 'success')
assert.equal(loggedIn.account.badge, 'SVIP')
assert.ok(storage.get('tutorial.session.v1').cookie)
assert.doesNotMatch(JSON.stringify(loggedIn), /demo_session_/)
assert.doesNotMatch(JSON.stringify(runtime.states), /demo_session_/)
console.log('PASS: login, cancellation, private storage and public account state')

runtime = await activate()
assert.equal((await runtime.actions.get('account.summary')()).signedIn, true)
view = await runtime.actions.get('render.library')({}, operation())
assert.equal(view.sections[0].items.length, 2)
assert.doesNotThrow(() => structuredClone(view))

const provider = runtime.providers.get('tutorial-account')
const playlistRef = view.sections[0].items[0].ref
const firstPage = await provider.playlists.get(playlistRef, undefined, operation())
assert.equal(firstPage.items.length, 2)
assert.equal(firstPage.nextCursor, '2')
const secondPage = await provider.playlists.get(playlistRef, firstPage.nextCursor, operation())
assert.equal(secondPage.items.length, 2)
assert.equal(secondPage.nextCursor, undefined)
await assert.rejects(
  provider.playlists.get({ ...playlistRef, pluginId: 'other.plugin' }, undefined, operation()),
  /不属于/,
)
await assert.rejects(provider.playlists.get(playlistRef, '-1', operation()), /游标/)
console.log('PASS: native view, playlist paging and resource ownership')

const search = await provider.tracks.search(
  { query: 'rain', kinds: ['track'], filters: {}, limit: 10 },
  operation(),
)
assert.equal(search.items[0].title, 'Soft Rain')
const ref = search.items[0].ref
assert.equal((await provider.tracks.resolve(ref, 'hires', operation())).error.code, 'UNSUPPORTED')

runtime.setPermission('denied')
await assert.rejects(runtime.actions.get('tracks.play')({ ref }, operation()), /允许插件控制播放/)
assert.equal(runtime.queue.length, 0)
assert.equal(runtime.player.length, 0)
runtime.setPermission('granted')
await runtime.actions.get('tracks.play')({ ref }, operation())
assert.equal(runtime.queue[0][0].title, 'Soft Rain')
assert.equal(runtime.player[0].id, ref.id)

await runtime.actions.get('playlist.open')({ ref: playlistRef }, operation())
assert.equal(runtime.navigation[0].ref.id, playlistRef.id)
await runtime.actions.get('playlist.import')({ ref: playlistRef }, operation())
assert.equal(runtime.importWindows[0].importerId, 'tutorial-playlist')
const importer = runtime.importers.get('tutorial-playlist')
const imported = await importer.getTracks(
  { value: 'demo-favorites', limit: 2 },
  operation(),
)
assert.equal(imported.items.length, 2)
assert.equal(imported.nextCursor, '2')
console.log('PASS: search, permission boundary, queue, navigation and importer')

const server = spawn(process.execPath, ['mock-audio.mjs'], {
  cwd: project,
  stdio: ['ignore', 'pipe', 'pipe'],
})
try {
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mock audio startup timeout')), 10_000)
    server.once('error', reject)
    server.once('exit', (code) => reject(new Error('Mock audio exited: ' + code)))
    server.stderr.on('data', (data) => process.stderr.write(data))
    server.stdout.on('data', (data) => {
      if (String(data).includes('Mock audio:')) {
        clearTimeout(timeout)
        resolveReady()
      }
    })
  })
  const resolved = await provider.tracks.resolve(ref, '320k', operation())
  assert.equal(resolved.ok, true)
  const audio = Buffer.from(await (await fetch(resolved.url)).arrayBuffer())
  assert.equal(audio.subarray(0, 4).toString(), 'RIFF')
  assert.equal(audio.subarray(8, 12).toString(), 'WAVE')
  assert.ok(audio.subarray(44).some((byte) => byte !== 0))
  console.log('PASS: resolve returns a readable, non-silent WAV')
} finally {
  server.kill()
}

await runtime.actions.get('account.logout')()
assert.equal(storage.has('tutorial.session.v1'), false)
assert.equal((await runtime.actions.get('account.summary')()).signedIn, false)
console.log('PASS: logout clears persisted session')

const docsRoot = resolve(dirname(project), '../../../../guide/plugins/v2/tutorial-account-native')
for (const name of ['index', 'manifest', 'login', 'native-library', 'playback', 'release']) {
  const markdown = await readFile(join(docsRoot, name + '.md'), 'utf8')
  assert.doesNotMatch(markdown, /聆澜音源|2\.0\+|SDK.*从.*版本|CLI.*从.*版本/)
  assert.match(markdown, /常见错误|常见失败/)
}
console.log('PASS: tutorial wording and required troubleshooting sections')
