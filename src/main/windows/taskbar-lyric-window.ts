import { BrowserWindow, screen, Display } from 'electron'
import { createWindow } from './index'
import { configManager } from '../services/ConfigManager'
import { join } from 'path'
import { taskbarLyricConfig } from '@common/types/config'
import { is } from '@electron-toolkit/utils'

const DEFAULT_WIDTH = 500
const DEFAULT_HEIGHT = 40
const SYS_TRAY_MARGIN = 80 // 给右侧系统托盘留的空间（DIP）

const taskbarLyricStore = {
  get: (): taskbarLyricConfig =>
    configManager.get<taskbarLyricConfig>('taskbarLyric', {
      isOpen: false,
      width: DEFAULT_WIDTH,
      fontSize: 14,
      mainColor: '#73BCFC',
      unplayedColor: 'rgba(255,255,255,0.55)',
      showCover: true
    }),
  set: (value: Partial<taskbarLyricConfig>) =>
    configManager.set<taskbarLyricConfig>('taskbarLyric', {
      ...taskbarLyricStore.get(),
      ...value
    })
}

/**
 * 计算任务栏歌词窗口的位置 —— 覆盖在主屏任务栏右侧（紧邻系统托盘）。
 * 通过 display.bounds 与 workArea 的差判断任务栏位置和高度。
 */
function computeTaskbarBounds(
  display: Display,
  width: number
): { x: number; y: number; width: number; height: number } {
  const { bounds, workArea } = display
  const taskbarTop = bounds.height - workArea.height - workArea.y
  const taskbarLeft = bounds.width - workArea.width - workArea.x
  // 默认假设任务栏在底部
  let h = taskbarTop > 0 ? taskbarTop : DEFAULT_HEIGHT
  let x = bounds.x + bounds.width - width - SYS_TRAY_MARGIN
  let y = bounds.y + bounds.height - h
  // 顶部任务栏
  if (workArea.y > bounds.y) {
    h = workArea.y - bounds.y
    y = bounds.y
    x = bounds.x + bounds.width - width - SYS_TRAY_MARGIN
  }
  // 左侧任务栏
  else if (taskbarLeft > 0 && workArea.x > bounds.x) {
    h = DEFAULT_HEIGHT
    x = bounds.x
    y = bounds.y + bounds.height - h
  }
  return { x, y, width, height: Math.max(h, DEFAULT_HEIGHT) }
}

class TaskbarLyricWindow {
  private win: BrowserWindow | null = null
  private mousePassthrough = true
  private displayListenerInstalled = false

  create(): BrowserWindow | null {
    if (this.win && !this.win.isDestroyed()) return this.win

    const cfg = taskbarLyricStore.get()
    const display = screen.getPrimaryDisplay()
    const bounds = computeTaskbarBounds(display, cfg.width || DEFAULT_WIDTH)

    this.win = createWindow({
      width: bounds.width,
      height: bounds.height,
      x: bounds.x,
      y: bounds.y,
      show: false,
      frame: false,
      transparent: true,
      hasShadow: false,
      backgroundColor: 'rgba(0, 0, 0, 0)',
      alwaysOnTop: true,
      resizable: false,
      movable: false,
      focusable: false,
      skipTaskbar: true,
      minimizable: false,
      maximizable: false,
      fullscreenable: false
    })
    if (!this.win) return null

    this.win.setAlwaysOnTop(true, 'pop-up-menu')
    this.win.webContents.setBackgroundThrottling(false)
    // 默认透传鼠标
    this.win.setIgnoreMouseEvents(true, { forward: true })
    this.mousePassthrough = true

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      this.win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}/#/taskbar-lyric`)
    } else {
      this.win.loadFile(join(__dirname, '../renderer/index.html'), { hash: 'taskbar-lyric' })
    }

    this.win.on('closed', () => {
      this.win = null
    })

    if (!this.displayListenerInstalled) {
      this.displayListenerInstalled = true
      const reposition = () => {
        if (!this.win || this.win.isDestroyed()) return
        const d = screen.getPrimaryDisplay()
        const cfg2 = taskbarLyricStore.get()
        const b = computeTaskbarBounds(d, cfg2.width || DEFAULT_WIDTH)
        this.win.setBounds(b)
      }
      screen.on('display-metrics-changed', reposition)
      screen.on('display-added', reposition)
      screen.on('display-removed', reposition)
    }

    return this.win
  }

  show(): void {
    const win = this.create()
    win?.showInactive() // 不抢焦点
    win?.setAlwaysOnTop(true, 'pop-up-menu')
  }

  hide(): void {
    if (this.win && !this.win.isDestroyed()) this.win.hide()
  }

  isVisible(): boolean {
    return !!this.win && !this.win.isDestroyed() && this.win.isVisible()
  }

  getWin(): BrowserWindow | null {
    return this.win && !this.win.isDestroyed() ? this.win : null
  }

  setMousePassthrough(passthrough: boolean): void {
    if (!this.win || this.win.isDestroyed()) return
    if (this.mousePassthrough === passthrough) return
    this.mousePassthrough = passthrough
    this.win.setIgnoreMouseEvents(passthrough, { forward: true })
  }

  reposition(): void {
    if (!this.win || this.win.isDestroyed()) return
    const d = screen.getPrimaryDisplay()
    const cfg = taskbarLyricStore.get()
    const b = computeTaskbarBounds(d, cfg.width || DEFAULT_WIDTH)
    this.win.setBounds(b)
  }
}

const taskbarLyricWindow = new TaskbarLyricWindow()

export { taskbarLyricStore }
export default taskbarLyricWindow
