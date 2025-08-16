import { ElectronAPI } from '@electron-toolkit/preload'

// 自定义 API 接口
interface CustomAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  setMiniMode: (isMini: boolean) => void
  netease: {
    search: (args: any) => Promise<any>
    getSongDetail: (args: any) => Promise<any>
    getSongUrl: (args: any) => Promise<any>
    getLyric: (args: any) => Promise<any>
    getToplist: (args: any) => Promise<any>
    getToplistDetail: (args: any) => Promise<any>
    getListSongs: (args: any) => Promise<any>
  }
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
