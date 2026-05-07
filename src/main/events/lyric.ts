import { BrowserWindow, ipcMain, screen } from 'electron'
import { isAbsolute, relative, resolve } from 'path'
import { lyricConfig } from '@common/types/config'
import { configManager } from '../services/ConfigManager'
import menuBarLyric from '../services/menuBarLyric'

import lyricWindow from '../windows/lyric-window'

const lyricStore = {
  get: () =>
    configManager.get<lyricConfig>('lyric', {
      fontSize: 30,
      mainColor: '#73BCFC',
      shadowColor: 'rgba(255, 255, 255, 0.5)',
      x: screen.getPrimaryDisplay().workAreaSize.width / 2 - 400,
      y: screen.getPrimaryDisplay().workAreaSize.height - 90,
      width: 800,
      height: 180,
      fontFamily: 'PingFangSC-Semibold',
      fontWeight: 600,
      position: 'center',
      alwaysShowPlayInfo: false,
      isLock: false,
      animation: true,
      showYrc: true,
      showTran: false,
      isDoubleLine: true,
      textBackgroundMask: false,
      backgroundMaskColor: 'rgba(0,0,0,0.2)',
      unplayedColor: 'rgba(255,255,255,0.5)',
      limitBounds: true
    }),
  set: (value: Partial<lyricConfig>) =>
    configManager.set<lyricConfig>('lyric', {
      ...lyricStore.get(),
      ...value
    })
}

/**
 * 歌词相关 IPC
 */
