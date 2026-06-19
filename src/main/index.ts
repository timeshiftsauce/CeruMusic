import {
  app,
  shell,
  BrowserWindow,
  ipcMain,
  screen,
  Rectangle,
  Display,
  Tray,
  Menu,
  desktopCapturer,
  session,
  nativeImage,
  clipboard,
  type WebContents,
  BrowserWindowConstructorOptions
} from 'electron'
import { configManager } from './services/ConfigManager'
import menuBarLyric from './services/menuBarLyric'
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
import { thumbarService } from './services/thumbarService'
import {
  setupDeepLinks,
  consumePendingShareIds,
  consumePendingPlaylistShareIds,
  consumePendingLtCodes
} from './router/routes'

// Initialize deep link routes
setupDeepLinks()

let pendingPlaylistFiles: string[] = []
const MEDIA_CAPTURE_GRANT_TTL_MS = 10_000
const MEDIA_CAPTURE_REQUEST_BUDGET = 4

type MediaCaptureGrant = {
  expiresAt: number
  allowScreenSourceLookup: boolean
  remainingMediaRequests: number
}

const mediaCaptureGrants = new Map<number, MediaCaptureGrant>()

const purgeExpiredMediaCaptureGrants = (): void => {
  const now = Date.now()
  for (const [webContentsId, grant] of mediaCaptureGrants.entries()) {
    if (grant.expiresAt <= now) {
      mediaCaptureGrants.delete(webContentsId)
    }
  }
}

const getMediaCaptureGrant = (webContentsId: number): MediaCaptureGrant | null => {
  purgeExpiredMediaCaptureGrants()
  return mediaCaptureGrants.get(webContentsId) || null
}

const isMainWindowWebContents = (webContents: WebContents | null | undefined): boolean => {
  return (
    !!mainWindow &&
    !!webContents &&
    !mainWindow.isDestroyed() &&
    mainWindow.webContents.id === webContents.id
  )
}

const authorizeMediaCaptureForWebContents = (webContentsId: number): void => {
  mediaCaptureGrants.set(webContentsId, {
    expiresAt: Date.now() + MEDIA_CAPTURE_GRANT_TTL_MS,
    allowScreenSourceLookup: true,
    remainingMediaRequests: MEDIA_CAPTURE_REQUEST_BUDGET
  })
}

const consumeScreenSourceLookupGrant = (webContentsId: number): boolean => {
  const grant = getMediaCaptureGrant(webContentsId)
  if (!grant || !grant.allowScreenSourceLookup) return false
  grant.allowScreenSourceLookup = false
  if (grant.remainingMediaRequests <= 0) {
    mediaCaptureGrants.delete(webContentsId)
  }
  return true
}

// const hasMediaPermissionGrant = (webContentsId: number): boolean => {
//   const grant = getMediaCaptureGrant(webContentsId)
//   return !!grant && grant.remainingMediaRequests > 0
// }

// const consumeMediaPermissionGrant = (webContentsId: number): boolean => {
//   const grant = getMediaCaptureGrant(webContentsId)
//   if (!grant || grant.remainingMediaRequests <= 0) return false
//   grant.remainingMediaRequests -= 1
//   if (!grant.allowScreenSourceLookup && grant.remainingMediaRequests <= 0) {
//     mediaCaptureGrants.delete(webContentsId)
//   }
//   return true
// }

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
const MAC_TRAY_GUID = 'f4f8a5d8-9eb2-4f98-8fd7-3a3d5ec9b2cf'

const sendPlaybackControl = (channel: 'music-control' | 'playPrev' | 'playNext'): void => {
  if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
  mainWindow.webContents.send(channel)
}

const isMacStatusBarLyricTrayInteractive = (): boolean =>
  process.platform !== 'darwin' || menuBarLyric.isEnabled()

function updateTrayMenu(): void {
  if (!tray) return
  if (!isMacStatusBarLyricTrayInteractive()) {
    tray.setToolTip('')
    tray.setContextMenu(null)
    return
  }

  tray.setToolTip('Ceru Music')
  const lyricWin = lyricWindow.getWin()
  const isVisible = !!lyricWin && lyricWin.isVisible()
  const toggleLyricLabel = isVisible ? '隐藏桌面歌词' : '显示桌面歌词'
  const toggleLockLabel = trayLyricLocked ? '解锁桌面歌词' : '锁定桌面歌词'

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '上一首',
      click: () => {
        sendPlaybackControl('playPrev')
      }
    },
    {
      label: '播放/暂停',
      click: () => {
        sendPlaybackControl('music-control')
      }
    },
    {
      label: '下一首',
      click: () => {
        sendPlaybackControl('playNext')
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
    { type: 'separator' },
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
      label: '退出',
      click: () => {
        app.quit()
      }
    }
  ])
  tray?.setContextMenu(contextMenu)
}

