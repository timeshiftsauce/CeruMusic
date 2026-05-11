import { BrowserWindow, app, shell } from 'electron'
import fs from 'fs'
import path from 'node:path'
import { autoUpdater as electronAutoUpdater } from 'electron-updater'
import { updateLog } from './logger'
import { downloadManager } from './services/DownloadManager'
import { DownloadStatus } from './types/download'

interface UpdateInfo {
  url: string
  name: string
  notes: string
  pub_date: string
  supportsDifferential?: boolean
  mode?: UpdateMode
}

type UpdateMode = 'differential' | 'full'

let mainWindow: BrowserWindow | null = null
let currentMode: UpdateMode | null = null
let currentUpdateInfo: UpdateInfo | null = null
let supportsDifferential = false

// 全量路径状态
let downloadProgress = { percent: 0, transferred: 0, total: 0 }
let currentDownloadTaskId: string | null = null
let unsubscribeDownloadEvents: (() => void) | null = null
let lastDownloadedFilePath: string | null = null

// 差分路径状态
let differentialReady = false
let isDifferentialDownloading = false
let electronUpdaterInitialized = false

const UPDATE_SERVER = 'https://update.cerumusic.top'

// 把 Node 的 process.arch 收敛到服务器认识的三种取值:
//   arm64 = Apple Silicon Mac (M1/M2/...) / Windows ARM
//   x64   = Intel Mac / Windows 64 位 (Node 里 x64 就是 x86_64,Intel Mac 走这里)
//   ia32  = Windows 32 位
// 其它(mips/ppc 等我们不发包的架构)兜底当 x64。
function normalizeArchForServer(a: string): 'x64' | 'ia32' | 'arm64' {
  if (a === 'arm64') return 'arm64'
  if (a === 'ia32' || a === 'x32') return 'ia32'
  return 'x64'
}
const CLIENT_ARCH = normalizeArchForServer(process.arch)

console.log(`AutoUpdater initialized with arch=${process.arch}, normalizedArch=${CLIENT_ARCH}`)

const UPDATE_API_URL = `${UPDATE_SERVER}/update/${process.platform}/${CLIENT_ARCH}/${app.getVersion()}`

function ymlNameForPlatform(): string {
  if (process.platform === 'darwin') return 'latest-mac.yml'
  if (process.platform === 'linux') return 'latest-linux.yml'
  return 'latest.yml'
}

// ============================================================
// DNS 兜底: 系统 DNS 解析失败时,通过 Cloudflare DoH (1.1.1.1) 拿 IP,
// 然后改写 URL 直连 IP. DoH 端点用 IP 访问,不依赖系统 DNS.
// ============================================================

interface DohCacheEntry {
  ip: string
  expiresAt: number
}
const dohCache = new Map<string, DohCacheEntry>()

async function dohResolve(hostname: string): Promise<string> {
  const cached = dohCache.get(hostname)
  if (cached && cached.expiresAt > Date.now()) return cached.ip

  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), 5000)
  try {
    const res = await fetch(
      `https://1.1.1.1/dns-query?name=${encodeURIComponent(hostname)}&type=A`,
      { headers: { Accept: 'application/dns-json' }, signal: ctrl.signal }
    )
    if (!res.ok) throw new Error(`DoH HTTP ${res.status}`)
    const data = (await res.json()) as { Answer?: { data: string }[] }
    const ips = (data.Answer || [])
      .map((a) => a.data)
      .filter((ip) => /^\d+\.\d+\.\d+\.\d+$/.test(ip))
    if (!ips.length) throw new Error('no A record')
    const ip = ips[0]
    dohCache.set(hostname, { ip, expiresAt: Date.now() + 5 * 60_000 })
    updateLog.log(`DoH resolved ${hostname} → ${ip}`)
    return ip
  } finally {
    clearTimeout(t)
  }
}

