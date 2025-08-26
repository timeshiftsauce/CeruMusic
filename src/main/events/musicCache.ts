import { ipcMain } from 'electron'
import { musicCacheService } from '../services/musicCache'

// 获取缓存信息
ipcMain.handle('music-cache:get-info', async () => {
  try {
    return await musicCacheService.getCacheInfo()
  } catch (error) {
    console.error('获取缓存信息失败:', error)
    return { count: 0, size: 0, sizeFormatted: '0 B' }
  }
})

// 清空缓存
ipcMain.handle('music-cache:clear', async () => {
  try {
    await musicCacheService.clearCache()
    return { success: true, message: '缓存已清空' }
  } catch (error) {
    console.error('清空缓存失败:', error)
    return { success: false, message: '清空缓存失败' }
  }
})

// 获取缓存大小
ipcMain.handle('music-cache:get-size', async () => {
  try {
    return await musicCacheService.getCacheSize()
  } catch (error) {
    console.error('获取缓存大小失败:', error)
    return 0
  }
})