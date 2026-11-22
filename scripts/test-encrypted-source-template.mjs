/**
 * Actual scaffold/build -> installed worker -> loopback HTTP -> desktop media pipeline.
 * Only Host permission/config/UI decisions are simulated. Crypto, WASM, Web streams,
 * NodePluginSandbox, PluginHttpServer and PluginMediaRegistry are the real implementations.
 *
 * node scripts/test-encrypted-source-template.mjs --tooling <CeruMusic-Plugin-Cli> [--electron]
 * Optional: --templates <CeruMusic-Plugin-Template> --output <new artifact directory>
 * Retains JSON, NDJSON, builds and Electron profile under a fresh temporary directory.
 * Build projects use the desktop's installed SDK/Core/Issuer through temporary links;
 * CLI and TypeScript come from tooling. No source-runtime substitution is performed.
 * No installs, global settings, published packages, template sync or user profiles change.
 */
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { appendFileSync } from 'node:fs'
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  symlink,
  unlink,
  writeFile
} from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { setTimeout as delay } from 'node:timers/promises'
import { build } from 'esbuild'

const scriptPath = fileURLToPath(import.meta.url)
const desktopRoot = resolve(dirname(scriptPath), '..')
const require = createRequire(import.meta.url)
const providerIds = ['builtin-decrypt', 'wasm-transform', 'own-service']
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex')
const importInstalled = (name) => import(pathToFileURL(require.resolve(name)).href)
const errorRecord = (error) => ({ message: error.message, stack: error.stack })

function logger(path, phase) {
  return (event, data = {}) => {
    appendFileSync(
      path,
      JSON.stringify({ time: new Date().toISOString(), phase, event, ...data }) + '\n'
    )
  }
}

async function bounded(promise, name, timeout = 20000) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(Error(`${name} timed out after ${timeout} ms`)), timeout)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function waitUntil(check, name) {
  for (let count = 0; count < 100; count++) {
    if (check()) return
    await delay(20)
  }
  throw Error(`Timed out waiting for ${name}`)
}

function verifyWav(bytes) {
  assert.equal(bytes.length, 96044)
  assert.equal(bytes.toString('ascii', 0, 4), 'RIFF')
  assert.equal(bytes.readUInt32LE(4) + 8, bytes.length)
  assert.equal(bytes.toString('ascii', 8, 16), 'WAVEfmt ')
  assert.equal(bytes.readUInt16LE(20), 1)
  assert.equal(bytes.readUInt16LE(22), 1)
  assert.equal(bytes.readUInt32LE(24), 16000)
  assert.equal(bytes.readUInt16LE(34), 16)
  assert.equal(bytes.readUInt32LE(40), bytes.length - 44)
  assert(
    bytes.subarray(44).some((byte) => byte !== 0),
    'Tone must not be silence'
  )
}

async function fetchBytes(registry, url, options = {}) {
  const request = new Request(url, { ...options, signal: AbortSignal.timeout(12000) })
  const response = url.startsWith('ceru-media:')
    ? await registry.handle(request)
    : await fetch(request)
  const bytes = Buffer.from(await response.arrayBuffer())
  return { response, bytes }
}

