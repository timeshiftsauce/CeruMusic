import { ElectronAPI } from '@electron-toolkit/preload'
import { MainApi, MethodParams } from '../main/services/musicSdk/index'
import type {
  HotkeyAction,
  HotkeyConfig,
  HotkeyConfigPayload,
  HotkeyStatus
} from '../common/types/hotkeys'
// 自定义 API 接口
interface DevModeState {enabled:boolean;entries:{path:string;enabled:boolean;id?:string;runtime?:2|3;error?:string}[]}
interface CustomAPI {
  karaoke: import('../common/karaoke').KaraokeApi
  musicDataRepair: {
    inspect: () => Promise<any>
    begin: (storage: Record<string, string | null>, restoreMissing: boolean) => Promise<any>
    finish: () => Promise<void>
    rollback: () => Promise<Record<string, string | null> | null>
    rollbackComplete: () => Promise<void>
    openBackup: () => Promise<void>
  }
  deepLinks: {
    pending: () => Promise<import('../common/types/deepLink').QueuedDeepLink[]>
    acknowledge: (sequence: number) => Promise<void>
    onChanged: (callback: () => void) => () => void
  }
  autoUpdater: any
  minimize: () => void
  maximize: () => void
  close: () => void
  setMiniMode: (isMini: boolean) => void
  /** 把主窗口拉到前台 —— 系统通知点击时用 */
  show: () => void
  toggleFullscreen: () => void
  onFullscreenChanged: (callback: (isFullscreen: boolean) => void) => () => void
  /** 窗口后台状态（最小化 / 隐藏到托盘） */
  getWindowBackgroundState: () => Promise<boolean>
  onWindowBackgroundChange: (callback: (isBackground: boolean) => void) => () => void
  onMusicCtrl: (callback: (event: Event, args: any) => void) => () => void

  music: {
    requestSdk: <T extends keyof MainApi>(
      method: T,
      args: {
        source: any
      } & (MethodParams<T> extends object ? MethodParams<T> : { [key: string]: any })
    ) => Promise<any>
    invoke: (channel: string, ...args: any[]) => Promise<any>
  }

