/**
 * 构建 external-media-integration 原生模块。
 *
 * 把 napi-rs 产出的 .node 放到 `native/external-media-integration/` 根目录，
 * 便于主进程按固定相对路径加载，并让 electron-builder 能 asarUnpack 它。
 *
 * 用法：
 *   node scripts/build-native-emi.mjs            # release
 *   node scripts/build-native-emi.mjs --debug    # debug
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, copyFileSync, readdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')
const crateDir = resolve(root, 'native', 'external-media-integration')
const isDebug = process.argv.includes('--debug')
const profileDir = isDebug ? 'debug' : 'release'
const targetArg = process.argv.find((arg) => arg.startsWith('--target='))?.slice('--target='.length)
const target = process.env.NATIVE_TARGET || targetArg || null
const universal = process.argv.includes('--universal')
const targets = universal ? ['aarch64-apple-darwin', 'x86_64-apple-darwin'] : [target]

console.log(`[emi] 构建 external-media-integration (${profileDir}) ...`)

// 检查工具链
const cargoCheck = spawnSync('cargo', ['--version'], { shell: true, encoding: 'utf8' })
if (cargoCheck.status !== 0) {
  console.error(
    '[emi] 未找到 cargo。请先安装 Rust：https://rustup.rs\n' +
      '       Windows 还需要 MSVC C++ 生成工具 + Windows SDK（VS Build Tools）。'
  )
  process.exit(1)
}

const builtLibraries = []
for (const buildTarget of targets) {
  if (buildTarget) {
    const installedTargets = spawnSync('rustup', ['target', 'list', '--installed'], {
      encoding: 'utf8',
      shell: true
    })
    if (installedTargets.status === 0 && !installedTargets.stdout.split(/\r?\n/).includes(buildTarget)) {
      const addTarget = spawnSync('rustup', ['target', 'add', buildTarget], {
        stdio: 'inherit',
        shell: true
      })
      if (addTarget.status !== 0) {
        console.error(`[emi] 无法安装 Rust 目标 ${buildTarget}`)
        process.exit(addTarget.status ?? 1)
      }
    }
  }

  const outDir = resolve(crateDir, 'target', ...(buildTarget ? [buildTarget] : []), profileDir)
  const args = ['build']
  if (!isDebug) args.push('--release')
  if (buildTarget) args.push('--target', buildTarget)

  const result = spawnSync('cargo', args, {
    cwd: crateDir,
    stdio: 'inherit',
    shell: true
  })
  if (result.status !== 0) {
    console.error(`[emi] cargo build 失败 (exit ${result.status ?? 'unknown'})`)
    process.exit(result.status ?? 1)
  }

  if (!existsSync(outDir)) {
    console.error(`[emi] 未找到构建输出目录: ${outDir}`)
    process.exit(1)
  }
  const candidates = readdirSync(outDir).filter((f) =>
    /external[_-]media[_-]integration\.(dll|so|dylib)$/i.test(f)
  )
  if (candidates.length === 0) {
    console.error(`[emi] 在 ${outDir} 未找到 external-media-integration 动态库`)
    process.exit(1)
  }
  builtLibraries.push(resolve(outDir, candidates[0]))
}

const destLib = resolve(crateDir, 'external-media-integration.node')
if (universal) {
  const result = spawnSync('lipo', ['-create', ...builtLibraries, '-output', destLib], {
    stdio: 'inherit',
    shell: true
  })
  if (result.status !== 0) {
    console.error('[emi] lipo 创建通用媒体模块失败')
    process.exit(result.status ?? 1)
  }
} else {
  copyFileSync(builtLibraries[0], destLib)
}
console.log(`[emi] 已生成 ${destLib}`)

// 顺带把生成的 .d.ts 也拷出来（napi 的 build 会输出到 crate 根目录）
mkdirSync(crateDir, { recursive: true })
console.log('[emi] 完成')