/** Reused in plain Node and the isolated Electron main process. */
export async function runWorkerSuite(config, browserProbe) {
  const log = logger(config.logPath, `${config.mode}/${config.language}`)
  const [
    { NodePluginSandbox },
    { PluginHttpServer },
    { createDispatcher },
    { readArtifact },
    sdk,
    media
  ] = await Promise.all([
    importInstalled('@shiqianjiang/ceru-plugin-core/node'),
    importInstalled('@shiqianjiang/ceru-plugin-core/server'),
    importInstalled('@shiqianjiang/ceru-plugin-core/dispatch'),
    importInstalled('@shiqianjiang/ceru-plugin-issuer'),
    importInstalled('@shiqianjiang/ceru-plugin-sdk'),
    import(pathToFileURL(config.mediaModule).href)
  ])
  const artifact = readArtifact(await readFile(config.artifactPath))
  const manifest = artifact.header.manifest
  const registry = new media.PluginMediaRegistry()
  const lifetime = new AbortController()
  const grants = new Map()
  const policy = new Map([
    ['network.serve', 'granted'],
    ['streams.transform', 'granted']
  ])
  const prompts = []
  const events = []
  const httpRequests = []
  const checks = []
  const shutdownNotices = []
  const runtimeErrors = []
  let shuttingDown = false
  let worker,
    server,
    address,
    starts = 0,
    stops = 0,
    disposed = false
  const declaration = (key) => {
    const row = manifest.uses.permissions.find((item) => item.key === key)
    assert(row, `Undeclared permission ${key}`)
    return row
  }
  const authorize = async (key, name) => {
    assert.equal(declaration(key).name, name)
    if (grants.get(key) !== 'granted') throw Error(`Permission denied: ${name}`)
  }
  const stopServer = async () => {
    const previous = server
    server = undefined
    if (previous) {
      await previous.stop()
      stops++
    }
  }
  // Dispatcher enforces the actual Core RPC contract. Only these Host decisions
  // are local fixtures; the server service forwards into the real Core transport.
  const dispatch = createDispatcher(
    {
      'config.get': async () => manifest.config ?? {},
      'permissions.query': async ({ key }) => {
        declaration(key)
        return { status: grants.get(key) ?? 'prompt' }
      },
      'permissions.getGranted': async () =>
        [...grants].map(([key, status]) => ({
          key,
          name: declaration(key).name,
          scope: {},
          status
        })),
      'permissions.requestGroup': async (request) => {
        assert.equal(
          request.intent?.kind,
          'user-intent',
          'Permission requests must carry the worker operation intent'
        )
        const group = sdk.PERMISSION_GROUPS[request.group]
        assert(group, `Unknown permission group ${request.group}`)
        const rows = request.keys.map((key) => {
          const row = declaration(key)
          assert(group.permissions.includes(row.name))
          const status = policy.get(row.name) ?? 'denied'
          grants.set(key, status)
          return { key, name: row.name, group: request.group, scope: {}, status }
        })
        prompts.push(request)
        log('permission-prompt', { group: request.group, grants: rows })
        return {
          group: request.group,
          status: rows.every((row) => row.status === 'granted') ? 'granted' : 'denied',
          grants: rows
        }
      },
      'server.start': async (options) => {
        assert.equal(server, undefined, 'Only one listener per plugin')
        assert.equal(options.port, undefined, 'Template must use a random port')
        assert.notEqual(options.lan, true, 'Template must bind loopback')
        server = new PluginHttpServer({
          signal: lifetime.signal,
          handler: (request) => {
            httpRequests.push({
              path: new URL(request.url).pathname,
              method: request.method,
              range: request.headers.get('range')
            })
            return worker.handleHttp(request)
          },
          onListen: (port) => registry.registerService(manifest.id, port)
        })
        address = await server.start(options)
        starts++
        log('server-start', address)
        return address
      },
      'server.stop': async () => {
        await stopServer()
        log('server-stop')
        return null
      },
      'operations.cancel': async () => null
    },
    {
      manifest,
      pluginId: manifest.id,
      signal: lifetime.signal,
      authorize,
      log: {
        debug() {},
        info() {},
        warn: (...args) => log('rpc-rejected', { args }),
        error: (...args) => log('rpc-error', { args })
      }
    }
  )
  let workerClosed
  const createWorker = () => {
    let closed
    workerClosed = new Promise((resolve) => {
      closed = resolve
    })
    return new NodePluginSandbox(dispatch, (type, data) => {
      events.push({ type, data })
      log('worker-event', { type, data })
      if (type === 'failed' || (type === 'log' && data.level === 'error')) {
        // Current Core may log its already-pending RPC rejection during disposal.
        // Preserve that diagnostic explicitly; never suppress other runtime errors.
        const expected =
          shuttingDown &&
          type === 'log' &&
          data.values?.some((value) => value?.message === 'Surface disposed')
        ;(expected ? shutdownNotices : runtimeErrors).push({ type, data })
      }
      if (type === 'disposed') disposed = true
      if (type === 'closed') closed()
    })
  }
  worker = createWorker()
  const removeRuntime = registry.registerRuntime(
    manifest.id,
    (id, signal) => worker.streamTransform(id, signal),
    () => authorize('demo-transform', 'streams.transform')
  )
  const invoke = (id, method, args) =>
    bounded(worker.invoke('provider', id, `tracks.${method}`, args), `${id}.${method}`)
  const refs = new Map()
  const resolutions = new Map()
  const prepared = new Map()
  const success = (name, details = {}) => {
    checks.push({ name, ...details })
    log('pass', { name, ...details })
  }
  try {
    await bounded(worker.start(artifact), 'worker activation')
    assert.deepEqual(
      events
        .filter((item) => item.type === 'register' && item.data.kind === 'provider')
        .map((item) => item.data.id)
        .sort(),
      [...providerIds].sort()
    )
    for (const id of providerIds) {
      const page = await invoke(id, 'search', [
        { query: 'Encrypted Demo', kinds: ['track'], filters: {}, limit: 10 }
      ])
      sdk.assertContentPage(page)
      assert.equal(page.items.length, 1)
      assert.equal(page.items[0].durationMs, 3000)
      assert.equal(page.items[0].ref.providerId, id)
      refs.set(id, page.items[0].ref)
      const lyrics = await invoke(id, 'lyrics', [page.items[0].ref])
      sdk.assertLyricsDocument(lyrics)
      assert.equal(lyrics.lines.length, 3)
      assert.equal(
        (
          await invoke(id, 'search', [
            { query: 'not-a-match', kinds: ['track'], filters: {}, limit: 10 }
          ])
        ).items.length,
        0
      )
    }
    assert.equal(prompts.length, 0)
    assert.equal(starts, 0)
    success('search-and-lyrics-without-permissions')

    // Resolve these before WASM: native decrypt/plain service must not request transform permission.
    for (const id of ['builtin-decrypt', 'own-service', 'wasm-transform']) {
      const result = await invoke(id, 'resolve', [refs.get(id), null])
      sdk.assertResolveResult(result)
      assert.equal(result.ok, true, JSON.stringify(result))
      resolutions.set(id, result)
      prepared.set(id, await registry.prepare(manifest.id, result, lifetime.signal))
      if (id !== 'wasm-transform') assert(!prompts.some((item) => item.group === 'audioTransform'))
    }
    assert.equal(starts, 1)
    assert.equal(prompts.filter((item) => item.group === 'audioTransform').length, 1)
    assert.equal(prepared.get('own-service').stream, undefined)
    success('real-worker-resolve-and-host-permissions', {
      starts,
      prompts: prompts.map((item) => item.group)
    })

    let expected
    const audio = []
    for (const id of providerIds) {
      const url = prepared.get(id).url
      const full = await fetchBytes(registry, url)
      assert.equal(full.response.status, 200)
      assert.equal(full.response.headers.get('content-type'), 'audio/wav')
      verifyWav(full.bytes)
      expected ??= full.bytes
      assert.deepEqual(full.bytes, expected, `${id} decoded WAV differs`)
      await writeFile(
        join(config.outputRoot, `${config.mode}-${config.language}-${id}.wav`),
        full.bytes
      )
      for (const [range, start, end] of [
        ['bytes=17-235', 17, 235],
        ['bytes=-44', 96000, 96043],
        ['bytes=96000-', 96000, 96043]
      ]) {
        const part = await fetchBytes(registry, url, { headers: { Range: range } })
        assert.equal(part.response.status, 206)
        assert.equal(part.response.headers.get('content-range'), `bytes ${start}-${end}/96044`)
        assert.deepEqual(part.bytes, expected.subarray(start, end + 1))
      }
      const head = await fetchBytes(registry, url, { method: 'HEAD' })
      assert.equal(head.response.headers.get('content-length'), '96044')
      assert.equal(head.bytes.length, 0)
      const invalid = await fetchBytes(registry, url, { headers: { Range: 'bytes=999999-' } })
      assert.equal(invalid.response.status, 416)
      if (id !== 'own-service') {
        const raw = await fetchBytes(registry, resolutions.get(id).url)
        assert.notDeepEqual(
          raw.bytes,
          expected,
          'Fixture route must actually contain encoded bytes'
        )
      }
      success(`${id}-full-range-head`, { sha256: digest(full.bytes), bytes: full.bytes.length })
      if (browserProbe) audio.push(await browserProbe({ registry, id, url, log, httpRequests }))
    }
    // Real worker transformations must also survive concurrent seeks and realms.
    const concurrent = await Promise.all(
      [17, 8191, 42003].map(async (start) => {
        const { bytes, response } = await fetchBytes(registry, prepared.get('wasm-transform').url, {
          headers: { Range: `bytes=${start}-${start + 511}` }
        })
        assert.equal(response.status, 206)
        assert.deepEqual(bytes, expected.subarray(start, start + 512))
        return start
      })
    )
    success('concurrent-worker-wasm-ranges', { offsets: concurrent })

    // Check actual Host registration ownership, not merely the mock grant decision.
    assert.throws(
      () => registry.assertPlaybackUrl('another-plugin', resolutions.get('own-service').url),
      /owned plugin service/
    )
    success('loopback-server-owner-isolation')

    const cancel = new AbortController()
    const temporary = await registry.prepare(
      manifest.id,
      resolutions.get('wasm-transform'),
      cancel.signal
    )
    cancel.abort()
    assert.equal((await registry.handle(new Request(temporary.url))).status, 404)
    success('media-lifetime-revocation')

    grants.set('demo-transform', 'denied')
    policy.set('streams.transform', 'denied')
    await assert.rejects(
      registry.prepare(manifest.id, resolutions.get('wasm-transform'), lifetime.signal),
      /Permission denied/
    )
    const denied = await invoke('wasm-transform', 'resolve', [refs.get('wasm-transform'), null])
    assert.equal(denied.error?.code, 'PERMISSION_DENIED')
    assert.equal(denied.error.recovery.actions[0].commandId, 'demo.start')
    for (const id of ['builtin-decrypt', 'own-service']) {
      const result = await invoke(id, 'resolve', [refs.get(id), null])
      assert.equal(result.ok, true)
      const accessible = await registry.prepare(manifest.id, result, lifetime.signal)
      assert.deepEqual((await fetchBytes(registry, accessible.url)).bytes, expected)
    }
    success('denied-transform-isolated-from-native-and-plain')

    grants.set('demo-server', 'denied')
    policy.set('network.serve', 'denied')
    registry.revoke(manifest.id)
    await stopServer()
    await worker.send('server-stopped', {})
    for (const id of providerIds) {
      const result = await invoke(id, 'resolve', [refs.get(id), null])
      assert.equal(result.error?.code, 'PERMISSION_DENIED')
      assert.equal(
        (await invoke(id, 'search', [{ query: '', kinds: ['track'], filters: {}, limit: 10 }]))
          .items.length,
        1
      )
    }
    for (const id of ['builtin-decrypt', 'wasm-transform'])
      assert.equal((await registry.handle(new Request(prepared.get(id).url))).status, 404)
    await assert.rejects(fetch(address.url + '/health', { signal: AbortSignal.timeout(2000) }))
    success('server-permission-revocation-closes-listener-and-media')

    // Reload the unchanged built artifact, then exercise ctx.server handle.close via
    // its effects cleanup. This is a real worker dispose message, not an edited fixture.
    shuttingDown = true
    await worker.send('dispose', {})
    await waitUntil(() => disposed, 'worker dispose acknowledgement')
    worker.dispose()
    await bounded(workerClosed, 'old worker exit')
    worker = createWorker()
    disposed = false
    shuttingDown = false
    grants.clear()
    policy.set('network.serve', 'granted')
    policy.set('streams.transform', 'granted')
    await worker.start(artifact)
    const reopened = await invoke('own-service', 'resolve', [refs.get('own-service'), null])
    assert.equal(reopened.ok, true)
    assert.deepEqual((await fetchBytes(registry, reopened.url)).bytes, expected)
    shuttingDown = true
    await worker.send('dispose', {})
    await waitUntil(() => disposed, 'graceful cleanup acknowledgement')
    assert.equal(server, undefined)
    await assert.rejects(fetch(reopened.url, { signal: AbortSignal.timeout(2000) }))
    success('graceful-worker-dispose-closes-real-server', { starts, stops })
    assert.deepEqual(runtimeErrors, [], 'Unexpected real-worker errors (see events.ndjson)')
    return {
      mode: config.mode,
      language: config.language,
      pluginId: manifest.id,
      artifactSha256: digest(await readFile(config.artifactPath)),
      wavSha256: digest(expected),
      checks,
      audio,
      httpRequests,
      shutdownNotices,
      success: true
    }
  } catch (error) {
    log('failure', errorRecord(error))
    throw error
  } finally {
    lifetime.abort()
    removeRuntime()
    registry.dispose()
    worker?.dispose()
    await stopServer()
  }
}