// 把 https://hostname/path 改成 https://<ip>/path,同时设置 Host header 让 SNI/HTTP 路由正确.
async function fetchWithDohFallback(
  url: string,
  init: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = 10000, ...rest } = init
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  // 先按原 URL 跑
  try {
    const res = await fetch(url, { ...rest, signal: ctrl.signal })
    return res
  } catch (err: any) {
    const code = err?.code || err?.cause?.code || ''
    // 只在 DNS 解析失败时回退,其它错误 (超时/连接拒绝等) 直接抛出
    if (code !== 'ENOTFOUND' && code !== 'EAI_AGAIN') throw err

    const u = new URL(url)
    let ip: string
    try {
      ip = await dohResolve(u.hostname)
    } catch (dohErr) {
      updateLog.log('DoH fallback failed:', (dohErr as Error).message)
      throw err
    }

    const ipUrl = `${u.protocol}//${ip}${u.pathname}${u.search}`
    const headers = new Headers(rest.headers)
    headers.set('Host', u.hostname)
    return fetch(ipUrl, { ...rest, headers, signal: ctrl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// ============================================================
// 安装包清理 (legacy 路径专用,electron-updater 自管缓存)
// ============================================================
const CLEANUP_RECORD_FILE = path.join(app.getPath('userData'), 'update_cleanup.json')

function loadCleanupList(): string[] {
  try {
    const raw = fs.readFileSync(CLEANUP_RECORD_FILE, 'utf-8')
    const list = JSON.parse(raw)
    return Array.isArray(list) ? list : []
  } catch {
    return []
  }
}

function saveCleanupList(list: string[]) {
  try {
    fs.writeFileSync(CLEANUP_RECORD_FILE, JSON.stringify(list, null, 2))
  } catch {}
}

function addInstallerForCleanup(filePath: string) {
  try {
    const tempDir = app.getPath('temp')
    if (!filePath || !path.resolve(filePath).startsWith(path.resolve(tempDir))) return
    const list = loadCleanupList()
    if (!list.includes(filePath)) {
      list.push(filePath)
      saveCleanupList(list)
    }
  } catch {}
}

export async function cleanupDownloadedInstallers() {
  try {
    const tempDir = path.resolve(app.getPath('temp'))
    const list = loadCleanupList()
    if (list.length === 0) return
    const remain: string[] = []
    for (const p of list) {
      try {
        if (!p) continue
        const abs = path.resolve(p)
        if (!abs.startsWith(tempDir)) {
          remain.push(p)
          continue
        }
        if (fs.existsSync(abs)) {
          try {
            await fs.promises.unlink(abs)
            updateLog.log('Removed leftover installer:', abs)
          } catch {
            remain.push(p)
          }
        }
      } catch {
        remain.push(p)
      }
    }
    if (remain.length > 0) saveCleanupList(remain)
    else {
      try {
        fs.unlinkSync(CLEANUP_RECORD_FILE)
      } catch {}
    }
  } catch {}
}

interface UpdateError {
  code?: string
  message: string
  raw?: string
}

const ERROR_CODE_MAP: Record<string, string> = {
  ENOTFOUND: '无法解析更新服务器域名,请检查 DNS 设置或网络连接',
  EAI_AGAIN: 'DNS 暂时无法解析,请稍后重试',
  ETIMEDOUT: '连接更新服务器超时,请检查网络',
  UND_ERR_CONNECT_TIMEOUT: '连接更新服务器超时,请检查网络',
  ECONNRESET: '与更新服务器的连接被重置,请重试',
  ECONNREFUSED: '更新服务器拒绝连接,可能在维护中',
  ECONNABORTED: '请求被中止,请重试',
  CERT_HAS_EXPIRED: '更新服务器证书已过期,请检查系统时间',
  UNABLE_TO_VERIFY_LEAF_SIGNATURE: '无法验证服务器证书,请检查系统时间或代理设置',
  ENETUNREACH: '网络不可达,请检查网络连接',
  EHOSTUNREACH: '无法访问更新服务器,请检查网络',
  AbortError: '请求超时',
  TimeoutError: '请求超时'
}

function translateError(err: unknown): UpdateError {
  if (!err) return { message: '未知错误' }
  if (typeof err === 'string') return { message: err, raw: err }
  const e = err as {
    code?: string
    cause?: { code?: string; message?: string }
    name?: string
    message?: string
  }
  const code =
    e.code ||
    e.cause?.code ||
    (e.name && e.name !== 'Error' && e.name !== 'TypeError' ? e.name : undefined)
  const raw = e.message || e.cause?.message || String(err)
  const friendly = code ? ERROR_CODE_MAP[code] : undefined
  return {
    code,
    message: friendly || raw || '更新失败',
    raw
  }
}

function sendError(err: unknown) {
  const payload = translateError(err)
  updateLog.log('Update error:', payload)
  mainWindow?.webContents.send('auto-updater:error', payload)
}

export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window
  updateLog.log('Auto updater initialized')
}

export async function checkForUpdates(window?: BrowserWindow) {
  if (window) mainWindow = window
  mainWindow?.webContents.send('auto-updater:checking-for-update')
  updateLog.log('Checking for updates...')

  try {
    // 总走 Hazel 拿基础信息(version + notes + url),全量路径直接复用
    const hazelInfo = await fetchHazelUpdateInfo()
    if (!hazelInfo || !isNewerVersion(hazelInfo.name, app.getVersion())) {
      mainWindow?.webContents.send('auto-updater:update-not-available')
      return
    }

    // 差分支持判定: 必须打包态 + yml 中存在 blockMapSize
    supportsDifferential = await detectBlockmapPresence()
    console.log('supportsDifferential:', supportsDifferential)
    currentUpdateInfo = { ...hazelInfo, supportsDifferential }
    currentMode = null
    differentialReady = false
    isDifferentialDownloading = false

    updateLog.log(
      `Update available: ${hazelInfo.name}, supportsDifferential=${supportsDifferential}`
    )
    mainWindow?.webContents.send('auto-updater:update-available', currentUpdateInfo)
  } catch (err) {
    sendError(err)
  }
}

async function fetchHazelUpdateInfo(): Promise<UpdateInfo | null> {
  updateLog.log('Fetching update info from ' + UPDATE_API_URL)
  try {
    const res = await fetchWithDohFallback(UPDATE_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CeruMusic-AutoUpdater',
        'X-Arch': CLIENT_ARCH
      },
      timeoutMs: 10000
    })
    if (res.status === 204) return null
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    const data = (await res.json()) as UpdateInfo
    if (data && data.url) {
      data.url = resolveDownloadUrlForCurrentArch(data.url)
    }
    return data
  } catch (error: any) {
    const realCode = error?.code || error?.cause?.code || error?.name
    const realMessage = error?.cause?.message || error?.message || String(error)
    updateLog.log('Hazel fetch raw error:', {
      name: error?.name,
      code: realCode,
      message: realMessage
    })
    const wrapped = new Error(realMessage) as Error & { code?: string }
    if (realCode) wrapped.code = realCode
    throw wrapped
  }
}

