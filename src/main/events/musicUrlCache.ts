import { ipcMain } from 'electron'
import { musicUrlCache } from '../services/musicUrlCache'

// 获取缓存 URL（渲染进程启动/播放时直接查询）
ipcMain.handle('music-url-cache:get', async (_event, songId: string) => {
  try {
    return musicUrlCache.getUrl(songId)
  } catch (error) {
    console.error('获取 URL 缓存失败:', error)
    return null
  }
})

// 保存 URL 到缓存（渲染进程拿到新 URL 后存入）
ipcMain.handle('music-url-cache:save', async (_event, songId: string, url: string) => {
  try {
    musicUrlCache.saveUrl(songId, url)
    return { success: true }
  } catch (error) {
    console.error('保存 URL 缓存失败:', error)
    return { success: false }
  }
})

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