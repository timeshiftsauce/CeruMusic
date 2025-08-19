import { app, shell, BrowserWindow, ipcMain, Tray } from 'electron'
import { is } from '@electron-toolkit/utils'
import { join } from 'path'

import icon from '../../resources/logo.png?asset'
import path from 'node:path'
import musicService from './services/music'
import pluginService from './services/plugin'
import useWindow from './window/index'

import aiEvents from './events/ai'

let mainWindow: BrowserWindow | null = null
// 使用对象包装布尔值，以便通过引用传递
const isQuittingState = { value: false }
const tray: { value: Tray | null } = { value: null }

function createWindow(): void {
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
    if (!isQuittingState.value) {
      event.preventDefault()
      mainWindow?.hide()

      // 显示托盘通知
      if (tray.value) {
        tray.value.displayBalloon({
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

ipcMain.handle('service-plugin-addPlugin', async (_, pluginCode, pluginName): Promise<any> => {
  return await (pluginService as any).addPlugin(pluginCode, pluginName)
})

ipcMain.handle('service-plugin-getPluginById', async (_, id): Promise<any> => {
  return await (pluginService as any).getPluginById(id)
})

// eslint-disable-next-line @typescript-eslint/no-unused-vars
ipcMain.handle('service-plugin-loadAllPlugins', async (_): Promise<any> => {
  return await (pluginService as any).getPluginById()
})

ipcMain.handle('service-music-request', async (_, api, args) => {
  return await musicService.request(api, args)
})

aiEvents(mainWindow)

// 应用退出前的清理
app.on('before-quit', () => {
  isQuittingState.value = true
})

// 创建窗口并注册window服务
app.whenReady().then(() => {
  // 先创建窗口
  createWindow()
  // 然后注册window服务，确保mainWindow已经创建
  useWindow(() => {}, ipcMain, app, mainWindow, isQuittingState, tray)
})
