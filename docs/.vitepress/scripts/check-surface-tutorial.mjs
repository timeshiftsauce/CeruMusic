import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import vm from 'node:vm'

// The argument must be a disposable vue/ts scaffold with dependencies installed.
const project = process.argv[2] && resolve(process.argv[2])
if (!project)
  throw new Error('Usage: node docs/.vitepress/scripts/check-surface-tutorial.mjs <project>')

const require = createRequire(join(project, 'package.json'))
const { buildProject } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-cli'))
)
const { readArtifact } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-issuer'))
)
const ts = require('typescript')
const lesson = fileURLToPath(new URL('../../guide/plugins/v2/surfaces.md', import.meta.url))
const sample = fileURLToPath(
  new URL('../../public/plugins/v2/tutorial/counter-page/', import.meta.url)
)
const changed = new Set()

async function applyLesson() {
  const markdown = await readFile(lesson, 'utf8')
  const blocks = [
    ...markdown.matchAll(/```(?:ts|json|vue) \[([^\]]+)\]\r?\n([\s\S]*?)```/g)
  ]
  assert.equal(blocks.length, 4, 'Surface lesson must contain four complete files')
  for (const [, file, source] of blocks) {
    assert.ok(
      ['ceru.plugin.json', 'src/index.ts', 'src/view.ts', 'src/App.vue'].includes(file),
      'Unexpected lesson file: ' + file
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
  if (stage === 'surface lesson') {
    assert.equal(artifact.header.manifest.modules.surfaces[0].id, 'counter')
  }

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

async function loadEntry(runtime) {
  const file = join(project, 'src/index.ts')
  const source = await readFile(file, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  vm.runInNewContext(
    js,
    {
      exports,
      Date: runtime.Date,
      setInterval: runtime.setInterval,
      clearInterval: runtime.clearInterval,
      require: (id) => {
        assert.equal(id, '@shiqianjiang/ceru-plugin-sdk')
        return { definePlugin: (entry) => entry }
      }
    },
    { filename: file }
  )
  return exports.default
}

const storage = new Map()
let now = 1000
let nextTimer = 1
const timers = new Map()
class TestDate extends Date {
  static now() {
    return now
  }
}

async function activate() {
  const config = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
  const manifest = config.manifest
  const actions = new Map()
  const states = []
  const runtime = {
    Date: TestDate,
    setInterval: (handler, delay) => {
      assert.equal(delay, 1000)
      const id = nextTimer++
      timers.set(id, handler)
      return id
    },
    clearInterval: (id) => timers.delete(id)
  }
  const ctx = {
    actions: {
      register: (id, handler) => {
        assert.ok(manifest.contributes.commands.some((command) => command.action === id))
        actions.set(id, handler)
      }
    },
    storage: {
      get: async (key) => storage.get(key) ?? null,
      set: async (key, value) => storage.set(key, value)
    },
    ui: {
      setState: async (id, state) => {
        assert.ok(manifest.modules.surfaces.some((surface) => surface.id === id))
        states.push({ id, state })
      }
    }
  }
  const cleanup = await (await loadEntry(runtime))(ctx)
  return { actions, states, cleanup }
}

await checkBuild('original scaffold')
await applyLesson()
await checkBuild('surface lesson')

let runtime = await activate()
const plain = (value) => JSON.parse(JSON.stringify(value))
assert.deepEqual(plain(await runtime.actions.get('counter.read')()), {
  count: 0,
  status: '页面已连接',
  activeSeconds: 0
})
assert.deepEqual(plain(await runtime.actions.get('counter.increment')()), {
  count: 1,
  status: '计数已保存',
  activeSeconds: 0
})
assert.equal(storage.get('counter'), 1)

await runtime.actions.get('counter.surface-open')()
assert.equal(timers.size, 1)
now = 3500
await [...timers.values()][0]()
assert.equal(runtime.states.at(-1).state.activeSeconds, 2)
assert.deepEqual(plain(await runtime.actions.get('counter.reset')()), {
  count: 0,
  status: '计数已重置',
  activeSeconds: 2
})
assert.deepEqual(plain(await runtime.actions.get('counter.surface-close')()), { closed: true })
assert.equal(timers.size, 0, 'closeAction must stop the publishing timer')

await runtime.actions.get('counter.increment')()
await runtime.cleanup()
runtime = await activate()
assert.equal((await runtime.actions.get('counter.read')()).count, 1)
await runtime.actions.get('counter.surface-open')()
assert.equal(timers.size, 1)
await runtime.cleanup()
assert.equal(timers.size, 0, 'plugin cleanup must stop the publishing timer')
console.log('PASS: invoke results, state publishing, lifecycle cleanup and persisted storage')

for (const file of changed) {
  const normalize = (value) => value.trim().replaceAll('\r\n', '\n')
  assert.equal(
    normalize(await readFile(join(project, file), 'utf8')),
    normalize(await readFile(join(sample, file), 'utf8')),
    'Download sample differs: ' + file
  )
}
console.log('PASS: downloadable source matches the lesson files')
