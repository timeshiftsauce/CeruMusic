import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { HotkeyConfigPayload } from '@common/types/hotkeys'

// Custom APIs for renderer
const api = {
  // 窗口控制方法
  minimize: () => {
    console.log('preload: 发送 window-minimize 事件')
    ipcRenderer.send('window-minimize')
  },
  // 阻止系统息屏
  powerSaveBlocker: {
    start: () => ipcRenderer.invoke('power-save-blocker:start'),
    stop: () => ipcRenderer.invoke('power-save-blocker:stop')
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
    // 音乐控制
    const handler = (event: Electron.IpcRendererEvent) => callback(event)
    ipcRenderer.on('music-control', handler)
    return () => ipcRenderer.removeListener('music-control', handler)
  },
  // 音乐相关方法
  music: {
    requestSdk: (api: string, args: any) =>
      ipcRenderer.invoke('service-music-sdk-request', api, args),
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
  },
  //音源插件
  plugins: {
    selectAndAddPlugin: (type: 'lx' | 'cr') =>
      ipcRenderer.invoke('service-plugin-selectAndAddPlugin', type),
    downloadAndAddPlugin: (url: string, type: 'lx' | 'cr') =>
      ipcRenderer.invoke('service-plugin-downloadAndAddPlugin', url, type),
    addPlugin: (pluginCode: string, pluginName: string) =>
      ipcRenderer.invoke('service-plugin-addPlugin', pluginCode, pluginName),
    getPluginById: (id: string) => ipcRenderer.invoke('service-plugin-getPluginById', id),
    loadAllPlugins: () => ipcRenderer.invoke('service-plugin-loadAllPlugins'),
    uninstallPlugin: (pluginId: string) =>
      ipcRenderer.invoke('service-plugin-uninstallPlugin', pluginId),
    getPluginLog: (pluginId: string) => ipcRenderer.invoke('service-plugin-getPluginLog', pluginId)
  },
  // ai助手
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
  // 音频缓存管理
  musicCache: {
    getInfo: () => ipcRenderer.invoke('music-cache:get-info'),
    clear: () => ipcRenderer.invoke('music-cache:clear'),
    getSize: () => ipcRenderer.invoke('music-cache:get-size')
  },
  // 文件读取
  file: {
    readFile: (path: string) => ipcRenderer.invoke('fs:read-file', path)
  },

  // 下载管理
  download: {
    getTasks: () => ipcRenderer.invoke('download:get-tasks'),
    pauseTask: (taskId: string) => ipcRenderer.invoke('download:pause-task', taskId),
    resumeTask: (taskId: string) => ipcRenderer.invoke('download:resume-task', taskId),
    cancelTask: (taskId: string) => ipcRenderer.invoke('download:cancel-task', taskId),
    deleteTask: (taskId: string, deleteFile: boolean = false) =>
      ipcRenderer.invoke('download:delete-task', taskId, deleteFile),
    pauseAllTasks: () => ipcRenderer.invoke('download:pause-all-tasks'),
    resumeAllTasks: () => ipcRenderer.invoke('download:resume-all-tasks'),
    retryTask: (taskId: string) => ipcRenderer.invoke('download:retry-task', taskId),
    setMaxConcurrent: (max: number) => ipcRenderer.invoke('download:set-max-concurrent', max),
    getMaxConcurrent: () => ipcRenderer.invoke('download:get-max-concurrent'),
    clearTasks: (type: 'queue' | 'completed' | 'failed' | 'all') =>
      ipcRenderer.invoke('download:clear-tasks', type),
    validateFiles: () => ipcRenderer.invoke('download:validate-files'),
    openFileLocation: (filePath: string) =>
      ipcRenderer.invoke('download:open-file-location', filePath),
    onTaskAdded: (callback: (event: Electron.IpcRendererEvent, task: any) => void) => {
      ipcRenderer.on('download:task-added', callback)
      return () => ipcRenderer.removeListener('download:task-added', callback)
    },
    onTaskProgress: (callback: (event: Electron.IpcRendererEvent, task: any) => void) => {
      ipcRenderer.on('download:task-progress', callback)
      return () => ipcRenderer.removeListener('download:task-progress', callback)
    },
    onTaskStatusChanged: (callback: (event: Electron.IpcRendererEvent, task: any) => void) => {
      ipcRenderer.on('download:task-status-changed', callback)
      return () => ipcRenderer.removeListener('download:task-status-changed', callback)
    },
    onTaskCompleted: (callback: (event: Electron.IpcRendererEvent, task: any) => void) => {
      ipcRenderer.on('download:task-completed', callback)
      return () => ipcRenderer.removeListener('download:task-completed', callback)
    },
    onTaskError: (callback: (event: Electron.IpcRendererEvent, task: any) => void) => {
      ipcRenderer.on('download:task-error', callback)
      return () => ipcRenderer.removeListener('download:task-error', callback)
    },
    onTaskDeleted: (callback: (event: Electron.IpcRendererEvent, taskId: string) => void) => {
      ipcRenderer.on('download:task-deleted', callback)
      return () => ipcRenderer.removeListener('download:task-deleted', callback)
    },
    onTasksReset: (callback: (event: Electron.IpcRendererEvent, tasks: any[]) => void) => {
      ipcRenderer.on('download:tasks-reset', callback)
      return () => ipcRenderer.removeListener('download:tasks-reset', callback)
    }
  },

  // 歌单管理 API
  songList: {
    // === 歌单管理 ===
    create: (name: string, description?: string, source?: string, meta?: Record<string, any>) =>
      ipcRenderer.invoke('songlist:create', name, description, source, meta),
    getAll: () => ipcRenderer.invoke('songlist:get-all'),
    getById: (hashId: string) => ipcRenderer.invoke('songlist:get-by-id', hashId),
    delete: (hashId: string) => ipcRenderer.invoke('songlist:delete', hashId),
    batchDelete: (hashIds: string[]) => ipcRenderer.invoke('songlist:batch-delete', hashIds),
    edit: (hashId: string, updates: any) => ipcRenderer.invoke('songlist:edit', hashId, updates),
    updateCover: (hashId: string, coverImgUrl: string) =>
      ipcRenderer.invoke('songlist:update-cover', hashId, coverImgUrl),
    search: (keyword: string, source?: string) =>
      ipcRenderer.invoke('songlist:search', keyword, source),
    getStatistics: () => ipcRenderer.invoke('songlist:get-statistics'),
    exists: (hashId: string) => ipcRenderer.invoke('songlist:exists', hashId),

    // === 歌曲管理 ===
    addSongs: (hashId: string, songs: any[]) =>
      ipcRenderer.invoke('songlist:add-songs', hashId, songs),
    removeSong: (hashId: string, songmid: string | number) =>
      ipcRenderer.invoke('songlist:remove-song', hashId, songmid),
    removeSongs: (hashId: string, songmids: (string | number)[]) =>
      ipcRenderer.invoke('songlist:remove-songs', hashId, songmids),
    clearSongs: (hashId: string) => ipcRenderer.invoke('songlist:clear-songs', hashId),
    getSongs: (hashId: string) => ipcRenderer.invoke('songlist:get-songs', hashId),
    getSongCount: (hashId: string) => ipcRenderer.invoke('songlist:get-song-count', hashId),
    hasSong: (hashId: string, songmid: string | number) =>
      ipcRenderer.invoke('songlist:has-song', hashId, songmid),
    getSong: (hashId: string, songmid: string | number) =>
      ipcRenderer.invoke('songlist:get-song', hashId, songmid),
    searchSongs: (hashId: string, keyword: string) =>
      ipcRenderer.invoke('songlist:search-songs', hashId, keyword),
    getSongStatistics: (hashId: string) =>
      ipcRenderer.invoke('songlist:get-song-statistics', hashId),
    validateIntegrity: (hashId: string) =>
      ipcRenderer.invoke('songlist:validate-integrity', hashId),
    repairData: (hashId: string) => ipcRenderer.invoke('songlist:repair-data', hashId),
    forceSave: (hashId: string) => ipcRenderer.invoke('songlist:force-save', hashId),

    // 喜欢歌单ID持久化
    getFavoritesId: () => ipcRenderer.invoke('songlist:get-favorites-id'),
    setFavoritesId: (id: string) => ipcRenderer.invoke('songlist:set-favorites-id', id)
  },

  getUserConfig: () => ipcRenderer.invoke('get-user-config'),

  hotkeys: {
    get: () => ipcRenderer.invoke('hotkeys:get'),
    set: (payload: HotkeyConfigPayload) => ipcRenderer.invoke('hotkeys:set', payload)
  },

  // 自动更新相关
  autoUpdater: {
    checkForUpdates: () => ipcRenderer.invoke('auto-updater:check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('auto-updater:download-update'),
    quitAndInstall: () => ipcRenderer.invoke('auto-updater:quit-and-install'),
    getDownloadedPath: (updateInfo?: any) =>
      ipcRenderer.invoke('auto-updater:get-downloaded-path', updateInfo),

    // 监听更新事件
    onCheckingForUpdate: (callback: () => void) => {
      ipcRenderer.on('auto-updater:checking-for-update', callback)
    },
    onUpdateAvailable: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-available', callback)
    },
    onUpdateNotAvailable: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-not-available', callback)
    },
    onDownloadProgress: (callback: (progress: any) => void) => {
      ipcRenderer.on('auto-updater:download-progress', (_, progress) => callback(progress))
    },
    onUpdateDownloaded: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-downloaded', callback)
    },
    onError: (callback: (error: string) => void) => {
      ipcRenderer.on('auto-updater:error', (_, error) => callback(error))
    },
    onDownloadStarted: (callback: (updateInfo: any) => void) => {
      ipcRenderer.on('auto-updater:download-started', (_, updateInfo) => callback(updateInfo))
    },

    // 移除所有监听器
    removeAllListeners: () => {
      ipcRenderer.removeAllListeners('auto-updater:checking-for-update')
      ipcRenderer.removeAllListeners('auto-updater:update-available')
      ipcRenderer.removeAllListeners('auto-updater:update-not-available')
      ipcRenderer.removeAllListeners('auto-updater:download-started')
      ipcRenderer.removeAllListeners('auto-updater:download-progress')
      ipcRenderer.removeAllListeners('auto-updater:update-downloaded')
      ipcRenderer.removeAllListeners('auto-updater:error')
    }
  },
  ping: (callbaack: Function) => ipcRenderer.on('song-ended', () => callbaack()),
  pingService: {
    start: () => {
      ipcRenderer.send('startPing')
      console.log('eventStart')
    },
    stop: () => {
      ipcRenderer.send('stopPing')
    }
  },

  // 目录设置相关
  directorySettings: {
    getDirectories: () => ipcRenderer.invoke('directory-settings:get-directories'),
    selectCacheDir: () => ipcRenderer.invoke('directory-settings:select-cache-dir'),
    selectDownloadDir: () => ipcRenderer.invoke('directory-settings:select-download-dir'),
    saveDirectories: (directories: any) =>
      ipcRenderer.invoke('directory-settings:save-directories', directories),
    resetDirectories: () => ipcRenderer.invoke('directory-settings:reset-directories'),
    openDirectory: (dirPath: string) =>
      ipcRenderer.invoke('directory-settings:open-directory', dirPath),
    getDirectorySize: (dirPath: string) =>
      ipcRenderer.invoke('directory-settings:get-directory-size', dirPath)
  },

  // 本地音乐管理
  localMusic: {
    selectDirs: () => ipcRenderer.invoke('local-music:select-dirs'),
    scan: async (dirs: string[]) => {
      const res = await ipcRenderer.invoke('local-music:scan', dirs)
      if (typeof res === 'string') {
        try {
          return JSON.parse(res)
        } catch {
          return []
        }
      }
      return Array.isArray(res) ? res : []
    },
    writeTags: (filePath: string, songInfo: any, tagWriteOptions: any) =>
      ipcRenderer.invoke('local-music:write-tags', { filePath, songInfo, tagWriteOptions }),
    getDirs: () => ipcRenderer.invoke('local-music:get-dirs'),
    setDirs: (dirs: string[]) => ipcRenderer.invoke('local-music:set-dirs', dirs),
    getList: () => ipcRenderer.invoke('local-music:get-list'),
    getUrlById: (id: string | number) => ipcRenderer.invoke('local-music:get-url', id),
    clearIndex: () => ipcRenderer.invoke('local-music:clear-index'),
    getCoverBase64: async (trackId: string) => {
      try {
        return await ipcRenderer.invoke('local-music:get-cover', trackId)
      } catch (e: any) {
        return ''
      }
    },
    getCoversBase64: async (trackIds: string[]) => {
      try {
        return await ipcRenderer.invoke('local-music:get-covers', trackIds)
      } catch (e: any) {
        return {}
      }
    },
    getTags: async (songmid: string, includeLyrics: boolean = true) => {
      try {
        return await ipcRenderer.invoke('local-music:get-tags', songmid, includeLyrics)
      } catch (e: any) {
        return null
      }
    },
    getLyric: async (songmid: string) => {
      try {
        return await ipcRenderer.invoke('local-music:get-lyric', songmid)
      } catch (e: any) {
        return ''
      }
    },
    onScanProgress: (callback: (processed: number, total: number) => void) => {
      const handler = (_event: any, data: { processed: number; total: number }) =>
        callback(data.processed, data.total)
      ipcRenderer.on('local-music:scan-progress', handler)
      return () => ipcRenderer.removeListener('local-music:scan-progress', handler)
    },
    onScanFinished: (callback: (resList: any[]) => void) => {
      const handler = (_event: any, resList: any[]) => callback(resList)
      ipcRenderer.on('local-music:scan-finished', handler)
      return () => ipcRenderer.removeListener('local-music:scan-finished', handler)
    },
    removeScanProgress: () => {
      ipcRenderer.removeAllListeners('local-music:scan-progress')
    },
    removeScanFinished: () => {
      ipcRenderer.removeAllListeners('local-music:scan-finished')
    }
  },

  // 插件通知相关
  pluginNotice: {
    onPluginNotice(callback: (data: string) => any) {
      function listener(_: any, data: any) {
        callback(data)
      }
      ipcRenderer.on('plugin-notice', listener)
      return () => ipcRenderer.removeListener('plugin-notice', listener)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', { ...electronAPI, ipcRenderer })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = { ...electronAPI, ipcRenderer }
  // @ts-ignore (define in dts)
  window.api = api
}
