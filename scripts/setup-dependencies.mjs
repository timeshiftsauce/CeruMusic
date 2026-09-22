import { spawnSync } from 'node:child_process'

const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

function run(command, args, label) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32'
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
  }
}

// Yarn 1 auto-runs node-gyp for packages containing binding.gyp. Skip all
// dependency lifecycle scripts, then run only the native setup owned by Ceru.
run(yarnCommand, ['install', '--frozen-lockfile', '--ignore-scripts'], 'yarn install')
run(process.execPath, ['node_modules/electron/install.js'], 'Electron download')
run(process.execPath, ['scripts/prepare-native-modules.mjs'], 'native module setup')

console.log('Dependencies and native modules are ready.')
