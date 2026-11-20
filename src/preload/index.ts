import { contextBridge } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import { desktopApi } from './desktopApi'
import { isDesktopDocument } from '../common/desktopDocument'

if (process.isMainFrame && process.contextIsolated) {
  const expected = process.argv.find(arg => arg.startsWith('--ceru-renderer-entry='))?.slice('--ceru-renderer-entry='.length)
  let available = true
  contextBridge.exposeInMainWorld('ceruTakeDesktopBridge', () => {
    if (!available || !expected || !isDesktopDocument(location.href, expected)) return null
    available = false
    return { api: desktopApi, electron: electronAPI }
  })
}
