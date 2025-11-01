import { BrowserWindow, ipcMain, screen } from 'electron'
import { isAbsolute, relative, resolve } from 'path'
import { lyricConfig } from '@common/types/config'
import { configManager } from '../services/ConfigManager'

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
      height: 180
    }),
  set: (value: lyricConfig) => configManager.set<lyricConfig>('lyric', value)
}

/**
 * 歌词相关 IPC
 */
const initLyricIpc = (mainWin?: BrowserWindow | null): void => {
  // const mainWin = mainWindow.getWin()
  const lyricWin = lyricWindow.getWin()

  // 切换桌面歌词
  ipcMain.on('change-desktop-lyric', (_event, val: boolean) => {
    if (val) {
      lyricWin?.show()
      lyricWin?.setAlwaysOnTop(true, 'screen-saver')
    } else lyricWin?.hide()
  })
  ipcMain.on('win-show', () => {
    mainWin?.show()
  })
  // 音乐名称更改
  ipcMain.on('play-song-change', (_, title) => {
    if (!title) return
    lyricWin?.webContents.send('play-song-change', title)
  })

  // 音乐歌词更改
  ipcMain.on('play-lyric-change', (_, lyricData) => {
    if (!lyricData) return
    lyricWin?.webContents.send('play-lyric-change', lyricData)
  })

  // 播放状态更改（播放/暂停）
  ipcMain.on('play-status-change', (_, status: boolean) => {
    lyricWin?.webContents.send('play-status-change', status)
  })

  // 获取窗口位置
  ipcMain.handle('get-window-bounds', () => {
    return lyricWin?.getBounds()
  })
  // 同步获取窗口位置（回退）
  ipcMain.on('get-window-bounds-sync', (event) => {
    event.returnValue = lyricWin?.getBounds()
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

  // 移动窗口
  ipcMain.on('move-window', (_, x, y, width, height) => {
    lyricWin?.setBounds({ x, y, width, height })
    // 保存配置
    lyricStore.set({ ...lyricStore.get(), x, y, width, height })
    // 保持置顶
    lyricWin?.setAlwaysOnTop(true, 'screen-saver')
  })

  // 更新高度
  ipcMain.on('update-window-height', (_, height) => {
    if (!lyricWin) return
    const { width } = lyricWin.getBounds()

    // 更新窗口高度
    lyricWin.setBounds({ width, height })
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
    // 触发窗口更新
    if (callback && lyricWin) {
      lyricWin.webContents.send('desktop-lyric-option-change', option)
    }
    mainWin?.webContents.send('desktop-lyric-option-change', option)
  })

  // 发送主程序事件
  ipcMain.on('send-main-event', (_, name, val) => {
    mainWin?.webContents.send(name, val)
  })

  // 关闭桌面歌词
  ipcMain.on('closeDesktopLyric', () => {
    lyricWin?.hide()
    mainWin?.webContents.send('closeDesktopLyric')
  })

  // 锁定/解锁桌面歌词
  let lyricLockState = false
  ipcMain.on('toogleDesktopLyricLock', (_, isLock: boolean) => {
    if (!lyricWin) return
    lyricLockState = !!isLock
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
