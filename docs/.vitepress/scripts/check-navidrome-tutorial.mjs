import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createHash, randomBytes } from 'node:crypto'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import vm from 'node:vm'

// The argument must be a disposable vue/ts scaffold with dependencies installed.
const project = process.argv[2] && resolve(process.argv[2])
if (!project)
  throw new Error('Usage: node docs/.vitepress/scripts/check-navidrome-tutorial.mjs <project>')

const require = createRequire(join(project, 'package.json'))
const { buildProject } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-cli'))
)
const { readArtifact } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-issuer'))
)
const ts = require('typescript')
const lessons = fileURLToPath(new URL('../../guide/plugins/v2/tutorial-navidrome/', import.meta.url))
const sample = fileURLToPath(
  new URL('../../public/plugins/v2/tutorial/navidrome-vue/', import.meta.url)
)
const changed = new Set()

async function applyLesson(name) {
  const markdown = await readFile(join(lessons, name + '.md'), 'utf8')
  const blocks = [
    ...markdown.matchAll(/```(?:ts|json|vue) \[([^\]]+)\]\r?\n([\s\S]*?)```/g)
  ]
  assert.ok(blocks.length, name + ': missing complete file blocks')
  for (const [, file, source] of blocks) {
    assert.match(file, /^(ceru\.plugin\.json|src\/(model|api|provider|index|view)\.ts|src\/App\.vue)$/)
    await mkdir(dirname(join(project, file)), { recursive: true })
    await writeFile(join(project, file), source)
    changed.add(file)
  }
}

async function checkBuild(stage) {
  const output = await buildProject(project)
  const artifact = readArtifact(await readFile(output.path))
  assert.equal(artifact.header.manifest.manifestVersion, 2)
  const configFile = ts.readConfigFile(join(project, 'tsconfig.json'), ts.sys.readFile)
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, project)
  const diagnostics = ts.getPreEmitDiagnostics(ts.createProgram(config.fileNames, config.options))
  assert.equal(
    diagnostics.length,
    0,
    ts.formatDiagnosticsWithColorAndContext(diagnostics, {
      getCanonicalFileName: (file) => file,
      getCurrentDirectory: () => project,
      getNewLine: () => '\n'
    })
  )
  console.log('PASS: ' + stage + ' types, build and artifact validation')
}

async function loadModule(name, imports) {
  const file = join(project, 'src', name + '.ts')
  const source = await readFile(file, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  vm.runInNewContext(
    js,
    {
      exports,
      URL,
      require: (id) => {
        assert.ok(Object.hasOwn(imports, id), 'Unexpected import: ' + id)
        return imports[id]
      }
    },
    { filename: file }
  )
  return exports
}

function operation() {
  const controller = new AbortController()
  return {
    id: 'navidrome-test',
    deadlineAt: Date.now() + 10000,
    signal: controller.signal,
    userIntent: { kind: 'user-intent', id: 'test' },
    controller
  }
}

const storage = new Map()
async function activate(withProvider) {
  const config = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
  const manifest = config.manifest
  const actions = new Map()
  const providers = new Map()
  const states = []
  const requests = []
  const prompts = []
  const grants = new Map()
  const ctx = {
    plugin: { id: manifest.id },
    modules: {
      require: (id) => {
        assert.equal(id, '@ceru/crypto')
        return { randomBytes, createHash }
      }
    },
    permissions: {
      query: async ({ key }) => ({ status: grants.get(key) ?? 'prompt' }),
      request: async ({ key, intent }) => {
        assert.equal(intent.kind, 'user-intent')
        prompts.push(key)
        grants.set(key, 'granted')
        return { status: 'granted' }
      }
    },
    http: {
      request: async (input) => {
        assert.equal(grants.get(input.permissionKey), 'granted')
        requests.push(input)
        const response = await fetch(input.url, { signal: input.operation.signal })
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.text()
        }
      }
    },
    actions: {
      register: (id, handler) => {
        assert.ok(manifest.contributes.commands.some((command) => command.action === id))
        actions.set(id, handler)
      }
    },
    providers: {
      register: (id, provider) => {
        assert.ok(manifest.contributes.providers?.some((item) => item.id === id))
        providers.set(id, provider)
      }
    },
    storage: {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => storage.set(key, value),
      delete: async (key) => storage.delete(key)
    },
    ui: {
      openView: async () => {},
      setState: async (id, state) => {
        assert.equal(id, 'connection')
        states.push(state)
      }
    },
    playback: { failure: (error) => ({ ok: false, error }) }
  }
  const imports = { '@shiqianjiang/ceru-plugin-sdk': { definePlugin: (entry) => entry } }
  imports['./model'] = await loadModule('model', imports)
  imports['./api'] = await loadModule('api', imports)
  if (withProvider) imports['./provider'] = await loadModule('provider', imports)
  await (await loadModule('index', imports)).default(ctx)
  return { actions, providers, states, requests, prompts, grants }
}