/** Runs only in the npm Electron runtime; never starts the packaged application. */
export async function runElectronSuites(configs) {
  const { app, BrowserWindow, protocol } = require('electron')
  assert(app.isReady(), 'Launcher must await app.whenReady()')
  const results = []
  let activeRegistry
  protocol.handle('ceru-media', (request) => activeRegistry.handle(request))
  const win = new BrowserWindow({
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  })
  win.webContents.setAudioMuted(true)
  try {
    await win.loadURL('data:text/html,<audio muted preload="metadata"></audio>')
    for (const config of configs) {
      const result = await runWorkerSuite(
        { ...config, mode: 'electron' },
        async ({ registry, id, url, log, httpRequests }) => {
          activeRegistry = registry
          const before = httpRequests.length
          const player = await bounded(
            win.webContents.executeJavaScript(
              `(async () => {
          const audio = document.querySelector('audio');
          audio.pause(); audio.removeAttribute('src'); audio.load(); audio.muted = true;
          audio.src = ${JSON.stringify(url)};
          const fail = () => Error('Audio media error ' + audio.error?.code + ': ' + audio.error?.message);
          const event = (name) => new Promise((resolve, reject) => {
            const timer = setTimeout(() => { cleanup(); reject(Error(name + ' timeout')); }, 6000);
            const done = () => { cleanup(); resolve(); };
            const error = () => { cleanup(); reject(fail()); };
            const cleanup = () => { clearTimeout(timer); audio.removeEventListener(name, done); audio.removeEventListener('error', error); };
            audio.addEventListener(name, done, { once: true }); audio.addEventListener('error', error, { once: true });
          });
          await audio.play();
          await new Promise(resolve => setTimeout(resolve, 180));
          const started = audio.currentTime > 0;
          const seeking = event('seeked'); audio.currentTime = 1.25; await seeking;
          await new Promise(resolve => setTimeout(resolve, 180));
          const result = { started, resumed: audio.currentTime > 1.25, currentTime: audio.currentTime,
            duration: audio.duration, muted: audio.muted, error: audio.error?.code ?? null };
          audio.pause(); audio.removeAttribute('src'); audio.load(); return result;
        })()`,
              true
            ),
            `${id} Chromium playback`,
            15000
          )
          assert.equal(player.started, true)
          assert.equal(player.resumed, true)
          assert.equal(player.muted, true)
          assert(Math.abs(player.duration - 3) < 0.05)
          assert.equal(player.error, null)
          const requests = httpRequests.slice(before)
          assert(requests.length > 0, 'Chromium must fetch the actual worker HTTP server')
          // A 96 KB/3s clip may already be fully buffered at seek time. Do not claim
          // that Chromium issued a nonzero HTTP range when it satisfied the seek locally.
          const output = {
            id,
            ...player,
            chromiumRequests: requests,
            seekUsedNonzeroRange: requests.some((row) => /^bytes=[1-9]/.test(row.range ?? ''))
          }
          log('chromium-audio-pass', output)
          return output
        }
      )
      results.push(result)
    }
    return {
      electron: process.versions.electron,
      node: process.version,
      chromium: process.versions.chrome,
      results
    }
  } finally {
    win.destroy()
    protocol.unhandle('ceru-media')
  }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--help')) {
    console.log(
      'node scripts/test-encrypted-source-template.mjs [--tooling PATH] [--templates PATH] [--output NEW_DIRECTORY] [--electron]'
    )
    return
  }
  const option = (name, fallback) => {
    const index = argv.indexOf(name)
    if (index < 0) return fallback
    assert(argv[index + 1] && !argv[index + 1].startsWith('--'), `Missing value for ${name}`)
    return resolve(argv[index + 1])
  }
  for (let index = 0; index < argv.length; index++) {
    if (['--tooling', '--templates', '--output'].includes(argv[index])) {
      index++
      continue
    }
    assert.equal(
      argv[index],
      '--electron',
      `Unknown option ${argv[index]}; packaged executables are not supported`
    )
  }
  const tooling = option('--tooling', resolve(desktopRoot, '../../plugin-v3/CeruMusic-Plugin-Cli'))
  const templates = option(
    '--templates',
    resolve(desktopRoot, '../../templates-v3/CeruMusic-Plugin-Template')
  )
  const output = option('--output')
  if (output) await mkdir(output) // Refuse an existing output, including existing user data.
  const outputRoot = output ?? (await mkdtemp(join(tmpdir(), 'ceru-encrypted-source-e2e-')))
  const logPath = join(outputRoot, 'events.ndjson')
  const reportPath = join(outputRoot, 'report.json')
  const log = logger(logPath, 'main')
  const report = {
    schema: 1,
    startedAt: new Date().toISOString(),
    desktopRoot,
    tooling,
    templates,
    outputRoot,
    node: process.version,
    builds: [],
    results: [],
    success: false
  }
  const links = []
  console.log(`Encrypted-source validation artifacts: ${outputRoot}`)
  try {
    const cliPath = join(tooling, 'packages/cli/dist/project.js')
    const { scaffoldProject, buildProject } = await import(pathToFileURL(cliPath).href)
    report.versions = {}
    for (const name of [
      '@shiqianjiang/ceru-plugin-core',
      '@shiqianjiang/ceru-plugin-sdk',
      '@shiqianjiang/ceru-plugin-issuer'
    ]) {
      const entry = require.resolve(name)
      const pkg = JSON.parse(await readFile(join(dirname(entry), '../package.json'), 'utf8'))
      report.versions[name] = { version: pkg.version, entry, sha256: digest(await readFile(entry)) }
    }
    const coreRoot = resolve(dirname(require.resolve('@shiqianjiang/ceru-plugin-core/node')), '..')
    report.runtimeFiles = []
    for (const file of [
      'dist/node.js',
      'dist/node-worker.js',
      'dist/http-server.js',
      'dist/media-stream.js',
      'assets/node-globals.js',
      'assets/sandbox.js'
    ]) {
      const path = join(coreRoot, file)
      report.runtimeFiles.push({ path, sha256: digest(await readFile(path)) })
    }
    report.scriptSha256 = digest(await readFile(scriptPath))
    report.cli = { path: cliPath, sha256: digest(await readFile(cliPath)) }
    const mediaModule = join(outputRoot, 'desktop-media.mjs')
    await build({
      absWorkingDir: desktopRoot,
      entryPoints: ['src/main/services/plugin/media/mediaProtocol.ts'],
      outfile: mediaModule,
      bundle: true,
      platform: 'node',
      format: 'esm',
      plugins: [
        {
          name: 'actual-desktop-dependencies',
          setup(builder) {
            builder.onResolve({ filter: /^@shiqianjiang\// }, (args) => ({
              path: pathToFileURL(require.resolve(args.path)).href,
              external: true
            }))
          }
        }
      ]
    })
    const mediaSource = join(desktopRoot, 'src/main/services/plugin/media/mediaProtocol.ts')
    report.media = {
      source: mediaSource,
      sourceSha256: digest(await readFile(mediaSource)),
      sha256: digest(await readFile(mediaModule))
    }
    const configs = []
    for (const language of ['js', 'ts']) {
      console.log(`[${language}] CLI scaffold/build`)
      const project = await scaffoldProject(join(outputRoot, `encrypted-source-${language}`), {
        template: 'encrypted-source',
        language
      })
      // Assert that the CLI's shipped snapshot really contains the intended source.
      for (const file of [
        `src/index.${language}`,
        `src/demo.${language}`,
        `src/fixtures.${language}`,
        'resources/xor-byte.wasm'
      ]) {
        assert.deepEqual(
          await readFile(join(project, file)),
          await readFile(join(templates, 'templates/encrypted-source', language, file)),
          `Stale CLI snapshot: ${language}/${file}`
        )
      }
      // Do not expose tooling's potentially newer/stale SDK to the project.
      // An isolated dependency directory resolves the exact desktop installation
      // for authoring contracts as well as execution, without editing either tree.
      await mkdir(join(project, 'node_modules/@shiqianjiang'), { recursive: true })
      const dependencies = [
        ...Object.entries(report.versions).map(([name, value]) => [
          name,
          resolve(dirname(value.entry), '..')
        ]),
        ['@shiqianjiang/ceru-plugin-cli', join(tooling, 'packages/cli')],
        ['typescript', join(tooling, 'node_modules/typescript')]
      ]
      for (const [name, target] of dependencies) {
        const link = join(project, 'node_modules', name)
        await symlink(
          await realpath(target),
          link,
          process.platform === 'win32' ? 'junction' : 'dir'
        )
        links.push(link)
      }
      const projectRequire = createRequire(join(project, 'package.json'))
      assert.equal(
        await realpath(projectRequire.resolve('@shiqianjiang/ceru-plugin-sdk')),
        await realpath(report.versions['@shiqianjiang/ceru-plugin-sdk'].entry),
        'Scaffolded project must resolve the actual desktop SDK'
      )
      const built = await buildProject(project)
      report.builds.push({
        language,
        project,
        artifactPath: built.path,
        bytes: built.bytes,
        sdkEntry: projectRequire.resolve('@shiqianjiang/ceru-plugin-sdk'),
        sha256: digest(await readFile(built.path))
      })
      configs.push({
        language,
        artifactPath: built.path,
        mediaModule,
        outputRoot,
        logPath,
        mode: 'node'
      })
    }
    for (const config of configs) {
      console.log(`[${config.language}] real Node worker / HTTP / media`)
      report.results.push(await runWorkerSuite(config))
    }
    if (argv.includes('--electron')) {
      console.log('Running isolated npm Electron runtime, hidden and muted')
      const childReport = join(outputRoot, 'electron-report.json')
      const profile = join(outputRoot, 'electron-profile')
      const launcher = join(outputRoot, 'electron-launcher.cjs')
      // Set userData BEFORE app readiness. Invoke only node_modules/electron,
      // never a packaged Ceru executable with an ignored JavaScript argument.
      await writeFile(
        launcher,
        `const { app, protocol } = require('electron');
app.setPath('userData', ${JSON.stringify(profile)});
app.setPath('sessionData', ${JSON.stringify(join(profile, 'session'))});
app.disableHardwareAcceleration();
protocol.registerSchemesAsPrivileged([{scheme:'ceru-media',privileges:{standard:true,secure:true,stream:true,supportFetchAPI:true}}]);
const fs = require('node:fs');
const timeout = setTimeout(() => { console.error('Isolated Electron validation timed out'); app.exit(2); }, 120000);
app.whenReady().then(async () => {
  try {
    const { runElectronSuites } = await import(${JSON.stringify(import.meta.url)});
    const result = await runElectronSuites(${JSON.stringify(configs)});
    fs.writeFileSync(${JSON.stringify(childReport)}, JSON.stringify({success:true,...result}, null, 2));
    clearTimeout(timeout); app.exit(0);
  } catch (error) {
    fs.writeFileSync(${JSON.stringify(childReport)}, JSON.stringify({success:false,error:{message:error.message,stack:error.stack}}, null, 2));
    console.error(error); clearTimeout(timeout); app.exit(1);
  }
});
`
      )
      const env = { ...process.env }
      delete env.ELECTRON_RUN_AS_NODE
      const child = spawn(require('electron'), [launcher], {
        cwd: outputRoot,
        env,
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      })
      const outputChunks = []
      for (const stream of [child.stdout, child.stderr])
        stream.on('data', (chunk) => {
          outputChunks.push(chunk)
          process.stdout.write(chunk)
        })
      try {
        const code = await bounded(
          new Promise((resolve, reject) => {
            child.once('error', reject)
            child.once('exit', (code, signal) => resolve({ code, signal }))
          }),
          'Electron subprocess',
          130000
        )
        await writeFile(join(outputRoot, 'electron-output.log'), Buffer.concat(outputChunks))
        try {
          report.electron = JSON.parse(await readFile(childReport, 'utf8'))
        } catch {}
        assert.equal(
          code.code,
          0,
          `Electron failed: ${JSON.stringify(code)} ${JSON.stringify(report.electron?.error)}`
        )
        assert.equal(report.electron.success, true)
      } finally {
        if (child.exitCode === null) child.kill()
      }
    }
    // A concurrent package refresh must not produce a mixed-version PASS.
    for (const file of [
      ...report.runtimeFiles,
      ...Object.values(report.versions).map(({ entry, sha256 }) => ({ path: entry, sha256 }))
    ]) {
      assert.equal(
        digest(await readFile(file.path)),
        file.sha256,
        `Installed runtime changed during validation; rerun after package refresh: ${file.path}`
      )
    }
    report.success = true
  } catch (error) {
    report.error = errorRecord(error)
    log('failure', report.error)
    throw error
  } finally {
    // Only remove junctions created by this run; keep reviewable build/log artifacts.
    for (const link of links) if ((await lstat(link)).isSymbolicLink()) await unlink(link)
    report.finishedAt = new Date().toISOString()
    await writeFile(reportPath, JSON.stringify(report, null, 2) + '\n')
    console.log(`Report: ${reportPath}`)
  }
  console.log(
    `PASS: ${report.results.length} Node variants; ${report.electron?.results.length ?? 0} Electron variants`
  )
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
