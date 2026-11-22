import { build } from 'esbuild'

const bundled = await build({ entryPoints: ['src/main/services/plugin/v2/manifest.ts'], bundle: true, write: false, platform: 'node', format: 'esm' })
export const { readV2Descriptor } = await import('data:text/javascript;base64,' + Buffer.from(bundled.outputFiles[0].text).toString('base64'))
