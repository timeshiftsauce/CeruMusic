import { BrowserWindow, app, shell } from 'electron'
import axios from 'axios'
import fs from 'fs'
import path from 'node:path'

let mainWindow: BrowserWindow | null = null
let currentUpdateInfo: UpdateInfo | null = null
let downloadProgress = { percent: 0, transferred: 0, total: 0 }

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

// Alist API 配置
const ALIST_BASE_URL = 'https://alist.shiqianjiang.cn' // 请替换为实际的 alist 域名
const ALIST_USERNAME = 'ceruupdate'
const ALIST_PASSWORD = '123456' //登录公开的账号密码

// Alist 认证 token
let alistToken: string | null = null

// 获取 Alist 认证 token
async function getAlistToken(): Promise<string> {
  if (alistToken) {
    return alistToken
  }

  try {
    console.log('Authenticating with Alist...')
    const response = await axios.post(
      `${ALIST_BASE_URL}/api/auth/login`,
      {
        username: ALIST_USERNAME,
        password: ALIST_PASSWORD
      },
      {
        timeout: 10000,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('Alist auth response:', response.data)

    if (response.data.code === 200) {
      alistToken = response.data.data.token
      console.log('Alist authentication successful')
      return alistToken! // 我们已经确认 token 存在
    } else {
      throw new Error(`Alist authentication failed: ${response.data.message || 'Unknown error'}`)
    }
  } catch (error: any) {
    console.error('Alist authentication error:', error)
    if (error.response) {
      throw new Error(
        `Failed to authenticate with Alist: HTTP ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      )
    } else {
      throw new Error(`Failed to authenticate with Alist: ${error.message}`)
    }
  }
}

// 获取 Alist 文件下载链接
async function getAlistDownloadUrl(version: string, fileName: string): Promise<string> {
  const token = await getAlistToken()
  const filePath = `/${version}/${fileName}`

  try {
    console.log(`Getting file info for: ${filePath}`)
    const response = await axios.post(
      `${ALIST_BASE_URL}/api/fs/get`,
      {
        path: filePath
      },
      {
        timeout: 10000,
        headers: {
          Authorization: token,
          'Content-Type': 'application/json'
        }
      }
    )

    console.log('Alist file info response:', response.data)

    if (response.data.code === 200) {
      const fileInfo = response.data.data

      // 检查文件是否存在且有下载链接
      if (fileInfo && fileInfo.raw_url) {
        console.log('Using raw_url for download:', fileInfo.raw_url)
        return fileInfo.raw_url
      } else if (fileInfo && fileInfo.sign) {
        // 使用签名构建下载链接
        const downloadUrl = `${ALIST_BASE_URL}/d${filePath}?sign=${fileInfo.sign}`
        console.log('Using signed download URL:', downloadUrl)
        return downloadUrl
      } else {
        // 尝试直接下载链接（无签名）
        const directUrl = `${ALIST_BASE_URL}/d${filePath}`
        console.log('Using direct download URL:', directUrl)
        return directUrl
      }
    } else {
      throw new Error(`Failed to get file info: ${response.data.message || 'Unknown error'}`)
    }
  } catch (error: any) {
    console.error('Alist file info error:', error)
    if (error.response) {
      throw new Error(
        `Failed to get download URL from Alist: HTTP ${error.response.status} - ${error.response.data?.message || error.response.statusText}`
      )
    } else {
      throw new Error(`Failed to get download URL from Alist: ${error.message}`)
    }
  }
}

// 初始化自动更新器
export function initAutoUpdater(window: BrowserWindow) {
  mainWindow = window
  console.log('Auto updater initialized')
}

// 检查更新
export async function checkForUpdates(window?: BrowserWindow) {
  if (window) {
    mainWindow = window
  }

  try {
    console.log('Checking for updates...')
    mainWindow?.webContents.send('auto-updater:checking-for-update')

    const updateInfo = await fetchUpdateInfo()

    if (updateInfo && isNewerVersion(updateInfo.name, app.getVersion())) {
      console.log('Update available:', updateInfo)
      currentUpdateInfo = updateInfo
      mainWindow?.webContents.send('auto-updater:update-available', updateInfo)
    } else {
      console.log('No update available')
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
    console.log('Starting download:', currentUpdateInfo.url)

    // 通知渲染进程开始下载
    mainWindow?.webContents.send('auto-updater:download-started', currentUpdateInfo)

    const downloadPath = await downloadFile(currentUpdateInfo.url)
    console.log('Download completed:', downloadPath)

    mainWindow?.webContents.send('auto-updater:update-downloaded', {
      downloadPath,
      updateInfo: currentUpdateInfo
    })
  } catch (error) {
    console.error('Download failed:', error)
    mainWindow?.webContents.send('auto-updater:error', (error as Error).message)
  }
}

// 下载文件
async function downloadFile(originalUrl: string): Promise<string> {
  const fileName = path.basename(originalUrl)
  const downloadPath = path.join(app.getPath('temp'), fileName)

  // 进度节流变量
  let lastProgressSent = 0
  let lastProgressTime = 0
  const PROGRESS_THROTTLE_INTERVAL = 500 // 500ms 发送一次进度
  const PROGRESS_THRESHOLD = 1 // 进度变化超过1%才发送

  try {
    let downloadUrl = originalUrl

    try {
      // 从当前更新信息中提取版本号
      const version = currentUpdateInfo?.name || app.getVersion()

      // 尝试使用 alist API 获取下载链接
      downloadUrl = await getAlistDownloadUrl(version, fileName)
      console.log('Using Alist download URL:', downloadUrl)
    } catch (alistError) {
      console.warn('Alist download failed, falling back to original URL:', alistError)
      console.log('Using original download URL:', originalUrl)
      downloadUrl = originalUrl
    }

    const response = await axios({
      method: 'GET',
      url: downloadUrl,
      responseType: 'stream',
      timeout: 30000, // 30秒超时
      onDownloadProgress: (progressEvent) => {
        const { loaded, total } = progressEvent
        const percent = total ? (loaded / total) * 100 : 0
        const currentTime = Date.now()

        // 节流逻辑：只在进度变化显著或时间间隔足够时发送
        const progressDiff = Math.abs(percent - lastProgressSent)
        const timeDiff = currentTime - lastProgressTime

        if (progressDiff >= PROGRESS_THRESHOLD || timeDiff >= PROGRESS_THROTTLE_INTERVAL) {
          downloadProgress = {
            percent,
            transferred: loaded,
            total: total || 0
          }

          mainWindow?.webContents.send('auto-updater:download-progress', downloadProgress)
          lastProgressSent = percent
          lastProgressTime = currentTime
        }
      }
    })

    // 发送初始进度
    const totalSize = parseInt(response.headers['content-length'] || '0', 10)
    mainWindow?.webContents.send('auto-updater:download-progress', {
      percent: 0,
      transferred: 0,
      total: totalSize
    })

    // 创建写入流
    const writer = fs.createWriteStream(downloadPath)

    // 将响应数据流写入文件
    response.data.pipe(writer)

    return new Promise((resolve, reject) => {
      writer.on('finish', () => {
        // 发送最终进度
        mainWindow?.webContents.send('auto-updater:download-progress', {
          percent: 100,
          transferred: totalSize,
          total: totalSize
        })

        console.log('File download completed:', downloadPath)
        resolve(downloadPath)
      })

      writer.on('error', (error) => {
        // 删除部分下载的文件
        fs.unlink(downloadPath, () => {})
        reject(error)
      })

      response.data.on('error', (error: Error) => {
        writer.destroy()
        fs.unlink(downloadPath, () => {})
        reject(error)
      })
    })
  } catch (error: any) {
    // 删除可能创建的文件
    if (fs.existsSync(downloadPath)) {
      fs.unlink(downloadPath, () => {})
    }

    if (error.response) {
      throw new Error(`Download failed: HTTP ${error.response.status} ${error.response.statusText}`)
    } else if (error.request) {
      throw new Error('Download failed: Network error')
    } else {
      throw new Error(`Download failed: ${error.message}`)
    }
  }
}

// 退出并安装
export function quitAndInstall() {
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
      shell.openPath(downloadPath).then(() => {
        app.quit()
      })
    } else {
      console.error('Downloaded file not found:', downloadPath)
    }
  } else if (process.platform === 'darwin') {
    // macOS: 打开 dmg 或 zip 文件
    const fileName = path.basename(currentUpdateInfo.url)
    const downloadPath = path.join(app.getPath('temp'), fileName)

    if (fs.existsSync(downloadPath)) {
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
