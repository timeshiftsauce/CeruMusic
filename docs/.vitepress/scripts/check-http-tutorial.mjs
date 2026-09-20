import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { resolve, join, dirname } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import { once } from 'node:events'
import assert from 'node:assert/strict'
import vm from 'node:vm'

// Mutates a disposable source/ts scaffold; dependencies may be installed in a parent directory.
const project = process.argv[2] && resolve(process.argv[2])
if (!project)
  throw new Error('Usage: node docs/.vitepress/scripts/check-http-tutorial.mjs <project>')
const require = createRequire(join(project, 'package.json'))
const { buildProject } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-cli'))
)
const { readArtifact } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-issuer'))
)
const { createHttpClient } = await import(
  pathToFileURL(require.resolve('@shiqianjiang/ceru-plugin-sdk/http'))
)
const ts = require('typescript')
const lessons = fileURLToPath(new URL('../../guide/plugins/v2/tutorial-source/', import.meta.url))
const sample = fileURLToPath(
  new URL('../../public/plugins/v2/tutorial/http-source/', import.meta.url)
)
const changed = new Set()

async function applyLesson(name) {
  const markdown = await readFile(join(lessons, name + '.md'), 'utf8')
  const blocks = [...markdown.matchAll(/```(?:ts|json) \[([^\]]+)\]\r?\n([\s\S]*?)```/g)]
  assert.ok(blocks.length, 'Missing lesson files: ' + name)
  for (const [, file, source] of blocks) {
    assert.match(file, /^(ceru\.plugin\.json|src\/(index|network|api|catalog|lyrics)\.ts)$/)
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
  console.log('PASS: ' + stage + ' types, build and artifact')
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
    id: 'tutorial-test',
    deadlineAt: Date.now() + 10000,
    signal: controller.signal,
    userIntent: { kind: 'user-intent', id: 'test' },
    controller
  }
}

async function activate(stage) {
  const config = JSON.parse(await readFile(join(project, 'ceru.plugin.json'), 'utf8'))
  const manifest = config.manifest
  const actions = new Map(),
    providers = new Map(),
    grants = new Map()
  const requests = [],
    prompts = []
  const ctx = {
    plugin: { id: manifest.id },
    config: { get: async () => manifest.config },
    permissions: {
      query: async ({ key }) => {
        assert.ok(manifest.permissions.some((p) => p.key === key))
        return { status: grants.get(key) ?? 'prompt' }
      },
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
        assert.equal(grants.get('source.private'), 'granted')
        requests.push(input)
        const response = await fetch(input.url, { signal: input.operation.signal })
        return {
          status: response.status,
          headers: Object.fromEntries(response.headers),
          body: await response.json()
        }
      },
      create: (options) => createHttpClient(ctx, options)
    },
    actions: {
      register: (id, handler) => {
        assert.ok(manifest.contributes.commands.some((item) => item.action === id))
        actions.set(id, handler)
      }
    },
    providers: {
      register: (id, provider) => {
        assert.ok(manifest.contributes.providers.some((item) => item.id === id))
        providers.set(id, provider)
      }
    },
    playback: { failure: (error) => ({ ok: false, error }) }
  }
  const imports = { '@shiqianjiang/ceru-plugin-sdk': { definePlugin: (entry) => entry } }
  imports['./network'] = await loadModule('network', imports)
  if (stage !== 'index') {
    imports['./api'] = await loadModule('api', imports)
    if (stage === 'playback') imports['./lyrics'] = await loadModule('lyrics', imports)
    imports['./catalog'] = await loadModule('catalog', imports)
  }
  await (await loadModule('index', imports)).default(ctx)
  return { actions, providers, grants, requests, prompts, imports, manifest }
}

