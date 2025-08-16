import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 窗口控制方法
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  setMiniMode: (isMini: boolean) => ipcRenderer.send('window-mini-mode', isMini),

  // 网易云音乐服务API
  netease: {
    search: (args: any) => ipcRenderer.invoke('netease-search', args),
    getSongDetail: (args: any) => ipcRenderer.invoke('netease-getSongDetail', args),
    getSongUrl: (args: any) => ipcRenderer.invoke('netease-getSongUrl', args),
    getLyric: (args: any) => ipcRenderer.invoke('netease-getLyric', args),
    getToplist: (args: any) => ipcRenderer.invoke('netease-getToplist', args),
    getToplistDetail: (args: any) => ipcRenderer.invoke('netease-getToplistDetail', args),
    getListSongs: (args: any) => ipcRenderer.invoke('netease-getListSongs', args)
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
