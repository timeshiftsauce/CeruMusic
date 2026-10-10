import { BrowserWindow, app, shell, net } from 'electron'
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

/** 本次更新下载使用的镜像前缀（空 = 原生直连）。 */
let currentMirror = ''

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

// ============================================================
// 更新镜像（GitHub 代理）—— 「选择下载方式」用
//
// 用法：把原始更新 URL 直接拼在镜像前缀后，例如
//   https://gh-proxy.org/https://github.com/owner/repo/releases/download/v1/a.exe
// 具体规则与 gh-proxy 一致（前缀 + 原始 URL，原 URL 保留完整协议与域名）。
//
// 镜像池的**唯一权威来源是 update-server**（响应里的 `mirrors: string[]`，
// 维护于 update-server/src/mirrors.ts）。这里只保留极少量应急兜底，用于
// 更新服务器不可达时的降级 —— 不要再往这里堆列表，改服务器即可。
// ============================================================
const FALLBACK_MIRRORS = ['https://gh-proxy.org/', 'https://ghproxy.net/', 'https://ghfast.top/']

/** 当前生效的镜像池：服务器下发优先，否则用内置兜底。 */
let availableMirrors: string[] = [...FALLBACK_MIRRORS]

/** 镜像测速的并发上限：避免一次性发起 74 个连接。 */
const MIRROR_PROBE_CONCURRENCY = 12

/** 把镜像前缀与原始下载 URL 拼成可直接下载的地址（gh-proxy 风格）。 */
export function buildMirrorUrl(mirror: string, originalUrl: string): string {
  if (!mirror) return originalUrl
  const base = mirror.endsWith('/') ? mirror : mirror + '/'
  return base + originalUrl
}

/**
 * 探测单个镜像的 RTT（毫秒）。失败/超时返回 null。mirror 为空串 = 原生直连。
 *
 * 判定「可用」的标准是**能建立连接并拿到 HTTP 响应**，而不是必须 2xx ——
 * gh-proxy 类镜像对未知路径返回 404/403 属正常（服务是活的），
 * 若按 res.ok 判定会把可用镜像误判为超时。
 */
