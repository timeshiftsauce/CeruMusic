import { app, globalShortcut, type BrowserWindow, ipcMain } from 'electron'
import {
  defaultHotkeyConfig,
  type HotkeyAction,
  type HotkeyConfig,
  type HotkeyConfigPayload,
  type HotkeyStatus
} from '@common/types/hotkeys'
import lyricWindow from '../../windows/lyric-window'
import { configManager } from '../ConfigManager'

type ApplyResult = { success: true } | { success: false; errors: string[] }

const normalizeAccelerator = (acc: unknown): string => {
  if (typeof acc !== 'string') return ''
  return acc.trim().replace(/\s+/g, '')
}

const actionLabel: Record<HotkeyAction, string> = {
  toggle: '播放/暂停',
  playNext: '下一首',
  playPrev: '上一首',
  seekForward: '快进',
  seekBackward: '快退',
  volumeUp: '音量 +',
  volumeDown: '音量 -',
  toggleDesktopLyric: '桌面歌词',
  setPlayModeSequence: '顺序播放',
  setPlayModeRandom: '随机播放',
  togglePlayModeSingle: '单曲循环切换'
}

const getStoredHotkeyConfig = (): HotkeyConfig => {
  const stored = configManager.get<Partial<HotkeyConfig>>('hotkeys', {})
  return {
    enabled: typeof stored?.enabled === 'boolean' ? stored.enabled : defaultHotkeyConfig.enabled,
    bindings: {
      ...defaultHotkeyConfig.bindings,
      ...(stored?.bindings || {})
    }
  }
}
let currentMainWindow: BrowserWindow | null = null
let ipcBound = false
let lastStatus: HotkeyStatus = { failedActions: [], actionErrors: {} }

const actionCallbacks = (mainWindow: BrowserWindow) => {
  const sendCtrl = (name: string, val?: unknown) => {
    if (!mainWindow || mainWindow.isDestroyed() || mainWindow.webContents.isDestroyed()) return
    mainWindow.webContents.send(name, val)
  }

  const toggleDesktopLyric = () => {
    const lyricWin = lyricWindow.getWin()
    const visible = !!lyricWin && lyricWin.isVisible()
    const next = !visible
    ipcMain.emit('change-desktop-lyric', null, next)
    if (!mainWindow.isDestroyed() && !mainWindow.webContents.isDestroyed()) {
      mainWindow.webContents.send('desktopLyricVisibility', next)
    }
  }

  const callbacks: Record<HotkeyAction, () => void> = {
    toggle: () => sendCtrl('toggle'),
    playNext: () => sendCtrl('playNext'),
    playPrev: () => sendCtrl('playPrev'),
    seekForward: () => sendCtrl('seekDelta', 5),
    seekBackward: () => sendCtrl('seekDelta', -5),
    volumeUp: () => sendCtrl('volumeDelta', 5),
    volumeDown: () => sendCtrl('volumeDelta', -5),
    toggleDesktopLyric: () => toggleDesktopLyric(),
    setPlayModeSequence: () => sendCtrl('setPlayMode', 'sequence'),
    setPlayModeRandom: () => sendCtrl('setPlayMode', 'random'),
    togglePlayModeSingle: () => sendCtrl('setPlayMode', 'toggleSingle')
  }

  return callbacks
}

const applyHotkeys = (mainWindow: BrowserWindow, nextConfig: HotkeyConfig): ApplyResult => {
  const cfg: HotkeyConfig = {
    enabled: !!nextConfig.enabled,
    bindings: { ...(nextConfig.bindings || {}) }
  }

  const bindings: Array<[HotkeyAction, string]> = Object.entries(cfg.bindings || {})
    .map(([k, v]) => [k as HotkeyAction, normalizeAccelerator(v)] as [HotkeyAction, string])
    .filter(([, v]) => !!v)

  const duplicates: string[] = []
  const seen = new Map<string, HotkeyAction>()
  for (const [action, acc] of bindings) {
    const key = acc.toLowerCase()
    const existed = seen.get(key)
    if (existed && existed !== action) duplicates.push(acc)
    else seen.set(key, action)
  }
  if (duplicates.length > 0) {
    const uniq = [...new Set(duplicates)]
    const failed = new Set<HotkeyAction>()
    const actionErrors: Partial<Record<HotkeyAction, string[]>> = {}
    for (const [action, acc] of bindings) {
      if (uniq.includes(acc)) {
        failed.add(action)
        actionErrors[action] = [...(actionErrors[action] || []), `快捷键冲突：${acc}`]
      }
    }
    lastStatus = { failedActions: Array.from(failed), actionErrors }
    return { success: false, errors: uniq.map((a) => `快捷键冲突：${a}`) }
  }

  globalShortcut.unregisterAll()

  if (!cfg.enabled) {
    configManager.set('hotkeys', cfg)
    lastStatus = { failedActions: [], actionErrors: {} }
    return { success: true }
  }

  const errors: string[] = []
  const failedActions = new Set<HotkeyAction>()
  const actionErrors: Partial<Record<HotkeyAction, string[]>> = {}
  const tryRegister = (action: HotkeyAction, acc: string, cb: () => void) => {
    const ok = globalShortcut.register(acc, cb)
    if (!ok) {
      failedActions.add(action)
      const msg = `注册失败：${actionLabel[action]}（${acc}）`
      errors.push(msg)
      actionErrors[action] = [...(actionErrors[action] || []), msg]
    }
  }

  const callbacks = actionCallbacks(mainWindow)

  for (const [action, acc] of bindings) {
    const cb = callbacks[action]
    if (!cb) continue
    tryRegister(action, acc, cb)
  }

  if (errors.length > 0) {
    lastStatus = { failedActions: Array.from(failedActions), actionErrors }
    return { success: false, errors }
  }

  configManager.set('hotkeys', cfg)
  lastStatus = { failedActions: [], actionErrors: {} }
  return { success: true }
}

export function initHotkeyService(mainWindow: BrowserWindow) {
  currentMainWindow = mainWindow
  if (!ipcBound) {
    ipcMain.handle('hotkeys:get', async () => {
      return { success: true, data: getStoredHotkeyConfig(), status: lastStatus }
    })

    ipcMain.handle('hotkeys:set', async (_e, payload: HotkeyConfigPayload) => {
      const win = currentMainWindow
      if (!win) return { success: false, error: '主窗口不可用', errors: [] }
      const current = getStoredHotkeyConfig()
      const next: HotkeyConfig = {
        enabled: typeof payload?.enabled === 'boolean' ? payload.enabled : current.enabled,
        bindings: { ...(payload?.bindings || {}) }
      }
      const res = applyHotkeys(win, next)
      if (!res.success) {
        return {
          success: false,
          error: '保存失败',
          errors: res.errors,
          data: getStoredHotkeyConfig(),
          status: lastStatus
        }
      }
      return { success: true, data: getStoredHotkeyConfig(), status: lastStatus }
    })

    app.once('will-quit', () => {
      try {
        globalShortcut.unregisterAll()
      } catch {}
    })

    ipcBound = true
  }

  const boot = getStoredHotkeyConfig()
  const res = applyHotkeys(mainWindow, boot)
  if (!res.success) {
    let tries = 0
    const maxTries = 5
    const delay = 500
    const run = () => {
      if (tries >= maxTries) return
      tries++
      const r = applyHotkeys(mainWindow, getStoredHotkeyConfig())
      if (!r.success) {
        setTimeout(run, delay)
      }
    }
    setTimeout(run, delay)
  }
}
