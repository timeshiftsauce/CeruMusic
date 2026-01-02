import { ElectronAPI } from '@electron-toolkit/preload'
import { MainApi, MethodParams } from '../main/services/musicSdk/index'
import type { HotkeyConfig, HotkeyConfigPayload } from '../common/types/hotkeys'
// 自定义 API 接口
interface CustomAPI {
  autoUpdater: any
  minimize: () => void
  maximize: () => void
  close: () => void
  setMiniMode: (isMini: boolean) => void
  toggleFullscreen: () => void
  onMusicCtrl: (callback: (event: Event, args: any) => void) => () => void

  music: {
    requestSdk: <T extends keyof MainApi>(
      method: T,
      args: {
        source: any
      } & (MethodParams<T> extends object ? MethodParams<T> : { [key: string]: any })
    ) => ReturnType<MainApi[T]>
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }

  musicCache: {
    getInfo: () => Promise<any>
    clear: () => Promise
    getSize: () => Promise<string>
  }

  // 下载管理
  download: {
    getTasks: () => Promise<any[]>
    pauseTask: (taskId: string) => Promise<void>
    resumeTask: (taskId: string) => Promise<void>
    pauseAllTasks: () => Promise<void>
    resumeAllTasks: () => Promise<void>
    cancelTask: (taskId: string) => Promise<void>
    deleteTask: (taskId: string, deleteFile?: boolean) => Promise<void>
    retryTask: (taskId: string) => Promise<void>
    setMaxConcurrent: (max: number) => Promise<void>
    getMaxConcurrent: () => Promise<number>
    clearTasks: (type: 'queue' | 'completed' | 'failed' | 'all') => Promise<void>
    validateFiles: () => Promise<any[]>
    openFileLocation: (filePath: string) => Promise<void>
    onTaskAdded: (callback: (event: any, task: any) => void) => () => void
    onTaskProgress: (callback: (event: any, task: any) => void) => () => void
    onTaskStatusChanged: (callback: (event: any, task: any) => void) => () => void
    onTaskCompleted: (callback: (event: any, task: any) => void) => () => void
    onTaskError: (callback: (event: any, task: any) => void) => () => void
    onTaskDeleted: (callback: (event: any, taskId: string) => void) => () => void
    onTasksReset: (callback: (event: any, tasks: any[]) => void) => () => void
  }

  // 歌单管理 API
  songList: {
    // === 歌单管理 ===
    create: (name: string, description?: string, source?: string) => Promise<any>
    getAll: () => Promise<any>
    getById: (hashId: string) => Promise<any>
    delete: (hashId: string) => Promise<any>
    batchDelete: (hashIds: string[]) => Promise<any>
    edit: (hashId: string, updates: any) => Promise<any>
    updateCover: (hashId: string, coverImgUrl: string) => Promise<any>
    search: (keyword: string, source?: string) => Promise<any>
    getStatistics: () => Promise<any>
    exists: (hashId: string) => Promise<any>

    // === 歌曲管理 ===
    addSongs: (hashId: string, songs: any[]) => Promise<any>
    removeSong: (hashId: string, songmid: string | number) => Promise<any>
    removeSongs: (hashId: string, songmids: (string | number)[]) => Promise<any>
    clearSongs: (hashId: string) => Promise<any>
    getSongs: (hashId: string) => Promise<any>
    getSongCount: (hashId: string) => Promise<any>
    hasSong: (hashId: string, songmid: string | number) => Promise<any>
    getSong: (hashId: string, songmid: string | number) => Promise<any>
    searchSongs: (hashId: string, keyword: string) => Promise<any>
    getSongStatistics: (hashId: string) => Promise<any>
    validateIntegrity: (hashId: string) => Promise<any>
    repairData: (hashId: string) => Promise<any>
    forceSave: (hashId: string) => Promise<any>
    getFavoritesId: () => Promise<any>
    setFavoritesId: (favoritesId: string) => Promise<any>
  }

  ai: {
    ask: (prompt: string) => Promise<any>
    askStream: (prompt: string, streamId: string) => Promise<any>
    onStreamChunk: (callback: (data: { streamId: string; chunk: string }) => void) => void
    onStreamEnd: (callback: (data: { streamId: string }) => void) => void
    onStreamError: (callback: (data: { streamId: string; error: string }) => void) => void
    removeStreamListeners: () => void
  }

  // 插件管理API
  plugins: {
    selectAndAddPlugin: (type: 'lx' | 'cr') => Promise<any>
    downloadAndAddPlugin: (url: string, type: 'lx' | 'cr') => Promise<any>
    uninstallPlugin(pluginId: string): ApiResult | PromiseLike<ApiResult>
    addPlugin: (pluginCode: string, pluginName: string) => Promise<any>
    getPluginById: (id: string) => Promise<any>
    loadAllPlugins: () => Promise<any>
    getPluginLog: (pluginId: string) => Promise<any>
  }
  ping: (callback: Function<any>) => undefined
  pingService: {
    start: () => undefined
    stop: () => undefined
  }

  // 目录设置API
  directorySettings: {
    getDirectories: () => Promise<{
      cacheDir: string
      downloadDir: string
    }>
    selectCacheDir: () => Promise<{
      success: boolean
      path?: string
      message?: string
    }>
    selectDownloadDir: () => Promise<{
      success: boolean
      path?: string
      message?: string
    }>
    saveDirectories: (directories: { cacheDir: string; downloadDir: string }) => Promise<{
      success: boolean
      message: string
    }>
    resetDirectories: () => Promise<{
      success: boolean
      directories?: {
        cacheDir: string
        downloadDir: string
      }
      message?: string
    }>
    openDirectory: (dirPath: string) => Promise<{
      success: boolean
      message?: string
    }>
    getDirectorySize: (dirPath: string) => Promise<{
      size: number
      formatted: string
    }>
  }

  // 用户配置API
  getUserConfig: () => Promise<any>

  hotkeys: {
    get: () => Promise<{ success: boolean; data?: HotkeyConfig; error?: string; errors?: string[] }>
    set: (
      payload: HotkeyConfigPayload
    ) => Promise<{ success: boolean; data?: HotkeyConfig; error?: string; errors?: string[] }>
  }

  pluginNotice: {
    onPluginNotice: (listener: (...args: any[]) => void) => () => void
  }

  localMusic: {
    selectDirs: () => Promise<string[]>
    scan: (dirs: string[]) => Promise<any[]>
    writeTags: (
      filePath: string,
      songInfo: any,
      tagWriteOptions: any
    ) => Promise<{ success: boolean; message?: string }>
    onScanProgress: (callback: (processed: number, total: number) => void) => void
    onScanFinished: (callback: (resList: any[]) => void) => void
    removeScanProgress: () => void
    removeScanFinished: () => void
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
