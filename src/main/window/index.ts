import { Tray, Menu, BrowserWindow } from 'electron'
import { electronApp, optimizer } from '@electron-toolkit/utils'
import path from 'node:path'
// 使用传入的 tray 对象
export default function useWindow(
  createWindow: { (): void; (): void },
  ipcMain: Electron.IpcMain,
  app: Electron.App,
  mainWindow: BrowserWindow | null,
  isQuitting: { value: boolean },
  trayObj: { value: Tray | null }
) {
  function createTray(): void {
    // 创建系统托盘
    const trayIconPath = path.join(__dirname, '../../resources/logo.png')
    trayObj.value = new Tray(trayIconPath)

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
          mainWindow?.webContents.send('music-control')
        }
      },
      { type: 'separator' },
      {
        label: '退出',
        click: () => {
          isQuitting.value = true
          app.quit()
        }
      }
    ])

    trayObj.value.setContextMenu(contextMenu)
    trayObj.value.setToolTip('Ceru Music')

    // 双击托盘图标显示窗口
    trayObj.value.on('click', () => {
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

  app.whenReady().then(() => {
    // Set app user model id for windows
    // electronApp.setAppUserModelId('com.cerulean.music')
    // Default open or close DevTools by F12 in development
    // and ignore CommandOrControl + R in production.
    // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
    app.on('browser-window-created', (_, window) => {
      optimizer.watchWindowShortcuts(window)
    })

    // 窗口控制 IPC 处理
    ipcMain.on('window-minimize', () => {
      console.log('收到 window-minimize 事件')
      if (mainWindow) {
        console.log('正在最小化窗口...')
        mainWindow.minimize()
      } else {
        console.log('mainWindow 不存在')
        const window = BrowserWindow.getFocusedWindow()
        if (window) {
          console.log('使用 getFocusedWindow 最小化窗口...')
          window.minimize()
        } else {
          console.log('没有找到可用的窗口')
        }
      }
    })

    ipcMain.on('window-maximize', () => {
      console.log('收到 window-maximize 事件')
      if (mainWindow) {
        console.log('正在最大化/还原窗口...')
        if (mainWindow.isMaximized()) {
          mainWindow.unmaximize()
        } else {
          mainWindow.maximize()
        }
      } else {
        console.log('mainWindow 不存在')
        const window = BrowserWindow.getFocusedWindow()
        if (window) {
          console.log('使用 getFocusedWindow 最大化/还原窗口...')
          if (window.isMaximized()) {
            window.unmaximize()
          } else {
            window.maximize()
          }
        } else {
          console.log('没有找到可用的窗口')
        }
      }
    })

    ipcMain.on('window-close', () => {
      console.log('收到 window-close 事件')
      if (mainWindow) {
        console.log('正在关闭窗口...')
        mainWindow.close()
      } else {
        console.log('mainWindow 不存在')
        const window = BrowserWindow.getFocusedWindow()
        if (window) {
          console.log('使用 getFocusedWindow 关闭窗口...')
          window.close()
        } else {
          console.log('没有找到可用的窗口')
        }
      }
    })

    // Mini 模式 IPC 处理 - 最小化到系统托盘
    ipcMain.on('window-mini-mode', (_, isMini) => {
      console.log('收到 window-mini-mode 事件，isMini:', isMini)
      if (mainWindow) {
        if (isMini) {
          // 进入 Mini 模式：隐藏窗口到系统托盘
          console.log('正在隐藏窗口...')
          mainWindow.hide()
          // 显示托盘通知（可选）
          if (trayObj.value) {
            console.log('显示托盘通知...')
            trayObj.value.displayBalloon({
              title: '澜音 Music',
              content: '已最小化到系统托盘啦，点击托盘图标可重新打开~'
            })
          } else {
            console.log('托盘对象不存在！trayObj.value:', trayObj.value)
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
      if (mainWindow) {
        const isFullScreen = mainWindow.isFullScreen()
        mainWindow.setFullScreen(!isFullScreen)
      }
    })

    createWindow()
    createTray()

    app.on('activate', function () {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}
