import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

// Custom APIs for renderer
const api = {
  // 窗口控制方法
  minimize: () => {
    console.log('preload: 发送 window-minimize 事件')
    ipcRenderer.send('window-minimize')
  },
  maximize: () => {
    console.log('preload: 发送 window-maximize 事件')
    ipcRenderer.send('window-maximize')
  },
  close: () => {
    console.log('preload: 发送 window-close 事件')
    ipcRenderer.send('window-close')
  },
  setMiniMode: (isMini: boolean) => {
    console.log('preload: 发送 window-mini-mode 事件，isMini:', isMini)
    ipcRenderer.send('window-mini-mode', isMini)
  },
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  onMusicCtrl: (callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    const handler = (event: Electron.IpcRendererEvent) => callback(event)
    ipcRenderer.on('music-control', handler)
    return () => ipcRenderer.removeListener('music-control', handler)
  },

  music: {
    request: (api: string, args: any) => ipcRenderer.invoke('service-music-request', api, args),
    requestSdk: (api: string, args: any) =>
      ipcRenderer.invoke('service-music-sdk-request', api, args)
  },
  plugins: {
    selectAndAddPlugin: (type: 'lx' | 'cr') =>
      ipcRenderer.invoke('service-plugin-selectAndAddPlugin', type),
    addPlugin: (pluginCode: string, pluginName: string) =>
      ipcRenderer.invoke('service-plugin-addPlugin', pluginCode, pluginName),
    getPluginById: (id: string) => ipcRenderer.invoke('service-plugin-getPluginById', id),
    loadAllPlugins: () => ipcRenderer.invoke('service-plugin-loadAllPlugins'),
    uninstallPlugin: (pluginId: string) =>
      ipcRenderer.invoke('service-plugin-uninstallPlugin', pluginId),
    getPluginLog: (pluginId: string) => ipcRenderer.invoke('service-plugin-getPluginLog', pluginId)
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

  musicCache: {
    getInfo: () => ipcRenderer.invoke('music-cache:get-info'),
    clear: () => ipcRenderer.invoke('music-cache:clear'),
    getSize: () => ipcRenderer.invoke('music-cache:get-size')
  },

  getUserConfig: () => ipcRenderer.invoke('get-user-config'),

  // 自动更新相关
  autoUpdater: {
    checkForUpdates: () => ipcRenderer.invoke('auto-updater:check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('auto-updater:download-update'),
    quitAndInstall: () => ipcRenderer.invoke('auto-updater:quit-and-install'),

    // 监听更新事件
    onCheckingForUpdate: (callback: () => void) => {
      ipcRenderer.on('auto-updater:checking-for-update', callback);
    },
    onUpdateAvailable: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-available', callback);
    },
    onUpdateNotAvailable: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-not-available', callback);
    },
    onDownloadProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('auto-updater:download-progress', (_, progress) => callback(progress));
    },
    onUpdateDownloaded: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-downloaded', callback);
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('auto-updater:error', (_, error) => callback(error));
    },
    onDownloadStarted: (callback: (updateInfo: any) => void) => {
      ipcRenderer.on('auto-updater:download-started', (_, updateInfo) => callback(updateInfo));
    },

    // 移除所有监听器
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('auto-updater:checking-for-update');
      ipcRenderer.removeAllListeners('auto-updater:update-available');
      ipcRenderer.removeAllListeners('auto-updater:update-not-available');
      ipcRenderer.removeAllListeners('auto-updater:download-started');
      ipcRenderer.removeAllListeners('auto-updater:download-progress');
      ipcRenderer.removeAllListeners('auto-updater:update-downloaded');
      ipcRenderer.removeAllListeners('auto-updater:error');
    }
  },
  ping: (callbaack: Function) => ipcRenderer.on('song-ended', () => callbaack()),
  pingService: {
    start: () => { ipcRenderer.send('startPing'); console.log('eventStart') },
    stop: () => { ipcRenderer.send('stopPing') }
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
