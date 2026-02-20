import { BrowserWindow, app, shell } from 'electron'
import axios from 'axios'
import fs from 'fs'
import path from 'node:path'
import { updateLog } from './logger'
import { downloadManager } from './services/DownloadManager'
import { DownloadStatus } from './types/download'

let mainWindow: BrowserWindow | null = null
let currentUpdateInfo: UpdateInfo | null = null
let downloadProgress = { percent: 0, transferred: 0, total: 0 }
let currentDownloadTaskId: string | null = null
let unsubscribeDownloadEvents: (() => void) | null = null
let lastDownloadedFilePath: string | null = null

// 记录待清理安装包的文件（保存在用户数据目录）
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
    // 仅记录位于临时目录的安装包
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
          // 安全保护：仅删除临时目录下的文件
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

// 更新信息接口
interface UpdateInfo {
  url: string
  name: string
  notes: string
  pub_date: string
}

// 更新服务器配置
const UPDATE_SERVER = 'https://update.ceru.shiqianjiang.cn'
const UPDATE_API_URL = `${UPDATE_SERVER}/update/${process.platform}/${app.getVersion()}`

// 初始化自动更新器
export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window
  updateLog.log('Auto updater initialized')
}

// 检查更新
export async function checkForUpdates(window?: BrowserWindow) {
  if (window) {
    mainWindow = window
  }

  try {
    updateLog.log('Checking for updates...')
    mainWindow?.webContents.send('auto-updater:checking-for-update')

    const updateInfo = await fetchUpdateInfo()

    if (updateInfo && isNewerVersion(updateInfo.name, app.getVersion())) {
      updateLog.log('Update available:', updateInfo)
      currentUpdateInfo = updateInfo
      mainWindow?.webContents.send('auto-updater:update-available', updateInfo)
    } else {
      updateLog.log('No update available')
      mainWindow?.webContents.send('auto-updater:update-not-available')
    }
  } catch (error) {
    console.error('Error checking for updates:', error)
    mainWindow?.webContents.send('auto-updater:error', (error as Error).message)
  }
}

// 获取更新信息
async function fetchUpdateInfo(): Promise<UpdateInfo | null> {
  try {
    updateLog.log('Fetching update info... url is ' + UPDATE_API_URL)
    const response = await axios.get(UPDATE_API_URL, {
      timeout: 10000, // 10秒超时
      validateStatus: (status) => status === 200 || status === 204 // 允许 200 和 204 状态码
    })

    if (response.status === 200) {
      return response.data as UpdateInfo
    } else if (response.status === 204) {
      // 204 表示没有更新
      return null
    }

    return null
  } catch (error: any) {
    if (error.response) {
      // 服务器响应了错误状态码
      throw new Error(`HTTP ${error.response.status}: ${error.response.statusText}`)
    } else if (error.request) {
      // 请求已发出但没有收到响应
      throw new Error('Network error: No response received')
    } else {
      // 其他错误
      throw new Error(`Request failed: ${error.message}`)
    }
  }
}

// 比较版本号
function isNewerVersion(remoteVersion: string, currentVersion: string): boolean {
  const parseVersion = (version: string) => {
    return version
      .replace(/^v/, '')
      .split('.')
      .map((num) => parseInt(num, 10))
  }

  const remote = parseVersion(remoteVersion)
  const current = parseVersion(currentVersion)

  for (let i = 0; i < Math.max(remote.length, current.length); i++) {
    const r = remote[i] || 0
    const c = current[i] || 0

    if (r > c) return true
    if (r < c) return false
  }

  return false
}

// 下载更新
export async function downloadUpdate() {
  if (!currentUpdateInfo) {
    throw new Error('No update info available')
  }

  try {
    updateLog.log('Starting download via DownloadManager:', currentUpdateInfo.url)

    // 目标下载路径（临时目录，文件名与远端保持一致）
    const fileName = path.basename(currentUpdateInfo.url)
    const downloadPath = path.join(app.getPath('temp'), fileName)

    // 构建用于下载管理显示的简要信息
    const songInfo = {
      name: `应用更新 ${currentUpdateInfo.name}`,
      singer: 'Ceru Music',
      albumName: 'Update',
      source: 'update',
      date: new Date(currentUpdateInfo.pub_date).toLocaleDateString('zh-CN')
    }

    // 高优先级加入下载队列（数值越小优先级越高）
    const priority = -100

    // 通知渲染进程开始下载（兼容旧事件）
    mainWindow?.webContents.send('auto-updater:download-started', currentUpdateInfo)

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

    // 订阅该任务的进度与完成事件，并在结束后取消订阅
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
  } catch (error) {
    console.error('Download failed:', error)
    mainWindow?.webContents.send('auto-updater:error', (error as Error).message)
  }
}

// 已迁移到 DownloadManager，此处不再保留下载函数

// 退出并安装
export function quitAndInstall() {
  // 优先使用下载完成时记录的路径，避免状态丢失导致无法安装
  if (!currentUpdateInfo && lastDownloadedFilePath) {
    try {
      if (fs.existsSync(lastDownloadedFilePath)) {
        shell.openPath(lastDownloadedFilePath).then(() => app.quit())
        return
      }
    } catch {}
  }

  if (!currentUpdateInfo) {
    console.error('No update info available for installation')
    return
  }

  // 对于不同平台，处理方式不同
  if (process.platform === 'win32') {
    // Windows: 打开安装程序
    const fileName = path.basename(currentUpdateInfo.url)
    const downloadPath = path.join(app.getPath('temp'), fileName)

    if (fs.existsSync(downloadPath)) {
      // 记录到清理列表，在下次应用启动时自动删除
      addInstallerForCleanup(downloadPath)
      shell.openPath(downloadPath).then(() => {
        app.quit()
      })
    } else {
      // 尝试使用最后记录的文件路径作为备用
      if (lastDownloadedFilePath && fs.existsSync(lastDownloadedFilePath)) {
        addInstallerForCleanup(lastDownloadedFilePath)
        shell.openPath(lastDownloadedFilePath).then(() => app.quit())
      } else {
        console.error('Downloaded file not found:', downloadPath)
      }
    }
  } else if (process.platform === 'darwin') {
    // macOS: 打开 dmg 或 zip 文件
    const fileName = path.basename(currentUpdateInfo.url)
    const downloadPath = path.join(app.getPath('temp'), fileName)

    if (fs.existsSync(downloadPath)) {
      addInstallerForCleanup(downloadPath)
      shell.openPath(downloadPath).then(() => {
        app.quit()
      })
    } else {
      console.error('Downloaded file not found:', downloadPath)
    }
  } else {
    // Linux: 打开下载文件夹
    shell.showItemInFolder(path.join(app.getPath('temp'), path.basename(currentUpdateInfo.url)))
  }
}

// 获取已下载的更新包路径（若存在）
export function getDownloadedUpdatePath(updateInfo?: UpdateInfo): string | null {
  try {
    // 1. 如果记录了最后下载路径且存在，优先返回
    if (lastDownloadedFilePath && fs.existsSync(lastDownloadedFilePath)) {
      return lastDownloadedFilePath
    }

    // 2. 根据传入或当前的 updateInfo 计算临时目录路径
    const info = updateInfo || currentUpdateInfo
    if (info && info.url) {
      const fileName = path.basename(info.url)
      const downloadPath = path.join(app.getPath('temp'), fileName)
      if (fs.existsSync(downloadPath)) return downloadPath
    }
  } catch (e) {
    // ignore
  }
  return null
}