async function detectBlockmapPresence(): Promise<boolean> {
  const ymlName = ymlNameForPlatform()
  try {
    const res = await fetchWithDohFallback(`${UPDATE_SERVER}/${ymlName}`, {
      headers: { 'User-Agent': 'CeruMusic-AutoUpdater' },
      timeoutMs: 5000
    })
    if (!res.ok) return false
    const text = await res.text()
    return /blockMapSize\s*:/.test(text)
  } catch (err) {
    updateLog.log('blockmap detect failed:', (err as Error).message)
    return false
  }
}

function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  const parse = (v: string) =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => parseInt(n, 10) || 0)
  const r = parse(remoteVersion)
  const c = parse(currentVersion)
  for (let i = 0; i < Math.max(r.length, c.length); i++) {
    const rv = r[i] || 0
    const cv = c[i] || 0
    if (rv > cv) return true
    if (rv < cv) return false
  }
  return false
}

function resolveDownloadUrlForCurrentArch(url: string): string {
  if (!url) return url
  const want = CLIENT_ARCH
  // 防御性纠正:即使服务端配错或 CDN 拿到旧 yml,客户端也能把 URL 改回当前架构。
  if (process.platform === 'darwin') {
    const other = want === 'arm64' ? 'x64' : 'arm64'
    return url.replace(new RegExp(`-${other}(\\.(?:dmg|zip))(\\?.*)?$`, 'i'), `-${want}$1$2`)
  }
  if (process.platform === 'win32') {
    return url.replace(
      /-win-(x64|ia32|arm64)-setup\.exe(\?.*)?$/i,
      (_m, _arch, qs) => `-win-${want}-setup.exe${qs || ''}`
    )
  }
  return url
}

// ============================================================
// 路径 1: electron-updater (差分)
// ============================================================