function setupTray(): void {
  // 全局单例：复用已有的托盘实例（热重载/多次执行保护）
  const g: any = global as any

  if (g.__ceru_tray__) {
    tray = g.__ceru_tray__
  } else {
    const iconName = process.platform === 'win32' ? 'logo.ico' : 'logo.png'
    const iconPath = path.join(__dirname, `../../resources/${iconName}`)
    // macOS 上使用空 image + GUID 实现菜单栏歌词的标题持久化
    const trayImage = process.platform === 'darwin' ? nativeImage.createEmpty() : iconPath
    tray = process.platform === 'darwin' ? new Tray(trayImage, MAC_TRAY_GUID) : new Tray(trayImage)
    g.__ceru_tray__ = tray
  }

  menuBarLyric.setTray(tray)
  menuBarLyric.onEnabledChange(() => {
    updateTrayMenu()
  })
  updateTrayMenu()

  tray?.removeAllListeners('click')

  // 左键单击：mac 上弹菜单（受状态栏歌词开关约束），其他平台切换主窗口显示
  tray?.on('click', () => {
    if (process.platform === 'darwin') {
      if (!isMacStatusBarLyricTrayInteractive()) return
      tray?.popUpContextMenu()
      return
    }
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

  if (!g.__ceru_tray_before_quit_bound__) {
    app.once('before-quit', () => {
      menuBarLyric.onEnabledChange(null)
      menuBarLyric.setTray(null)
      // macOS: 不要 destroy 托盘 —— 让 AppKit 在进程退出时自然销毁 NSStatusItem,
      // GUID 绑定的位置才会被刷到 user defaults。手动 destroy 会在保存前移除 item,
      // 导致下次启动时 Cmd+拖动调好的位置丢失。
      if (process.platform !== 'darwin') {
        try {
          tray?.destroy()
        } catch {}
        tray = null
        g.__ceru_tray__ = null
      }
    })
    g.__ceru_tray_before_quit_bound__ = true
  }
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

/**
 * 网易云式窗口化全屏（borderless windowed fullscreen）。
 * 不走 OS 原生 setFullScreen（在 Windows 配合 titleBarStyle:'hidden' 会被 DWM 边框压缩 16px），
 * 改为：setBounds 到 display.bounds + alwaysOnTop 覆盖任务栏。
 * 进入前快照窗口状态，退出后完整还原。
 */
const fsState = {
  active: false,
  bounds: null as Rectangle | null,
  maxSize: null as { width: number; height: number } | null,
  resizable: null as boolean | null,
  movable: null as boolean | null,
  alwaysOnTop: null as boolean | null,
  wasMaximized: false
}

function isWindowedFullScreenActive(): boolean {
  return fsState.active
}

function enterWindowedFullScreen(win: BrowserWindow): void {
  if (fsState.active) return

  fsState.wasMaximized = win.isMaximized()
  if (fsState.wasMaximized) win.unmaximize()

  fsState.bounds = win.getBounds()
  const [maxW, maxH] = win.getMaximumSize()
  fsState.maxSize = { width: maxW, height: maxH }
  fsState.resizable = win.isResizable()
  fsState.movable = win.isMovable()
  fsState.alwaysOnTop = win.isAlwaysOnTop()

  // 必须先置 active：setBounds 会立刻触发 resized 事件，guard 才能跳过
  fsState.active = true

  win.setMaximumSize(0, 0)
  win.setResizable(false)
  win.setMovable(false)
  const display = screen.getDisplayMatching(fsState.bounds)
  win.setBounds(display.bounds)
  win.setAlwaysOnTop(true) // 盖住任务栏

  win.webContents.send('app-fullscreen-changed', true)
}

function exitWindowedFullScreen(win: BrowserWindow): void {
  if (!fsState.active) return

  // 先把 active 置 false 之前，先调用 setBounds 等会触发 resized；
  // 这里反过来：先恢复，最后再置 false，避免 resized 中途看到 active=false 误处理
  win.setAlwaysOnTop(fsState.alwaysOnTop ?? false)
  win.setMovable(fsState.movable ?? true)
  win.setResizable(fsState.resizable ?? true)
  if (fsState.maxSize) {
    win.setMaximumSize(fsState.maxSize.width, fsState.maxSize.height)
  }
  if (fsState.bounds) win.setBounds(fsState.bounds)

  fsState.active = false

  if (fsState.wasMaximized) win.maximize()

  fsState.bounds = null
  fsState.maxSize = null
  fsState.resizable = null
  fsState.movable = null
  fsState.alwaysOnTop = null
  fsState.wasMaximized = false

  win.webContents.send('app-fullscreen-changed', false)
}

function toggleAppFullScreen(win: BrowserWindow | null): void {
  if (!win) return
  if (fsState.active) exitWindowedFullScreen(win)
  else enterWindowedFullScreen(win)
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
    const songIdBase = `${task.songInfo.name}-${task.songInfo.singer}-${source}`
    const preferWordByWord = task.tagWriteOptions?.lyricFormat === 'word-by-word'
    const cacheKey = `${songIdBase}:${preferWordByWord ? 'word' : 'lrc'}`

    // Check cache
    const cachedLyric = await musicCacheService.getCachedLyric(cacheKey)
    if (cachedLyric) return cachedLyric

    let lyric: string | null = null

    // 2. Fallback to built-in SDK if no lyric found yet and source is supported
    if (!lyric && ['wy', 'kw', 'tx', 'mg', 'kg'].includes(source)) {
      try {
        const api = musicSdkService(source)
        const result = await api.getLyric({
          songInfo: task.songInfo,
          useFormat: task.tagWriteOptions?.lyricFormat || 'lrc'
        })

        if (result && !result.error) {
          if (typeof result === 'string') {
            lyric = result
          } else {
            const cr = (result as any).crlyric || (result as any).cr_lyric || null
            const std = (result as any).lyric || (result as any).lrc || null
            if (preferWordByWord) {
              lyric = (cr as any) || (std as any) || null
            } else {
              lyric = (std as any) || (cr as any) || null
            }
            // 若同时拿到两种格式，分别缓存以便下次命中正确偏好
            if (cr && typeof cr === 'string') {
              const wordKey = `${songIdBase}:word`
              musicCacheService.cacheLyric(wordKey, cr as string).catch(() => {})
            }
            if (std && typeof std === 'string') {
              const lrcKey = `${songIdBase}:lrc`
              musicCacheService.cacheLyric(lrcKey, std as string).catch(() => {})
            }
          }
        } else if (result && (result as any).error) {
          console.warn(`Built-in SDK getLyric error for ${source}:`, (result as any).error)
        }
      } catch (error) {
        console.warn(`Built-in SDK getLyric exception for ${source}:`, error)
      }
    }

    if (lyric && typeof lyric === 'object') {
      throw new Error('Failed to get lyric: ' + JSON.stringify(lyric))
    }

    // Cache result（按偏好维度区分缓存键）
    if (lyric) {
      musicCacheService.cacheLyric(cacheKey, lyric).catch(console.error)
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
  } as BrowserWindowConstructorOptions

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
    // F11 切换窗口化全屏
    if (input.key === 'F11' && input.type === 'keyDown') {
      event.preventDefault()
      toggleAppFullScreen(mainWindow)
    }
    // ESC 退出窗口化全屏
    if (
      input.key === 'Escape' &&
      input.type === 'keyDown' &&
      isWindowedFullScreenActive() &&
      mainWindow
    ) {
      event.preventDefault()
      exitWindowedFullScreen(mainWindow)
    }
  })
  mainWindow.on('blur', () => {
    isSPressed = false
  })

  // ⚠️ 关键修改 2: 监听 'moved' 事件，动态更新最大尺寸
  mainWindow.on('moved', () => {
    if (isWindowedFullScreenActive()) return
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
    if (isWindowedFullScreenActive()) return
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
    // Windows 任务栏缩略图工具栏 —— 必须在窗口可见后调用 setThumbarButtons 才生效
    // (Electron 文档: thumbar buttons only visible while the window is showing)
    // 非 win32 内部 no-op
    try {
      thumbarService.init(mainWindow!)
    } catch (e) {
      console.warn('[thumbar] init failed:', e)
    }
  })

  // IPC：window-toggle-fullscreen 通过 events/index.ts 转发到这里
  ipcMain.removeAllListeners('app-toggle-fullscreen-internal')
  ipcMain.on('app-toggle-fullscreen-internal', () => {
    toggleAppFullScreen(mainWindow)
  })

  // IPC：window-maximize 在我方全屏期间需要先退出再最大化
  ipcMain.removeAllListeners('app-maximize-internal')
  ipcMain.on('app-maximize-internal', () => {
    if (!mainWindow) return
    if (isWindowedFullScreenActive()) {
      exitWindowedFullScreen(mainWindow)
      return
    }
    if (mainWindow.isMaximized()) mainWindow.unmaximize()
    else mainWindow.maximize()
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

  // === 窗口标题 / 任务栏-Dock 进度条 IPC ===
  // 启动时 BrowserWindow 默认 title 来自 index.html 的 <title> 或 productName,
  // 渲染端会在启动后立即推送一次"软件名"作为兜底,有歌时切换为"歌名 - 歌手"。
  // 注意:setProgress 接受 -1 清除 / [0,1] 显示 / paused 显示暂停色(Windows 黄)。
  ipcMain.removeAllListeners('app:set-title')
  ipcMain.on('app:set-title', (_event, title: string) => {
    if (!mainWindow || mainWindow.isDestroyed()) return
    try {
      mainWindow.setTitle(typeof title === 'string' && title ? title : '澜音 Ceru Music')
    } catch (e) {
      console.warn('[app:set-title] failed:', e)
    }
  })
  ipcMain.removeAllListeners('app:set-progress')
  ipcMain.on(
    'app:set-progress',
    (_event, progress: number, options: { paused?: boolean } | null) => {
      if (!mainWindow || mainWindow.isDestroyed()) return
      try {
        // Electron: progress < 0 清除;[0,1] 显示;options.mode='paused' 暂停色
        if (typeof progress !== 'number' || progress < 0) {
          mainWindow.setProgressBar(-1)
          return
        }
        const clamped = Math.max(0, Math.min(1, progress))
        if (options && options.paused) {
          mainWindow.setProgressBar(clamped, { mode: 'paused' })
        } else {
          mainWindow.setProgressBar(clamped)
        }
      } catch (e) {
        console.warn('[app:set-progress] failed:', e)
      }
    }
  )

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL']).then()
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html')).then()
  }
}

import { registerAutoUpdateEvents, initAutoUpdateForWindow } from './events/autoUpdate'
import { cleanupDownloadedInstallers } from './autoUpdate'

// 注册自动更新事件 - 尽早注册以避免时序问题
registerAutoUpdateEvents()

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async () => {
  // 清理上次安装残留的安装包（仅限临时目录）
  try {
    await cleanupDownloadedInstallers()
  } catch {}
  // Set app user model id for windows - 确保与 electron-builder.yml 中的 appId 一致
  // dev 模式用单独 AUMID，避免 electron.exe 被注册为 com.cerumusic.app 污染
  // Windows Toast / SMTC / 任务栏分组的缓存。详见对应排障记录。
  const AUMID = is.dev ? 'com.cerumusic.app.dev' : 'com.cerumusic.app'
  electronApp.setAppUserModelId(AUMID)

  // 在 Windows 上设置应用程序名称，帮助 SMTC 识别
  if (process.platform === 'win32') {
    app.setAppUserModelId(AUMID)
    // 设置应用程序名称
    app.setName('澜音')
  }

  // Default open or close DevTools by F12 in development
  // and ignore CommandOrControl + R in production.
  // see https://github.com/alex8088/electron-toolkit/tree/master/packages/utils
  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  // 拦截 Ctrl+W 和 Alt+F4，模拟点击关闭按钮行为（最小化到托盘或显示关闭对话框）
  app.on('browser-window-created', (_, window) => {
    window.webContents.on('before-input-event', (event, input) => {
      const isCtrlW = input.type === 'keyDown' && input.control && input.key.toLowerCase() === 'w'
      const isAltF4 = input.type === 'keyDown' && input.alt && input.key.toLowerCase() === 'f4'
      if (isCtrlW || isAltF4) {
        event.preventDefault()
        // 发送 window-close IPC，让渲染进程按正常关闭流程处理（显示对话框或最小化到托盘）
        window.webContents.send('window-close-requested')
      }
    })
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

  // 系统音频采集 - 媒体权限授权流程
  // 渲染端必须先调用 system-audio:prepare-capture 拿一次性令牌，否则 PermissionRequest 会被拒
  const mainSession = session.defaultSession
  mainSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') {
      if (!webContents || !isMainWindowWebContents(webContents)) {
        return false
      }
      return true
    }
    return true
  })
  mainSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') {
      if (!webContents || !isMainWindowWebContents(webContents)) {
        callback(false)
        return
      }
      callback(true)
      return
    }
    callback(true)
  })

  // GitCode 防盗链：去掉对 gitcode.com 请求的 Referer
  session.defaultSession.webRequest.onBeforeSendHeaders(
    { urls: ['*://*/*'] },
    (details, callback) => {
      const referer = details.requestHeaders['Referer'] || details.requestHeaders['referer']
      const baseUrl = new URL(details.url).origin
      if (referer) {
        details.requestHeaders['Referer'] = baseUrl
        details.requestHeaders['referer'] = baseUrl
      }
      callback({ requestHeaders: details.requestHeaders })
    }
  )

  setupDownloadManager()
  downloadManager.start()

  // 注册插件限流处理器：插件调用 stopRequests 时暂停所有下载并通知渲染进程
  pluginService.setThrottleHandler((pluginId, reason, duration) => {
    downloadManager.pauseAllTasks()
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('plugin-throttle', { pluginId, reason, duration })
    }
  })

  // 注册插件禁用处理器：插件因崩溃次数过多被永久禁用时通知渲染进程
  pluginService.setDisabledHandler((pluginId, reason) => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('plugin-disabled', { pluginId, reason })
    }
  })

  // 应用退出前销毁所有插件 worker，避免 worker 阻塞主进程退出
  app.on('before-quit', () => {
    pluginService.disposeAll().catch(() => {})
  })

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
    // 冷启动 deep-link（Windows / Linux）：进程参数中包含 cerumusic:// 协议链接
    const startProtocolUrl = process.argv?.find(
      (a) => typeof a === 'string' && a.startsWith('cerumusic://')
    )
    if (startProtocolUrl) {
      console.log('[deep-link] 冷启动检测到协议链接:', startProtocolUrl)
      deepLinkRouter.match(mainWindow, startProtocolUrl)
    }
    mainWindow.webContents.on('did-finish-load', () => {
      // 页面加载完成后分发并清空队列
      pendingPlaylistFiles.forEach((p) => mainWindow!.webContents.send('open-playlist-file', p))
      pendingPlaylistFiles = []
    })
  }

  app.on('activate', function () {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    } else if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      if (!mainWindow.isVisible()) mainWindow.show()
      mainWindow.focus()
    }
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

