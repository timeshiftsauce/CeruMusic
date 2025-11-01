import InitPluginService from './plugins'
import '../services/musicSdk/index'
import aiEvents from '../events/ai'
import { app, powerSaveBlocker } from 'electron'
import path from 'node:path'
import { type BrowserWindow, ipcMain } from 'electron'
export default function InitEventServices(mainWindow: BrowserWindow) {
  InitPluginService()
  aiEvents(mainWindow)
  basisEvent(mainWindow)
}

function basisEvent(mainWindow: BrowserWindow) {
  let psbId: number | null = null
  // 复用主进程创建的托盘
  let tray: any = (global as any).__ceru_tray__ || null
  let isQuitting = false
  // 托盘菜单与图标由主进程统一创建，这里不再重复创建
  // 播放/暂停由主进程托盘菜单触发 'music-control' 事件

  // 应用退出前的清理
  app.on('before-quit', () => {
    isQuitting = true
  })

  // 窗口控制 IPC 处理
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.on('window-maximize', () => {
    if (mainWindow.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow.maximize()
    }
  })

  ipcMain.on('window-close', () => {
    mainWindow.close()
  })

  // Mini 模式 IPC 处理 - 最小化到系统托盘
  ipcMain.on('window-mini-mode', (_, isMini) => {
    if (mainWindow) {
      if (isMini) {
        // 进入 Mini 模式：隐藏窗口到系统托盘
        mainWindow.hide()
        // 显示托盘通知（可选）
        tray = (global as any).__ceru_tray__ || tray
        if (tray && tray.displayBalloon) {
          tray.displayBalloon({
            title: '澜音 Music',
            content: '已最小化到系统托盘啦，点击托盘图标可重新打开~'
          })
        }
      } else {
        // 退出 Mini 模式：显示窗口
        mainWindow.show()
        mainWindow.focus()
      }
    }
  })

  // 全屏模式 IPC 处理
  ipcMain.on('window-toggle-fullscreen', () => {
    const isFullScreen = mainWindow.isFullScreen()
    mainWindow.setFullScreen(!isFullScreen)
  })
  // 阻止窗口关闭，改为隐藏到系统托盘
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()

      // 显示托盘通知
      tray = (global as any).__ceru_tray__ || tray
      if (tray && tray.displayBalloon) {
        tray.displayBalloon({
          title: 'Ceru Music',
          content: '已最小化到系统托盘啦，点击托盘图标可重新打开~'
        })
      }
    }
  })
  // 阻止系统息屏 IPC（开启/关闭）
  ipcMain.handle('power-save-blocker:start', () => {
    if (psbId == null) {
      psbId = powerSaveBlocker.start('prevent-display-sleep')
    }
    return psbId
  })

  ipcMain.handle('power-save-blocker:stop', () => {
    if (psbId != null && powerSaveBlocker.isStarted(psbId)) {
      powerSaveBlocker.stop(psbId)
    }
    psbId = null
    return true
  })

  // 获取应用版本号
  ipcMain.handle('get-app-version', () => {
    return app.getVersion()
  })
}
