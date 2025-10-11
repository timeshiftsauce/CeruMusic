import InitPluginService from './plugins'
import '../services/musicSdk/index'
import aiEvents from '../events/ai'
import { app, powerSaveBlocker, Menu } from 'electron'
import path from 'node:path'
import { type BrowserWindow, Tray, ipcMain } from 'electron'
export default function InitEventServices(mainWindow: BrowserWindow) {
  InitPluginService()
  aiEvents(mainWindow)
  basisEvent(mainWindow)
}

function basisEvent(mainWindow: BrowserWindow) {
  let psbId: number | null = null
  let tray: Tray | null = null
  let isQuitting = false
  function createTray(): void {
    // 创建系统托盘
    const trayIconPath = path.join(__dirname, '../../resources/logo.png')
    tray = new Tray(trayIconPath)

    // 创建托盘菜单
    const contextMenu = Menu.buildFromTemplate([
      {
        label: '显示窗口',
        click: () => {
          if (mainWindow) {
            mainWindow.show()
            mainWindow.focus()
          }
        }
      },
      {
        label: '播放/暂停',
        click: () => {
          // 这里可以添加播放控制逻辑
          console.log('music-control')
          mainWindow?.webContents.send('music-control')
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting = true
          app.quit()
        }
      }
    ])

    tray.setContextMenu(contextMenu)
    tray.setToolTip('Ceru Music')

    // 单击托盘图标显示窗口
    tray.on('click', () => {
      if (mainWindow) {
        if (mainWindow.isVisible()) {
          mainWindow.hide()
        } else {
          mainWindow.show()
          mainWindow.focus()
        }
      }
    })
  }
  createTray()
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
        if (tray) {
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
      if (tray) {
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
