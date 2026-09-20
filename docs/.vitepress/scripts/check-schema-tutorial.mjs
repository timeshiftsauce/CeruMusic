import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import vm from 'node:vm'

// The argument must be a disposable source/ts scaffold with dependencies installed.
const project = process.argv[2] && resolve(process.argv[2])
if (!project)
  throw new Error('Usage: node docs/.vitepress/scripts/check-schema-tutorial.mjs <project>')

const require = createRequire(join(project, 'package.json'))
const { buildProject } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-cli'))
)
const { readArtifact } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-issuer'))
)
const ts = require('typescript')
const lesson = fileURLToPath(new URL('../../guide/plugins/v2/ui-schema.md', import.meta.url))
const sample = fileURLToPath(
  new URL('../../public/plugins/v2/tutorial/settings-drawer/', import.meta.url)
)
const changed = new Set()

async function applyLesson() {
  const markdown = await readFile(lesson, 'utf8')
  const blocks = [...markdown.matchAll(/```(?:ts|json) \[([^\]]+)\]\r?\n([\s\S]*?)```/g)]
  assert.equal(blocks.length, 3, 'Schema lesson must contain three complete files')
  for (const [, file, source] of blocks) {
    assert.ok(
      ['ceru.plugin.json', 'ui/settings.json', 'src/index.ts'].includes(file),
      'Unexpected lesson file: ' + file
    )
    await mkdir(dirname(join(project, file)), { recursive: true })
    await writeFile(join(project, file), source)
    changed.add(file)
  }
}

async function loadTypeScript(file, imports = {}) {
  const source = await readFile(file, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText
  const exports = {}
  vm.runInNewContext(
    js,
    {
      exports,
      require: (id) => {
        assert.ok(Object.hasOwn(imports, id), 'Unexpected import: ' + id)
        return imports[id]
      }
    },
    { filename: file }
  )
  return exports
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

const storage = new Map()
async function activate() {
  const config = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
  const manifest = config.manifest
  const actions = new Map()
  const states = []
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
        assert.equal(id, 'settings')
        states.push(state)
      }
    }
  }
  const imports = { '@shiqianjiang/ceru-plugin-sdk': { definePlugin: (entry) => entry } }
  const entry = await loadTypeScript(join(project, 'src/index.ts'), imports)
  await entry.default(ctx)
  return { actions, states, manifest }
}

await checkBuild('original scaffold')
await applyLesson()
await checkBuild('schema lesson')

const drawer = await loadTypeScript(
  fileURLToPath(new URL('../../../src/common/pluginDrawer.ts', import.meta.url))
)
const config = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
const declaredActions = config.manifest.contributes.commands.map((command) => command.action)
const schema = drawer.readDrawerSchema(
  JSON.parse(await readFile(join(project, 'ui/settings.json'), 'utf8')),
  declaredActions
)
const values = {
  displayName: '家庭曲库',
  accessToken: 'secret-token',
  resultLimit: 30,
  autoPlay: true,
  quality: 'flac',
  source: 'forged'
}
const submit = drawer.drawerAction(schema, -1, values)
assert.equal(submit.action, 'settings.save')
assert.equal(submit.input.source, 'settings-form', 'submitInput must override form values')
assert.throws(() => drawer.drawerAction(schema, -1, { ...values, displayName: '' }), /请填写/)
assert.throws(() => drawer.drawerAction(schema, -1, { ...values, resultLimit: '30' }), /字段格式/)
assert.throws(() => drawer.drawerAction(schema, -1, { ...values, quality: 'master' }), /请选择有效/)

const resetIndex = schema.root.children.findIndex((item) => item.type === 'button')
const reset = drawer.drawerAction(schema, resetIndex, { ...values, scope: 'forged' })
assert.equal(reset.action, 'settings.reset')
assert.equal(reset.input.scope, 'all', 'button input must override form values')
assert.equal(drawer.drawerState(schema, { ...values }).accessToken, undefined)

let runtime = await activate()
const plain = (value) => JSON.parse(JSON.stringify(value))
assert.equal((await runtime.actions.get('settings.load')()).quality, '320k')
const savedState = plain(await runtime.actions.get(submit.action)(submit.input))
assert.equal(savedState.displayName, '家庭曲库')
assert.equal(savedState.quality, 'flac')
assert.equal(savedState.accessToken, undefined, 'secret must not be published in surface state')
assert.equal(storage.get('preferences').accessToken, 'secret-token')

const blankToken = drawer.drawerAction(schema, -1, { ...values, accessToken: '' })
await runtime.actions.get(blankToken.action)(blankToken.input)
assert.equal(storage.get('preferences').accessToken, 'secret-token', 'blank token must keep saved token')
runtime = await activate()
assert.equal((await runtime.actions.get('settings.load')()).displayName, '家庭曲库')
await runtime.actions.get(reset.action)(reset.input)
assert.equal(storage.get('preferences').displayName, '我的音乐服务')
assert.equal(storage.get('preferences').accessToken, '')
console.log('PASS: desktop schema parsing, form validation, secret handling and persistence')

for (const file of changed) {
  const normalize = (value) => value.trim().replaceAll('\r\n', '\n')
  assert.equal(
    normalize(await readFile(join(project, file), 'utf8')),
    normalize(await readFile(join(sample, file), 'utf8')),
    'Download sample differs: ' + file
  )
}
console.log('PASS: downloadable source matches the lesson files')
