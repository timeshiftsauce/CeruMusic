import { app, shell, BrowserWindow, ipcMain, Tray, Menu } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/logo.png?asset'
import path from 'node:path'
import musicService from './services/music'
import pluginService from './services/plugin'
import aiEvents from './events/ai'
import './services/musicSdk/index'

// import wy from './utils/musicSdk/wy/index'
// import kg from './utils/musicSdk/kg/index'
// wy.hotSearch.getList().then((res) => {
//   console.log(res)
// })
// kg.hotSearch.getList().then((res) => {
//   console.log(res)
// })
let tray: Tray | null = null
let mainWindow: BrowserWindow | null = null
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

  // 双击托盘图标显示窗口
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

function createWindow(): void {
  // return
  // Create the browser window.
  mainWindow = new BrowserWindow({
    width: 1100,
    height: 750,
    minWidth: 970,
    minHeight: 670,
    show: false,
    center: true,
    autoHideMenuBar: true,
    // alwaysOnTop: true,
    // 移除最大宽高限制，以便全屏模式能够铺满整个屏幕
    titleBarStyle: 'hidden',
    ...(process.platform === 'linux' ? { icon } : {}),
    // ...(process.platform !== 'darwin' ? { titleBarOverlay: true } : {}),
    icon: path.join(__dirname, '../../resources/logo.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false
    }
  })
  if (process.platform == 'darwin') mainWindow.setWindowButtonVisibility(false)

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  // 阻止窗口关闭，改为隐藏到系统托盘
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault()
      mainWindow?.hide()

      // 显示托盘通知
      if (tray) {
        tray.displayBalloon({
          iconType: 'info',
          title: 'Ceru Music',
          content: '已最小化到系统托盘啦，点击托盘图标可重新打开~'
        })
      }
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).then()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).then()
  }
}

ipcMain.handle('service-plugin-selectAndAddPlugin', async (_, type): Promise<any> => {
  try {
    return await pluginService.selectAndAddPlugin(type)
  } catch (error: any) {
    console.error('Error selecting and adding plugin:', error)
    return { error: error.message }
  }
})

ipcMain.handle('service-plugin-addPlugin', async (_, pluginCode, pluginName): Promise<any> => {
  try {
    return await pluginService.addPlugin(pluginCode, pluginName)
  } catch (error: any) {
    console.error('Error adding plugin:', error)
    return { error: error.message }
  }
})

ipcMain.handle('service-plugin-getPluginById', async (_, id): Promise<any> => {
  try {
    return pluginService.getPluginById(id)
  } catch (error: any) {
    console.error('Error getting plugin by id:', error)
    return { error: error.message }
  }
})

ipcMain.handle('service-plugin-loadAllPlugins', async (): Promise<any> => {
  try {
    // 使用新的 getPluginsList 方法，但保持 API 兼容性
    return await pluginService.getPluginsList()
  } catch (error: any) {
    console.error('Error loading all plugins:', error)
    return { error: error.message }
  }
})

ipcMain.handle('service-plugin-getPluginLog', async (_, pluginId): Promise<any> => {
  try {
    return await pluginService.getPluginLog(pluginId)
  } catch (error: any) {
    console.error('Error getting plugin log:', error)
    return { error: error.message }
  }
})

ipcMain.handle('service-plugin-uninstallPlugin', async (_, pluginId): Promise<any> => {
  try {
    return await pluginService.uninstallPlugin(pluginId)
  } catch (error: any) {
    console.error('Error uninstalling plugin:', error)
    return { error: error.message }
  }
})

ipcMain.handle('service-music-request', async (_, api, args) => {
  return await musicService.request(api, args)
})

aiEvents(mainWindow)

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // Set app user model id for windows

  electronApp.setAppUserModelId('com.cerulean.music')

  // 初始化插件系统
  try {
    await pluginService.initializePlugins()
    console.log('插件系统初始化完成')
  } catch (error) {
    console.error('插件系统初始化失败:', error)
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // IPC test
  ipcMain.on('ping', () => console.log('pong'))

  // 窗口控制 IPC 处理
  ipcMain.on('window-minimize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      window.minimize()
    }
  })

  ipcMain.on('window-maximize', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      if (window.isMaximized()) {
        window.unmaximize()
      } else {
        window.maximize()
      }
    }
  })

  ipcMain.on('window-close', () => {
    const window = BrowserWindow.getFocusedWindow()
    if (window) {
      window.close()
    }
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

// 当所有窗口关闭时不退出应用，因为我们有系统托盘
app.on('window-all-closed', () => {
  // 在 macOS 上，应用通常会保持活跃状态
  // 在其他平台上，我们也保持应用运行，因为有系统托盘
})

// 应用退出前的清理
app.on('before-quit', () => {
  isQuitting = true
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.
