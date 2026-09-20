import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
const artifact = process.argv[2]
if (!artifact) throw new Error('Usage: node scripts/build-plugin-host-smoke.mjs <plugin.js>')
await build({
  entryPoints: ['src/main/services/plugin/manager/PluginHost.ts'],
  outfile: '.plugin-host-smoke.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { '@common': './src/common' }
})
const child = spawn(require('electron'), ['scripts/plugin-host-smoke.cjs', artifact], {
  stdio: 'inherit',
  windowsHide: true
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
