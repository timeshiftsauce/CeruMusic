import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)

// better-sqlite3 13 ships Node-API prebuilds; rebuilding it for each Electron
// ABI unnecessarily requires a local C++ toolchain and discards that benefit.
const Database = require('better-sqlite3')
const database = new Database(':memory:')
database.prepare('SELECT 1').get()
database.close()

if (process.platform === 'win32') {
  const { rebuild } = await import('@electron/rebuild')
  await rebuild({
    buildPath: fileURLToPath(new URL('../', import.meta.url)),
    electronVersion: require('electron/package.json').version,
    onlyModules: ['registry-js']
  })
  require('registry-js')
}

console.log('Native modules ready: better-sqlite3 (Node-API), registry-js (Windows only)')
