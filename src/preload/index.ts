import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import type { HotkeyConfigPayload } from '@common/types/hotkeys'

// Custom APIs for renderer
const api = {
  musicDataRepair: {
    inspect: () => ipcRenderer.invoke('music:repair-inspect'),
    begin: (storage: Record<string, string | null>, restoreMissing: boolean) => ipcRenderer.invoke('music:repair-begin', storage, restoreMissing),
    finish: () => ipcRenderer.invoke('music:repair-finish'),
    rollback: () => ipcRenderer.invoke('music:repair-rollback'),
    rollbackComplete: () => ipcRenderer.invoke('music:repair-rollback-complete'),
    openBackup: () => ipcRenderer.invoke('music:repair-open-backup')
  },
  deepLinks: {
    pending: (): Promise<import('../common/types/deepLink').QueuedDeepLink[]> =>
      ipcRenderer.invoke('deeplink:pending'),
    acknowledge: (sequence: number) => ipcRenderer.invoke('deeplink:ack', sequence),
    onChanged: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('deeplink:changed', handler)
      return () => ipcRenderer.removeListener('deeplink:changed', handler)
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
  /** 把主窗口拉到前台 —— 系统通知点击时用,主进程会处理 show/restore/focus */
  show: () => {
    ipcRenderer.send('window-show')
  },
  toggleFullscreen: () => ipcRenderer.send('window-toggle-fullscreen'),
  /** 监听主进程原生全屏状态变化 */
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => {
    const handler = (_: Electron.IpcRendererEvent, value: boolean) => callback(value)
    ipcRenderer.on('app-fullscreen-changed', handler)
    ipcRenderer.send('window:request-fullscreen-state')
    return () => ipcRenderer.removeListener('app-fullscreen-changed', handler)
  },
  onMusicCtrl: (callback: (event: Electron.IpcRendererEvent, ...args: any[]) => void) => {
    // 音乐控制
    const handler = (event: Electron.IpcRendererEvent) => callback(event)
    ipcRenderer.on('music-control', handler)
    return () => ipcRenderer.removeListener('music-control', handler)
  },
  // 音乐相关方法
  music: {
    requestSdk: async (api: string, args: any) => {
      const result = await ipcRenderer.invoke('service-music-sdk-request', api, args)
      if (result?.__ceruMusicSdkError === true) throw new Error(String(result.message))
      return result
    },
    invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args)
  },
  //音源插件
  plugins: {
    accountLogout: (pluginId: string, itemId: string) =>
      ipcRenderer.invoke('plugin:account-logout', pluginId, itemId),
    accountSummary: (pluginId: string, itemId: string) =>
      ipcRenderer.invoke('plugin:account-summary', pluginId, itemId),
    onAccountChanged: (callback: (event: { pluginId: string }) => void) => {
      const listener = (_event: any, value: { pluginId: string }) => callback(value)
      ipcRenderer.on('plugin:account-changed', listener)
      return () => ipcRenderer.removeListener('plugin:account-changed', listener)
    },
    prepareExternal: (sequence: number) => ipcRenderer.invoke('plugin:external:prepare', sequence),
    commitExternal: (sequence: number, format?: string) =>
      ipcRenderer.invoke('plugin:external:commit', sequence, format),
    discardExternal: (sequence: number) => ipcRenderer.invoke('plugin:external:discard', sequence),
    openPlaylistImportMenu: (pluginId: string, menuId: string) =>
      ipcRenderer.invoke('plugin:playlist-import-menu', pluginId, menuId),
    guestImport: (pluginId: string, adapterId: string, url?: string) =>
      ipcRenderer.invoke('plugin:guest-import', pluginId, adapterId, url),
    guestList: (pluginId: string) => ipcRenderer.invoke('plugin:guest-list', pluginId),
    guestSelect: (pluginId: string, guestId: string | null) =>
      ipcRenderer.invoke('plugin:guest-select', pluginId, guestId),
    guestUpdate: (pluginId: string, guestId: string, url: string) =>
      ipcRenderer.invoke('plugin:guest-update', pluginId, guestId, url),
    guestRemove: (pluginId: string, guestId: string) =>
      ipcRenderer.invoke('plugin:guest-remove', pluginId, guestId),
    guestPermissions: (pluginId: string, guestId: string) =>
      ipcRenderer.invoke('plugin:guest-permissions', pluginId, guestId),
    guestSetPermissions: (pluginId: string, guestId: string, keys: string[]) =>
      ipcRenderer.invoke('plugin:guest-set-permissions', pluginId, guestId, keys),
    onUI: (callback: (request: any) => void) => {
      const listener = (_event: any, request: any) => callback(request)
      ipcRenderer.on('plugin:ui', listener)
      return () => ipcRenderer.removeListener('plugin:ui', listener)
    },
    respondUI: (result: any) => ipcRenderer.invoke('plugin:ui-result', result),
    uiReady: (ready: boolean) => ipcRenderer.invoke('plugin:ui-ready', ready),
    publishHostEvent: (event: string, value: unknown, pluginId?: string) =>
      ipcRenderer.invoke('plugin:publish-host-event', event, value, pluginId),
    onUICancel: (callback: (request: { id: string }) => void) => {
      const listener = (_event: any, request: { id: string }) => callback(request)
      ipcRenderer.on('plugin:ui-cancel', listener)
      return () => ipcRenderer.removeListener('plugin:ui-cancel', listener)
    },
    openSurface: (pluginId: string, surfaceId: string) =>
      ipcRenderer.invoke('plugin:open-surface', pluginId, surfaceId),
    mountSurface: (pluginId: string, surfaceId: string) =>
      ipcRenderer.invoke('plugin:mount-surface', pluginId, surfaceId),
    surfaceReady: (pluginId: string, surfaceId: string, sessionId: string) =>
      ipcRenderer.invoke('plugin:surface-ready', pluginId, surfaceId, sessionId),
    onSurfaceState: (callback: (event: any) => void) => {
      const listener = (_event: any, value: any) => callback(value)
      ipcRenderer.on('plugin:surface-state', listener)
      return () => ipcRenderer.removeListener('plugin:surface-state', listener)
    },
    surfaceAction: async (
      pluginId: string,
      surfaceId: string,
      sessionId: string,
      action: string,
      input: unknown
    ) => {
      const result = await ipcRenderer.invoke(
        'plugin:surface-action',
        pluginId,
        surfaceId,
        sessionId,
        action,
        input
      )
      if (result.cancelled) {
        const error = new Error('插件页面已关闭')
        error.name = 'AbortError'
        throw error
      }
      return result.value
    },
    drawerAction: (
      pluginId: string,
      surfaceId: string,
      sessionId: string,
      index: number,
      values: Record<string, unknown>
    ) => ipcRenderer.invoke('plugin:drawer-action', pluginId, surfaceId, sessionId, index, values),
    closeDrawer: (pluginId: string, surfaceId: string, sessionId: string) =>
      ipcRenderer.invoke('plugin:drawer-close', pluginId, surfaceId, sessionId),
    contributions: () => ipcRenderer.invoke('plugin:contributions'),
    restoreEnabled: () => ipcRenderer.invoke('plugin:restore-enabled'),
    setActive: (pluginId: string | null) => ipcRenderer.invoke('plugin:set-active', pluginId),
    setProviderOwner: (source: string, pluginId: string | null) =>
      ipcRenderer.invoke('plugin:set-provider-owner', source, pluginId),
    setCapabilityOwner: (source: string, capability: string, pluginId: string | null) =>
      ipcRenderer.invoke('plugin:set-capability-owner', source, capability, pluginId),
    setEnabled: (pluginId: string, enabled: boolean) =>
      ipcRenderer.invoke('plugin:set-enabled', pluginId, enabled),
    updateLocal: (pluginId: string) => ipcRenderer.invoke('plugin:update-local', pluginId),
    updateFromUrl: (pluginId: string, url: string) =>
      ipcRenderer.invoke('plugin:update-url', pluginId, url),
    onChanged: (callback: (change?: any) => void) => {
      const listener = (_event: any, change?: any) => callback(change)
      ipcRenderer.on('plugin:changed', listener)
      return () => ipcRenderer.removeListener('plugin:changed', listener)
    },
    importerTracks: (pluginId: string, importerId: string, input: any) =>
      ipcRenderer.invoke('plugin:importer-tracks', pluginId, importerId, input),
    selectAndAddPlugin: (type: 'lx' | 'cr') =>
      ipcRenderer.invoke('service-plugin-selectAndAddPlugin', type),
    downloadAndAddPlugin: (url: string, type: 'lx' | 'cr', targetPluginId?: string) =>
      ipcRenderer.invoke('service-plugin-downloadAndAddPlugin', url, type, targetPluginId),
    addPlugin: (pluginCode: string, pluginName: string, targetPluginId?: string) =>
      ipcRenderer.invoke('service-plugin-addPlugin', pluginCode, pluginName, targetPluginId),
    getPluginById: (id: string) => ipcRenderer.invoke('service-plugin-getPluginById', id),
    loadAllPlugins: () => ipcRenderer.invoke('service-plugin-loadAllPlugins'),
    uninstallPlugin: (pluginId: string) =>
      ipcRenderer.invoke('service-plugin-uninstallPlugin', pluginId),
    getPluginLog: (pluginId: string) => ipcRenderer.invoke('service-plugin-getPluginLog', pluginId),
    // 服务插件相关
    getPluginType: (pluginId: string) =>
      ipcRenderer.invoke('service-plugin-getPluginType', pluginId),
    getConfigSchema: (pluginId: string) =>
      ipcRenderer.invoke('service-plugin-getConfigSchema', pluginId),
    getConfig: (pluginId: string) => ipcRenderer.invoke('service-plugin-getConfig', pluginId),
    getPermissions: (pluginId: string) =>
      ipcRenderer.invoke('service-plugin-getPermissions', pluginId),
    getManifest: (pluginId: string) => ipcRenderer.invoke('service-plugin-getManifest', pluginId),
    savePermissions: (pluginId: string, permissions: string[]) =>
      ipcRenderer.invoke('service-plugin-savePermissions', pluginId, permissions),
    saveConfig: (pluginId: string, config: Record<string, any>) =>
      ipcRenderer.invoke('service-plugin-saveConfig', pluginId, config),
    testConnection: (pluginId: string) =>
      ipcRenderer.invoke('service-plugin-testConnection', pluginId),
    getPlaylists: (pluginId: string) => ipcRenderer.invoke('service-plugin-getPlaylists', pluginId),
    getPlaylistSongs: (pluginId: string, playlistId: string) =>
      ipcRenderer.invoke('service-plugin-getPlaylistSongs', pluginId, playlistId),
    importToLocal: (pluginId: string, playlistId: string, playlistName?: string) =>
      ipcRenderer.invoke('service-plugin-importToLocal', pluginId, playlistId, playlistName),
    getServiceLyric: (pluginId: string, songInfo: any) =>
      ipcRenderer.invoke('service-plugin-getServiceLyric', pluginId, songInfo),
    onDeepLinkAdd: (
      callback: (payload: { url: string; type: 'lx' | 'cr'; targetPluginId?: string }) => void
    ) => {
      const handler = (
        _: any,
        payload: { url: string; type: 'lx' | 'cr'; targetPluginId?: string }
      ) => callback(payload)
      ipcRenderer.on('plugin-add-link', handler)
      return () => ipcRenderer.removeListener('plugin-add-link', handler)
    }
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
  // 窗口关闭请求监听（Ctrl+W / Alt+F4）
  windowClose: {
    onRequest: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('window-close-requested', handler)
      return () => ipcRenderer.removeListener('window-close-requested', handler)
    }
  },
  // 设置同步 API：把 closeToTray 等渲染端配置同步到主进程
  settings: {
    syncCloseToTray: (value: boolean) => {
      ipcRenderer.send('settings:sync-close-to-tray', value)
    },
    getCloseToTray: () => ipcRenderer.invoke('settings:get-close-to-tray')
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
    replaceSongs: (id: string, songs: any[]) => ipcRenderer.invoke('songlist:replace-songs', id, songs),
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
    reorderSongs: (hashId: string, songmids: (string | number)[]) =>
      ipcRenderer.invoke('songlist:reorder-songs', hashId, songmids),
    moveSong: (hashId: string, songmid: string | number, toIndex: number) =>
      ipcRenderer.invoke('songlist:move-song', hashId, songmid, toIndex),

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
    downloadUpdate: (mode?: 'differential' | 'full') =>
      ipcRenderer.invoke('auto-updater:download-update', mode),
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
    onDifferentialFallback: (callback: (info: { reason: string }) => void) => {
      ipcRenderer.on('auto-updater:differential-fallback', (_, info) => callback(info))
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
      ipcRenderer.removeAllListeners('auto-updater:differential-fallback')
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
    onTagsChanged: (
      callback: (event: import('../common/types/localMusicMetadata').LocalMusicTagsChanged) => void
    ) => {
      const handler = (
        _event: Electron.IpcRendererEvent,
        data: import('../common/types/localMusicMetadata').LocalMusicTagsChanged
      ) => callback(data)
      ipcRenderer.on('local-music:tags-changed', handler)
      return () => ipcRenderer.removeListener('local-music:tags-changed', handler)
    },
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
    },
    removeBatchMatchListeners: () => {
      ipcRenderer.removeAllListeners('local-music:batch-match-progress')
      ipcRenderer.removeAllListeners('local-music:batch-match-finished')
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
    },
    onPluginThrottle(
      callback: (data: { pluginId: string; reason: string; duration?: number }) => void
    ) {
      function listener(_: any, data: any) {
        callback(data)
      }
      ipcRenderer.on('plugin-throttle', listener)
      return () => ipcRenderer.removeListener('plugin-throttle', listener)
    },
    onPluginDisabled(callback: (data: { pluginId: string; reason: string }) => void) {
      function listener(_: any, data: any) {
        callback(data)
      }
      ipcRenderer.on('plugin-disabled', listener)
      return () => ipcRenderer.removeListener('plugin-disabled', listener)
    }
  },
  // 系统音频采集
  systemAudio: {
    prepareCapture: async () => {
      return ipcRenderer.invoke('system-audio:prepare-capture')
    },
    getDefaultScreenSourceId: async () => {
      return ipcRenderer.invoke('system-audio:get-default-source-id')
    },
    getAllScreenSourceIds: async () => {
      // 暂时保留这个或者也迁移到主进程，目前主要用 getDefaultScreenSourceId
      return []
    }
  },
  // 歌曲分享
  share: {
    exportPlaylistResolver: (sources: string[]) =>
      ipcRenderer.invoke('share:playlist-resolver:export', sources),
    exportResolver: (source: string, song: any) =>
      ipcRenderer.invoke('share:resolver:export', source, song),
    createDescriptor: (source: string, song: any) =>
      ipcRenderer.invoke('share:descriptor:create', source, song),
    readDescriptor: (id: string) => ipcRenderer.invoke('share:descriptor:read', id),
    getPluginCodeAndMd5: (
      pluginId: string
    ): Promise<{ code: string; md5: string; type: 'cr' | 'lx' } | { error: string }> =>
      ipcRenderer.invoke('service-share-getPluginCodeAndMd5', pluginId)
  },
  clipboard: {
    /** 通过主进程读取系统剪贴板,绕过 renderer 焦点 / 权限限制 */
    readText: (): Promise<string> => ipcRenderer.invoke('clipboard:read-text')
  },
  /**
   * Windows 任务栏缩略图工具栏(Thumbnail Toolbar)桥
   * 主进程 thumbarService 实现按钮渲染 + cover overlay + tooltip,
   * 渲染端只需推送语义状态,所有平台分支在主进程处理。
   * 非 Windows 平台 setThumbarButtons 自动 no-op,渲染端无需判断。
   */
  thumbar: {
    setState: (state: {
      hasSong: boolean
      isPlaying: boolean
      isLiked: boolean
      songName: string
      singer: string
    }) => ipcRenderer.send('thumbar:set-state', state),
    setCover: (dataUrl: string | null) => ipcRenderer.send('thumbar:set-cover', dataUrl),
    /** 喜欢按钮点击回调 —— 主进程发 'thumbar:toggle-like' */
    onToggleLike: (callback: () => void) => {
      const handler = () => callback()
      ipcRenderer.on('thumbar:toggle-like', handler)
      return () => ipcRenderer.removeListener('thumbar:toggle-like', handler)
    }
  },
  /**
   * 应用级窗口控件:窗口标题 + 任务栏/Dock 进度条
   * - setTitle: 启动时为软件名,有歌时为"歌名 - 歌手"(参考网易云/QQ音乐)
   * - setProgress: Windows 任务栏图标进度 + macOS Dock 进度;
   *   传入 [0,1] 显示;< 0 清除;{paused:true} 显示暂停态(黄色,Windows)
   */
  app: {
    setTitle: (title: string) => ipcRenderer.send('app:set-title', title),
    setProgress: (progress: number, options?: { paused?: boolean }) =>
      ipcRenderer.send('app:set-progress', progress, options || null)
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
