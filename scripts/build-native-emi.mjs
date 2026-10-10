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
const outDir = resolve(
  crateDir,
  process.env.NAPI_BUILD_TYPE === 'debug' ? 'target/debug' : 'target/release'
)

const isDebug = process.argv.includes('--debug')
const profileDir = isDebug ? 'debug' : 'release'

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

const args = ['build']
if (!isDebug) args.push('--release')

const result = spawnSync('cargo', args, {
  cwd: crateDir,
  stdio: 'inherit',
  shell: true
})

if (result.status !== 0) {
  console.error(`[emi] cargo build 失败 (exit ${result.status ?? 'unknown'})`)
  process.exit(result.status ?? 1)
}

// cargo 产出的 cdylib 名字带前缀/后缀，找出来复制成 .node
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

const srcLib = resolve(outDir, candidates[0])
const destLib = resolve(crateDir, 'external-media-integration.node')
copyFileSync(srcLib, destLib)
console.log(`[emi] 已生成 ${destLib}`)

// 顺带把生成的 .d.ts 也拷出来（napi 的 build 会输出到 crate 根目录）
mkdirSync(crateDir, { recursive: true })
console.log('[emi] 完成')
