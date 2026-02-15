import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  screen,
  Rectangle,
  Display,
  Tray,
  Menu
} from 'electron'
import { configManager } from './services/ConfigManager'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/logo.png?asset'
import path from 'node:path'
import InitEventServices from './events'

import lyricWindow from './windows/lyric-window'

import './events/musicCache'
import './events/songList'
import './events/directorySettings'
import './events/pluginNotice'
import initLyricIpc from './events/lyric'
import { initPluginNotice } from './events/pluginNotice'
import './events/localMusic'
import fs from 'node:fs'
import { initHotkeyService } from './services/hotkeys'
import { deepLinkRouter } from './router'
import { setupDeepLinks } from './router/routes'

// Initialize deep link routes
setupDeepLinks()

let pendingPlaylistFiles: string[] = []
const queueOpenPlaylist = (filePath: string) => {
  if (!filePath) return
  if (!/\.(cmpl|cpl)$/i.test(filePath)) return
  if (!pendingPlaylistFiles.includes(filePath)) pendingPlaylistFiles.push(filePath)
  if (mainWindow && !mainWindow.webContents.isLoadingMainFrame()) {
    // 已加载，立即分发并清空队列
    pendingPlaylistFiles.forEach((p) => mainWindow!.webContents.send('open-playlist-file', p))
    pendingPlaylistFiles = []
  }
}
process.on('unhandledRejection', (reason: any) => {
  console.error('Unhandled Rejection:', reason?.message || reason)
})

process.on('uncaughtException', (error: any) => {
  console.error('Uncaught Exception:', error?.message || error)
})

// 注册自定义协议
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient('cerumusic', process.execPath, [path.resolve(process.argv[1])])
  }
} else {
  app.setAsDefaultProtocolClient('cerumusic')
}

// 获取单实例锁
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  // 如果没有获得锁，说明已经有实例在运行，退出当前实例
  app.quit()
} else {
  // 当第二个实例尝试启动时，聚焦到第一个实例的窗口
  app.on('second-instance', (_event, argv) => {
    // 如果有窗口存在，聚焦到该窗口
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
    const argPath = argv?.find((a) => /\.(cmpl|cpl)$/i.test(a))
    if (argPath) queueOpenPlaylist(argPath)

    // 处理 Deep Link (Windows/Linux)
    const protocolUrl = argv?.find((arg) => arg.startsWith('cerumusic://'))
    if (protocolUrl && mainWindow) {
      deepLinkRouter.match(mainWindow, protocolUrl)
    }
  })
}

let mainWindow: BrowserWindow | null = null
let tray: Tray | null = null
let trayLyricLocked = false

function updateTrayMenu() {
  const lyricWin = lyricWindow.getWin()
  const isVisible = !!lyricWin && lyricWin.isVisible()
  const toggleLyricLabel = isVisible ? '隐藏桌面歌词' : '显示桌面歌词'
  const toggleLockLabel = trayLyricLocked ? '解锁桌面歌词' : '锁定桌面歌词'

  const contextMenu = Menu.buildFromTemplate([
    {
      label: toggleLyricLabel,
      click: () => {
        const target = !isVisible
        ipcMain.emit('change-desktop-lyric', null, target)
      }
    },
    {
      label: toggleLockLabel,
      click: () => {
        const next = !trayLyricLocked
        ipcMain.emit('toogleDesktopLyricLock', null, next)
      }
    },
    { type: 'separator' },
    {
      label: '显示主窗口',
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
        mainWindow?.webContents.send('music-control')
      }
    },
    { type: 'separator' },
    {
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])
  tray?.setContextMenu(contextMenu)
}

function setupTray() {
  // 全局单例防重复（热重载/多次执行保护）
  const g: any = global as any
  if (g.__ceru_tray__) {
    try {
      g.__ceru_tray__.destroy()
    } catch {}
    g.__ceru_tray__ = null
  }
  if (tray) {
    try {
      tray.destroy()
    } catch {}
    tray = null
  }

  const iconPath = path.join(__dirname, '../../resources/logo.ico')
  tray = new Tray(iconPath)
  tray.setToolTip('Ceru Music')
  updateTrayMenu()

  // 左键单击切换主窗口显示
  tray.on('click', () => {
    if (!mainWindow) return
    if (mainWindow.isVisible()) {
      mainWindow.hide()
    } else {
      mainWindow.show()
      mainWindow.focus()
    }
  })

  // 防重复注册 IPC 监听（仅注册一次）
  if (!g.__ceru_tray_ipc_bound__) {
    ipcMain.on('toogleDesktopLyricLock', (_e, isLock: boolean) => {
      trayLyricLocked = !!isLock
      updateTrayMenu()
    })
    ipcMain.on('change-desktop-lyric', () => {
      updateTrayMenu()
    })
    g.__ceru_tray_ipc_bound__ = true
  }

  // 记录全局托盘句柄
  g.__ceru_tray__ = tray

  app.once('before-quit', () => {
    try {
      tray?.destroy()
    } catch {}
    tray = null
    g.__ceru_tray__ = null
  })
}

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

