import { ipcMain, BrowserWindow } from 'electron'
import {
  initAutoUpdater,
  checkForUpdates,
  downloadUpdate,
  quitAndInstall,
  getDownloadedUpdatePath,
  probeMirrors
} from '../autoUpdate'

// 注册自动更新相关的IPC事件
export function registerAutoUpdateEvents() {
  // 检查更新
  ipcMain.handle('auto-updater:check-for-updates', (event) => {
    const window = BrowserWindow.fromWebContents(event.sender)
    if (window) {
      checkForUpdates(window)
    }
  })

  // 下载更新
  //  - mode: 'differential' | 'full' | undefined（undefined 时主进程自动选）
  //  - mirror: GitHub 代理前缀（空/undefined = 原生直连）
  ipcMain.handle(
    'auto-updater:download-update',
    (_event, mode?: 'differential' | 'full', mirror?: string) => {
      downloadUpdate(mode, mirror)
    }
  )

  // 探测更新镜像速度：返回按 RTT 升序的 [{ url, ms }]（失败的已剔除）
  ipcMain.handle('auto-updater:probe-mirrors', async (_event, mirrors?: string[]) => {
    return await probeMirrors(mirrors)
  })

  // 安装更新
  ipcMain.handle('auto-updater:quit-and-install', () => {
    quitAndInstall()
  })

  // 查询是否已有已下载更新包
  ipcMain.handle('auto-updater:get-downloaded-path', (_event, updateInfo) => {
    return getDownloadedUpdatePath(updateInfo || undefined)
  })
}

// 初始化自动更新（在主窗口创建后调用）
export function initAutoUpdateForWindow(window: BrowserWindow) {
  initAutoUpdater(window)
}
