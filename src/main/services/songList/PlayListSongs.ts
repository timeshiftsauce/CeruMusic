import type { Songs as SongItem } from '@common/types/songList'
import fs from 'fs'
import path from 'path'
import { getAppDirPath } from '../../utils/path'

// 错误类定义
class PlayListError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'PlayListError'
  }
}

// 工具函数类
class PlayListUtils {
  /**
   * 获取歌单文件路径
   */
  static getFilePath(hashId: string): string {
    if (!hashId || typeof hashId !== 'string' || !hashId.trim()) {
      throw new PlayListError('无效的歌单ID', 'INVALID_HASH_ID')
    }
    return path.join(getAppDirPath('userData'), 'songList', `${hashId.trim()}.json`)
  }

  /**
   * 确保目录存在
   */
  static ensureDirectoryExists(dirPath: string): void {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true })
    }
  }

  /**
   * 安全的JSON解析
   */
  static safeJsonParse<T>(content: string, defaultValue: T): T {
    try {
      const parsed = JSON.parse(content)
      return parsed as T
    } catch {
      return defaultValue
    }
  }

  /**
   * 安全的JSON解析（专门用于数组）
   */
  static safeJsonParseArray<T>(content: string, defaultValue: T[]): T[] {
    try {
      const parsed = JSON.parse(content)
      return Array.isArray(parsed) ? parsed : defaultValue
    } catch {
      return defaultValue
    }
  }

  /**
   * 验证歌曲对象
   */
  static isValidSong(song: any): song is SongItem {
    return (
      song &&
      typeof song === 'object' &&
      (typeof song.songmid === 'string' || typeof song.songmid === 'number') &&
      String(song.songmid).trim().length > 0
    )
  }

  /**
   * 去重歌曲列表
   */
  static deduplicateSongs(songs: SongItem[]): SongItem[] {
    const seen = new Set<string>()
    return songs.filter((song) => {
      const songmidStr = String(song.songmid)
      if (seen.has(songmidStr)) {
        return false
      }
      seen.add(songmidStr)
      return true
    })
  }
}

export default class PlayListSongs {
  protected readonly filePath: string
  protected list: SongItem[]
  private isDirty: boolean = false

  constructor(hashId: string) {
    this.filePath = PlayListUtils.getFilePath(hashId)
    this.list = []
    this.initList()
  }

