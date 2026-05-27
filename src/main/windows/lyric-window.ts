import { BrowserWindow, screen } from 'electron'
import { createWindow } from './index'
import { configManager } from '../services/ConfigManager'
import { join } from 'path'
import { lyricConfig } from '@common/types/config'
import { is } from '@electron-toolkit/utils'

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

// 与渲染端 fontSizeToHeight 互为逆函数，保证 height↔fontSize 双向同步
const HEIGHT_MIN = 140
const HEIGHT_MAX = 360
const FONT_MIN = 20
const FONT_MAX = 96

const heightToFontSize = (height: number): number => {
  const ratio = (height - HEIGHT_MIN) / (HEIGHT_MAX - HEIGHT_MIN)
  return Math.round(FONT_MIN + Math.min(Math.max(ratio, 0), 1) * (FONT_MAX - FONT_MIN))
}

class LyricWindow {
  private win: BrowserWindow | null = null
  constructor() {}
  /**
   * 主窗口事件
   * @returns void
   */
  private event(): void {
    if (!this.win) return
    // 歌词窗口缩放
    this.win?.on('resized', () => {
      const bounds = this.win?.getBounds()
      if (bounds) {
        const { width, height } = bounds
        lyricStore.set({ width, height, fontSize: heightToFontSize(height) })
      }
    })
    this.win?.on('closed', () => {
      this.win = null
      // 通知主窗口状态变更（用户通过 OS 关闭按钮关闭时，closeDesktopLyric IPC 不会触发）
      try {
        const { BrowserWindow } = require('electron')
        const wins = BrowserWindow.getAllWindows()
        const mainWin = wins.find(w => !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed())
        if (mainWin) {
          mainWin.webContents.send('desktop-lyric-open-change', false)
          mainWin.webContents.send('closeDesktopLyric')
        }
      } catch {}
    })
  }
  /**
   * 创建主窗口
   * @returns BrowserWindow | null
   */
  create(): BrowserWindow | null {
    const { width, height, x, y } = lyricStore.get()
    this.win = createWindow({
      width: width || 800,
      height: height || 180,
      minWidth: 440,
      minHeight: 120,
      maxWidth: 1600,
      maxHeight: 300,
      show: false,
      // 没有指定位置时居中显示
      center: !(x && y),
      // 窗口位置
      x,
      y,
      transparent: true,
      hasShadow: false,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      alwaysOnTop: true,
      resizable: true,
      movable: true,
      // 不在任务栏显示
      skipTaskbar: true,
      // 窗口不能最小化
      minimizable: false,
      // 窗口不能最大化
      maximizable: false,
      // 窗口不能进入全屏状态
      fullscreenable: false
    })
    if (!this.win) return null
    // 加载地址（开发环境用项目根目录，生产用打包后的相对路径）
    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/desktop-lyric`)
    } else {
      this.win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'desktop-lyric' })
    }
    // 窗口事件
    this.event()
    return this.win
  }
  /**
   * 获取窗口
   * @returns BrowserWindow | null
   */
  getWin(): BrowserWindow | null {
    return this.win
  }
}

export default new LyricWindow()
