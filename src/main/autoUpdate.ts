import { BrowserWindow, app, shell } from 'electron'
import axios from 'axios'
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
const UPDATE_API_URL = `${UPDATE_SERVER}/update/${process.platform}/${app.getVersion()}`

function ymlNameForPlatform(): string {
  if (process.platform === 'darwin') return 'latest-mac.yml'
  if (process.platform === 'linux') return 'latest-linux.yml'
  return 'latest.yml'
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

// ============================================================
// 入口: 检查更新 (dispatcher)
// ============================================================

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
    supportsDifferential = app.isPackaged && (await detectBlockmapPresence())

    currentUpdateInfo = { ...hazelInfo, supportsDifferential }
    currentMode = null
    differentialReady = false
    isDifferentialDownloading = false

    updateLog.log(
      `Update available: ${hazelInfo.name}, supportsDifferential=${supportsDifferential}`
    )
    mainWindow?.webContents.send('auto-updater:update-available', currentUpdateInfo)
  } catch (err) {
    updateLog.log('check error:', err)
    mainWindow?.webContents.send('auto-updater:error', (err as Error).message)
  }
}

async function fetchHazelUpdateInfo(): Promise<UpdateInfo | null> {
  updateLog.log('Fetching update info from ' + UPDATE_API_URL)
  try {
    const response = await axios.get(UPDATE_API_URL, {
      timeout: 10000,
      validateStatus: (status) => status === 200 || status === 204
    })
    if (response.status === 200) {
      const data = response.data as UpdateInfo
      if (data && data.url) {
        data.url = resolveDownloadUrlForCurrentArch(data.url)
      }
      return data
    }
    return null
  } catch (error: any) {
    if (error.response) {
      throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`)
    } else if (error.request) {
      throw new Error('Network error: No response received')
    } else {
      throw new Error(`Request failed: ${error.message}`)
    }
  }
}

async function detectBlockmapPresence(): Promise<boolean> {
  const ymlName = ymlNameForPlatform()
  try {
    const res = await axios.get(`${UPDATE_SERVER}/${ymlName}`, {
      timeout: 5000,
      transformResponse: [(d) => d],
      responseType: 'text'
    })
    const text = String(res.data || '')
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
  if (process.platform !== 'darwin' || !url) return url
  const want = process.arch === 'arm64' ? 'arm64' : 'x64'
  const other = want === 'arm64' ? 'x64' : 'arm64'
  return url.replace(new RegExp(`-${other}(\\.[a-z0-9]+)(\\?.*)?$`, 'i'), `-${want}$1$2`)
}

// ============================================================
// 路径 1: electron-updater (差分)
// ============================================================

function initElectronUpdater() {
  if (electronUpdaterInitialized) return

  electronAutoUpdater.autoDownload = false
  electronAutoUpdater.autoInstallOnAppQuit = false

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
        mainWindow?.webContents.send(
          'auto-updater:error',
          (fallbackErr as Error).message || String(fallbackErr)
        )
      }
    } else {
      mainWindow?.webContents.send(
        'auto-updater:error',
        err?.message || 'electron-updater error'
      )
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
    await electronAutoUpdater.downloadUpdate()
  } catch (err) {
    isDifferentialDownloading = false
    throw err
  }
}

// ============================================================
// 路径 2: legacy axios + DownloadManager (全量)
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
      mainWindow?.webContents.send('auto-updater:error', t.error || '下载失败')
      cleanupListeners()
    }
  }

  const onError = (t: any) => {
    if (t.id !== currentDownloadTaskId) return
    mainWindow?.webContents.send('auto-updater:error', t.error || '下载失败')
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
    mainWindow?.webContents.send('auto-updater:error', 'No update info available')
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
        mainWindow?.webContents.send(
          'auto-updater:error',
          (e2 as Error).message || String(e2)
        )
      }
    } else {
      mainWindow?.webContents.send('auto-updater:error', (err as Error).message)
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
    shell.showItemInFolder(
      path.join(app.getPath('temp'), path.basename(currentUpdateInfo.url))
    )
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
