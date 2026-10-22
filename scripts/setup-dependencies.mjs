import { spawnSync } from 'node:child_process'

const yarnCommand = process.platform === 'win32' ? 'yarn.cmd' : 'yarn'

function run(command, args, label, env = process.env) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env
  })

  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(`${label} failed with exit code ${result.status ?? 'unknown'}`)
  }
}

function installElectron() {
  const args = ['node_modules/electron/install.js']
  // This installer also runs directly via node, outside a Yarn/npm lifecycle.
  // Set the mirror explicitly instead of relying on .npmrc being exported.
  const mirror =
    process.env.npm_config_electron_mirror ||
    process.env.NPM_CONFIG_ELECTRON_MIRROR ||
    process.env.npm_package_config_electron_mirror ||
    process.env.ELECTRON_MIRROR

  if (mirror) {
    console.log(`Downloading Electron using configured mirror: ${mirror}`)
    run(process.execPath, args, 'Electron download')
    return
  }

  console.log('Downloading Electron using npmmirror...')
  try {
    run(process.execPath, args, 'Electron download', {
      ...process.env,
      ELECTRON_MIRROR: 'https://npmmirror.com/mirrors/electron/',
      // npmmirror uses /45.0.0/ while GitHub uses /v45.0.0/.
      ELECTRON_CUSTOM_DIR: process.env.ELECTRON_CUSTOM_DIR || '{{ version }}'
    })
  } catch (error) {
    console.warn(`${error.message}; retrying Electron download from GitHub...`)
    run(process.execPath, args, 'Electron download')
  }
}

// Yarn 1 auto-runs node-gyp for packages containing binding.gyp. Skip all
// dependency lifecycle scripts, then run only the native setup owned by Ceru.
run(yarnCommand, ['install', '--frozen-lockfile', '--ignore-scripts'], 'yarn install')
installElectron()
run(process.execPath, ['scripts/prepare-native-modules.mjs'], 'native module setup')

console.log('Dependencies and native modules are ready.')