await checkBuild('original scaffold')
await copyFile(join(sample, 'mock-server.mjs'), join(project, 'mock-server.mjs'))
const server = spawn(process.execPath, ['mock-server.mjs'], {
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
      if (String(data).includes('Mock music API:')) {
        clearTimeout(timeout)
        resolveReady()
      }
    })
  })
  for (const stage of ['index', 'provider', 'playback']) {
    await applyLesson(stage)
    await checkBuild(stage)
    const runtime = await activate(stage)
    const { actions, providers, grants, requests, prompts } = runtime
    assert.equal(requests.length, 0, 'Activation should not request the API')
    assert.deepEqual(await actions.get('source.check')({}, operation()), { ok: true, tracks: 3 })
    assert.deepEqual(prompts, ['source.private', 'source.http'])
    for (const key of ['source.private', 'source.http']) {
      grants.set(key, 'denied')
      const before = requests.length
      await assert.rejects(actions.get('source.check')({}, operation()), /允许|denied/)
      assert.equal(requests.length, before, 'Denied permission must not issue a request')
      assert.equal(prompts.length, 2, 'Denied permission must not prompt again')
      grants.set(key, 'granted')
    }
    const cancelled = operation()
    cancelled.controller.abort()
    await assert.rejects(actions.get('source.check')({}, cancelled), /abort/i)
    if (stage === 'index') continue
    const tracks = providers.get('tutorial-source').tracks
    const request = { query: ' MORNING ', kinds: ['track'], filters: {}, limit: 20 }
    const first = await tracks.search(request, operation())
    assert.equal(first.items.length, 1)
    assert.equal(first.items[0].ref.id, 'morning')
    assert.equal(first.items[0].ref.pluginId, runtime.manifest.id)
    assert.equal(first.items[0].playable, stage === 'playback')
    assert.equal(
      (await tracks.search({ ...request, query: '不存在' }, operation())).items.length,
      0
    )
    await assert.rejects(tracks.search({ ...request, cursor: '-1' }, operation()), /分页游标/)
    const result = await actions.get('source.test')({}, operation())
    assert.equal(result.first.items.length, 2)
    assert.equal(result.first.nextCursor, '2')
    assert.equal(result.second.items.length, 1)
    assert.equal(result.second.items[0].ref.id, 'night')
    assert.equal(result.second.nextCursor, undefined)
    const ref = first.items[0].ref
    if (stage === 'provider') {
      assert.equal((await tracks.resolve(ref, undefined, operation())).error.code, 'UNSUPPORTED')
      continue
    }
    const resolved = await tracks.resolve(ref, 'lossless', operation())
    assert.equal(resolved.ok, true)
    const response = await fetch(resolved.url)
    assert.equal(response.status, 200)
    assert.equal(response.headers.get('content-type'), 'audio/wav')
    const wave = Buffer.from(await response.arrayBuffer())
    assert.equal(wave.toString('ascii', 0, 4), 'RIFF')
    assert.equal(wave.toString('ascii', 8, 12), 'WAVE')
    assert.equal(wave.readUInt32LE(40) / wave.readUInt32LE(28), 2.2)
    assert.ok(wave.subarray(44).some((byte) => byte !== 0))
    assert.equal(result.lyrics.track.id, 'morning')
    assert.equal(result.lyrics.format, 'crlyric')
    assert.equal(result.lyrics.lines[1].startTimeMs, 1000)
    assert.equal(result.lyrics.lines[1].text, '这是本机模拟服务返回的歌词')
    assert.equal(
      (await tracks.resolve({ ...ref, pluginId: 'other' }, undefined, operation())).error.code,
      'NOT_FOUND'
    )
    assert.equal((await tracks.resolve(ref, '320k', operation())).error.code, 'UNSUPPORTED')
    await assert.rejects(tracks.lyrics({ ...ref, id: 'missing' }, operation()), /HTTP 404/)
    grants.set('source.private', 'denied')
    await assert.rejects(tracks.resolve(ref, undefined, operation()), /允许/)
    grants.set('source.private', 'granted')
    grants.set('source.http', 'denied')
    await assert.rejects(tracks.resolve(ref, undefined, operation()), /denied/)
    const cleaned = runtime.imports['./lyrics'].toLyrics(ref, {
      offsetMs: 50,
      lines: [
        { startTimeMs: 1000, text: 'second' },
        { startTimeMs: -1, text: 'invalid' },
        { startTimeMs: 0, endTimeMs: 900, text: 'first' },
        { startTimeMs: 100, endTimeMs: 10, text: 'invalid end' }
      ]
    })
    assert.equal(cleaned.offsetMs, 50)
    assert.equal(cleaned.lines.length, 2)
    assert.equal(cleaned.lines[0].text, 'first')
    for (const input of requests) assert.equal(input.operation.id, 'tutorial-test')
  }
  for (const file of changed) {
    const normalize = (value) => value.trim().replaceAll('\r\n', '\n')
    assert.equal(
      normalize(await readFile(join(project, file), 'utf8')),
      normalize(await readFile(join(sample, file), 'utf8')),
      'Sample differs: ' + file
    )
  }
  console.log(
    'PASS: actual SDK HTTP client, authorization, cancellation, two pages, WAV, lyrics and sample parity'
  )
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit')
    server.kill()
    await exited
  }
}