const plain = (value) => JSON.parse(JSON.stringify(value))
const login = (overrides = {}) => ({
  serverUrl: 'http://127.0.0.1:4533',
  username: 'demo',
  password: 'demo',
  remember: true,
  allowLocal: true,
  ...overrides
})

await checkBuild('original scaffold')
await applyLesson('index')
await checkBuild('project manifest')
await applyLesson('connection')
await checkBuild('connection actions')
await copyFile(join(sample, 'mock-navidrome.mjs'), join(project, 'mock-navidrome.mjs'))

const server = spawn(process.execPath, ['mock-navidrome.mjs'], {
  cwd: project,
  stdio: ['ignore', 'pipe', 'pipe']
})
try {
  await new Promise((resolveReady, reject) => {
    const timeout = setTimeout(() => reject(new Error('Mock startup timeout')), 10000)
    server.once('error', reject)
    server.once('exit', (code) => {
      clearTimeout(timeout)
      reject(new Error('Mock exited: ' + code))
    })
    server.stderr.on('data', (data) => process.stderr.write(data))
    server.stdout.on('data', (data) => {
      if (String(data).includes('Mock Navidrome:')) {
        clearTimeout(timeout)
        resolveReady()
      }
    })
  })

  let runtime = await activate(false)
  await assert.rejects(runtime.actions.get('connection.save')(login({ password: 'wrong' }), operation()), /无效/)
  assert.equal(storage.size, 0)
  const connected = plain(await runtime.actions.get('connection.save')(login(), operation()))
  assert.equal(connected.connected, true)
  assert.equal(connected.token, undefined)
  assert.equal(connected.salt, undefined)
  assert.equal(storage.get('connection.v1').password, undefined)
  assert.deepEqual(runtime.prompts, ['navidrome.http', 'navidrome.private'])
  assert.match((await runtime.actions.get('connection.ping')({}, operation())).status, /连接正常/)

  runtime = await activate(false)
  assert.equal((await runtime.actions.get('connection.read')()).connected, true)
  await runtime.actions.get('connection.logout')()
  assert.equal(storage.size, 0)
  assert.equal((await runtime.actions.get('connection.read')()).connected, false)
  runtime.grants.set('navidrome.http', 'denied')
  const beforeDenied = runtime.requests.length
  await assert.rejects(runtime.actions.get('connection.save')(login(), operation()), /权限未授予/)
  assert.equal(runtime.requests.length, beforeDenied)
  console.log('PASS: bad login, authorization, public state, storage restore and logout')

  await applyLesson('surface')
  await checkBuild('Vue connection page')
  const appSource = await readFile(join(project, 'src/App.vue'), 'utf8')
  assert.match(appSource, /context\.subscribe\(applyState\)/)
  assert.match(appSource, /clearInterval\(poll\)/)
  assert.doesNotMatch(appSource, /100vh/)

  await applyLesson('provider')
  await checkBuild('Navidrome provider')
  runtime = await activate(true)
  await runtime.actions.get('connection.save')(login(), operation())
  const tracks = runtime.providers.get('navidrome').tracks
  const first = await tracks.search(
    { query: '', kinds: ['track'], filters: {}, limit: 1 },
    operation()
  )
  assert.equal(first.items.length, 1)
  assert.equal(first.items[0].title, 'Morning Light')
  assert.equal(first.nextCursor, '1')
  const second = await tracks.search(
    { query: '', kinds: ['track'], filters: {}, limit: 1, cursor: first.nextCursor },
    operation()
  )
  assert.equal(second.items[0].title, 'Rainy Afternoon')
  assert.equal(second.nextCursor, undefined)
  await assert.rejects(
    tracks.search({ query: '', kinds: ['track'], filters: {}, limit: 1, cursor: '-1' }, operation()),
    /分页游标/
  )
  const ref = first.items[0].ref
  const resolved = await tracks.resolve(ref, 'original', operation())
  assert.equal(resolved.ok, true)
  const audio = await fetch(resolved.url)
  const wave = Buffer.from(await audio.arrayBuffer())
  assert.equal(audio.status, 200)
  assert.equal(wave.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wave.toString('ascii', 8, 12), 'WAVE')
  assert.ok(wave.subarray(44).some((byte) => byte !== 0))
  const lyrics = await tracks.lyrics(ref, operation())
  assert.equal(lyrics.lines.length, 2)
  assert.equal(lyrics.lines[1].startTimeMs, 1000)
  assert.equal(lyrics.lines[1].text, '歌词来自 OpenSubsonic 接口')
  await runtime.actions.get('connection.logout')()
  assert.equal((await tracks.resolve(ref, 'original', operation())).error.code, 'AUTH_REQUIRED')
  console.log('PASS: pagination, ref ownership, WAV playback, lyrics and auth recovery')

  for (const file of changed) {
    const normalize = (value) => value.trim().replaceAll('\r\n', '\n')
    assert.equal(
      normalize(await readFile(join(project, file), 'utf8')),
      normalize(await readFile(join(sample, file), 'utf8')),
      'Download sample differs: ' + file
    )
  }
  console.log('PASS: downloadable source matches the final lesson files')
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit')
    server.kill()
    await exited
  }
}