// 查询并清空待处理的分享 DeepLink id 队列（冷启动 / 启动页阶段缓冲的事件）
ipcMain.handle('get-pending-share-ids', async () => {
  return consumePendingShareIds()
})

// 查询并清空待处理的歌单分享 DeepLink id 队列
ipcMain.handle('get-pending-playlist-share-ids', async () => {
  return consumePendingPlaylistShareIds()
})

// 查询并清空待处理的一起听 DeepLink code 队列
ipcMain.handle('get-pending-lt-codes', async () => {
  return consumePendingLtCodes()
})

/* 主进程剪贴板读取 —— 比 renderer 的 navigator.clipboard.readText() 更可靠:
 *  - 无需窗口焦点 / 用户手势
 *  - 不受 Permissions Policy / 浏览器异步权限提示影响
 *  - Electron 的 clipboard 模块同步读取系统剪贴板,直接返回纯文本 */
ipcMain.handle('clipboard:read-text', async () => {
  try {
    return clipboard.readText() || ''
  } catch (e) {
    console.warn('clipboard:read-text failed', e)
    return ''
  }
})

// 系统音频采集 - 标记一次显式授权的采集会话
ipcMain.handle('system-audio:prepare-capture', async (event) => {
  if (!isMainWindowWebContents(event.sender)) {
    return false
  }
  authorizeMediaCaptureForWebContents(event.sender.id)
  return true
})

// 系统音频采集 - 获取屏幕源ID
ipcMain.handle('system-audio:get-default-source-id', async (event) => {
  if (!isMainWindowWebContents(event.sender) || !consumeScreenSourceLookupGrant(event.sender.id)) {
    return ''
  }
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'] })
    return (sources && sources[0] && sources[0].id) || ''
  } catch (e) {
    console.error('Failed to get screen sources:', e)
    return ''
  }
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
