import { ElectronAPI } from '@electron-toolkit/preload'

// 自定义 API 接口
interface CustomAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  setMiniMode: (isMini: boolean) => void
  music: {
    request: (api:string, args: any) => Promise<any>
  }

  ai: {
    ask: (prompt: string) => Promise<any>
    askStream: (prompt: string, streamId: string) => Promise<any>
    onStreamChunk: (callback: (data: { streamId: string; chunk: string }) => void) => Promise<any>
    onStreamEnd: (callback: (data: { streamId: string }) => void) => Promise<any>
    onStreamError: (callback: (data: { streamId: string; error: string }) => void) => Promise<any>
    removeStreamListeners: () => Promise<any>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
