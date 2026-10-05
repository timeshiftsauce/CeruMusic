import { ipcMain } from 'electron'
import { musicCacheService } from '../services/musicCache'
import { configManager } from '../services/ConfigManager'

// 获取缓存信息
ipcMain.handle('music-cache:get-info', async () => {
  try {
    return await musicCacheService.getCacheInfo()
  } catch (error) {
    console.error('获取缓存信息失败:', error)
    return {
      count: 0,
      size: 0,
      sizeFormatted: '0 B',
      maxBytes: 0,
      maxFormatted: '不限制',
      maxQuality: '不限制',
      percent: 0,
      breakdown: [],
      qualityBreakdown: []
    }
  }
})

// 清空缓存
ipcMain.handle('music-cache:clear', async () => {
  try {
    console.log('收到清空缓存请求')
    await musicCacheService.clearCache()
    console.log('缓存清空完成')
    return { success: true, message: '缓存已清空' }
  } catch (error: any) {
    console.error('清空缓存失败:', error)
    return { success: false, message: `清空缓存失败: ${error.message}` }
  }
})

// 获取缓存大小
ipcMain.handle('music-cache:get-size', async () => {
  try {
    const info = await musicCacheService.getCacheInfo()
    return info.size
  } catch (error) {
    console.error('获取缓存大小失败:', error)
    return 0
  }
})

// 获取缓存策略（容量上限 / 音质上限）
ipcMain.handle('music-cache:get-policy', async () => {
  try {
    return {
      maxBytes: musicCacheService.getMaxCacheBytes(),
      maxQuality: musicCacheService.getMaxCacheQuality()
    }
  } catch (error) {
    console.error('获取缓存策略失败:', error)
    return { maxBytes: 0, maxQuality: '' }
  }
})

// 保存缓存策略；保存容量上限后立即按 LRU 淘汰到上限以内
ipcMain.handle(
  'music-cache:set-policy',
  async (_, policy: { maxBytes?: number; maxQuality?: string }) => {
    try {
      if (typeof policy?.maxBytes === 'number') {
        const value = Math.floor(policy.maxBytes)
        if (!Number.isFinite(value) || value < 0) throw new Error('容量上限不合法')
        configManager.set('cacheMaxBytes', value)
      }
      if (typeof policy?.maxQuality === 'string') {
        configManager.set('cacheMaxQuality', policy.maxQuality)
      }

      const result = await musicCacheService.evictByLru()
      return { success: true, ...result }
    } catch (error: any) {
      console.error('保存缓存策略失败:', error)
      return { success: false, message: error?.message || String(error) }
    }
  }
)

// 手动触发一次 LRU 淘汰
ipcMain.handle('music-cache:enforce-limit', async () => {
  try {
    return { success: true, ...(await musicCacheService.evictByLru()) }
  } catch (error: any) {
    console.error('缓存淘汰失败:', error)
    return { success: false, message: error?.message || String(error) }
  }
})

// 读取封面图片本体（本地已落盘则直接返回 file:// URL，miss 返回 null）
ipcMain.handle('music-cache:get-cover-file', async (_, songCacheKey: string) => {
  try {
    return await musicCacheService.getCachedCoverFile(songCacheKey)
  } catch (error) {
    console.error('读取封面缓存失败:', error)
    return null
  }
})

// 删除某首歌的封面缓存（图片损坏时由渲染层请求，便于下次重新下载）
ipcMain.handle('music-cache:invalidate-cover', async (_, songCacheKey: string) => {
  try {
    await musicCacheService.invalidateCoverFile(songCacheKey)
    return { success: true }
  } catch (error: any) {
    console.error('清除封面缓存失败:', error)
    return { success: false, message: error?.message || String(error) }
  }
})

// 写入封面图片本体。渲染层已下载好的图片二进制经此落盘，避免下次重复联网。
ipcMain.handle(
  'music-cache:put-cover-file',
  async (_, songCacheKey: string, data: ArrayBuffer | Uint8Array, ext: string) => {
    try {
      if (!songCacheKey || !data) return null
      // contextBridge 传过来的可能是 ArrayBuffer 或已类型化视图，Buffer.from 两种都接受
      const buffer = Buffer.from(data as ArrayBuffer)
      // 空数据或过小（不可能是有效图片）直接拒绝，避免缓存出坏文件
      if (buffer.byteLength < 32) {
        console.warn('封面数据过小，拒绝写入缓存:', buffer.byteLength)
        return null
      }
      return await musicCacheService.cacheCoverFile(songCacheKey, buffer, ext || '.jpg')
    } catch (error) {
      console.error('写入封面缓存失败:', error)
      return null
    }
  }
)
