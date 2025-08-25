import { ElectronAPI } from '@electron-toolkit/preload'
import { MainApi, MethodParams } from '../main/services/musicSdk/index'
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
    requestSdk: <T extends keyof MainApi>(
      method: T,
      args: {
        source: any
      } & (MethodParams<T> extends object ? MethodParams<T> : { [key: string]: any })
    ) => ReturnType<MainApi[T]>
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
    uninstallPlugin(pluginId: string): ApiResult | PromiseLike<ApiResult>
    addPlugin: (pluginCode: string, pluginName: string) => Promise<any>
    getPluginById: (id: string) => Promise<any>
    loadAllPlugins: () => Promise<any>
    getPluginLog: (pluginId: string) => Promise<any>
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
