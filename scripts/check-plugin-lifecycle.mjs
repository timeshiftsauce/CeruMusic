import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
await build({ stdin: { contents: "export {default} from './src/main/services/plugin/index.ts'; export {bindPluginUIWindow} from './src/main/services/plugin/uiBridge.ts'; export * from './src/main/services/plugin/externalInstall.ts'; export * from './src/main/router/pendingLinks.ts';", resolveDir: process.cwd(), loader: 'ts' }, outfile: '.plugin-lifecycle-smoke.mjs', bundle: true, platform: 'node', format: 'esm', packages: 'external', alias: { '@common': './src/common' } })
const child = spawn(require('electron'), [process.argv[2] || 'scripts/plugin-lifecycle-smoke.cjs'], { stdio: 'inherit', windowsHide: true })
child.on('exit', code => { process.exitCode = code ?? 1 })