function initElectronUpdater() {
  if (electronUpdaterInitialized) return

  electronAutoUpdater.autoDownload = false
  electronAutoUpdater.autoInstallOnAppQuit = false
  electronAutoUpdater.disableWebInstaller = true
  // X-Arch 让服务器知道当前客户端真实 arch,从而:
  // - latest.yml/latest-mac.yml 顶层 path/sha512 指向正确架构的安装包
  // - blockmap / 安装包请求也带上,服务端日志可观测
  // electron-updater 会把 requestHeaders 透传到 yml、blockmap、installer 三种请求。
  electronAutoUpdater.requestHeaders = { 'X-Arch': CLIENT_ARCH }

  electronAutoUpdater.on('download-progress', (p) => {
    downloadProgress = {
      percent: p.percent,
      transferred: p.transferred,
      total: p.total
    }
    mainWindow?.webContents.send('auto-updater:download-progress', downloadProgress)
  })

  electronAutoUpdater.on('update-downloaded', () => {
    differentialReady = true
    isDifferentialDownloading = false
    mainWindow?.webContents.send('auto-updater:update-downloaded')
  })

  electronAutoUpdater.on('error', async (err) => {
    updateLog.log('electron-updater error:', err)
    if (isDifferentialDownloading) {
      // 差分中失败 → 通知 UI + 自动回退全量
      isDifferentialDownloading = false
      currentMode = 'full'
      mainWindow?.webContents.send('auto-updater:differential-fallback', {
        reason: err?.message || '差分下载失败'
      })
      try {
        await downloadWithLegacy()
      } catch (fallbackErr) {
        sendError(fallbackErr)
      }
    } else {
      sendError(err)
    }
  })

  electronUpdaterInitialized = true
}

async function downloadWithDifferential() {
  if (!currentUpdateInfo) throw new Error('No update info')
  initElectronUpdater()
  isDifferentialDownloading = true
  differentialReady = false
  mainWindow?.webContents.send('auto-updater:download-started', {
    ...currentUpdateInfo,
    mode: 'differential'
  })
  try {
    await electronAutoUpdater.checkForUpdates()
    // update.cerumusic.top 走实时代理时,单范围差分更稳,避免 multipart/byteranges 兼容性问题
    const provider = (electronAutoUpdater as any).updateInfoAndProvider?.provider
    if (provider?.runtimeOptions) {
      provider.runtimeOptions.isUseMultipleRangeRequest = false
    }
    await electronAutoUpdater.downloadUpdate()
  } catch (err) {
    isDifferentialDownloading = false
    throw err
  }
}

// ============================================================
// 路径 2: 全量下载 + DownloadManager
// ============================================================

async function downloadWithLegacy() {
  if (!currentUpdateInfo) throw new Error('No update info')

  updateLog.log('Starting full download via DownloadManager:', currentUpdateInfo.url)

  const fileName = path.basename(currentUpdateInfo.url)
  const downloadPath = path.join(app.getPath('temp'), fileName)

  const songInfo = {
    name: `应用更新 ${currentUpdateInfo.name}`,
    singer: 'Ceru Music',
    albumName: 'Update',
    source: 'update',
    date: new Date(currentUpdateInfo.pub_date).toLocaleDateString('zh-CN')
  }

  const priority = -100
  mainWindow?.webContents.send('auto-updater:download-started', {
    ...currentUpdateInfo,
    mode: 'full'
  })

  const task = downloadManager.addTask(
    songInfo,
    currentUpdateInfo.url,
    downloadPath,
    { downloadLyrics: false, priority },
    priority,
    'autoUpdate',
    undefined
  )

  currentDownloadTaskId = task.id

  const onProgress = (t: any) => {
    if (t.id !== currentDownloadTaskId) return
    downloadProgress = {
      percent: t.progress,
      transferred: t.downloadedSize,
      total: t.totalSize
    }
    mainWindow?.webContents.send('auto-updater:download-progress', downloadProgress)
  }

  const onStatusChanged = (t: any) => {
    if (t.id !== currentDownloadTaskId) return
    if (t.status === DownloadStatus.Completed) {
      lastDownloadedFilePath = downloadPath
      mainWindow?.webContents.send('auto-updater:update-downloaded', {
        downloadPath,
        updateInfo: currentUpdateInfo
      })
      cleanupListeners()
    } else if (t.status === DownloadStatus.Error) {
      sendError(t.error || '下载失败')
      cleanupListeners()
    }
  }

  const onError = (t: any) => {
    if (t.id !== currentDownloadTaskId) return
    sendError(t.error || '下载失败')
    cleanupListeners()
  }

  const cleanupListeners = () => {
    if (unsubscribeDownloadEvents) {
      try {
        unsubscribeDownloadEvents()
      } catch {}
    }
    downloadManager.off('task-progress', onProgress)
    downloadManager.off('task-status-changed', onStatusChanged)
    downloadManager.off('task-error', onError)
    currentDownloadTaskId = null
    unsubscribeDownloadEvents = null
  }

  downloadManager.on('task-progress', onProgress)
  downloadManager.on('task-status-changed', onStatusChanged)
  downloadManager.on('task-error', onError)
}

