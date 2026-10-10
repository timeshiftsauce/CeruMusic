/*
 * Windows AUMID（AppUserModelID）注册 —— 让 SMTC / Toast 显示「澜音」。
 *
 * 背景（实测结论，别再走弯路）：
 *   SMTC 媒体卡片上的应用名，**既不是** `app.setAppUserModelId()` 设的字符串，
 *   **也不是** 注册表 `AppUserModelId\<AUMID>\DisplayName`（写它有但不生效）。
 *   真实来源是 **Shell 的应用清单** —— 用 `Get-StartApps` 可以看到，
 *   只有**开始菜单里存在匹配 AUMID 的 .lnk 快捷方式**时，应用才会出现在
 *   清单里，SMTC 卡片才能解析出名字与图标。
 *
 *   证据：`LX Music → cn.toside.music.desktop`、`Apifox → cn.apifox.app`
 *   这些 AUMID 都在 `Get-StartApps` 里，且各自都有开始菜单快捷方式；
 *   而 CeruMusic 没有快捷方式 → 不在清单里 → 卡片不显示名字。
 *
 * 正式版由 NSIS 安装器创建「澜音.lnk」顺带解决；但：
 *   - 开发模式（`yarn dev`）跑的是 node_modules 里的 electron.exe，没有快捷方式
 *   - 便携版 / 绿色版不经过安装器
 * 所以这里在启动时主动补一个开始菜单快捷方式，dev 与打包版统一生效。
 *
 * 注意：失败时静默降级 —— 只影响卡片上的应用名，不影响播放与媒体键。
 */

import { app } from 'electron'
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/** 卡片/通知/开始菜单上显示的应用名。 */
const DISPLAY_NAME = '澜音'

/**
 * 确保开始菜单里存在指向本应用的快捷方式，并写 AUMID 的 DisplayName。
 *
 * @param aumid 要注册的 AppUserModelID（须与 `app.setAppUserModelId` 一致）
 */
export function registerWindowsAumid(aumid: string): void {
  if (process.platform !== 'win32') return

  writeDisplayName(aumid)
  ensureStartMenuShortcut()
}

/**
 * 写 `HKCU\Software\Classes\AppUserModelId\<AUMID>\DisplayName`。
 *
 * 单独写它不足以让卡片显示名字，但配合快捷方式能覆盖掉默认名
 * （否则可能显示 exe 的 FileDescription，dev 下就是 "Electron"）。
 */
function writeDisplayName(aumid: string): void {
  const key = `HKCU\\Software\\Classes\\AppUserModelId\\${aumid}`
  try {
    execFileSync(
      'reg.exe',
      ['add', key, '/v', 'DisplayName', '/t', 'REG_SZ', '/d', DISPLAY_NAME, '/f'],
      { stdio: 'ignore', windowsHide: true }
    )
    console.log(`[aumid] DisplayName = ${DISPLAY_NAME}`)
  } catch (e) {
    console.warn('[aumid] 写入 DisplayName 失败:', e)
  }
}

/**
 * 在开始菜单创建指向本应用的 .lnk。
 *
 * 用 PowerShell 的 `WScript.Shell` COM 创建，避免为一次性操作引入
 * 额外的快捷方式依赖库。
 *
 * dev 模式下 exe 是 `node_modules/electron/dist/electron.exe`，
 * 直接用 `process.execPath` 即可（打包后它就是 ceru-music.exe）。
 */
function ensureStartMenuShortcut(): void {
  const target = process.execPath
  if (!target || !fs.existsSync(target)) {
    console.warn('[aumid] 找不到可执行文件，跳过快捷方式:', target)
    return
  }

  const startMenu = path.join(
    app.getPath('appData'),
    'Microsoft',
    'Windows',
    'Start Menu',
    'Programs'
  )
  const linkPath = path.join(startMenu, `${DISPLAY_NAME}.lnk`)

  // 已存在就不再重建 —— 避免每次启动都触碰 Shell 索引。
  if (fs.existsSync(linkPath)) {
    console.log(`[aumid] 开始菜单快捷方式已存在: ${linkPath}`)
    return
  }

  // PowerShell 脚本：建 .lnk。Description 会被 Shell 当作应用名之一。
  const iconPath = `${target},0`
  const script = `
$ErrorActionPreference = 'Stop'
$shell = New-Object -ComObject WScript.Shell
$lnk = $shell.CreateShortcut(${psQuote(linkPath)})
$lnk.TargetPath = ${psQuote(target)}
$lnk.WorkingDirectory = ${psQuote(path.dirname(target))}
$lnk.IconLocation = ${psQuote(iconPath)}
$lnk.Description = ${psQuote(DISPLAY_NAME)}
$lnk.Save()
Write-Output 'shortcut-ok'
`.trim()

  try {
    const out = execFileSync(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      { encoding: 'utf8', windowsHide: true, timeout: 15000 }
    )
    console.log(`[aumid] 已创建开始菜单快捷方式: ${linkPath} (${out.trim()})`)
  } catch (e) {
    console.warn('[aumid] 创建开始菜单快捷方式失败（不影响播放）:', e)
  }
}

/** 转义成 PowerShell 单引号字符串字面量。 */
function psQuote(value: string): string {
  return `'${value.replace(/'/g, "''")}'`
}