import { downloadManager } from './services/DownloadManager'
import pluginService from './services/plugin/index'
import musicSdkService from './services/musicSdk/service'
import { musicCacheService } from './services/musicCache'

function setupDownloadManager() {
  // Setup URL Fetcher for lazy loading
  downloadManager.setUrlFetcher(async (task) => {
    if (!task.pluginId || !task.songInfo || !task.quality) {
      throw new Error('Task missing required info for fetching URL')
    }

    const usePlugin = pluginService.getPluginById(task.pluginId)
    if (!usePlugin) throw new Error('Plugin not found')

    const source = task.songInfo.source
    const songId = `${task.songInfo.name}-${task.songInfo.singer}-${source}-${task.quality}`

    // Check cache
    const cachedUrl = await musicCacheService.getCachedMusicUrl(songId)
    if (cachedUrl) return cachedUrl

    // Fetch from plugin
    const originalUrl = await usePlugin.getMusicUrl(source, task.songInfo, task.quality)
    if (typeof originalUrl === 'object')
      throw new Error('Failed to get URL: ' + JSON.stringify(originalUrl))

    // Cache result
    musicCacheService.cacheMusic(songId, originalUrl).catch(console.error)

    return originalUrl
  })

  // Setup Lyric Fetcher for lazy loading
  downloadManager.setLyricFetcher(async (task) => {
    if (!task.songInfo) {
      throw new Error('Task missing required info for fetching lyric')
    }

    const source = task.songInfo.source
    const songId = `${task.songInfo.name}-${task.songInfo.singer}-${source}`

    // Check cache
    const cachedLyric = await musicCacheService.getCachedLyric(songId)
    if (cachedLyric) return cachedLyric

    let lyric: string | null = null

    // 2. Fallback to built-in SDK if no lyric found yet and source is supported
    if (!lyric && ['wy', 'kw', 'tx', 'mg', 'kg'].includes(source)) {
      try {
        const api = musicSdkService(source)
        const result = await api.getLyric({ songInfo: task.songInfo })
        if (result && !result.error) {
          lyric = result.lyric || result.lrc || null
        } else if (result && result.error) {
          console.warn(`Built-in SDK getLyric error for ${source}:`, result.error)
        }
      } catch (error) {
        console.warn(`Built-in SDK getLyric exception for ${source}:`, error)
      }
    }

    if (lyric && typeof lyric === 'object') {
      throw new Error('Failed to get lyric: ' + JSON.stringify(lyric))
    }

    // Cache result
    if (lyric) {
      musicCacheService.cacheLyric(songId, lyric).catch(console.error)
    }

    return lyric
  })

  // Setup Event Forwarding
  const forwardEvent = (eventName: string, task: any) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send(`download:${eventName}`, task)
    }
  }

  downloadManager.on('task-added', (task) => forwardEvent('task-added', task))
  downloadManager.on('task-progress', (task) => forwardEvent('task-progress', task))
  downloadManager.on('task-status-changed', (task) => forwardEvent('task-status-changed', task))
  downloadManager.on('task-completed', (task) => forwardEvent('task-completed', task))
  downloadManager.on('task-error', (task) => forwardEvent('task-error', task))
  downloadManager.on('task-retrying', (task) => forwardEvent('task-retrying', task))
  downloadManager.on('task-deleted', (taskId) => forwardEvent('task-deleted', taskId))
  downloadManager.on('tasks-reset', (tasks) => forwardEvent('tasks-reset', tasks))

  // Setup IPC Handlers
  ipcMain.handle('download:get-tasks', () => {
    return downloadManager.getTasks()
  })
  ipcMain.handle('download:pause-task', (_, taskId) => {
    downloadManager.pauseTask(taskId)
  })
  ipcMain.handle('download:resume-task', (_, taskId) => {
    downloadManager.resumeTask(taskId)
  })
  ipcMain.handle('download:cancel-task', (_, taskId) => {
    downloadManager.cancelTask(taskId)
  })
  ipcMain.handle('download:delete-task', (_, taskId, deleteFile) => {
    downloadManager.deleteTask(taskId, deleteFile)
  })
  ipcMain.handle('download:retry-task', (_, taskId) => {
    downloadManager.retryTask(taskId)
  })
  ipcMain.handle('download:open-file-location', (_, filePath) => {
    shell.showItemInFolder(filePath)
  })
  ipcMain.handle('download:set-max-concurrent', (_, max) => {
    downloadManager.setMaxConcurrentDownloads(max)
  })
  ipcMain.handle('download:get-max-concurrent', () => {
    return downloadManager.getMaxConcurrentDownloads()
  })
  ipcMain.handle('download:validate-files', async () => {
    await downloadManager.validateFiles()
    return downloadManager.getTasks()
  })
  ipcMain.handle('download:clear-tasks', (_, type) => {
    downloadManager.clearTasks(type)
  })
  ipcMain.handle('download:pause-all-tasks', () => {
    downloadManager.pauseAllTasks()
  })
  ipcMain.handle('download:resume-all-tasks', () => {
    downloadManager.resumeAllTasks()
  })
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

  initHotkeyService(mainWindow)

  // 注册生产环境调试快捷键 Ctrl+S+F11
  let isSPressed = false
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.code === 'KeyS') {
      isSPressed = input.type === 'keyDown'
    }
    if (input.key === 'F12' && input.type === 'keyDown' && input.control && isSPressed) {
      event.preventDefault()
      if (mainWindow?.webContents.isDevToolsOpened()) {
        mainWindow?.webContents.closeDevTools()
      } else {
        mainWindow?.webContents.openDevTools()
      }
    }
  })
  mainWindow.on('blur', () => {
    isSPressed = false
  })

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

  // 拦截 Logto 认证请求，使用系统浏览器打开
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('auth.shiqianjiang.cn')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url).then()
    return { action: 'deny' }
  })
  InitEventServices(mainWindow)
  initPluginNotice(mainWindow)
  // 设置背景节流
  mainWindow.webContents.setBackgroundThrottling(false)

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).then()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).then()
  }
}

