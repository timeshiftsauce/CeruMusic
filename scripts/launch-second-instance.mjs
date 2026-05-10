/**
 * 启动第二个 Electron 实例 —— 用于一起听等多人功能的本地调试
 *
 * 使用前提：
 *   1. 已经在另一个终端跑着 `yarn dev`（即 vite dev server + 第一个 electron）
 *   2. 当前 vite dev server 监听在 http://localhost:5173（默认）
 *
 * 跑法（在仓库根目录）：
 *   node scripts/launch-second-instance.mjs
 *
 * 工作原理：
 *   - 直接用 node_modules 里的 electron 二进制启动主进程
 *   - 通过 ELECTRON_RENDERER_URL 让它连同一个 vite dev server
 *   - 通过 ALLOW_MULTI_INSTANCE=1 跳过单实例锁
 *   - 用独立的 --user-data-dir 避免 cookie / 登录态串台
 *
 * 退出：
 *   关闭第二个 Electron 窗口即可，或在此终端 Ctrl+C
 */

import { spawn } from 'child_process'
import { fileURLToPath } from 'url'
import { dirname, join, resolve } from 'path'
import { mkdirSync } from 'fs'
import { tmpdir } from 'os'

const __dirname = dirname(fileURLToPath(import.meta.url))
const projectRoot = resolve(__dirname, '..')

/* ---------------- 配置项 ---------------- */

/** 主进程编译产物 —— electron-vite dev 默认输出到 out/main */
const MAIN_ENTRY = join(projectRoot, 'out', 'main', 'index.js')

/** 渲染器 dev server URL —— electron-vite 默认 5173 */
const RENDERER_URL = process.env.ELECTRON_RENDERER_URL || 'http://localhost:5173'

/**
 * 第二实例独立的 user-data 目录
 *
 * 必须独立 —— Electron 单实例锁本质是基于 userData 的文件锁，
 * 同时也避免登录态、本地数据库与第一个实例冲突。
 *
 * 用 tmpdir 而不是项目内目录，避免被 vite 监视触发重载。
 */
const userDataDir = join(tmpdir(), 'cerumusic-second-instance')
mkdirSync(userDataDir, { recursive: true })

/* ---------------- 启动 ---------------- */

const electronBin =
  process.platform === 'win32'
    ? join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe')
    : join(projectRoot, 'node_modules', 'electron', 'dist', 'electron')

console.log(`[launch] electron = ${electronBin}`)
console.log(`[launch] main entry = ${MAIN_ENTRY}`)
console.log(`[launch] renderer = ${RENDERER_URL}`)
console.log(`[launch] user-data-dir = ${userDataDir}`)
console.log('---')

const child = spawn(
  electronBin,
  [
    MAIN_ENTRY,
    `--user-data-dir=${userDataDir}`,
    // 避免与第一个实例的 GPU 缓存争用（不同 user-data 已经隔离，但加这个保险）
    '--disable-gpu-shader-disk-cache'
  ],
  {
    env: {
      ...process.env,
      // 关键 1：让主进程跳过单实例锁（与 src/main/index.ts 的检查对齐）
      ALLOW_MULTI_INSTANCE: '1',
      // 关键 2：让渲染器连同一个 vite dev server
      ELECTRON_RENDERER_URL: RENDERER_URL,
      // 关键 3：electron-vite 的 dev 模式标记（避免主进程走 production 分支加载本地文件）
      NODE_ENV: 'development'
    },
    stdio: 'inherit'
  }
)

child.on('exit', (code) => {
  console.log(`\n[launch] 第二实例已退出 (code=${code})`)
  process.exit(code ?? 0)
})

/* Ctrl+C 时把信号转发给子进程 */
process.on('SIGINT', () => child.kill('SIGINT'))
process.on('SIGTERM', () => child.kill('SIGTERM'))
