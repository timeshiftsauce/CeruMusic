import InitPluginService from './plugins'
import InitShareService from './share'
import '../services/musicSdk/index'
import aiEvents from '../events/ai'
// import initLocalMusicEvents from './localMusic'
import initFontEvents from '../services/font/index'
import { app, powerSaveBlocker } from 'electron'
import { type BrowserWindow, ipcMain } from 'electron'
import lyricWindow from '../windows/lyric-window'
import { initDlnaService } from './dlna'
import { configManager } from '../services/ConfigManager'

export default function InitEventServices(mainWindow: BrowserWindow) {
  InitPluginService()
  InitShareService()
  aiEvents(mainWindow)
  initFontEvents()
  // initLocalMusicEvents()
  initDlnaService()
  basisEvent(mainWindow)
}

function basisEvent(mainWindow: BrowserWindow) {
  let psbId: number | null = null
  // 复用主进程创建的托盘
  let tray: any = (global as any).__ceru_tray__ || null
  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit()
  })
  // app.whenReady().then(() => {
  //   mainWindow.webContents.openDevTools();
  // });
  // 窗口控制 IPC 处理
  ipcMain.on('window-minimize', () => {
    mainWindow.minimize()
  })

  ipcMain.on('window-maximize', () => {
    // 转发到 main/index.ts，在我方全屏激活时会先退出全屏再判断 maximize
    ipcMain.emit('app-maximize-internal')
  })

  ipcMain.on('window-close', () => {
    mainWindow.close()
    lyricWindow.getWin()?.close()
  })
  mainWindow.on('close', () => {
    lyricWindow.getWin()?.close()
    // 当渲染端意外绕过设置直接 close 时，保险：若 closeToTray 为 false 则确保正常退出
    // 注意：使用 app.quit() 而非 app.exit(0)，让 before-quit / disposeAll 等钩子执行
    const closeToTray = configManager.get<boolean>('closeToTray', true)
    if (!closeToTray) {
      app.quit()
    }
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

  /**
   * 把主窗口拉到前台
   *
   * 用途:渲染端的系统通知(一起听新消息等)被用户点击后,需要把窗口拉前台。
   * 单走 renderer 的 window.focus() 在多数场景下不够:
   *   - 窗口被托盘 hide 了 → focus 无效,要先 show
   *   - 窗口最小化了 → focus 不会还原,要先 restore
   *   - 窗口被其它应用盖住了 → focus 在 Windows 上有 SetForegroundWindow 限制,
   *     主进程调 BrowserWindow.focus 系统级权重更高
   */
  ipcMain.on('window-show', () => {
    if (!mainWindow) return
    if (!mainWindow.isVisible()) mainWindow.show()
    if (mainWindow.isMinimized()) mainWindow.restore()
    mainWindow.focus()
  })

  // 全屏模式 IPC：转发到 main/index.ts 的窗口化全屏 toggle
  ipcMain.on('window-toggle-fullscreen', () => {
    ipcMain.emit('app-toggle-fullscreen-internal')
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

  // 设置同步 IPC：渲染端 closeToTray 变更时通知主进程持久化
  ipcMain.on('settings:sync-close-to-tray', (_, value: boolean) => {
    configManager.set<boolean>('closeToTray', value)
  })

  // 主进程读取 closeToTray 当前值（保险查询）
  ipcMain.handle('settings:get-close-to-tray', () => {
    return configManager.get<boolean>('closeToTray', true)
  })
}
