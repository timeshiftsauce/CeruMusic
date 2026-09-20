import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

// Real Electron IPC + real sandbox Worker, isolated user data and a fake remote endpoint.
const require = createRequire(import.meta.url)
const root = fileURLToPath(new URL('../', import.meta.url))
const directory = await mkdtemp(join(root, '.permission-smoke-'))
try {
  const entry = join(directory, 'test.mjs')
  await build({
    entryPoints: [join(root, 'scripts/plugin-permissions-smoke.ts')],
    outfile: entry,
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    alias: { '@common': join(root, 'src/common') },
    plugins: [
      {
        name: 'test-network',
        setup(builder) {
          builder.onResolve({ filter: /^@shiqianjiang\/ceru-plugin-core\/network$/ }, () => ({
            path: 'network',
            namespace: 'test'
          }))
          builder.onLoad({ filter: /.*/, namespace: 'test' }, () => ({
            contents: `
        export async function requestNetwork() {
          globalThis.__permissionNetworkCalls = (globalThis.__permissionNetworkCalls || 0) + 1;
          return { status: 200, headers: {}, body: { ok: true } };
        }
      `
          }))
        }
      }
    ]
  })
  const launcher = join(directory, 'launch.cjs')
  await writeFile(
    launcher,
    "import('./test.mjs').catch(e => { console.error(e); require('electron').app.exit(1) })"
  )
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [launcher], {
    cwd: root,
    env,
    stdio: 'inherit',
    windowsHide: true
  })
  process.exitCode = await new Promise((resolve, reject) => {
    child.on('error', reject)
    child.on('exit', (code) => resolve(code ?? 1))
  })
} finally {
  await rm(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 })
}
