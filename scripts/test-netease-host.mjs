import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtemp, rm } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

const artifact = process.argv[2]
if (!artifact) throw new Error('Usage: node scripts/test-netease-host.mjs <网易云 dist/plugin.js>')
const require = createRequire(import.meta.url)
const root = resolve('.')
const temporary = await mkdtemp(join(root, '.netease-host-'))
try {
  const bundle = join(temporary, 'host.mjs')
  await build({
    entryPoints: ['src/main/services/plugin/manager/PluginHost.ts'],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    alias: { '@common': './src/common' }
  })
  const child = spawn(
    require('electron'),
    ['scripts/netease-host-smoke.cjs', resolve(artifact), bundle, temporary],
    { stdio: 'inherit', windowsHide: true }
  )
  const code = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', resolve)
  })
  assert.equal(code, 0, 'Electron NetEase Host smoke failed')
} finally {
  assert.ok(resolve(temporary).startsWith(root + sep))
  await rm(temporary, { recursive: true, force: true })
}
