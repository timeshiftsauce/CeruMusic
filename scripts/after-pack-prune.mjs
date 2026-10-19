import { readdir, rm } from 'node:fs/promises'
import path from 'node:path'

/**
 * electron-builder copies every better-sqlite3 prebuild into each platform package.
 * Keep only binaries that can load in the artifact being produced.
 */
export default async function afterPack(context) {
  const appResourcesDir =
    context.electronPlatformName === 'darwin'
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          'Contents',
          'Resources'
        )
      : path.join(context.appOutDir, 'resources')
  const resourcesDir = path.join(
    appResourcesDir,
    'app.asar.unpacked',
    'node_modules',
    'better-sqlite3',
    'prebuilds'
  )

  let entries
  try {
    entries = await readdir(resourcesDir)
  } catch {
    return
  }

  const platform = context.electronPlatformName
  const arch = context.arch
  const keep = new Set()

  if (platform === 'darwin') {
    if (arch === 4) {
      keep.add('darwin-arm64.node')
      keep.add('darwin-x64.node')
    } else {
      keep.add(`darwin-${arch === 3 ? 'arm64' : 'x64'}.node`)
    }
  } else if (platform === 'win32') {
    keep.add(`win32-${arch === 3 ? 'arm64' : 'x64'}.node`)
  } else if (platform === 'linux') {
    const suffix = arch === 3 ? 'arm64' : 'x64'
    keep.add(`linux-${suffix}.node`)
    keep.add(`linuxmusl-${suffix}.node`)
  } else {
    return
  }

  await Promise.all(
    entries
      .filter((entry) => !keep.has(entry))
      .map((entry) => rm(path.join(resourcesDir, entry), { recursive: true, force: true }))
  )
}