import { registerAutoUpdateEvents, initAutoUpdateForWindow } from './events/autoUpdate'

// 注册自动更新事件 - 尽早注册以避免时序问题
registerAutoUpdateEvents()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
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

  // Initialize plugins before starting download manager
  try {
    console.log('Initializing plugins...')
    await pluginService.initializePlugins()
    console.log('Plugins initialized.')
  } catch (error) {
    console.error('Failed to initialize plugins:', error)
  }

  createWindow()
  setupDownloadManager()
  downloadManager.start()

  // 仅在主进程初始化一次托盘
  setupTray()

  ipcMain.on('startPing', () => {
    if (ping) clearInterval(ping)
    console.log('start-----开始')
    startPing()
  })
  ipcMain.on('stopPing', () => {
    clearInterval(ping)
  })
  // 初始化自动更新器 桌面歌词
  if (mainWindow) {
    initAutoUpdateForWindow(mainWindow)
    lyricWindow.create()
    initLyricIpc(mainWindow)
    const startArg = process.argv?.find((a) => /\.(cmpl|cpl)$/i.test(a))
    if (startArg) queueOpenPlaylist(startArg)
    mainWindow.webContents.on('did-finish-load', () => {
      // 页面加载完成后分发并清空队列
      pendingPlaylistFiles.forEach((p) => mainWindow!.webContents.send('open-playlist-file', p))
      pendingPlaylistFiles = []
    })
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// macOS 双击文件打开
app.on('open-file', (event, filePath) => {
  event.preventDefault()
  queueOpenPlaylist(filePath)
})

// macOS Deep Link
app.on('open-url', (event, url) => {
  event.preventDefault()
  if (mainWindow) {
    deepLinkRouter.match(mainWindow, url)
  }
})

// 读取文件内容供渲染层解析
ipcMain.handle('fs:read-file', async (_event, path: string) => {
  try {
    const buf = await fs.promises.readFile(path)
    return buf
  } catch (err: any) {
    return Promise.reject(err?.message || String(err))
  }
})

// 查询并清空待处理的打开文件队列
ipcMain.handle('get-pending-open-playlist-files', async () => {
  const list = [...pendingPlaylistFiles]
  pendingPlaylistFiles = []
  return list
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
