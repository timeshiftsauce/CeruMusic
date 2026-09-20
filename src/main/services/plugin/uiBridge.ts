import { BrowserWindow, ipcMain, type IpcMainInvokeEvent } from 'electron'
import { randomUUID } from 'crypto'

const pending = new Map<
  string,
  {
    sender: number
    resolve: (value: any) => void
    reject: (error: Error) => void
    timer: ReturnType<typeof setTimeout>
    pluginId: string
  }
>()
let mainWindow: BrowserWindow | undefined
let ready = false

function cancelWindowRequests(sender: number, message: string) {
  for (const [id, entry] of pending) {
    if (entry.sender !== sender) continue
    pending.delete(id)
    clearTimeout(entry.timer)
    entry.reject(new Error(message))
  }
}

/** Only the application's main window may display or answer plugin dialogs. */
export function bindPluginUIWindow(window: BrowserWindow): void {
  mainWindow = window
  ready = false
  window.webContents.on('did-start-navigation', (_event, _url, isInPlace, isMainFrame) => {
    // Hash-router navigation and subframe loads keep the mounted Vue bridge alive.
    if (mainWindow !== window || isInPlace || !isMainFrame) return
    ready = false
    cancelWindowRequests(window.webContents.id, '主界面正在重新加载，请重试')
  })
  const sender = window.webContents.id
  window.once('closed', () => {
    cancelWindowRequests(sender, '主界面已关闭')
    if (mainWindow === window) {
      mainWindow = undefined
      ready = false
    }
  })
}

ipcMain.handle('plugin:ui-ready', (event, value: boolean) => {
  if (!mainWindow || mainWindow.isDestroyed() || event.sender !== mainWindow.webContents)
    return false
  ready = value === true
  if (!ready) cancelWindowRequests(event.sender.id, '插件界面已断开，请重试')
  return ready
})
ipcMain.handle('plugin:ui-result', (event, result) => {
  const entry = pending.get(result?.id)
  if (!entry || entry.sender !== event.sender.id) return
  pending.delete(result.id)
  clearTimeout(entry.timer)
  result.error ? entry.reject(new Error(String(result.error))) : entry.resolve(result.value)
})

function applicationWindow() {
  return mainWindow && !mainWindow.isDestroyed() ? mainWindow : undefined
}

export function assertPluginUIRequest(event: IpcMainInvokeEvent): void {
  const win = applicationWindow()
  if (!win || event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame)
    throw new Error('只有澜音主界面可以操作插件抽屉')
}

export function callPluginUI(pluginId: string, method: string, data: any): Promise<any> {
  const win = applicationWindow()
  if (!win || !ready) return Promise.reject(new Error('请等待澜音主界面加载完成后重试'))
  const id = randomUUID()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id)
      if (!win.isDestroyed()) win.webContents.send('plugin:ui-cancel', { id, pluginId })
      reject(new Error('用户界面请求超时'))
    }, 120000)
    pending.set(id, { sender: win.webContents.id, pluginId, resolve, reject, timer })
    win.webContents.send('plugin:ui', { id, pluginId, method, data })
  })
}

export function cancelPluginUI(pluginId: string): void {
  for (const [id, entry] of pending) {
    if (entry.pluginId !== pluginId) continue
    pending.delete(id)
    clearTimeout(entry.timer)
    applicationWindow()?.webContents.send('plugin:ui-cancel', { id, pluginId })
    entry.reject(new Error('插件已停止'))
  }
}

export function publishPluginSurface(pluginId: string, sessionId: string, state: unknown): void {
  applicationWindow()?.webContents.send('plugin:surface-state', {
    pluginId,
    sessionId,
    state,
    closed: state === undefined
  })
}

export function publishPluginAccountChanged(pluginId: string): void {
  applicationWindow()?.webContents.send('plugin:account-changed', { pluginId })
}

export function pluginChanged(change?: {
  type: 'installed' | 'updated' | 'uninstalled' | 'state-changed'
  pluginId: string
  enabled?: boolean
}): void {
  applicationWindow()?.webContents.send('plugin:changed', change)
}
