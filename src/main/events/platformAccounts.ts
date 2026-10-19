import { ipcMain, type BrowserWindow } from 'electron'
import { platformAccounts } from '../services/platformAccounts'

export function initPlatformAccountEvents(mainWindow: BrowserWindow): void {
  ipcMain.handle('platform-accounts:status', () => platformAccounts.status())
  ipcMain.handle('platform-accounts:open-login', (_, platform: unknown) => {
    platformAccounts.openLogin(platform, mainWindow)
    return { success: true }
  })
  ipcMain.handle('platform-accounts:kuwo-login', (_, username: unknown, password: unknown) =>
    platformAccounts.loginKuwo(username, password, mainWindow)
  )
  ipcMain.handle('platform-accounts:sync-playlists', (_, platform: unknown, selectedIds?: string[]) =>
    platformAccounts.syncPlaylists(platform, selectedIds)
  )
  ipcMain.handle('platform-accounts:logout', (_, platform: unknown) =>
    platformAccounts.logout(platform, mainWindow)
  )
}
