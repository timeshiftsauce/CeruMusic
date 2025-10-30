import { app, shell, BrowserWindow, ipcMain, screen, Rectangle, Display } from 'electron'
import { configManager } from './services/ConfigManager'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/logo.png?asset'
import path from 'node:path'
import InitEventServices from './events'

import './events/musicCache'
import './events/songList'
import './events/directorySettings'
import './events/pluginNotice'

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

let mainWindow: BrowserWindow | null = null

/**
 * 根据窗口当前所在的显示器，动态更新窗口的最大尺寸限制。
 * 这样可以确保窗口在任何显示器上都能正常最大化或全屏。
 * @param {BrowserWindow} win - 要更新的窗口实例
 */
function updateWindowMaxLimits(win: BrowserWindow | null): void {
  if (!win) return

  // 1. 获取窗口的当前边界 (bounds)
  const currentBounds: Rectangle = win.getBounds()

  // 2. 查找包含该边界的显示器
  const currentDisplay: Display = screen.getDisplayMatching(currentBounds)

  // 3. 获取该显示器的完整尺寸 (full screen size)
  const { width: currentScreenWidth, height: currentScreenHeight } = currentDisplay.size

  // 4. 应用新的最大尺寸限制
  // 移除 maxWidth/maxHeight 上的硬限制，使其能够最大化到当前屏幕的尺寸。
  // 注意：设置为 0, 0 意味着没有最小限制，我们只关注最大限制。
  win.setMaximumSize(currentScreenWidth, currentScreenHeight)
}

function createWindow(): void {
  // 获取保存的窗口位置和大小
  const savedBounds = configManager.getWindowBounds()

  // 默认窗口配置
  const defaultOptions = {
    width: 1100,
    height: 750,
    minWidth: 1100,
    minHeight: 670,
    // ⚠️ 关键修改 1: 移除 maxWidth 和 maxHeight 的硬编码限制
    // maxWidth: screenWidth,
    // maxHeight: screenHeight,
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

  // ⚠️ 关键修改 2: 监听 'moved' 事件，动态更新最大尺寸
  mainWindow.on('moved', () => {
    // 当窗口移动时，确保最大尺寸限制随屏幕变化
    updateWindowMaxLimits(mainWindow)

    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
      const bounds = mainWindow.getBounds()
      configManager.saveWindowBounds(bounds)
    }
  })

  // ⚠️ 关键修改 3: 窗口创建后立即应用一次最大尺寸限制
  updateWindowMaxLimits(mainWindow)

  mainWindow.on('resized', () => {
    if (mainWindow && !mainWindow.isMaximized() && !mainWindow.isFullScreen()) {
      const bounds = mainWindow.getBounds()

      // 获取当前屏幕尺寸 (已在文件顶部导入 screen，无需 require)
      const currentDisplay = screen.getDisplayMatching(bounds)
      // 使用 workAreaSize 避免窗口超出任务栏/Dock
      const { width: screenWidth, height: screenHeight } = currentDisplay.workAreaSize

      // 确保窗口不超过屏幕工作区域尺寸
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
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })
  InitEventServices(mainWindow)
  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).then()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).then()
  }
}

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

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  createWindow()

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

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

let ping: NodeJS.Timeout
function startPing() {
  // 已迁移到 Howler，不再使用 DOM <audio> 轮询。
  // 如需主进程感知播放结束，请在渲染进程通过 IPC 主动通知。
  if (ping) {
    clearInterval(ping)
  }
  ping = setInterval(() => {
    // 保留占位，避免调用方报错；不再做任何轮询。
    // 可在此处监听自定义 IPC 事件以扩展行为。
    clearInterval(ping)
  }, 1000)
}
