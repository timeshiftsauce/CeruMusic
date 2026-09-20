import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import vm from 'node:vm'

// The argument must be a disposable source/ts scaffold with dependencies installed.
const project = process.argv[2] && resolve(process.argv[2])
if (!project)
  throw new Error('Usage: node docs/.vitepress/scripts/check-tutorial.mjs <exercise-project>')
const require = createRequire(join(project, 'package.json'))
const { buildProject } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-cli'))
)
const { readArtifact } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-issuer'))
)
const ts = require('typescript')
const lessons = fileURLToPath(new URL('../../guide/plugins/v2/', import.meta.url))
const sample = fileURLToPath(
  new URL('../../public/plugins/v2/tutorial/first-plugin/', import.meta.url)
)
const changed = new Set()

async function applyLesson(name) {
  const markdown = await readFile(join(lessons, name + '.md'), 'utf8')
  const blocks = [...markdown.matchAll(/```(?:ts|json) \[([^\]]+)\]\r?\n([\s\S]*?)```/g)]
  assert.ok(blocks.length > 0, name + ': missing complete file blocks')
  for (const [, file, source] of blocks) {
    assert.ok(
      ['src/index.ts', 'src/catalog.ts', 'ceru.plugin.json', 'ui/counter.json'].includes(file)
    )
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
  console.log('PASS: ' + stage + ' build, types and artifact validation')
}

async function loadModule(file, imports = {}) {
  const source = await readFile(file, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  vm.runInNewContext(
    js,
    {
      exports,
      require: (name) => {
        assert.ok(Object.hasOwn(imports, name), 'Unexpected import: ' + name)
        return imports[name]
      }
    },
    { filename: file }
  )
  return exports
}

const storage = new Map()
async function activate(withCatalog) {
  const registered = new Map()
  const messages = []
  const states = new Map()
  const config = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
  const manifest = config.manifest
  const ctx = {
    plugin: { id: manifest.id },
    actions: {
      register: (id, handler) => {
        assert.ok(manifest.contributes.commands.some((command) => command.action === id))
        registered.set(id, handler)
      }
    },
    providers: {
      register: (id, provider) => {
        assert.ok(manifest.contributes.providers.some((item) => item.id === id))
        registered.set(id, provider)
      }
    },
    storage: {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => {
        storage.set(key, value)
      }
    },
    ui: {
      notify: async (message) => {
        messages.push(message)
      },
      setState: async (id, state) => {
        assert.ok(manifest.modules.surfaces.some((surface) => surface.id === id))
        states.set(id, state)
      }
    },
    playback: { failure: (error) => ({ ok: false, error }) }
  }
  const imports = { '@shiqianjiang/ceru-plugin-sdk': { definePlugin: (entry) => entry } }
  if (withCatalog) imports['./catalog'] = await loadModule(join(project, 'src/catalog.ts'))
  const entry = await loadModule(join(project, 'src/index.ts'), imports)
  await entry.default(ctx)
  return { registered, messages, states, manifest, config }
}

async function checkSearch(runtime) {
  const provider = runtime.registered.get('catalog')
  for (const [query, expected] of [
    ['晨光', 'sunrise'],
    ['我的曲库', 'sunrise'],
    [' MORNING ', 'morning'],
    ['不存在', null]
  ]) {
    const result = await provider.tracks.search({ query, limit: 20, kinds: ['track'], filters: {} })
    assert.equal(result.items.length, expected ? 1 : 0)
    if (expected) {
      const item = result.items[0]
      assert.equal(item.ref.id, expected)
      assert.equal(item.ref.pluginId, runtime.manifest.id)
      assert.equal(item.ref.providerId, 'catalog')
      assert.equal(item.playable, false)
      assert.ok(item.metadata.artists.length)
    }
  }
  assert.equal((await provider.tracks.search({ query: '', limit: 2 })).items.length, 2)
  assert.equal((await provider.tracks.resolve()).error.code, 'UNSUPPORTED')
}

await checkBuild('quick-start scaffold')
await applyLesson('first-command')
await checkBuild('first-command')
let runtime = await activate(false)
assert.equal(runtime.messages.length, 0, 'registering an action must not execute it')
await runtime.registered.get('hello')()
assert.equal(runtime.messages[0].message, '你好，这是我的第一个澜音插件！')

await applyLesson('first-search')
await checkBuild('first-search')
runtime = await activate(true)
await checkSearch(runtime)
await runtime.registered.get('hello')()
assert.equal(runtime.messages.length, 1)

await applyLesson('first-storage')
await checkBuild('first-storage')
runtime = await activate(true)
assert.equal(runtime.states.get('counter').status, '已问候 0 次')
await runtime.registered.get('hello')()
await runtime.registered.get('hello')()
assert.equal(storage.get('visits'), 2)
assert.equal(runtime.messages.at(-1).message, '这是第 2 次问候')
runtime = await activate(true)
assert.equal(runtime.states.get('counter').status, '已问候 2 次')
await checkSearch(runtime)

// Exercise the desktop's actual schema parser and form-to-action mapping.
const drawer = await loadModule(
  fileURLToPath(new URL('../../../src/common/pluginDrawer.ts', import.meta.url))
)
const page = runtime.manifest.contributes.settingsPages[0]
const surface = runtime.manifest.modules.surfaces.find((item) => item.id === page.view)
const resource = runtime.config.resources[surface.entry]
const schema = drawer.readDrawerSchema(
  JSON.parse(await readFile(join(project, resource.path), 'utf8')),
  runtime.manifest.contributes.commands.map((command) => command.action)
)
const action = drawer.drawerAction(schema, -1, {})
await runtime.registered.get(action.action)(action.input)
assert.equal(storage.get('visits'), 3)
assert.equal(runtime.states.get('counter').status, '已问候 3 次')
console.log('PASS: command, search, counter reload and desktop form action')

for (const file of changed) {
  const actual = (await readFile(join(project, file), 'utf8')).trim().replaceAll('\r\n', '\n')
  const published = (await readFile(join(sample, file), 'utf8')).trim().replaceAll('\r\n', '\n')
  assert.equal(actual, published, 'Download sample differs from lessons: ' + file)
}
console.log('PASS: downloadable source matches the final lesson files')
