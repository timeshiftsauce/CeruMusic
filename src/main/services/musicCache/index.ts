import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as crypto from 'crypto'
import axios from 'axios'

export class MusicCacheService {
  private cacheDir: string
  private cacheIndex: Map<string, string> = new Map()
  private indexFilePath: string

  constructor() {
    this.cacheDir = path.join(app.getPath('userData'), 'music-cache')
    this.indexFilePath = path.join(this.cacheDir, 'cache-index.json')
    this.initCache()
  }

  private async initCache() {
    try {
      // 确保缓存目录存在
      await fs.mkdir(this.cacheDir, { recursive: true })

      // 加载缓存索引
      await this.loadCacheIndex()
    } catch (error) {
      console.error('初始化音乐缓存失败:', error)
    }
  }

  private async loadCacheIndex() {
    try {
      const indexData = await fs.readFile(this.indexFilePath, 'utf-8')
      const index = JSON.parse(indexData)
      this.cacheIndex = new Map(Object.entries(index))
    } catch (error) {
      // 索引文件不存在或损坏，创建新的
      this.cacheIndex = new Map()
      await this.saveCacheIndex()
    }
  }

  private async saveCacheIndex() {
    try {
      const indexObj = Object.fromEntries(this.cacheIndex)
      await fs.writeFile(this.indexFilePath, JSON.stringify(indexObj, null, 2))
    } catch (error) {
      console.error('保存缓存索引失败:', error)
    }
  }

  private generateCacheKey(songId: string): string {
    return crypto.createHash('md5').update(`${songId}`).digest('hex')
  }

  private getCacheFilePath(cacheKey: string, url: string): string {
    const ext = path.extname(new URL(url).pathname) || '.mp3'
    return path.join(this.cacheDir, `${cacheKey}${ext}`)
  }

  async getCachedMusicUrl(songId: string, originalUrlPromise: Promise<string>): Promise<string> {
    const cacheKey = this.generateCacheKey(songId)
    console.log('hash', cacheKey)

    // 检查是否已缓存
    if (this.cacheIndex.has(cacheKey)) {
      const cachedFilePath = this.cacheIndex.get(cacheKey)!

      try {
        // 验证文件是否存在
        await fs.access(cachedFilePath)
        console.log(`使用缓存文件: ${cachedFilePath}`)
        return `file://${cachedFilePath}`
      } catch (error) {
        // 文件不存在，从缓存索引中移除
        this.cacheIndex.delete(cacheKey)
        await this.saveCacheIndex()
      }
    }

    // 下载并缓存文件 先返回源链接不等待结果优化体验
    this.downloadAndCache(songId, await originalUrlPromise, cacheKey)
    return await originalUrlPromise
  }

  private async downloadAndCache(songId: string, url: string, cacheKey: string): Promise<string> {
    try {
      console.log(`开始下载歌曲: ${songId}`)

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        timeout: 30000,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      })

      const cacheFilePath = this.getCacheFilePath(cacheKey, url)
      const writer = require('fs').createWriteStream(cacheFilePath)

      response.data.pipe(writer)

      return new Promise((resolve, reject) => {
        writer.on('finish', async () => {
          try {
            // 更新缓存索引
            this.cacheIndex.set(cacheKey, cacheFilePath)
            await this.saveCacheIndex()

            console.log(`歌曲缓存完成: ${cacheFilePath}`)
            resolve(`file://${cacheFilePath}`)
          } catch (error) {
            reject(error)
          }
        })

        writer.on('error', (error: Error) => {
          console.error(`下载歌曲失败: ${songId}`, error)
          // 清理失败的文件
          fs.unlink(cacheFilePath).catch(() => {})
          reject(error)
        })
      })
    } catch (error) {
      console.error(`下载歌曲失败: ${songId}`, error)
      throw error
    }
  }

  async clearCache(): Promise<void> {
    try {
      // 删除所有缓存文件
      for (const filePath of this.cacheIndex.values()) {
        try {
          await fs.unlink(filePath)
        } catch (error) {
          // 忽略文件不存在的错误
        }
      }

      // 清空缓存索引
      this.cacheIndex.clear()
      await this.saveCacheIndex()

      console.log('音乐缓存已清空')
    } catch (error) {
      console.error('清空缓存失败:', error)
    }
  }

  async getCacheSize(): Promise<number> {
    let totalSize = 0

    for (const filePath of this.cacheIndex.values()) {
      try {
        const stats = await fs.stat(filePath)
        totalSize += stats.size
      } catch (error) {
        // 文件不存在，忽略
      }
    }

    return totalSize
  }

  async getCacheInfo(): Promise<{ count: number; size: number; sizeFormatted: string }> {
    const size = await this.getCacheSize()
    const count = this.cacheIndex.size

    const formatSize = (bytes: number): string => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    return {
      count,
      size,
      sizeFormatted: formatSize(size)
    }
  }
}

// 单例实例
export const musicCacheService = new MusicCacheService()
