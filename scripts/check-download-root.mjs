import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { randomUUID } from 'node:crypto'
import { build } from 'esbuild'

// Run with: node scripts/check-download-root.mjs
const require = createRequire(import.meta.url)
const Module = require('node:module')
const scratch = await mkdtemp(path.join(tmpdir(), 'ceru-download-check-'))
const rootFile = path.join(path.parse(process.cwd()).root, `ceru-download-${randomUUID()}.bin`)
const payload = Buffer.from('CeruMusic download regression fixture')
const server = createServer((_req, res) => res.end(payload))
let manager

async function compile(entryPoints, plugins = []) {
  const result = await build({
    entryPoints,
    bundle: true,
    write: false,
    platform: 'node',
    format: 'cjs',
    packages: 'external',
    alias: { '@common': path.resolve('src/common') },
    plugins
  })
  return result.outputFiles[0].text
}

async function runWorker(code, url, filePath) {
  const worker = new Worker(
    `require = require('node:module').createRequire(${JSON.stringify(path.resolve('package.json'))});\n${code}`,
    { eval: true }
  )
  let timer
  try {
    return await new Promise((resolve, reject) => {
      timer = setTimeout(() => reject(new Error('Download worker timed out')), 10000)
      worker.on('error', reject)
      worker.on('exit', (code) => reject(new Error(`Worker exited unexpectedly: ${code}`)))
      worker.on('message', (message) => {
        if (message.type === 'completed') resolve(message.result)
        if (message.type === 'error') reject(new Error(message.error))
      })
      worker.postMessage({ url, filePath, songInfo: { source: 'update' } })
    })
  } finally {
    clearTimeout(timer)
    await worker.terminate()
  }
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

try {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const url = `http://127.0.0.1:${server.address().port}/fixture`
  const workerCode = await compile(['src/main/workers/downloadWorker.ts'])
  const source = path.join(scratch, 'source.bin')
  await writeFile(source, payload)

  // Exercise the real worker, HTTP streaming, file URLs and recursive directory creation.
  for (const [destination, downloadUrl] of [
    [rootFile, url],
    [path.join(scratch, 'nested', 'downloads', 'song.bin'), url]
  ]) {
    await runWorker(workerCode, downloadUrl, destination)
    assert.deepEqual(await readFile(destination), payload)
  }
  assert.equal((await runWorker(workerCode, url, rootFile)).message, '歌曲已存在')
  await rm(rootFile)
  await runWorker(workerCode, pathToFileURL(source).href, rootFile)
  assert.deepEqual(await readFile(rootFile), payload)
  await assert.rejects(
    runWorker(workerCode, url, path.join(source, 'not-a-directory', 'song.bin')),
    /ENOTDIR|EEXIST/
  )
  console.log(
    'PASS: real worker downloads to root and nested directories; file errors are preserved'
  )

  // Use deterministic worker events to cover events arriving after retry/pause/completion.
  const stubs = {
    electron: `export const app = { getPath: () => ${JSON.stringify(scratch)} }`,
    'electron-log': `export default {
      transports: { file: {} }, info() {}, warn() {}, error() {}
    }`,
    './ConfigManager': `export class ConfigManager {
      static getInstance() { return new ConfigManager() }
      get(key, fallback) { return fallback }
      set() {}
    }`,
    './networkProxy': 'export const getCurrentProxyRule = () => null',
    './plugin/playbackRequests': 'export const playbackRequestHeaders = () => ({})',
    './systemCaTrust': "export const TRUST_SYSTEM_CA_KEY = 'trustSystemCa'",
    worker_threads: `import { EventEmitter } from 'node:events'
      export class Worker extends EventEmitter {
        postMessage() {}
        terminate() {
          this.terminated = true
          queueMicrotask(() => this.emit('exit', 1))
          return Promise.resolve(1)
        }
      }`
  }
  await writeFile(path.join(scratch, 'downloads.json'), '[]')
  const managerCode = await compile(
    ['src/main/services/DownloadManager.ts'],
    [
      {
        name: 'download-test-runtime',
        setup(builder) {
          builder.onResolve({ filter: /.*/ }, (args) => {
            if (Object.hasOwn(stubs, args.path)) return { path: args.path, namespace: 'test-stub' }
          })
          builder.onLoad({ filter: /.*/, namespace: 'test-stub' }, (args) => ({
            contents: stubs[args.path],
            loader: 'js'
          }))
        }
      }
    ]
  )
  const mod = new Module(path.resolve('scripts/.download-check.cjs'))
  mod.filename = path.resolve('scripts/.download-check.cjs')
  mod.paths = Module._nodeModulePaths(path.resolve('scripts'))
  mod._compile(managerCode, mod.filename)
  manager = mod.exports.downloadManager
  await manager.loadTasks()

  const task = manager.addTask({}, url, path.join(scratch, 'retry.bin'), {})
  const old = manager.activeDownloads.get(task.id)
  assert.ok(old instanceof EventEmitter)
  old.emit('message', { type: 'error', error: 'EPERM: fixture write denied' })
  const replacement = manager.activeDownloads.get(task.id)
  await flush()
  old.emit('message', { type: 'progress', progress: 99 })
  old.emit('message', { type: 'completed' })
  old.emit('error', new Error('stale error'))
  old.emit('exit', 1)
  assert.equal(task.retries, 1)
  assert.equal(task.progress, 0)
  assert.equal(manager.activeDownloads.get(task.id), replacement)
  assert.ok(!replacement.terminated)

  // An unexpected exit must not terminate the retry created by error handling.
  replacement.emit('exit', 1)
  const next = manager.activeDownloads.get(task.id)
  await flush()
  assert.equal(task.retries, 2)
  assert.ok(next && !next.terminated)
  next.emit('message', { type: 'error', error: 'EPERM: fixture write denied' })
  manager.activeDownloads.get(task.id).emit('message', {
    type: 'error',
    error: 'EPERM: fixture write denied'
  })
  await flush()
  assert.equal(task.retries, 3)
  assert.equal(task.error, 'EPERM: fixture write denied')
  assert.ok(!manager.activeDownloads.has(task.id))

  const paused = manager.addTask({}, url, path.join(scratch, 'pause.bin'), {})
  manager.pauseTask(paused.id)
  manager.resumeTask(paused.id)
  await flush()
  assert.equal(paused.retries, 0)
  const resumed = manager.activeDownloads.get(paused.id)
  assert.ok(resumed && !resumed.terminated)
  resumed.emit('message', { type: 'completed' })
  await flush()
  assert.equal(paused.progress, 100)
  assert.equal(paused.retries, 0)
  console.log('PASS: stale worker events, exit retries, error reporting and pause/resume')
} finally {
  manager?.shutdown()
  if (manager) await manager.saveQueue
  server.closeAllConnections()
  await new Promise((resolve) => server.close(resolve))
  await rm(rootFile, { force: true })
  await rm(rootFile + '.temp', { force: true })
  await rm(scratch, { recursive: true, force: true })
}
