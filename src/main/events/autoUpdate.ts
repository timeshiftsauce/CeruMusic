import { ipcMain, BrowserWindow } from 'electron'
import { initAutoUpdater, checkForUpdates, downloadUpdate, quitAndInstall } from '../autoUpdate'

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
  ipcMain.handle('auto-updater:download-update', () => {
    downloadUpdate()
  })

  // 安装更新
  ipcMain.handle('auto-updater:quit-and-install', () => {
    quitAndInstall()
  })
}

// 初始化自动更新（在主窗口创建后调用）
export function initAutoUpdateForWindow(window: BrowserWindow) {
  initAutoUpdater(window)
}
