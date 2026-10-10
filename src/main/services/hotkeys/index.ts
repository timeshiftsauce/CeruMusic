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
import { isMediaKeyAccelerator } from '@common/hotkeyAccelerators'

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
  togglePlayModeSingle: '单曲循环切换',
  toggleAudioOutputSelector: '切换音频输出设备'
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
const registeredAppHotkeys = new Set<string>()

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
    togglePlayModeSingle: () => sendCtrl('setPlayMode', 'toggleSingle'),
    toggleAudioOutputSelector: () => sendCtrl('hotkeys:toggle-audio-output-selector')
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

  // ---- 冲突检测 ----
  // 注意：冲突**不阻断**整体应用。只把冲突的这几个动作标为失败并跳过注册，
  // 其余动作照常注册、配置照常落盘 —— 否则用户一旦撞键，所有快捷键都会失效，
  // 且由于下面不保存配置，连改回来都做不到。
  const conflictActions = new Set<HotkeyAction>()
  const conflictErrors: Partial<Record<HotkeyAction, string[]>> = {}
  {
    const byAcc = new Map<string, HotkeyAction[]>()
    for (const [action, acc] of bindings) {
      const key = acc.toLowerCase()
      const list = byAcc.get(key)
      if (list) list.push(action)
      else byAcc.set(key, [action])
    }
    for (const [, actions] of byAcc) {
      if (actions.length < 2) continue
      // 同一按键被多个动作占用：所有占用者都算冲突（无法判断该保留谁）。
      for (const action of actions) {
        conflictActions.add(action)
        const msg = `快捷键冲突：${actionLabel[action]} 与其它功能占用了同一按键（${cfg.bindings?.[action]}）`
        conflictErrors[action] = [...(conflictErrors[action] || []), msg]
      }
    }
  }

  // 先注销旧的，再注册新的（无论是否有冲突都要走这一步，
  // 保证「不冲突的那些」能正常生效）。
  for (const accelerator of registeredAppHotkeys) globalShortcut.unregister(accelerator)
  registeredAppHotkeys.clear()

  // 收集本轮所有失败项与错误（冲突 + 注册失败 + 媒体键）。
  const errors: string[] = []
  const failedActions = new Set<HotkeyAction>(conflictActions)
  const actionErrors: Partial<Record<HotkeyAction, string[]>> = { ...conflictErrors }
  for (const [, msgs] of Object.entries(conflictErrors)) {
    for (const m of msgs || []) errors.push(m)
  }

  // 配置总是落盘：让用户改得动、能逐步消解冲突。
  const persist = () => configManager.set('hotkeys', cfg)

  if (!cfg.enabled) {
    persist()
    // 禁用时保留「冲突提示」，否则用户看不到为什么某些项标红；
    // 若没有任何问题则清空状态。
    lastStatus = {
      failedActions: Array.from(failedActions),
      actionErrors
    }
    return failedActions.size > 0 ? { success: false, errors } : { success: true }
  }

  const tryRegister = (action: HotkeyAction, acc: string, cb: () => void) => {
    // 冲突项：跳过注册，但错误已在上面记好。
    if (conflictActions.has(action)) return

    // 媒体键交给系统媒体会话处理（渲染进程的 navigator.mediaSession 已经接管播放/暂停与上/下一首）：
    // 注册为 globalShortcut 会关闭本应用的 SMTC 发布，系统媒体卡片、媒体键与其它集成都会看不到本应用。
    if (isMediaKeyAccelerator(acc)) {
      failedActions.add(action)
      const msg = `媒体键不能作为全局快捷键（会关闭系统媒体控制，媒体键请交给系统处理）：${actionLabel[action]}（${acc}）`
      errors.push(msg)
      actionErrors[action] = [...(actionErrors[action] || []), msg]
      return
    }

    const ok = globalShortcut.register(acc, cb)
    if (!ok) {
      failedActions.add(action)
      const msg = `注册失败：${actionLabel[action]}（${acc}）`
      errors.push(msg)
      actionErrors[action] = [...(actionErrors[action] || []), msg]
    } else {
      registeredAppHotkeys.add(acc)
    }
  }

  const callbacks = actionCallbacks(mainWindow)

  for (const [action, acc] of bindings) {
    const cb = callbacks[action]
    if (!cb) continue
    tryRegister(action, acc, cb)
  }

  persist()
  lastStatus = { failedActions: Array.from(failedActions), actionErrors }
  return errors.length > 0 ? { success: false, errors } : { success: true }
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