  musicCache: {
    getInfo: () => Promise<{
      count: number
      size: number
      sizeFormatted: string
      maxBytes: number
      maxFormatted: string
      maxQuality: string
      percent: number
      breakdown: Array<{
        key: 'audio' | 'cover' | 'lyric'
        count: number
        size: number
        sizeFormatted: string
        percent: number
      }>
      /** 按音质聚合（仅音频），用于设置页的扇形图 */
      qualityBreakdown: Array<{
        quality: string
        count: number
        size: number
        sizeFormatted: string
        percent: number
      }>
    }>
    clear: () => Promise<{ success: boolean; message: string }>
    getSize: () => Promise<string>
    getPolicy: () => Promise<{ maxBytes: number; maxQuality: string }>
    setPolicy: (policy: {
      maxBytes?: number
      maxQuality?: string
    }) => Promise<{ success: boolean; evicted?: number; freedBytes?: number; message?: string }>
    enforceLimit: () => Promise<{
      success: boolean
      evicted?: number
      freedBytes?: number
      message?: string
    }>
    /** 读取已落盘的封面图片地址，未缓存返回 null */
    getCoverFile: (songCacheKey: string) => Promise<string | null>
    /** 把已下载的封面图片写入缓存，返回只读封面地址 */
    putCoverFile: (songCacheKey: string, data: ArrayBuffer, ext: string) => Promise<string | null>
    /** 清除某首歌的封面缓存（图片损坏时用） */
    invalidateCoverFile: (songCacheKey: string) => Promise<{ success: boolean }>
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
    replaceSongs: (id: string, songs: any[]) => Promise<{ success: boolean; error?: string }>
    // === 歌单管理 ===
    create: (
      name: string,
      description?: string,
      source?: string,
      meta?: Record<string, any>
    ) => Promise<any>
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
    reorderSongs: (hashId: string, songmids: (string | number)[]) => Promise<any>
    moveSong: (hashId: string, songmid: string | number, toIndex: number) => Promise<any>
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

  windowClose: {
    onRequest: (callback: () => void) => () => void
  }

  // 设置同步：把渲染端某些配置（如 closeToTray）同步到主进程
  settings: {
    syncCloseToTray: (value: boolean) => void
    getCloseToTray: () => Promise<boolean>
    getNetworkProxy: () => Promise<import('../main/services/networkProxy').NetworkProxyConfig>
    setNetworkProxy: (
      config: Partial<import('../main/services/networkProxy').NetworkProxyConfig>
    ) => Promise<
      | { success: true; config: import('../main/services/networkProxy').NetworkProxyConfig }
      | { success: false; error: string }
    >
    testNetworkProxy: (
      config: Partial<import('../main/services/networkProxy').NetworkProxyConfig>
    ) => Promise<import('../main/services/networkProxy').NetworkProxyTestResult>
    /** 信任系统证书（Node 侧 TLS，兼容抓包代理） */
    getTrustSystemCertificates: () => Promise<{ enabled: boolean; supported: boolean }>
    setTrustSystemCertificates: (value: boolean) => Promise<{ success: boolean; applied: boolean }>
  }

  // 插件管理API
  plugins: {
    accountConnections: (pluginId:string,itemId:string,validate?:boolean) => Promise<{active:string|null;rows:{id:string;expired?:boolean;syncLikes?:boolean;summary:import('@shiqianjiang/ceru-plugin-sdk').AccountSummary}[]}>
    accountLikes:(pluginId:string,itemId:string,connection:string,enabled:boolean,ref?:import('@shiqianjiang/ceru-plugin-sdk').ResourceRef)=>Promise<void>
    accountCollection: (pluginId:string,itemId:string,capability:import('@shiqianjiang/ceru-plugin-sdk').AccountListCapability,connection:string,cursor?:string)=>Promise<import('@shiqianjiang/ceru-plugin-sdk').Page<import('@shiqianjiang/ceru-plugin-sdk').ContentEntity>>
    cancelAccountQr: (pluginId:string,ticket:string) => Promise<void>
    accountChange: (pluginId:string,itemId:string,action:'login'|'switch'|'logout',connection?:string,method?:'form'|'qrcode'|'oauth'|'browser') => Promise<boolean>
    accountLogout: (pluginId: string, itemId: string) => Promise<void>
    accountSummary: (
      pluginId: string,
      itemId: string
    ) => Promise<import('@shiqianjiang/ceru-plugin-sdk').AccountSummary>
    onAccountChanged: (callback: (event: { pluginId: string }) => void) => () => void
    guestImport: (
      pluginId: string,
      adapterId: string,
      url?: string
    ) => Promise<import('@shiqianjiang/ceru-plugin-sdk').GuestInfo | null>
    guestList: (pluginId: string) => Promise<import('@shiqianjiang/ceru-plugin-sdk').GuestInfo[]>
    guestSelect: (pluginId: string, guestId: string | null) => Promise<void>
    guestUpdate: (
      pluginId: string,
      guestId: string,
      url: string
    ) => Promise<import('@shiqianjiang/ceru-plugin-sdk').GuestInfo>
    guestRemove: (pluginId: string, guestId: string) => Promise<void>
    guestPermissions: (pluginId: string, guestId: string) => Promise<string[]>
    guestSetPermissions: (pluginId: string, guestId: string, keys: string[]) => Promise<void>
    hookControls: (change?:import('../common/pluginHookControls').HookControlChange) => Promise<import('../common/pluginHookControls').HookControls>
    hookSnapshot: () => Promise<import('../common/pluginHookControls').HookSnapshot>
    trackLike: (id:string,input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['track.like'],location:string) => Promise<{prevented:boolean;handledBy:string[]}>
    playlistCreate: (id:string,input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['playlist.create']) => Promise<{prevented:boolean;handledBy:string[]}>
    playlistDelete: (id:string,input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['playlist.delete']) => Promise<{prevented:boolean;handledBy:string[]}>
    playlistExport: (id:string,input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['playlist.export']) => Promise<{prevented:boolean;handledBy:string[]}>
    playlistImport: (id:string,input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['playlist.import']) => Promise<{prevented:boolean;handledBy:string[]}>
    windowClose: (id:string,location:'titlebar'|'shortcut') => Promise<{prevented:boolean;handledBy:string[]}>
    replayDownload: (token:string)=>Promise<unknown>
    shareCreate: (id:string,input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['share.create'])=>Promise<{prevented:boolean;handledBy:string[];result:import('@shiqianjiang/ceru-plugin-sdk').ShareOperationResult|null}>
    systemOperation: (id:string,name:import('@shiqianjiang/ceru-plugin-sdk').SystemOperationName,input:unknown)=>Promise<{prevented:boolean;handledBy:string[]}>
    dispatchLink: (url:string)=>Promise<boolean>
    playlistTracks: (id:string,name:'playlist.addTracks'|'playlist.removeTracks',input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['playlist.addTracks']) => Promise<{prevented:boolean;handledBy:string[]}>
    searchQuery: (input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['search.query']) => Promise<string | null>
    searchSuggest: (input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['search.suggest']) => Promise<string[]>
    searchResults: (input:import('@shiqianjiang/ceru-plugin-sdk').OperationInputs['search.results']) => Promise<import('@shiqianjiang/ceru-plugin-sdk').SearchResultItem[]>
    onHookNames: (callback:(snapshot:{revision:number;names:string[]})=>void) => () => void
    runPlaybackOperation: (id:string,name:string,input:unknown,from?:string,system?:boolean) => Promise<{prevented:boolean;handledBy:string[]}>
    onUI: (callback: (request: any) => void) => () => void
    respondUI: (result: any) => Promise<any>
    uiReady: (ready: boolean) => Promise<boolean>
    guardRoute: (to: import('@shiqianjiang/ceru-plugin-sdk').PluginRoute, from: import('@shiqianjiang/ceru-plugin-sdk').PluginRoute | null, owner?:string) => Promise<{prevented:boolean;handledBy:string[];redirect:import('@shiqianjiang/ceru-plugin-sdk').PluginRoute|null}>
    routeCompleted: (to: import('@shiqianjiang/ceru-plugin-sdk').PluginRoute, from: import('@shiqianjiang/ceru-plugin-sdk').PluginRoute | null) => Promise<void>
    reportEnvironment: (online: boolean, locale: string) => Promise<void>
    publishHostEvent: (event: string, value: unknown, pluginId?: string) => Promise<void>
    onUICancel: (callback: (request: { id: string }) => void) => () => void
    openSurface: (pluginId: string, surfaceId: string) => Promise<any>
    skinChoice: (choice?: import('@common/pluginSkin').SkinChoice | null) => Promise<import('@common/pluginSkin').SkinPreferences>
    regionChoice: (edit: import('@common/pluginSkin').RegionEdit) => Promise<import('@common/pluginSkin').SkinPreferences>
    skinSetting: (edit: import('@common/pluginSkin').SkinSettingEdit) => Promise<import('@common/pluginSkin').SkinPreferences>
    mountSurface: (
      pluginId: string,
      surfaceId: string,
      slot?: string,
      section?: import('@common/pluginPlaylistContext').PlaylistSectionContext,
      region?: string
    ) => Promise<import('@common/pluginDrawer').PluginVisibleSession>
    surfaceReady: (
      pluginId: string,
      surfaceId: string,
      sessionId: string
    ) => Promise<import('@shiqianjiang/ceru-plugin-sdk').JsonObject>
    onSurfaceState: (
      callback: (event: {
        pluginId: string
        sessionId: string
        state?: import('@shiqianjiang/ceru-plugin-sdk').JsonObject
        closed: boolean
      }) => void
    ) => () => void
    surfaceAction: (
      pluginId: string,
      surfaceId: string,
      sessionId: string,
      action: string,
      input: unknown
    ) => Promise<any>
    drawerAction: (
      pluginId: string,
      surfaceId: string,
      sessionId: string,
      index: number,
      values: Record<string, unknown>
    ) => Promise<import('@shiqianjiang/ceru-plugin-sdk').JsonObject>
    closeDrawer: (pluginId: string, surfaceId: string, sessionId: string) => Promise<void>
    strictMode:(enabled?:boolean)=>Promise<boolean>
    devState:()=>Promise<DevModeState>
    setDevMode:(enabled:boolean)=>Promise<DevModeState>
    addDevFile:()=>Promise<DevModeState>
    removeDevFile:(file:string)=>Promise<DevModeState>
    onDevReloaded:(callback:()=>void)=>()=>void
    musicSources: () => Promise<import('@shiqianjiang/ceru-plugin-sdk').MusicSource[]>
    guardProviderSelection: (id:string, pluginId:string, providerId:string, source:string|null, provider:string|null) => Promise<boolean>
    cancelProviderSelection: (id:string) => Promise<void>
    evaluatePageVisibility: (pluginId: string, entryId: string, source: string | null, provider: string | null, kind?: 'page' | 'provider') => Promise<unknown>
    contributions: () => Promise<any[]>
    getPathForFile: (file: File) => string
    queueExternalFile: (filePath: string) => Promise<{ sequence: number }>
    prepareExternal: (sequence: number) => Promise<{
      name: string
      version: string
      description: string
      update: boolean
      componentViews: boolean
      formats: { value: string; label: string }[]
    }>
    commitExternal: (sequence: number, format?: string) => Promise<any>
    discardExternal: (sequence: number) => Promise<void>
    openPlaylistImportMenu: (pluginId: string, menuId: string) => Promise<unknown>
    restoreEnabled: () => Promise<void>
    setActive: (
      pluginId: string | null
    ) => Promise<{ success?: boolean; error?: string; viewError?: string }>
    setProviderOwner: (source: string, pluginId: string | null) => Promise<boolean>
    setCapabilityOwner: (
      source: string,
      capability: string,
      pluginId: string | null
    ) => Promise<boolean>
    setEnabled: (pluginId: string, enabled: boolean) => Promise<any>
    updateLocal: (pluginId: string) => Promise<any>
    updateFromUrl: (pluginId: string, url: string) => Promise<any>
    onChanged: (callback: (change?: any) => void) => () => void
    importerTracks: (pluginId: string, importerId: string, input: any) => Promise<any>
    selectAndAddPlugin: (type: 'lx' | 'cr') => Promise<any>
    downloadAndAddPlugin: (url: string, type: 'lx' | 'cr', targetPluginId?: string) => Promise<any>
    uninstallPlugin(pluginId: string): ApiResult | PromiseLike<ApiResult>
    addPlugin: (pluginCode: string, pluginName: string, targetPluginId?: string) => Promise<any>
    getPluginType: (pluginId: string) => Promise<any>
    getConfigSchema: (pluginId: string) => Promise<any>
    getConfig: (pluginId: string) => Promise<any>
    getPermissions: (pluginId: string) => Promise<any>
    getDescriptor: (pluginId: string) => Promise<any>
    savePermissions: (pluginId: string, permissions: string[]) => Promise<any>
    saveConfig: (pluginId: string, config: Record<string, any>) => Promise<any>
    testConnection: (pluginId: string) => Promise<any>
    getPlaylists: (pluginId: string) => Promise<any>
    getPlaylistSongs: (pluginId: string, playlistId: string) => Promise<any>
    importToLocal: (pluginId: string, playlistId: string, playlistName?: string) => Promise<any>
    getServiceLyric: (pluginId: string, songInfo: any) => Promise<any>
    onDeepLinkAdd: (
      callback: (payload: { url: string; type: 'lx' | 'cr'; targetPluginId?: string }) => void
    ) => () => void
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
    get: () => Promise<{
      success: boolean
      data?: HotkeyConfig
      status?: HotkeyStatus
      error?: string
      errors?: string[]
    }>
    set: (payload: HotkeyConfigPayload) => Promise<{
      success: boolean
      data?: HotkeyConfig
      status?: HotkeyStatus
      error?: string
      errors?: string[]
    }>
  }

  pluginNotice: {
    onPluginNotice: (listener: (...args: any[]) => void) => () => void
    onPluginThrottle: (
      listener: (data: { pluginId: string; reason: string; duration?: number }) => void
    ) => () => void
    onPluginDisabled: (listener: (data: { pluginId: string; reason: string }) => void) => () => void
  }

  localMusic: {
    readAnalysisAudio: (url: string) => Promise<ArrayBuffer | null>
    getCoverBase64: (trackId: string) => Promise<string>
    [x: string]: any
    selectDirs: () => Promise<string[]>
    scan: (dirs: string[]) => Promise<any[]>
    writeTags: (
      filePath: string,
      songInfo: any,
      tagWriteOptions: any
    ) => Promise<{ success: boolean; message?: string }>
    getLyric: (songmid: string) => Promise<string>
    getTags: (
      songmid: string,
      includeLyrics?: boolean
    ) => Promise<import('../common/types/localMusicMetadata').LocalMusicTags | null>
    onTagsChanged: (
      callback: (event: import('../common/types/localMusicMetadata').LocalMusicTagsChanged) => void
    ) => () => void
    onScanProgress: (callback: (processed: number, total: number) => void) => void
    onScanFinished: (callback: (resList: any[]) => void) => void
    removeScanProgress: () => void
    removeScanFinished: () => void
  }

  share: {
    exportPlaylistResolver: (
      sources: string[]
    ) => Promise<{ code: string; md5: string; type: 'cr'; qualities: string[] }>
    exportResolver: (
      source: string,
      song: any
    ) => Promise<{
      code: string
      md5: string
      type: 'cr'
      pluginId: string
      pluginName: string
      qualities: string[]
      musicInfo: Record<string, any>
    }>
    createDescriptor: (
      source: string,
      song: any
    ) => Promise<{ id: string; url: string; template: string }>
    readDescriptor: (id: string) => Promise<any>
    getPluginCodeAndMd5: (
      pluginId: string
    ) => Promise<{ code: string; md5: string; type: 'cr' | 'lx' } | { error: string }>
  }

  clipboard: {
    readText: () => Promise<string>
  }

  /** 系统级通知(操作系统通知中心);返回 false 表示平台不支持或参数无效 */
  systemNotification: {
    show: (title: string, body: string) => Promise<boolean>
  }

  /** 打开应用日志目录(主进程决定路径,不存在则先创建) */
  openLogsDirectory: () => Promise<{ success: boolean; path?: string; message?: string }>

  systemAudio: {
    /** 必须先调用此方法获取一次性媒体采集授权（10s 过期、最多 4 次请求） */
    prepareCapture: () => Promise<boolean>
    getDefaultScreenSourceId: () => Promise<string>
    getAllScreenSourceIds: () => Promise<string[]>
  }

  /**
   * 系统媒体控件原生集成 (SMTC / MPRIS / NowPlayingInfoCenter)。
   *
   * 与浏览器 mediaSession 的区别: 封面以原始字节交给系统,
   * 所以系统卡片能显示高清封面。不可用时渲染端应回落到 mediaSession。
   */
  emi: {
    isAvailable: () => Promise<boolean>
    updateMetadata: (payload: {
      songName: string
      authorName: string
      albumName: string
      coverData?: Uint8Array | null
      ncmId?: number | null
      duration?: number | null
    }) => void
    updatePlaybackStatus: (status: 'Playing' | 'Paused') => void
    updateTimeline: (payload: { currentTime: number; totalTime: number }) => void
    updatePlaybackRate: (rate: number) => void
    updatePlayMode: (payload: {
      repeatMode: 'Track' | 'List' | 'None'
      isShuffling: boolean
    }) => void
    onMediaEvent: (
      callback: (event: {
        type:
          | 'Play'
          | 'Pause'
          | 'Stop'
          | 'NextSong'
          | 'PreviousSong'
          | 'ToggleShuffle'
          | 'ToggleRepeat'
          | 'SetRate'
          | 'SetVolume'
          | 'Seek'
        positionMs?: number | null
        rate?: number | null
        volume?: number | null
      }) => void
    ) => () => void
  }
}

export interface DesktopBridge {
  electron: ElectronAPI
  api: CustomAPI
}

declare global {
  interface Window {
    ceruTakeDesktopBridge?: () => DesktopBridge | null
  }
}
