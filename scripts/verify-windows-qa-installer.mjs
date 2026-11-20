import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const [installerPath, asarPath] = process.argv.slice(2)
if (!installerPath || !asarPath)
  throw Error(
    'Usage: node scripts/verify-windows-qa-installer.mjs <installer.exe> <tested app.asar>'
  )
const installer = resolve(installerPath),
  asar = resolve(asarPath)
const archive = spawn(
  createRequire(import.meta.url)('7zip-bin').path7za,
  ['x', '-so', installer, 'resources/app.asar'],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] }
)
let diagnostics = ''
archive.stderr.on('data', (chunk) => {
  diagnostics = (diagnostics + chunk).slice(-2000)
})
const finished = new Promise((done, reject) => {
  archive.once('error', reject)
  archive.once('close', (code) =>
    code === 0 ? done() : reject(Error('Cannot inspect installer: ' + code + ' ' + diagnostics))
  )
})
async function digest(stream) {
  const hash = createHash('sha256')
  let bytes = 0
  for await (const chunk of stream) {
    hash.update(chunk)
    bytes += chunk.length
  }
  return { bytes, sha256: hash.digest('hex').toUpperCase() }
}
const [embedded, tested, setup] = await Promise.all([
  digest(archive.stdout),
  digest(createReadStream(asar)),
  digest(createReadStream(installer)),
  finished
])
assert.ok(embedded.bytes > 0, 'No resources/app.asar in installer')
assert.deepEqual(embedded, tested, 'The installer does not contain the tested ASAR')
console.log(
  JSON.stringify({ installer: setup, testedAsar: tested, embeddedAsar: embedded }, null, 2)
)
