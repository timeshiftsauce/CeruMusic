import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 窗口控制方法
  minimize: () => ipcRenderer.send('window-minimize'),
  maximize: () => ipcRenderer.send('window-maximize'),
  close: () => ipcRenderer.send('window-close'),
  setMiniMode: (isMini: boolean) => ipcRenderer.send('window-mini-mode', isMini),
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  onMusicCtrl: (callback) => ipcRenderer.on('music-control', callback),

  music: {
    request: (api: string, args: any) => ipcRenderer.invoke('service-music-request', api, args)
  },

  ai: {
    ask: (prompt: string) => ipcRenderer.invoke('ai-ask', prompt),
    askStream: (prompt: string, streamId: string) =>
      ipcRenderer.invoke('ai-ask-stream', prompt, streamId),
    onStreamChunk: (callback: (data: { streamId: string; chunk: string }) => void) => {
      ipcRenderer.on('ai-stream-chunk', (_, data) => callback(data))
    },
    onStreamEnd: (callback: (data: { streamId: string }) => void) => {
      ipcRenderer.on('ai-stream-end', (_, data) => callback(data))
    },
    onStreamError: (callback: (data: { streamId: string; error: string }) => void) => {
      ipcRenderer.on('ai-stream-error', (_, data) => callback(data))
    },
    removeStreamListeners: () => {
      ipcRenderer.removeAllListeners('ai-stream-chunk')
      ipcRenderer.removeAllListeners('ai-stream-end')
      ipcRenderer.removeAllListeners('ai-stream-error')
    }
  },

  getUserConfig: () => ipcRenderer.invoke('get-user-config')
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
