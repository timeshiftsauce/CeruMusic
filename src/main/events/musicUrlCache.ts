import { ipcMain } from 'electron'
import { musicUrlCache } from '../services/musicUrlCache'

// 清除指定歌曲的 URL 缓存（播放失败时由渲染进程调用）
ipcMain.handle('music-url-cache:invalidate', async (_event, songId: string) => {
  try {
    musicUrlCache.invalidateUrl(songId)
    return { success: true }
  } catch (error) {
    console.error('清除 URL 缓存失败:', error)
    return { success: false }
  }
})

// 清空全部 URL 缓存
ipcMain.handle('music-url-cache:clear', async () => {
  try {
    musicUrlCache.clearAll()
    return { success: true }
  } catch (error) {
    console.error('清空 URL 缓存失败:', error)
    return { success: false }
  }
})