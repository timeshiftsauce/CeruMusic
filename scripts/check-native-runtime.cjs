const assert = require('node:assert/strict')
const { spawnSync } = require('node:child_process')
const { existsSync, readdirSync } = require('node:fs')
const { join, resolve } = require('node:path')

// Check the shipped binaries with Electron's Node runtime, not the build host's ABI.
const root = resolve(__dirname, '..')
let executable
let appRoot = root
if (process.argv.includes('--packaged')) {
  const dist = resolve(process.env.CERU_DIST_DIR || join(root, 'dist'))
  if (process.platform === 'win32') {
    executable = join(dist, 'win-unpacked', 'ceru-music.exe')
    appRoot = join(dist, 'win-unpacked', 'resources', 'app.asar')
  } else if (process.platform === 'darwin') {
    const macDir = join(dist, process.arch === 'arm64' ? 'mac-arm64' : 'mac')
    const bundle = readdirSync(macDir).find((name) => name.endsWith('.app'))
    assert.ok(bundle, 'Packaged macOS app is missing')
    const contents = join(macDir, bundle, 'Contents')
    executable = join(contents, 'MacOS', readdirSync(join(contents, 'MacOS'))[0])
    appRoot = join(contents, 'Resources', 'app.asar')
  } else {
    const linuxDir = join(dist, 'linux-unpacked')
    executable = ['ceru-music', '澜音'].map((name) => join(linuxDir, name)).find(existsSync)
    appRoot = join(linuxDir, 'resources', 'app.asar')
  }
  assert.ok(executable && existsSync(executable), 'Packaged executable is missing')
  assert.ok(existsSync(appRoot), 'Packaged app.asar is missing')
} else {
  executable = require('electron')
}

const check = `
  const assert = require('node:assert/strict')
  const requireApp = require('node:module').createRequire(require('node:path').join(process.argv[1], 'package.json'))
  const Database = requireApp('better-sqlite3')
  const db = new Database(':memory:')
  db.exec('CREATE TABLE smoke (id INTEGER PRIMARY KEY, name TEXT)')
  db.transaction(() => db.prepare('INSERT INTO smoke VALUES (?, ?)').run(1, '澜音'))()
  assert.equal(db.prepare('SELECT name FROM smoke WHERE id = ?').get(1).name, '澜音')
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok')
  db.close()
  if (process.platform === 'win32') {
    const registry = requireApp('registry-js')
    assert.ok(Array.isArray(registry.enumerateKeys('HKEY_CURRENT_USER', 'Software')))
  }
  async function checkOnnx() {
    const ort = requireApp('onnxruntime-node')
    // ONNX opset 13 Identity graph with a single float32 input and output.
    const model = Buffer.from('CAg6QgoQCgF4EgF5IghJZGVudGl0eRIMbmF0aXZlX3Ntb2tlWg8KAXgSCgoICAESBAoCCAFiDwoBeRIKCggIARIECgIIAUICEA0=', 'base64')
    const session = await ort.InferenceSession.create(model, { executionProviders: ['cpu'] })
    try {
      const result = await session.run({ x: new ort.Tensor('float32', Float32Array.of(42), [1]) })
      assert.deepEqual(Array.from(result.y.data), [42])
    } finally {
      await session.release()
    }
  }
  checkOnnx().then(() => {
    console.log(JSON.stringify({ electron: process.versions.electron, arch: process.arch, sqlite: 'ok', registry: process.platform === 'win32' ? 'ok' : 'unused', onnx: 'ok' }))
  }).catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
`
const result = spawnSync(executable, ['-e', check, appRoot], {
  env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
  stdio: 'inherit',
  windowsHide: true,
  timeout: 30000
})
if (result.error) throw result.error
assert.equal(result.status, 0, 'Electron native module verification failed')
