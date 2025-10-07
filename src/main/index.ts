import { app, shell, BrowserWindow, ipcMain, Tray, Menu, screen, powerSaveBlocker } from 'electron'
import { configManager } from './services/ConfigManager'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/logo.png?asset'
import path from 'node:path'
import pluginService from './services/plugin'
import aiEvents from './events/ai'
import './services/musicSdk/index'
// 获取单实例锁
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果没有获得锁，说明已经有实例在运行，退出当前实例
  app.quit()
} else {
  // 当第二个实例尝试启动时，聚焦到第一个实例的窗口
  app.on('second-instance', () => {
    // 如果有窗口存在，聚焦到该窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
  })
}

// import wy from './utils/musicSdk/wy/index'
// import kg from './utils/musicSdk/kg/index'
// wy.hotSearch.getList().then((res) => {
//   console.log(res)
// })
// kg.hotSearch.getList().then((res) => {
//   console.log(res)
// })
let tray: Tray | null = null
let psbId: number | null = null
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
  // 获取保存的窗口位置和大小
  const savedBounds = configManager.getWindowBounds()

  // 获取屏幕尺寸
  const primaryDisplay = screen.getPrimaryDisplay()
  // 使用完整屏幕尺寸而不是工作区域，以支持真正的全屏模式
  const { width: screenWidth, height: screenHeight } = primaryDisplay.size

  // 默认窗口配置
  const defaultOptions = {
    width: 1100,
    height: 750,
    minWidth: 1100,
    minHeight: 670,
    maxWidth: screenWidth,
    maxHeight: screenHeight,
    show: false,
    center: !savedBounds, // 如果有保存的位置，则不居中
    autoHideMenuBar: true,
    titleBarStyle: 'hidden' as const,
    ...(process.platform === 'linux' ? { icon } : {}),
    icon: path.join(__dirname, '../../resources/logo.ico'),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false,
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      backgroundThrottling: false
    }
  }

  // 如果有保存的窗口位置和大小，则使用保存的值
  if (savedBounds) {
    Object.assign(defaultOptions, savedBounds)
  }

  // Create the browser window.
  mainWindow = new BrowserWindow(defaultOptions)
  if (process.platform == 'darwin') mainWindow.setWindowButtonVisibility(false)

  // 监听窗口移动和调整大小事件，保存窗口位置和大小
  mainWindow.on('moved', () => {
    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
      const bounds = mainWindow.getBounds()
      configManager.saveWindowBounds(bounds)
    }
  })

  mainWindow.on('resized', () => {
    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
      const bounds = mainWindow.getBounds()

      // 获取当前屏幕尺寸
      const { screen } = require('electron')
      const currentDisplay = screen.getDisplayMatching(bounds)
      const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize

      // 确保窗口不超过屏幕尺寸
      let needResize = false
      const newBounds = { ...bounds }

      if (bounds.width > screenWidth) {
        newBounds.width = screenWidth
        needResize = true
      }

      if (bounds.height > screenHeight) {
        newBounds.height = screenHeight
        needResize = true
      }

      // 如果需要调整大小，应用新的尺寸
      if (needResize) {
        mainWindow.setBounds(newBounds)
      }

      configManager.saveWindowBounds(newBounds)
    }
  })

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

ipcMain.handle('service-plugin-downloadAndAddPlugin', async (_, url, type): Promise<any> => {
  try {
    return await pluginService.downloadAndAddPlugin(url, type)
  } catch (error: any) {
    console.error('Error downloading and adding plugin:', error)
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

// 获取应用版本号
ipcMain.handle('get-app-version', () => {
  return app.getVersion()
})

aiEvents(mainWindow)
import './events/musicCache'
import './events/songList'
import './events/directorySettings'
import './events/pluginNotice'
import { registerAutoUpdateEvents, initAutoUpdateForWindow } from './events/autoUpdate'

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows - 确保与 electron-builder.yml 中的 appId 一致
  electronApp.setAppUserModelId('com.cerumusic.app')

  // 在 Windows 上设置应用程序名称，帮助 SMTC 识别
  if (process.platform === 'win32') {
    app.setAppUserModelId('com.cerumusic.app')
    // 设置应用程序名称
    app.setName('澜音')
  }

  setTimeout(async () => {
    // 初始化插件系统
    try {
      await pluginService.initializePlugins()
      console.log('插件系统初始化完成')
    } catch (error) {
      console.error('插件系统初始化失败:', error)
    }
  }, 1000)

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

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

  createWindow()
  createTray()

  // 注册自动更新事件
  registerAutoUpdateEvents()
  ipcMain.on('startPing', () => {
    if (ping) clearInterval(ping)
    console.log('start-----开始')
    startPing()
  })
  ipcMain.on('stopPing', () => {
    clearInterval(ping)
  })
  // 初始化自动更新器
  if (mainWindow) {
    initAutoUpdateForWindow(mainWindow)
  }

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

let ping: NodeJS.Timeout
function startPing() {
  let interval = 3000

  ping = setInterval(() => {
    if (mainWindow) {
      mainWindow.webContents
        .executeJavaScript(
          `
    (function() {
      const audio = document.getElementById("globaAudio");
      if(!audio) return { playing:false, ended: false };

      if(audio.ended) return { playing:false, ended: true };

      return { playing: !audio.paused, ended: false, currentTime: audio.currentTime, duration: audio.duration };
    })()
    `
        )
        .then((res) => {
          console.log(res)
          if (res.duration - res.currentTime <= 20) {
            clearInterval(ping)
            interval = 500
            ping = setInterval(() => {
              if (mainWindow) {
                mainWindow.webContents
                  .executeJavaScript(
                    `
                  (function() {
                    const audio = document.getElementById("globaAudio");
                    if(!audio) return { playing:false, ended: false };

                    if(audio.ended) return { playing:false, ended: true };

                    return { playing: !audio.paused, ended: false, currentTime: audio.currentTime, duration: audio.duration };
                  })()
                `
                  )
                  .then((res) => {
                    console.log(res)
                    if (res && res.ended) {
                      mainWindow?.webContents.send('song-ended')
                      console.log('next song')
                      clearInterval(ping)
                    }
                  })
                  .catch((err) => console.warn(err))
              }
            }, interval)
          }
        })
        .catch((err) => console.warn(err))
    }
  }, interval)
}