async function probeMirror(mirror: string, timeoutMs = 6000): Promise<number | null> {
  // 用 GitHub 静态小资源作探测目标，拼接方式与真实下载完全一致。
  // mirror 为空串时即「直连」——直接请求原始 URL，同样能反映 GitHub 直连速度。
  const probeTarget =
    'https://raw.githubusercontent.com/timeshiftsauce/CeruMusic/refs/heads/main/docs/assets/head.jpg'
  const url = mirror ? buildMirrorUrl(mirror, probeTarget) : probeTarget
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  const started = Date.now()
  try {
    // HEAD 更省流量；部分代理不支持 HEAD，失败时降级用 GET + Range 取首字节。
    let res = await net.fetch(url, { method: 'HEAD', signal: ctrl.signal })
    if (!res.ok) {
      res = await net.fetch(url, {
        method: 'GET',
        headers: { Range: 'bytes=0-0' },
        signal: ctrl.signal
      })
      // 读掉 body 确保首字节真正到达
      try {
        await res.arrayBuffer()
      } catch {}
    }
    // 只要拿到了 HTTP 响应就说明链路可达（包含 404/403，说明代理服务本身活着）。
    // 仅在连接层失败（DNS/超时/TLS）时才返回 null。
    return Date.now() - started
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/** 并发池：限制同时进行的探测数，避免一次性发起过多连接。 */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const runners = new Array(Math.min(limit, items.length)).fill(0).map(async () => {
    while (true) {
      const index = cursor++
      if (index >= items.length) return
      results[index] = await worker(items[index], index)
    }
  })
  await Promise.all(runners)
  return results
}

/**
 * 并发探测「原生直连 + 所有镜像」的 RTT。
 *
 * 返回列表**第一个固定是原生直连**（url 为空串）。
 * 其余镜像：可用的按 RTT 升序排在前面，**探测失败（超时）的保留在末尾**，
 * 其 ms 为 null（前端渲染为「超时」并置灰，不作为默认选中项）。
 *
 * 用于更新弹窗：一个面板里把「直连」和全部镜像并列，用户单选。
 * 探测受并发上限约束（MIRROR_PROBE_CONCURRENCY）。
 */
export async function probeMirrors(
  mirrors?: string[]
): Promise<Array<{ url: string; ms: number | null }>> {
  const explicit = !!(mirrors && mirrors.length)
  const list = (explicit ? mirrors! : availableMirrors).filter(Boolean)
  const fromServer = !explicit && list !== FALLBACK_MIRRORS
  updateLog.log(
    `镜像测速开始：共 ${list.length} 个（来源：${explicit ? '调用方指定' : fromServer ? '服务器下发' : '内置兜底'}，并发 ${MIRROR_PROBE_CONCURRENCY}）`
  )
  const [directMs, mirrorResults] = await Promise.all([
    probeMirror(''), // 空串 = 原生直连
    mapWithConcurrency(list, MIRROR_PROBE_CONCURRENCY, async (mirror) => {
      const ms = await probeMirror(mirror)
      return { url: mirror, ms }
    })
  ])
  // 可用的按延迟升序在前，超时的排在其后（保持相对顺序）
  const ok = mirrorResults
    .filter((r) => r.ms != null)
    .sort((a, b) => (a.ms as number) - (b.ms as number))
  const failed = mirrorResults.filter((r) => r.ms == null)
  updateLog.log(
    `镜像测速完成：可用 ${ok.length}/${list.length}，超时 ${failed.length}，直连 ${directMs == null ? '超时' : directMs + 'ms'}`
  )
  // 直连始终第一；其余 = 可用（升序）+ 超时（末尾）
  return [{ url: '', ms: directMs }, ...ok, ...failed]
}

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
    const res = await net.fetch(
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
    const res = await net.fetch(url, { ...rest, signal: ctrl.signal })
    return res
  } catch (err: any) {
    const code = err?.code || err?.cause?.code || ''
    const message = String(err?.message || '')
    // 只在 DNS 解析失败时回退,其它错误 (超时/连接拒绝等) 直接抛出。
    // net.fetch 的 DNS 失败表现为 net::ERR_NAME_NOT_RESOLVED 文案。
    const isDnsError =
      code === 'ENOTFOUND' ||
      code === 'EAI_AGAIN' ||
      /ERR_NAME_NOT_RESOLVED|ERR_NAME_RESOLUTION_FAILED/.test(message)
    if (!isDnsError) throw err

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
    return net.fetch(ipUrl, { ...rest, headers, signal: ctrl.signal })
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
    // 更新服务器冷启动要回源 GitHub API，国内可能十几秒；超时给足 20s。
    const res = await fetchWithDohFallback(UPDATE_API_URL, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        'User-Agent': 'CeruMusic-AutoUpdater',
        'X-Arch': CLIENT_ARCH
      },
      timeoutMs: 20000
    })
    if (res.status === 204) return null
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`)
    }
    const data = (await res.json()) as UpdateInfo & { mirrors?: unknown }
    if (data && data.url) {
      data.url = resolveDownloadUrlForCurrentArch(data.url)
    }
    // 服务器下发的镜像池优先；没有/格式不对则沿用内置兜底。
    if (Array.isArray(data?.mirrors)) {
      const list = (data.mirrors as unknown[])
        .filter((m): m is string => typeof m === 'string' && /^https?:\/\//i.test(m))
        .map((m) => (m.endsWith('/') ? m : m + '/'))
      if (list.length) {
        availableMirrors = list
        updateLog.log(`镜像池已由服务器下发：${list.length} 个`)
      }
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

  // 组装下载地址：选了镜像就「镜像前缀 + 原始 URL」，否则直连。
  const originalUrl = currentUpdateInfo.url
  const downloadUrl = currentMirror ? buildMirrorUrl(currentMirror, originalUrl) : originalUrl
  updateLog.log(
    currentMirror
      ? `Starting full download via mirror: ${downloadUrl}`
      : `Starting full download via DownloadManager: ${downloadUrl}`
  )

  const fileName = path.basename(originalUrl)
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
    downloadUrl,
    downloadPath,
    { downloadLyrics: false, priority },
    priority,
    // 应用更新不是「插件发起的下载」：pluginId 必须留空。
    // 若传 'autoUpdate'，渲染层广播下载事件时会把它当成插件任务，
    // 而该 songInfo（source='update'，无 songmid）不是合法歌曲 → 抛错刷屏。
    undefined,
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

export async function downloadUpdate(mode?: UpdateMode, mirror?: string) {
  if (!currentUpdateInfo) {
    sendError('No update info available')
    return
  }

  // 记录本次使用的镜像（空 = 原生直连）。downloadWithLegacy 据此拼接下载地址。
  currentMirror = mirror && typeof mirror === 'string' ? mirror.trim() : ''
  updateLog.log(currentMirror ? `使用镜像下载：${currentMirror}` : '使用原生（直连）下载')

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
