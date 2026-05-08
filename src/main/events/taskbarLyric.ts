import { ipcMain, BrowserWindow } from 'electron'
import taskbarLyricWindow, { taskbarLyricStore } from '../windows/taskbar-lyric-window'
import { taskbarLyricConfig } from '@common/types/config'

/**
 * 任务栏歌词 IPC 处理。
 * 转发由 desktopLyricBridge 推送的 song/lyric/progress/status 事件，
 * 由 lyric.ts 负责（避免重复订阅 ipcMain），这里只处理任务栏歌词专属的控制事件。
 */
export function initTaskbarLyricIpc(mainWin: BrowserWindow | null): void {
  ipcMain.removeAllListeners('taskbar-lyric:toggle')
  ipcMain.removeAllListeners('taskbar-lyric:set-config')
  ipcMain.removeAllListeners('taskbar-lyric:set-mouse-passthrough')
  ipcMain.removeAllListeners('taskbar-lyric:ready')
  ipcMain.removeHandler('taskbar-lyric:get-config')

  ipcMain.on('taskbar-lyric:toggle', (_event, open: boolean) => {
    const isOpen = !!open
    taskbarLyricStore.set({ isOpen })
    if (isOpen) {
      taskbarLyricWindow.show()
    } else {
      taskbarLyricWindow.hide()
    }
    // 通知主窗口同步设置 UI 状态
    mainWin?.webContents.send('taskbar-lyric-open-change', isOpen)
  })

  ipcMain.handle('taskbar-lyric:get-config', () => {
    return taskbarLyricStore.get()
  })

  ipcMain.on('taskbar-lyric:set-config', (_event, partial: Partial<taskbarLyricConfig>) => {
    taskbarLyricStore.set(partial || {})
    taskbarLyricWindow.reposition()
    const win = taskbarLyricWindow.getWin()
    win?.webContents.send('taskbar-lyric-config-change', taskbarLyricStore.get())
  })

  ipcMain.on('taskbar-lyric:set-mouse-passthrough', (_event, passthrough: boolean) => {
    taskbarLyricWindow.setMousePassthrough(!!passthrough)
  })

  ipcMain.on('taskbar-lyric:ready', () => {
    // 渲染端准备就绪，请求主窗口推送一次最新快照
    mainWin?.webContents.send('taskbar-lyric-request-snapshot')
  })
}