  /**
   * 初始化歌单列表
   */
  private initList(): void {
    // 增加重试机制，处理文件创建的时序问题
    const maxRetries = 3
    const retryDelay = 100 // 100ms

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        if (!fs.existsSync(this.filePath)) {
          if (attempt < maxRetries - 1) {
            // 等待一段时间后重试
            const start = Date.now()
            while (Date.now() - start < retryDelay) {
              // 简单的同步等待
            }
            continue
          }
          throw new PlayListError('歌单文件不存在', 'FILE_NOT_FOUND')
        }

        const content = fs.readFileSync(this.filePath, 'utf-8')
        const parsed = PlayListUtils.safeJsonParseArray<SongItem>(content, [])

        // 验证和清理数据
        this.list = parsed.filter(PlayListUtils.isValidSong)

        // 如果数据被清理过，标记为需要保存
        if (this.list.length !== parsed.length) {
          this.isDirty = true
          console.warn(
            `歌单文件包含无效数据，已自动清理 ${parsed.length - this.list.length} 条无效记录`
          )
        }

        // 成功读取，退出重试循环
        return
      } catch (error) {
        if (attempt < maxRetries - 1) {
          console.warn(`读取歌单文件失败，第 ${attempt + 1} 次重试:`, error)
          // 等待一段时间后重试
          const start = Date.now()
          while (Date.now() - start < retryDelay) {
            // 简单的同步等待
          }
          continue
        }

        console.error('读取歌单文件失败:', error)
        throw new PlayListError(
          `读取歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
          'READ_FAILED'
        )
      }
    }
  }

  /**
   * 检查歌单文件是否存在
   */
  static hasListFile(hashId: string): boolean {
    try {
      const filePath = PlayListUtils.getFilePath(hashId)
      return fs.existsSync(filePath)
    } catch {
      return false
    }
  }

  /**
   * 添加歌曲到歌单
   */
  addSongs(songs: SongItem[]): void {
    if (!Array.isArray(songs) || songs.length === 0) {
      return
    }
    // 验证和过滤有效歌曲
    const validSongs = songs.filter(PlayListUtils.isValidSong)
    if (validSongs.length === 0) {
      console.warn('没有有效的歌曲可添加')
      return
    }

    // 使用 Set 提高查重性能，统一转换为字符串进行比较
    const existingSongMids = new Set(this.list.map((song) => String(song.songmid)))

    // 添加不重复的歌曲
    const newSongs = validSongs.filter((song) => !existingSongMids.has(String(song.songmid)))

    if (newSongs.length > 0) {
      this.list.push(...newSongs)
      this.isDirty = true
      this.saveToFile()

      console.log(
        `成功添加 ${newSongs.length} 首歌曲，跳过 ${validSongs.length - newSongs.length} 首重复歌曲`
      )
    } else {
      console.log('所有歌曲都已存在，未添加任何歌曲')
    }
  }

  /**
   * 从歌单中移除歌曲
   */
  removeSong(songmid: string | number): boolean {
    if (!songmid && songmid !== 0) {
      throw new PlayListError('无效的歌曲ID', 'INVALID_SONG_ID')
    }

    const songmidStr = String(songmid)
    const index = this.list.findIndex((item) => String(item.songmid) === songmidStr)
    if (index !== -1) {
      this.list.splice(index, 1)
      this.isDirty = true
      this.saveToFile()
      return true
    }
    return false
  }

  /**
   * 批量移除歌曲
   */
  removeSongs(songmids: (string | number)[]): { removed: number; notFound: number } {
    if (!Array.isArray(songmids) || songmids.length === 0) {
      return { removed: 0, notFound: 0 }
    }

    const validSongMids = songmids.filter(
      (id) => (id || id === 0) && (typeof id === 'string' || typeof id === 'number')
    )
    const songMidSet = new Set(validSongMids.map((id) => String(id)))

    const initialLength = this.list.length
    this.list = this.list.filter((song) => !songMidSet.has(String(song.songmid)))

    const removedCount = initialLength - this.list.length
    const notFoundCount = validSongMids.length - removedCount

    if (removedCount > 0) {
      this.isDirty = true
      this.saveToFile()
    }

    return { removed: removedCount, notFound: notFoundCount }
  }

  /**
   * 清空歌单
   */
  clearSongs(): void {
    if (this.list.length > 0) {
      this.list = []
      this.isDirty = true
      this.saveToFile()
    }
  }

  /**
   * 保存到文件
   */
  private saveToFile(): void {
    if (!this.isDirty) {
      return
    }

    try {
      const dir = path.dirname(this.filePath)
      PlayListUtils.ensureDirectoryExists(dir)

      // 原子性写入：先写临时文件，再重命名
      const tempPath = `${this.filePath}.tmp`
      const content = JSON.stringify(this.list, null, 2)

      fs.writeFileSync(tempPath, content)
      fs.renameSync(tempPath, this.filePath)

      this.isDirty = false
    } catch (error) {
      console.error('保存歌单文件失败:', error)
      throw new PlayListError(
        `保存歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'SAVE_FAILED'
      )
    }
  }

  /**
   * 强制保存到文件
   */
  forceSave(): void {
    this.isDirty = true
    this.saveToFile()
  }

  /**
   * 获取歌曲列表
   */
  getSongs(): readonly SongItem[] {
    return Object.freeze([...this.list])
  }

  /**
   * 获取歌曲数量
   */
  getCount(): number {
    return this.list.length
  }

  /**
   * 检查歌曲是否存在
   */
  hasSong(songmid: string | number): boolean {
    if (!songmid && songmid !== 0) {
      return false
    }
    const songmidStr = String(songmid)
    return this.list.some((song) => String(song.songmid) === songmidStr)
  }

  /**
   * 根据songmid获取歌曲
   */
  getSong(songmid: string | number): SongItem | null {
    if (!songmid && songmid !== 0) {
      return null
    }
    const songmidStr = String(songmid)
    return this.list.find((song) => String(song.songmid) === songmidStr) || null
  }

  /**
   * 搜索歌曲
   */
  searchSongs(keyword: string): SongItem[] {
    if (!keyword || typeof keyword !== 'string') {
      return []
    }

    const lowerKeyword = keyword.toLowerCase()
    return this.list.filter(
      (song) =>
        song.name?.toLowerCase().includes(lowerKeyword) ||
        song.singer?.toLowerCase().includes(lowerKeyword) ||
        song.albumName?.toLowerCase().includes(lowerKeyword)
    )
  }

  /**
   * 获取歌单统计信息
   */
  getStatistics(): {
    total: number
    bySinger: Record<string, number>
    byAlbum: Record<string, number>
    lastModified: string
  } {
    const bySinger: Record<string, number> = {}
    const byAlbum: Record<string, number> = {}

    this.list.forEach((song) => {
      // 统计歌手
      if (song.singer) {
        const singerName = String(song.singer)
        bySinger[singerName] = (bySinger[singerName] || 0) + 1
      }

      // 统计专辑
      if (song.albumName) {
        const albumName = String(song.albumName)
        byAlbum[albumName] = (byAlbum[albumName] || 0) + 1
      }
    })

    return {
      total: this.list.length,
      bySinger,
      byAlbum,
      lastModified: new Date().toISOString()
    }
  }

  /**
   * 验证歌单完整性
   */
  validateIntegrity(): { isValid: boolean; issues: string[] } {
    const issues: string[] = []

    // 检查文件是否存在
    if (!fs.existsSync(this.filePath)) {
      issues.push('歌单文件不存在')
    }

    // 检查数据完整性
    const invalidSongs = this.list.filter((song) => !PlayListUtils.isValidSong(song))
    if (invalidSongs.length > 0) {
      issues.push(`发现 ${invalidSongs.length} 首无效歌曲`)
    }

    // 检查重复歌曲
    const songMids = this.list.map((song) => String(song.songmid))
    const uniqueSongMids = new Set(songMids)
    if (songMids.length !== uniqueSongMids.size) {
      issues.push(`发现 ${songMids.length - uniqueSongMids.size} 首重复歌曲`)
    }

    return {
      isValid: issues.length === 0,
      issues
    }
  }

  /**
   * 修复歌单数据
   */
  repairData(): { fixed: boolean; changes: string[] } {
    const changes: string[] = []
    let hasChanges = false

    // 移除无效歌曲
    const validSongs = this.list.filter(PlayListUtils.isValidSong)
    if (validSongs.length !== this.list.length) {
      changes.push(`移除了 ${this.list.length - validSongs.length} 首无效歌曲`)
      this.list = validSongs
      hasChanges = true
    }

    // 去重
    const deduplicatedSongs = PlayListUtils.deduplicateSongs(this.list)
    if (deduplicatedSongs.length !== this.list.length) {
      changes.push(`移除了 ${this.list.length - deduplicatedSongs.length} 首重复歌曲`)
      this.list = deduplicatedSongs
      hasChanges = true
    }

    if (hasChanges) {
      this.isDirty = true
      this.saveToFile()
    }

    return {
      fixed: hasChanges,
      changes
    }
  }
}

// 导出错误类供外部使用
export { PlayListError }