// ============================================================
// 公共出口: 下载 / 安装 / 查询
// ============================================================

export async function downloadUpdate(mode?: UpdateMode) {
  if (!currentUpdateInfo) {
    sendError('No update info available')
    return
  }

  // 用户没指定 → 优先差分(若支持)
  const chosen: UpdateMode = mode || (supportsDifferential ? 'differential' : 'full')
  currentMode = chosen
  updateLog.log(`Downloading update with mode=${chosen}`)

  try {
    if (chosen === 'differential') {
      await downloadWithDifferential()
    } else {
      await downloadWithLegacy()
    }
  } catch (err) {
    updateLog.log('download failed:', err)
    if (chosen === 'differential') {
      // 差分初始化阶段就失败 → 通知 + 回退
      isDifferentialDownloading = false
      currentMode = 'full'
      mainWindow?.webContents.send('auto-updater:differential-fallback', {
        reason: (err as Error).message || '差分下载失败'
      })
      try {
        await downloadWithLegacy()
      } catch (e2) {
        sendError(e2)
      }
    } else {
      sendError(err)
    }
  }
}

export function quitAndInstall() {
  if (currentMode === 'differential' && differentialReady) {
    electronAutoUpdater.quitAndInstall(false, true)
    return
  }
  quitAndInstallLegacy()
}

function quitAndInstallLegacy() {
  if (!currentUpdateInfo && lastDownloadedFilePath) {
    try {
      if (fs.existsSync(lastDownloadedFilePath)) {
        shell.openPath(lastDownloadedFilePath).then(() => app.quit())
        return
      }
    } catch {}
  }

  if (!currentUpdateInfo) {
    updateLog.log('No update info available for installation')
    return
  }

  if (process.platform === 'win32') {
    const fileName = path.basename(currentUpdateInfo.url)
    const downloadPath = path.join(app.getPath('temp'), fileName)
    if (fs.existsSync(downloadPath)) {
      addInstallerForCleanup(downloadPath)
      shell.openPath(downloadPath).then(() => app.quit())
    } else if (lastDownloadedFilePath && fs.existsSync(lastDownloadedFilePath)) {
      addInstallerForCleanup(lastDownloadedFilePath)
      shell.openPath(lastDownloadedFilePath).then(() => app.quit())
    } else {
      updateLog.log('Downloaded file not found:', downloadPath)
    }
  } else if (process.platform === 'darwin') {
    const fileName = path.basename(currentUpdateInfo.url)
    const downloadPath = path.join(app.getPath('temp'), fileName)
    if (fs.existsSync(downloadPath)) {
      addInstallerForCleanup(downloadPath)
      shell.openPath(downloadPath).then(() => app.quit())
    } else {
      updateLog.log('Downloaded file not found:', downloadPath)
    }
  } else {
    shell.showItemInFolder(path.join(app.getPath('temp'), path.basename(currentUpdateInfo.url)))
  }
}

export function getDownloadedUpdatePath(updateInfo?: UpdateInfo): string | null {
  // 差分模式: 返回 sentinel 标识已就绪,UI 会触发"立即安装"对话框
  if (currentMode === 'differential') {
    return differentialReady ? '__electron_updater_internal__' : null
  }
  // 全量模式: 返回真实文件路径
  try {
    if (lastDownloadedFilePath && fs.existsSync(lastDownloadedFilePath)) {
      return lastDownloadedFilePath
    }
    const info = updateInfo || currentUpdateInfo
    if (info && info.url) {
      const fileName = path.basename(info.url)
      const downloadPath = path.join(app.getPath('temp'), fileName)
      if (fs.existsSync(downloadPath)) return downloadPath
    }
  } catch {}
  return null
}
