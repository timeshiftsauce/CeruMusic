import { BrowserWindow, screen } from 'electron'
import { createWindow } from './index'
import { configManager } from '../services/ConfigManager'
import { join } from 'path'
import { lyricConfig } from '@common/types/config'

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
        console.log('歌词窗口缩放:', width, height)

        lyricStore.set({
          ...lyricStore.get(),
          width,
          height
        })
      }
    })
    this.win?.on('closed', () => {
      this.win = null
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
      // 窗口位置
      x,
      y,
      transparent: true,
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
    this.win.loadFile(join(__dirname, '../main/src/web/lyric.html'))
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
