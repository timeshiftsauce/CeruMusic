import { ElectronAPI } from '@electron-toolkit/preload'

// 自定义 API 接口
interface CustomAPI {
  minimize: () => void
  maximize: () => void
  close: () => void
  setMiniMode: (isMini: boolean) => void
}

declare global {
  interface Window {
    electron: ElectronAPI
    api: CustomAPI
  }
}
