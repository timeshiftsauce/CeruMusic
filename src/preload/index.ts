import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { HotkeyConfigPayload } from '@common/types/hotkeys'
import { normalizeLocalMusicScanResult } from './localMusicScan'

// Custom APIs for renderer
const api = {
  appInfo: {
    getVersion: () => ipcRenderer.invoke('get-app-version'),
    getFontList: () => ipcRenderer.invoke('get-font-list'),
    getPendingOpenPlaylistFiles: () => ipcRenderer.invoke('get-pending-open-playlist-files')
  },
  appEvents: {
    on: (channel: string, callback: (...args: any[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, ...args: any[]) => callback(...args)
      ipcRenderer.on(channel, handler)
      return () => ipcRenderer.removeListener(channel, handler)
    }
  },
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
    initializeSystem: () => ipcRenderer.invoke('service-plugin-initialize-system'),
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
      const handler = (_: Electron.IpcRendererEvent, data: { streamId: string; chunk: string }) =>
        callback(data)
      ipcRenderer.on('ai-stream-chunk', handler)
      return () => ipcRenderer.removeListener('ai-stream-chunk', handler)
    },
    onStreamEnd: (callback: (data: { streamId: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { streamId: string }) => callback(data)
      ipcRenderer.on('ai-stream-end', handler)
      return () => ipcRenderer.removeListener('ai-stream-end', handler)
    },
    onStreamError: (callback: (data: { streamId: string; error: string }) => void) => {
      const handler = (_: Electron.IpcRendererEvent, data: { streamId: string; error: string }) =>
        callback(data)
      ipcRenderer.on('ai-stream-error', handler)
      return () => ipcRenderer.removeListener('ai-stream-error', handler)
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
      return () => ipcRenderer.removeListener('auto-updater:checking-for-update', callback)
    },
    onUpdateAvailable: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-available', callback)
      return () => ipcRenderer.removeListener('auto-updater:update-available', callback)
    },
    onUpdateNotAvailable: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-not-available', callback)
      return () => ipcRenderer.removeListener('auto-updater:update-not-available', callback)
    },
    onDownloadProgress: (callback: (progress: any) => void) => {
      const handler = (_: Electron.IpcRendererEvent, progress: any) => callback(progress)
      ipcRenderer.on('auto-updater:download-progress', handler)
      return () => ipcRenderer.removeListener('auto-updater:download-progress', handler)
    },
    onUpdateDownloaded: (callback: () => void) => {
      ipcRenderer.on('auto-updater:update-downloaded', callback)
      return () => ipcRenderer.removeListener('auto-updater:update-downloaded', callback)
    },
    onError: (callback: (error: string) => void) => {
      const handler = (_: Electron.IpcRendererEvent, error: string) => callback(error)
      ipcRenderer.on('auto-updater:error', handler)
      return () => ipcRenderer.removeListener('auto-updater:error', handler)
    },
    onDownloadStarted: (callback: (updateInfo: any) => void) => {
      const handler = (_: Electron.IpcRendererEvent, updateInfo: any) => callback(updateInfo)
      ipcRenderer.on('auto-updater:download-started', handler)
      return () => ipcRenderer.removeListener('auto-updater:download-started', handler)
    },

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
    scan: async (dirs: string[]) => normalizeLocalMusicScanResult(await ipcRenderer.invoke('local-music:scan', dirs)),
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
    batchMatch: (songmids: string[]) => ipcRenderer.invoke('local-music:batch-match', songmids),
    onBatchMatchProgress: (
      callback: (processed: number, total: number, matched: number) => void
    ) => {
      const handler = (_event: any, data: { processed: number; total: number; matched: number }) =>
        callback(data.processed, data.total, data.matched)
      ipcRenderer.on('local-music:batch-match-progress', handler)
      return () => ipcRenderer.removeListener('local-music:batch-match-progress', handler)
    },
    onBatchMatchFinished: (callback: (res: any) => void) => {
      const handler = (_event: any, res: any) => callback(res)
      ipcRenderer.on('local-music:batch-match-finished', handler)
      return () => ipcRenderer.removeListener('local-music:batch-match-finished', handler)
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
  },
  desktopLyric: {
    getOption: () => ipcRenderer.invoke('get-desktop-lyric-option'),
    getOpenState: () => ipcRenderer.invoke('get-lyric-open-state'),
    getLockState: () => ipcRenderer.invoke('get-lyric-lock-state'),
    getWindowBounds: () => ipcRenderer.invoke('get-window-bounds'),
    getAllWorkArea: () => ipcRenderer.invoke('get-all-work-area'),
    changeOpen: (open: boolean) => ipcRenderer.send('change-desktop-lyric', open),
    toggleLock: (lock: boolean) => ipcRenderer.send('toogleDesktopLyricLock', lock),
    setOption: (payload: any, callback: boolean = false) =>
      ipcRenderer.send('set-desktop-lyric-option', payload, callback),
    setFont: (font: string) => ipcRenderer.send('set-desktop-lyric-font', font),
    moveWindow: (x: number, y: number, width: number, height: number) =>
      ipcRenderer.send('move-window', x, y, width, height),
    updateWindowHeight: (height: number) => ipcRenderer.send('update-window-height', height),
    sendWindowEvent: (eventName: string, ...args: any[]) => ipcRenderer.send(eventName, ...args),
    sendMainEvent: (eventName: string, ...args: any[]) =>
      ipcRenderer.send('send-main-event', eventName, ...args),
    lyricWindowReady: () => ipcRenderer.send('lyric-window-ready'),
    onOpenChange: (callback: (open: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, open: boolean) => callback(open)
      ipcRenderer.on('desktop-lyric-open-change', handler)
      return () => ipcRenderer.removeListener('desktop-lyric-open-change', handler)
    },
    onSongChange: (callback: (data: { name?: string; artist?: string }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: { name?: string; artist?: string }
      ) => callback(data)
      ipcRenderer.on('play-song-change', handler)
      return () => ipcRenderer.removeListener('play-song-change', handler)
    },
    onLyricChange: (callback: (lines: any[]) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, lines: any[]) => callback(lines)
      ipcRenderer.on('play-lyric-change', handler)
      return () => ipcRenderer.removeListener('play-lyric-change', handler)
    },
    onLyricIndexChange: (callback: (index: number) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, index: number) => callback(index)
      ipcRenderer.on('play-lyric-index', handler)
      return () => ipcRenderer.removeListener('play-lyric-index', handler)
    },
    onLyricProgress: (callback: (payload: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, payload: any) => callback(payload)
      ipcRenderer.on('play-lyric-progress', handler)
      return () => ipcRenderer.removeListener('play-lyric-progress', handler)
    },
    onPlayStatusChange: (callback: (status: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, status: boolean) => callback(status)
      ipcRenderer.on('play-status-change', handler)
      return () => ipcRenderer.removeListener('play-status-change', handler)
    },
    onOptionChange: (callback: (option: any) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, option: any) => callback(option)
      ipcRenderer.on('desktop-lyric-option-change', handler)
      return () => ipcRenderer.removeListener('desktop-lyric-option-change', handler)
    },
    onFontChange: (callback: (font: string) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, font: string) => callback(font)
      ipcRenderer.on('set-desktop-lyric-font', handler)
      return () => ipcRenderer.removeListener('set-desktop-lyric-font', handler)
    },
    onLockChange: (callback: (lock: boolean) => void) => {
      const handler = (_event: Electron.IpcRendererEvent, lock: boolean) => callback(lock)
      ipcRenderer.on('toogleDesktopLyricLock', handler)
      return () => ipcRenderer.removeListener('toogleDesktopLyricLock', handler)
    },
    onCloseRequest: (callback: () => void) => {
      ipcRenderer.on('closeDesktopLyric', callback)
      return () => ipcRenderer.removeListener('closeDesktopLyric', callback)
    }
  },
  recognitionWorker: {
    ready: () => ipcRenderer.send('worker:ready'),
    sendGenerated: (payload: any) => ipcRenderer.send('worker:fp-generated', payload),
    sendError: (payload: any) => ipcRenderer.send('worker:fp-error', payload),
    onStartTask: (callback: (payload: { id: string; filePath: string }) => void) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        payload: { id: string; filePath: string }
      ) => callback(payload)
      ipcRenderer.on('worker:start-task', handler)
      return () => ipcRenderer.removeListener('worker:start-task', handler)
    }
  },
  // 系统音频采集
  systemAudio: {
    getDefaultScreenSourceId: async () => {
      return ipcRenderer.invoke('system-audio:get-default-source-id')
    },
    getAllScreenSourceIds: async () => {
      // 暂时保留这个或者也迁移到主进程，目前主要用 getDefaultScreenSourceId
      return []
    }
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
