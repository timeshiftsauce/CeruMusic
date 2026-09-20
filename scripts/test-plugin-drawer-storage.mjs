import { build } from 'esbuild'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
await build({
  stdin: {
    contents: `
    export { default as PluginHost } from './src/main/services/plugin/manager/PluginHost.ts';
    export { PluginStorage, deletePluginStorage } from './src/main/services/plugin/storage.ts';
    export { bindPluginUIWindow } from './src/main/services/plugin/uiBridge.ts';
    export { savePluginConfig } from './src/main/services/plugin/pluginConfig.ts';
    export { readDrawerSchema, drawerAction } from './src/common/pluginDrawer.ts';
  `,
    resolveDir: process.cwd()
  },
  outfile: '.plugin-drawer-smoke.mjs',
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  alias: { '@common': './src/common' }
})
const childEnv = { ...process.env }
delete childEnv.ELECTRON_RUN_AS_NODE
const child = spawn(require('electron'), ['scripts/plugin-drawer-storage-smoke.cjs'], {
  stdio: 'inherit',
  windowsHide: true,
  env: childEnv
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
