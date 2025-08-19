import { ElectronAPI } from '@electron-toolkit/preload'

// 自定义 API 接口
interface CustomAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  setMiniMode: (isMini: boolean) => void
  toggleFullscreen: () => void
  onMusicCtrl: (callback: (event: Event, args: any) => void) => void

  music: {
    request: (api: string, args: any) => Promise<any>
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
    getPlugins: () => Promise<
      Array<{
        name: string
        version: string
        author: string
        description?: string
      }>
    >
    openPluginFile: () => Promise<{
      success: boolean
      message: string
    }>
    uninstall: (pluginName: string) => Promise<{
      success: boolean
      message: string
    }>
  }

  // 用户配置API
  getUserConfig: () => Promise<any>
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
