import type { SongList, Songs } from '@common/types/songList'
import PlayListSongs from './PlayListSongs'
import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import { getAppDirPath } from '../../utils/path'

// 常量定义
const DEFAULT_COVER_IDENTIFIER = 'default-cover'
const SONGLIST_DIR = 'songList'
const INDEX_FILE = 'index.json'

// 错误类型定义
class SongListError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'SongListError'
  }
}

// 工具函数类
class SongListUtils {
  /**
   * 获取默认封面标识符
   */
  static getDefaultCoverUrl(): string {
    return DEFAULT_COVER_IDENTIFIER
  }

  /**
   * 获取歌单管理入口文件路径
   */
  static getSongListIndexPath(): string {
    return path.join(getAppDirPath('userData'), SONGLIST_DIR, INDEX_FILE)
  }

  /**
   * 获取歌单文件路径
   */
  static getSongListFilePath(hashId: string): string {
    return path.join(getAppDirPath('userData'), SONGLIST_DIR, `${hashId}.json`)
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
   * 生成唯一hashId
   */
  static generateUniqueId(name: string): string {
    return crypto.createHash('md5').update(`${name}_${Date.now()}_${Math.random()}`).digest('hex')
  }

  /**
   * 验证歌曲封面URL是否有效
   */
  static isValidCoverUrl(url: string | undefined | null): boolean {
    return Boolean(url && url.trim() !== '' && url !== DEFAULT_COVER_IDENTIFIER)
  }

  /**
   * 验证hashId格式
   */
  static isValidHashId(hashId: string): boolean {
    return Boolean(hashId && typeof hashId === 'string' && hashId.trim().length > 0)
  }

  /**
   * 安全的JSON解析
   */
  static safeJsonParse<T>(content: string, defaultValue: T): T {
    try {
      return JSON.parse(content) as T
    } catch {
      return defaultValue
    }
  }
}

export default class ManageSongList extends PlayListSongs {
  private readonly hashId: string

  constructor(hashId: string) {
    if (!SongListUtils.isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }

    super(hashId)
    this.hashId = hashId.trim()
  }

  /**
   * 静态方法：创建新歌单
   * @param name 歌单名称
   * @param description 歌单描述
   * @param source 歌单来源
   * @returns 包含hashId的对象 (id字段就是hashId)
   */
  static createPlaylist(
    name: string,
    description: string = '',
    source: SongList['source']
  ): { id: string } {
    // 参数验证
    if (!name?.trim()) {
      throw new SongListError('歌单名称不能为空', 'EMPTY_NAME')
    }

    if (!source) {
      throw new SongListError('歌单来源不能为空', 'EMPTY_SOURCE')
    }

    try {
      const id = SongListUtils.generateUniqueId(name)
      const now = new Date().toISOString()

      const songListInfo: SongList = {
        id,
        name: name.trim(),
        createTime: now,
        updateTime: now,
        description: description?.trim() || '',
        coverImgUrl: SongListUtils.getDefaultCoverUrl(),
        source
      }

      // 创建歌单文件
      ManageSongList.createSongListFile(id)

      // 更新入口文件
      ManageSongList.updateIndexFile(songListInfo, 'add')

      // 验证歌单可以正常实例化
      try {
        new ManageSongList(id)
        // 如果能成功创建实例，说明文件创建成功
      } catch (verifyError) {
        console.error('歌单创建验证失败:', verifyError)
        // 清理已创建的文件
        try {
          const filePath = SongListUtils.getSongListFilePath(id)
          if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath)
          }
        } catch (cleanupError) {
          console.error('清理失败的歌单文件时出错:', cleanupError)
        }
        throw new SongListError('歌单创建后验证失败', 'CREATION_VERIFICATION_FAILED')
      }