const initLyricIpc = (mainWin?: BrowserWindow | null): void => {
  // const mainWin = mainWindow.getWin()
  let lyricWin = lyricWindow.getWin()
  const getLyricWin = () => {
    lyricWin = lyricWindow.getWin()
    return lyricWin
  }
  const ensureLyricWin = () => {
    lyricWin = getLyricWin()
    if (lyricWin && !lyricWin.isDestroyed() && !lyricWin.webContents.isDestroyed()) {
      return lyricWin
    }
    lyricWin = lyricWindow.create()
    return lyricWin
  }

  // 切换桌面歌词
  ipcMain.on('change-desktop-lyric', (_event, val: boolean) => {
    lyricStore.set({ isOpen: !!val })
    lyricOpenState = !!val
    mainWin?.webContents.send('desktop-lyric-open-change', !!val)

    const lyricWin = val ? ensureLyricWin() : getLyricWin()
    if (!lyricWin || lyricWin.isDestroyed() || lyricWin.webContents.isDestroyed()) return

    if (val) {
      lyricWin.show()
      lyricWin.setAlwaysOnTop(true, 'screen-saver')
    } else {
      lyricWin.hide()
    }
    lyricWin.webContents.send('desktop-lyric-open-change', !!val)
  })
  ipcMain.on('win-show', () => {
    mainWin?.show()
  })
  // macOS 状态栏歌词开关同步
  ipcMain.on('set-mac-status-bar-lyric-enabled', (_event, enabled: boolean) => {
    menuBarLyric.setEnabled(enabled)
  })
  // 音乐名称更改
  ipcMain.on('play-song-change', (_, title) => {
    if (!title) return
    menuBarLyric.setSong(title)
    const lyricWin = getLyricWin()
    if (!lyricWin || lyricWin.isDestroyed() || lyricWin.webContents.isDestroyed()) return

    lyricWin.webContents.send('play-song-change', title)
  })

  // 音乐歌词更改
  ipcMain.on('play-lyric-change', (_, lyricData) => {
    if (!lyricData) return
    menuBarLyric.setLyrics(lyricData)
    const lyricWin = getLyricWin()
    if (!lyricWin || lyricWin.isDestroyed() || lyricWin.webContents.isDestroyed()) return

    lyricWin.webContents.send('play-lyric-change', lyricData)
  })

  // 当前行索引变化（用于立即高亮切换）
  ipcMain.on('play-lyric-index', (_, index: number) => {
    if (index === undefined || index === null) return
    menuBarLyric.setIndex(index)
    const lyricWin = getLyricWin()
    if (!lyricWin || lyricWin.isDestroyed() || lyricWin.webContents.isDestroyed()) return

    lyricWin.webContents.send('play-lyric-index', index)
  })

  // 当前行进度（用于控制 30% 时机的延迟替换）
  ipcMain.on('play-lyric-progress', (_, payload: { index: number; progress: number }) => {
    const lyricWin = getLyricWin()
    if (!payload || !lyricWin || lyricWin.isDestroyed() || lyricWin.webContents.isDestroyed()) {
      return
    }
    lyricWin.webContents.send('play-lyric-progress', payload)
  })

  // 播放状态更改（播放/暂停）
  ipcMain.on('play-status-change', (_, status: boolean) => {
    menuBarLyric.setPlayStatus(status)
    const lyricWin = getLyricWin()
    if (!lyricWin || lyricWin.isDestroyed() || lyricWin.webContents.isDestroyed()) return
    lyricWin.webContents.send('play-status-change', status)
  })

  // 获取窗口位置
  ipcMain.handle('get-window-bounds', () => {
    return getLyricWin()?.getBounds()
  })
  // 同步获取窗口位置（回退）
  ipcMain.on('get-window-bounds-sync', (event) => {
    event.returnValue = getLyricWin()?.getBounds()
  })

  // 获取屏幕尺寸
  ipcMain.handle('get-screen-size', () => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    return { width, height }
  })
  // 同步获取屏幕尺寸（回退）
  ipcMain.on('get-screen-size-sync', (event) => {
    const { width, height } = screen.getPrimaryDisplay().workAreaSize
    event.returnValue = { width, height }
  })
  // 获取所有屏幕工作区
  ipcMain.handle('get-all-work-area', () => {
    return screen.getAllDisplays().map((display) => display.workArea)
  })

  // 移动窗口
  ipcMain.on('move-window', (_, x, y, width, height) => {
    const lyricWin = getLyricWin()
    lyricWin?.setBounds({ x, y, width, height })
    // 保存配置
    lyricStore.set({ x, y, width, height })
    // 保持置顶
    lyricWin?.setAlwaysOnTop(true, 'screen-saver')
  })

  // 更新高度
  ipcMain.on('update-window-height', (_, height) => {
    const lyricWin = getLyricWin()
    if (!lyricWin) return
    const { width } = lyricWin.getBounds()
    lyricWin.setBounds({ width, height })
    lyricStore.set({ height })
  })

  // 获取配置
  ipcMain.handle('get-desktop-lyric-option', () => {
    return lyricStore.get()
  })
  // 同步获取配置（用于 invoke 不可用的回退）
  ipcMain.on('get-desktop-lyric-option-sync', (event) => {
    event.returnValue = lyricStore.get()
  })

  // 保存配置
  ipcMain.on('set-desktop-lyric-option', (_, option, callback: boolean = false) => {
    lyricStore.set(option)
    const lyricWin = getLyricWin()
    // 触发窗口更新
    if (callback && lyricWin && !lyricWin.isDestroyed() && !lyricWin.webContents.isDestroyed()) {
      lyricWin.webContents.send('desktop-lyric-option-change', option)
    }
    mainWin?.webContents.send('desktop-lyric-option-change', option)
  })

  // 接收字体设置并转发给歌词窗口
  ipcMain.on('set-desktop-lyric-font', (_, font: string) => {
    // Save font setting
    lyricStore.set({
      ...lyricStore.get(),
      fontFamily: font
    })

    const lyricWin = getLyricWin()
    if (lyricWin && !lyricWin.isDestroyed() && !lyricWin.webContents.isDestroyed()) {
      lyricWin.webContents.send('set-desktop-lyric-font', font)
    }
  })

  // 发送主程序事件
  ipcMain.on('send-main-event', (_, name, val) => {
    console.log('send-main-event', name, val)
    mainWin?.webContents.send(name, val)
  })

  // 关闭桌面歌词
  ipcMain.on('closeDesktopLyric', () => {
    const lyricWin = getLyricWin()
    lyricWin?.hide()
    lyricOpenState = false
    lyricStore.set({ isOpen: lyricOpenState })
    mainWin?.webContents.send('closeDesktopLyric')
  })

  // 锁定/解锁桌面歌词
  let lyricLockState = !!lyricStore.get().isLock
  let lyricOpenState = !!lyricStore.get().isOpen
  ipcMain.on('toogleDesktopLyricLock', (_, isLock: boolean) => {
    const lyricWin = getLyricWin()
    if (!lyricWin) return
    lyricLockState = !!isLock
    lyricStore.set({ isLock: lyricLockState })
    // 是否穿透
    if (lyricLockState) {
      lyricWin.setIgnoreMouseEvents(true, { forward: true })
    } else {
      lyricWin.setIgnoreMouseEvents(false)
    }
    // 广播到桌面歌词窗口与主窗口，保持两端状态一致
    lyricWin.webContents.send('toogleDesktopLyricLock', lyricLockState)
    mainWin?.webContents.send('toogleDesktopLyricLock', lyricLockState)
  })

  // 查询当前桌面歌词锁定状态
  ipcMain.handle('get-lyric-lock-state', () => lyricLockState)
  // 查询当前桌面歌词打开状态
  ipcMain.handle('get-lyric-open-state', () => lyricOpenState)

  // 桌面歌词窗口（渲染进程）声明准备就绪：如需启动时显示，等到此刻再显示
  ipcMain.on('lyric-window-ready', () => {
    try {
      const lyricWin = getLyricWin()
      if (lyricWin && !lyricWin.isDestroyed()) {
        if (lyricOpenState) {
          setTimeout(() => {
            lyricWin.show()
            lyricWin.setAlwaysOnTop(true, 'screen-saver')
          }, 1000)
        }
        // 恢复锁定状态
        if (lyricLockState) {
          lyricWin.setIgnoreMouseEvents(true, { forward: true })
          lyricWin.webContents.send('toogleDesktopLyricLock', lyricLockState)
          mainWin?.webContents.send('toogleDesktopLyricLock', lyricLockState)
        }
      }
    } catch {}
    mainWin?.webContents.send('lyric-window-ready')
  })

  // 检查是否是子文件夹
  ipcMain.handle('check-if-subfolder', (_, localFilesPath: string[], selectedDir: string) => {
    const resolvedSelectedDir = resolve(selectedDir)
    const allPaths = localFilesPath.map((p) => resolve(p))
    return allPaths.some((existingPath) => {
      const relativePath = relative(existingPath, resolvedSelectedDir)
      return relativePath && !relativePath.startsWith('..') && !isAbsolute(relativePath)
    })
  })
}

export default initLyricIpc
