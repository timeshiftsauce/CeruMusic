import { createRequire } from 'node:module'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const require = createRequire(import.meta.url)

// better-sqlite3 13 ships Node-API prebuilds; rebuilding it for each Electron
// ABI unnecessarily requires a local C++ toolchain and discards that benefit.
const Database = require('better-sqlite3')
const database = new Database(':memory:')
database.prepare('SELECT 1').get()
database.close()

if (process.platform === 'win32') {
  // registry-js ships a N-API binary, so it is compatible with Electron
  // without an Electron-ABI rebuild. Download it explicitly when install
  // scripts were skipped in CI; falling back to node-gyp would require VS.
  const registryPackage = require.resolve('registry-js/package.json')
  const registryRoot = dirname(registryPackage)
  const registryBinary = resolve(registryRoot, 'build', 'Release', 'registry.node')
  if (!existsSync(registryBinary)) {
    const prebuildInstall = require.resolve('prebuild-install/bin.js', {
      paths: [registryRoot]
    })
    const result = spawnSync(
      process.execPath,
      [prebuildInstall, '--runtime', 'napi', '--target', '3', '--force'],
      { cwd: registryRoot, stdio: 'inherit' }
    )
    if (result.status !== 0) {
      throw new Error(`Failed to download registry-js prebuild (exit ${result.status ?? 'unknown'})`)
    }
  }
  require('registry-js')
}

console.log('Native modules ready: better-sqlite3 (Node-API), registry-js (Windows only)')
