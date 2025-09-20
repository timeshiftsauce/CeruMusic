import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'
import * as crypto from 'crypto'
import axios from 'axios'
import { CONFIG_NAME } from '../../events/directorySettings'

export class MusicCacheService {
  private cacheIndex: Map<string, string> = new Map()

  constructor() {
    this.initCache()
  }

  private getCacheDirectory(): string {
    try {
      // 尝试从配置文件读取自定义缓存目录
      const configPath = path.join(app.getPath('userData'), CONFIG_NAME)
      const configData = require('fs').readFileSync(configPath, 'utf-8')
      const config = JSON.parse(configData)

      if (config.cacheDir && typeof config.cacheDir === 'string') {
        return config.cacheDir
      }
    } catch {
      // 配置文件不存在或读取失败，使用默认目录
    }

    // 默认缓存目录
    return path.join(app.getPath('userData'), 'music-cache')
  }

  // 动态获取缓存目录
  public get cacheDir(): string {
    return this.getCacheDirectory()
  }

  // 动态获取索引文件路径
  public get indexFilePath(): string {
    return path.join(this.cacheDir, 'cache-index.json')
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

  async getCachedMusicUrl(songId: string): Promise<string | null> {
    const cacheKey = this.generateCacheKey(songId)
    console.log('检查缓存 hash:', cacheKey)

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
        console.warn(`缓存文件不存在，移除索引: ${cachedFilePath}`)
        this.cacheIndex.delete(cacheKey)
        await this.saveCacheIndex()
      }
    }

    return null
  }

  async cacheMusic(songId: string, url: string): Promise<void> {
    const cacheKey = this.generateCacheKey(songId)

    // 如果已经缓存，跳过
    if (this.cacheIndex.has(cacheKey)) {
      return
    }

    try {
      await this.downloadAndCache(songId, url, cacheKey)
    } catch (error) {
      console.error(`缓存歌曲失败: ${songId}`, error)
      throw error
    }
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
      console.log('开始清空缓存目录:', this.cacheDir)

      // 先重新加载缓存索引，确保获取最新的文件列表
      await this.loadCacheIndex()

      // 删除索引中记录的所有缓存文件
      let deletedFromIndex = 0
      for (const filePath of this.cacheIndex.values()) {
        try {
          await fs.unlink(filePath)
          deletedFromIndex++
          console.log('删除缓存文件:', filePath)
        } catch (error: any) {
          console.warn('删除文件失败:', filePath, error.message)
        }
      }

      // 删除缓存目录中的所有其他文件（包括可能遗漏的文件）
      let deletedFromDir = 0
      try {
        const files = await fs.readdir(this.cacheDir)
        for (const file of files) {
          const filePath = path.join(this.cacheDir, file)
          try {
            const stats = await fs.stat(filePath)
            if (stats.isFile() && file !== 'cache-index.json') {
              await fs.unlink(filePath)
              deletedFromDir++
              console.log('删除目录文件:', filePath)
            }
          } catch (error: any) {
            console.warn('删除目录文件失败:', filePath, error.message)
          }
        }
      } catch (error: any) {
        console.warn('读取缓存目录失败:', error.message)
      }

      // 清空缓存索引
      this.cacheIndex.clear()
      await this.saveCacheIndex()

      console.log(
        `音乐缓存已清空 - 从索引删除: ${deletedFromIndex}个文件, 从目录删除: ${deletedFromDir}个文件`
      )
    } catch (error) {
      console.error('清空缓存失败:', error)
      throw error
    }
  }

  getDirectorySize = async (dirPath: string): Promise<number> => {
    let totalSize = 0

    try {
      const items = await fs.readdir(dirPath)

      for (const item of items) {
        const itemPath = path.join(dirPath, item)
        const stats = await fs.stat(itemPath)

        if (stats.isDirectory()) {
          totalSize += await this.getDirectorySize(itemPath)
        } else {
          totalSize += stats.size
        }
      }
    } catch {
      // 忽略无法访问的文件/目录
    }

    return totalSize
  }

  async getCacheInfo(): Promise<{ count: number; size: number; sizeFormatted: string }> {
    // 重新加载缓存索引以确保数据准确
    await this.loadCacheIndex()

    // 统计实际的缓存文件数量和大小
    let actualCount = 0
    let totalSize = 0

    try {
      const items = await fs.readdir(this.cacheDir)

      for (const item of items) {
        const itemPath = path.join(this.cacheDir, item)
        try {
          const stats = await fs.stat(itemPath)

          if (stats.isFile() && item !== 'cache-index.json') {
            // 检查是否是音频文件
            const ext = path.extname(item).toLowerCase()
            const audioExts = ['.mp3', '.flac', '.wav', '.aac', '.ogg', '.m4a', '.wma']

            if (audioExts.includes(ext)) {
              actualCount++
              totalSize += stats.size
            }
          }
        } catch (error: any) {
          // 忽略无法访问的文件
          console.warn('无法访问文件:', itemPath, error.message)
        }
      }
    } catch (error: any) {
      console.warn('读取缓存目录失败:', error.message)
      // 如果无法读取目录，使用索引数据作为备选
      totalSize = await this.getDirectorySize(this.cacheDir)
      actualCount = this.cacheIndex.size
    }

    const formatSize = (bytes: number): string => {
      if (bytes === 0) return '0 B'
      const k = 1024
      const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
      const i = Math.floor(Math.log(bytes) / Math.log(k))
      return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
    }

    console.log(`缓存信息 - 文件数量: ${actualCount}, 总大小: ${totalSize} bytes`)

    return {
      count: actualCount,
      size: totalSize,
      sizeFormatted: formatSize(totalSize)
    }
  }
}

// 单例实例
export const musicCacheService = new MusicCacheService()
