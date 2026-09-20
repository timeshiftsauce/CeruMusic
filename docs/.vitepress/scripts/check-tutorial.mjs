import { readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'
import vm from 'node:vm'

// Use a separately npm-created source/ts project. It becomes the lesson exercise.
const project = process.argv[2] && resolve(process.argv[2])
if (!project)
  throw new Error('Usage: node docs/.vitepress/scripts/check-tutorial.mjs <source-ts-project>')
const require = createRequire(join(project, 'package.json'))
const { buildProject } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-cli'))
)
const { readArtifact } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-issuer'))
)
const ts = require('typescript')
const lessons = fileURLToPath(new URL('../../guide/plugins/v2/', import.meta.url))
const snippet = async (file) => {
  const text = (await readFile(join(lessons, file), 'utf8')).replaceAll('\r\n', '\n')
  const source = /```ts\n([\s\S]*?)```/.exec(text)?.[1]
  if (!source) throw new Error('Missing TypeScript snippet in ' + file)
  return source.trim()
}
const main = join(project, 'src/index.ts')
let source = (await readFile(main, 'utf8')).replaceAll('\r\n', '\n')
function replaceHello(body) {
  const start = source.indexOf("  ctx.actions.register('hello'")
  const end = source.indexOf('\n\n  ctx.providers.register', start)
  assert.ok(start !== -1 && end > start, 'source template must contain hello before catalog')
  source =
    source.slice(0, start) +
    body
      .split('\n')
      .map((line) => (line ? '  ' + line : ''))
      .join('\n') +
    source.slice(end)
}
async function check(stage) {
  await writeFile(main, source)
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
await check('quick-start')
replaceHello(await snippet('first-command.md'))
await check('first-command')
source = source.replace(/const tracks = \[[\s\S]*?\n\]/, await snippet('first-search.md'))
await check('first-search')
replaceHello(await snippet('first-storage.md'))
await check('first-storage')

// Verify the lesson's actual functions, including no results and two consecutive actions.
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText
const registered = new Map()
const storage = new Map()
const messages = []
const exports = {}
const context = {
  plugin: { id: 'example.tutorial' },
  config: { get: async () => ({ displayName: 'Demo' }) },
  actions: {
    register: (id, handler) => {
      registered.set(id, handler)
      return () => registered.delete(id)
    }
  },
  providers: {
    register: (id, provider) => {
      registered.set(id, provider)
      return () => registered.delete(id)
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
    }
  },
  utils: { lodash: { trim: (value) => value.trim() } },
  playback: { failure: (error) => ({ ok: false, error }) }
}
vm.runInNewContext(js, {
  exports,
  require: (name) => {
    assert.equal(name, '@shiqianjiang/ceru-plugin-sdk')
    return { definePlugin: (entry) => entry }
  }
})
await exports.default(context)
const provider = registered.get('catalog')
for (const query of ['晨光', '我的曲库', 'Morning', '不存在']) {
  const result = await provider.tracks.search({ query, limit: 20, kinds: ['track'], filters: {} })
  assert.equal(result.items.length, query === '不存在' ? 0 : 1)
}
await registered.get('hello')()
await registered.get('hello')()
assert.equal(storage.get('visits'), 2)
assert.equal(messages.at(-1).message, '这是第 2 次问候')
console.log('PASS: tutorial search, empty results and counter writes')
console.log('Exercise project: ' + project)