      return { id }
    } catch (error) {
      console.error('创建歌单失败:', error)
      if (error instanceof SongListError) {
        throw error
      }
      throw new SongListError(
        `创建歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'CREATE_FAILED'
      )
    }
  }

  /**
   * 创建歌单文件
   * @param hashId 歌单hashId
   */
  private static createSongListFile(hashId: string): void {
    const songListFilePath = SongListUtils.getSongListFilePath(hashId)
    const dir = path.dirname(songListFilePath)

    SongListUtils.ensureDirectoryExists(dir)

    try {
      // 使用原子性写入确保文件完整性
      const tempPath = `${songListFilePath}.tmp`
      const content = JSON.stringify([], null, 2)

      fs.writeFileSync(tempPath, content)
      fs.renameSync(tempPath, songListFilePath)

      // 确保文件确实存在且可读
      if (!fs.existsSync(songListFilePath)) {
        throw new Error('文件创建后验证失败')
      }

      // 验证文件内容
      const verifyContent = fs.readFileSync(songListFilePath, 'utf-8')
      JSON.parse(verifyContent) // 确保内容是有效的JSON
    } catch (error) {
      throw new SongListError(
        `创建歌单文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'FILE_CREATE_FAILED'
      )
    }
  }

  /**
   * 删除当前歌单
   */
  delete(): void {
    const hashId = this.getHashId()

    try {
      // 检查歌单是否存在
      if (!ManageSongList.exists(hashId)) {
        throw new SongListError('歌单不存在', 'PLAYLIST_NOT_FOUND')
      }

      // 删除歌单文件
      const filePath = SongListUtils.getSongListFilePath(hashId)
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath)
      }

      // 从入口文件中移除
      ManageSongList.updateIndexFile({ id: hashId } as SongList, 'remove')
    } catch (error) {
      console.error('删除歌单失败:', error)
      if (error instanceof SongListError) {
        throw error
      }
      throw new SongListError(
        `删除歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'DELETE_FAILED'
      )
    }
  }

  /**
   * 修改当前歌单信息
   * @param updates 要更新的字段
   */
  edit(updates: Partial<Omit<SongList, 'id' | 'createTime'>>): void {
    if (!updates || Object.keys(updates).length === 0) {
      throw new SongListError('更新内容不能为空', 'EMPTY_UPDATES')
    }

    const hashId = this.getHashId()

    try {
      const songLists = ManageSongList.readIndexFile()
      const index = songLists.findIndex((item) => item.id === hashId)

      if (index === -1) {
        throw new SongListError('歌单不存在', 'PLAYLIST_NOT_FOUND')
      }

      // 验证和清理更新数据
      const cleanUpdates = ManageSongList.validateAndCleanUpdates(updates)

      // 更新歌单信息
      songLists[index] = {
        ...songLists[index],
        ...cleanUpdates,
        updateTime: new Date().toISOString()
      }

      // 保存到入口文件
      ManageSongList.writeIndexFile(songLists)
    } catch (error) {
      console.error('修改歌单失败:', error)
      if (error instanceof SongListError) {
        throw error
      }
      throw new SongListError(
        `修改歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'EDIT_FAILED'
      )
    }
  }

  /**
   * 获取当前歌单的hashId
   * @returns hashId
   */
  private getHashId(): string {
    return this.hashId
  }

  /**
   * 验证和清理更新数据
   * @param updates 原始更新数据
   * @returns 清理后的更新数据
   */
  private static validateAndCleanUpdates(
    updates: Partial<Omit<SongList, 'id' | 'createTime'>>
  ): Partial<Omit<SongList, 'id' | 'createTime'>> {
    const cleanUpdates: Partial<Omit<SongList, 'id' | 'createTime'>> = {}

    // 验证歌单名称
    if (updates.name !== undefined) {
      const trimmedName = updates.name.trim()
      if (!trimmedName) {
        throw new SongListError('歌单名称不能为空', 'EMPTY_NAME')
      }
      cleanUpdates.name = trimmedName
    }

    // 处理描述
    if (updates.description !== undefined) {
      cleanUpdates.description = updates.description?.trim() || ''
    }

    // 处理封面URL
    if (updates.coverImgUrl !== undefined) {
      cleanUpdates.coverImgUrl = updates.coverImgUrl || SongListUtils.getDefaultCoverUrl()
    }

    // 处理来源
    if (updates.source !== undefined) {
      if (!updates.source) {
        throw new SongListError('歌单来源不能为空', 'EMPTY_SOURCE')
      }
      cleanUpdates.source = updates.source
    }

    return cleanUpdates
  }

  /**
   * 读取歌单列表
   * @returns 歌单列表数组
   */
  static Read(): SongList[] {
    try {
      return ManageSongList.readIndexFile()
    } catch (error) {
      console.error('读取歌单列表失败:', error)
      if (error instanceof SongListError) {
        throw error
      }
      throw new SongListError(
        `读取歌单列表失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'READ_FAILED'
      )
    }
  }

  /**
   * 根据hashId获取单个歌单信息
   * @param hashId 歌单hashId
   * @returns 歌单信息或null
   */
  static getById(hashId: string): SongList | null {
    if (!SongListUtils.isValidHashId(hashId)) {
      return null
    }

    try {
      const songLists = ManageSongList.readIndexFile()
      return songLists.find((item) => item.id === hashId) || null
    } catch (error) {
      console.error('获取歌单信息失败:', error)
      return null
    }
  }

  /**
   * 读取入口文件
   * @returns 歌单列表数组
   */
  private static readIndexFile(): SongList[] {
    const indexPath = SongListUtils.getSongListIndexPath()

    if (!fs.existsSync(indexPath)) {
      ManageSongList.initializeIndexFile()
      return []
    }

    try {
      const content = fs.readFileSync(indexPath, 'utf-8')
      const parsed = SongListUtils.safeJsonParse<unknown>(content, [])

      // 验证数据格式
      if (!Array.isArray(parsed)) {
        console.warn('入口文件格式错误，重新初始化')
        ManageSongList.initializeIndexFile()
        return []
      }

      return parsed as SongList[]
    } catch (error) {
      console.error('解析入口文件失败:', error)
      // 备份损坏的文件并重新初始化
      ManageSongList.backupCorruptedFile(indexPath)
      ManageSongList.initializeIndexFile()
      return []
    }
  }

  /**
   * 备份损坏的文件
   * @param filePath 文件路径
   */
  private static backupCorruptedFile(filePath: string): void {
    try {
      const backupPath = `${filePath}.backup.${Date.now()}`
      fs.copyFileSync(filePath, backupPath)
      console.log(`已备份损坏的文件到: ${backupPath}`)
    } catch (error) {
      console.error('备份损坏文件失败:', error)
    }
  }

  /**
   * 初始化入口文件
   */
  private static initializeIndexFile(): void {
    const indexPath = SongListUtils.getSongListIndexPath()
    const dir = path.dirname(indexPath)

    SongListUtils.ensureDirectoryExists(dir)

    try {
      fs.writeFileSync(indexPath, JSON.stringify([], null, 2))
    } catch (error) {
      throw new SongListError(
        `初始化入口文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'INIT_FAILED'
      )
    }
  }

  /**
   * 写入入口文件
   * @param songLists 歌单列表
   */
  private static writeIndexFile(songLists: SongList[]): void {
    if (!Array.isArray(songLists)) {
      throw new SongListError('歌单列表必须是数组格式', 'INVALID_DATA_FORMAT')
    }

    const indexPath = SongListUtils.getSongListIndexPath()
    const dir = path.dirname(indexPath)

    SongListUtils.ensureDirectoryExists(dir)

    try {
      // 先写入临时文件，再重命名，确保原子性操作
      const tempPath = `${indexPath}.tmp`
      fs.writeFileSync(tempPath, JSON.stringify(songLists, null, 2))
      fs.renameSync(tempPath, indexPath)
    } catch (error) {
      console.error('写入入口文件失败:', error)
      throw new SongListError(
        `写入入口文件失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'WRITE_FAILED'
      )
    }
  }

  /**
   * 更新入口文件
   * @param songListInfo 歌单信息
   * @param action 操作类型
   */
  private static updateIndexFile(songListInfo: SongList, action: 'add' | 'remove'): void {
    const songLists = ManageSongList.readIndexFile()

    switch (action) {
      case 'add':
        // 检查是否已存在，避免重复添加
        if (!songLists.some((item) => item.id === songListInfo.id)) {
          songLists.push(songListInfo)
        }
        break

      case 'remove':
        const index = songLists.findIndex((item) => item.id === songListInfo.id)
        if (index !== -1) {
          songLists.splice(index, 1)
        }
        break

      default:
        throw new SongListError(`不支持的操作类型: ${action}`, 'INVALID_ACTION')
    }

    ManageSongList.writeIndexFile(songLists)
  }

  /**
   * 更新当前歌单封面图片URL
   * @param coverImgUrl 封面图片URL
   */
  updateCoverImg(coverImgUrl: string): void {
    try {
      const finalCoverUrl = coverImgUrl || SongListUtils.getDefaultCoverUrl()
      this.edit({ coverImgUrl: finalCoverUrl })
    } catch (error) {
      console.error('更新封面失败:', error)
      if (error instanceof SongListError) {
        throw error
      }
      throw new SongListError(
        `更新封面失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'UPDATE_COVER_FAILED'
      )
    }
  }

  /**
   * 重写父类的addSongs方法，添加自动设置封面功能
   * @param songs 要添加的歌曲列表
   */
  addSongs(songs: Songs[]): void {
    if (!Array.isArray(songs) || songs.length === 0) {
      return
    }

    // 调用父类方法添加歌曲
    super.addSongs(songs)

    // 异步更新封面，不阻塞主要功能
    setImmediate(() => {
      this.updateCoverIfNeeded(songs)
    })
  }

  /**
   * 检查并更新封面图片
   * @param newSongs 新添加的歌曲列表
   */
  private updateCoverIfNeeded(newSongs: Songs[]): void {
    try {
      const currentPlaylist = ManageSongList.getById(this.hashId)

      if (!currentPlaylist) {
        console.warn(`歌单 ${this.hashId} 不存在，跳过封面更新`)
        return
      }

      const shouldUpdateCover = this.shouldUpdateCover(currentPlaylist.coverImgUrl)

      if (shouldUpdateCover) {
        const validCoverUrl = this.findValidCoverFromSongs(newSongs)

        if (validCoverUrl) {
          this.updateCoverImg(validCoverUrl)
        } else if (
          !currentPlaylist.coverImgUrl ||
          currentPlaylist.coverImgUrl === SongListUtils.getDefaultCoverUrl()
        ) {
          // 如果没有找到有效封面且当前也没有封面，设置默认封面
          this.updateCoverImg(SongListUtils.getDefaultCoverUrl())
        }
      }
    } catch (error) {
      console.error('更新封面失败:', error)
      // 不抛出错误，避免影响添加歌曲的主要功能
    }
  }

  /**
   * 判断是否应该更新封面
   * @param currentCoverUrl 当前封面URL
   * @returns 是否应该更新
   */
  private shouldUpdateCover(currentCoverUrl: string): boolean {
    return !currentCoverUrl || currentCoverUrl === SongListUtils.getDefaultCoverUrl()
  }

  /**
   * 从歌曲列表中查找有效的封面图片
   * @param songs 歌曲列表
   * @returns 有效的封面URL或null
   */
  private findValidCoverFromSongs(songs: Songs[]): string | null {
    // 优先检查新添加的歌曲
    for (const song of songs) {
      if (SongListUtils.isValidCoverUrl(song.img)) {
        return song.img
      }
    }

    // 如果新添加的歌曲都没有封面，检查当前歌单中的所有歌曲
    try {
      for (const song of this.list) {
        if (SongListUtils.isValidCoverUrl(song.img)) {
          return song.img
        }
      }
    } catch (error) {
      console.error('获取歌单歌曲列表失败:', error)
    }

    return null
  }

  /**
   * 检查歌单是否存在
   * @param hashId 歌单hashId
   * @returns 是否存在
   */
  static exists(hashId: string): boolean {
    if (!SongListUtils.isValidHashId(hashId)) {
      return false
    }

    try {
      const songLists = ManageSongList.readIndexFile()
      return songLists.some((item) => item.id === hashId)
    } catch (error) {
      console.error('检查歌单存在性失败:', error)
      return false
    }
  }

  /**
   * 获取歌单统计信息
   * @returns 统计信息
   */
  static getStatistics(): { total: number; bySource: Record<string, number>; lastUpdated: string } {
    try {
      const songLists = ManageSongList.readIndexFile()
      const bySource: Record<string, number> = {}

      songLists.forEach((playlist) => {
        const source = playlist.source || 'unknown'
        bySource[source] = (bySource[source] || 0) + 1
      })

      return {
        total: songLists.length,
        bySource,
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      console.error('获取统计信息失败:', error)
      return {
        total: 0,
        bySource: {},
        lastUpdated: new Date().toISOString()
      }
    }
  }

  /**
   * 获取当前歌单信息
   * @returns 歌单信息或null
   */
  getPlaylistInfo(): SongList | null {
    return ManageSongList.getById(this.hashId)
  }

  /**
   * 批量操作：删除多个歌单
   * @param hashIds 歌单ID数组
   * @returns 操作结果
   */
  static batchDelete(hashIds: string[]): { success: string[]; failed: string[] } {
    const result = { success: [] as string[], failed: [] as string[] }

    for (const hashId of hashIds) {
      try {
        ManageSongList.deleteById(hashId)
        result.success.push(hashId)
      } catch (error) {
        console.error(`删除歌单 ${hashId} 失败:`, error)
        result.failed.push(hashId)
      }
    }

    return result
  }

  /**
   * 搜索歌单
   * @param keyword 搜索关键词
   * @param source 可选的来源筛选
   * @returns 匹配的歌单列表
   */
  static search(keyword: string, source?: SongList['source']): SongList[] {
    if (!keyword?.trim()) {
      return []
    }

    try {
      const songLists = ManageSongList.readIndexFile()
      const lowerKeyword = keyword.toLowerCase()

      return songLists.filter((playlist) => {
        const matchesKeyword =
          playlist.name.toLowerCase().includes(lowerKeyword) ||
          playlist.description.toLowerCase().includes(lowerKeyword)
        const matchesSource = !source || playlist.source === source

        return matchesKeyword && matchesSource
      })
    } catch (error) {
      console.error('搜索歌单失败:', error)
      return []
    }
  }

  // 静态方法别名，用于删除和编辑指定hashId的歌单
  /**
   * 静态方法：删除指定歌单
   * @param hashId 歌单hashId
   */
  static deleteById(hashId: string): void {
    if (!SongListUtils.isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }

    const instance = new ManageSongList(hashId)
    instance.delete()
  }

  /**
   * 静态方法：编辑指定歌单
   * @param hashId 歌单hashId
   * @param updates 要更新的字段
   */
  static editById(hashId: string, updates: Partial<Omit<SongList, 'id' | 'createTime'>>): void {
    if (!SongListUtils.isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }

    const instance = new ManageSongList(hashId)
    instance.edit(updates)
  }

  /**
   * 静态方法：更新指定歌单封面
   * @param hashId 歌单hashId
   * @param coverImgUrl 封面图片URL
   */
  static updateCoverImgById(hashId: string, coverImgUrl: string): void {
    if (!SongListUtils.isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }

    const instance = new ManageSongList(hashId)
    instance.updateCoverImg(coverImgUrl)
  }

  // 保持向后兼容的别名方法
  static Delete = ManageSongList.deleteById
  static Edit = ManageSongList.editById
  static read = ManageSongList.Read
}

// 导出错误类供外部使用
export { SongListError }
