import type { SongList, Songs } from '@common/types/songList'

// IPC 响应基础类型
export interface IPCResponse<T = any> {
  success: boolean
  data?: T
  error?: string
  message?: string
  code?: string
}

// 歌单管理相关类型定义
export interface SongListAPI {
  // === 歌单管理 ===

  /**
   * 创建新歌单
   */
  create(
    name: string,
    description?: string,
    source?: SongList['source']
  ): Promise<IPCResponse<{ id: string }>>

  /**
   * 获取所有歌单
   */
  getAll(): Promise<IPCResponse<SongList[]>>

  /**
   * 根据ID获取歌单信息
   */
  getById(hashId: string): Promise<IPCResponse<SongList | null>>

  /**
   * 删除歌单
   */
  delete(hashId: string): Promise<IPCResponse>

  /**
   * 批量删除歌单
   */
  batchDelete(hashIds: string[]): Promise<IPCResponse<{ success: string[]; failed: string[] }>>

  /**
   * 编辑歌单信息
   */
  edit(hashId: string, updates: Partial<Omit<SongList, 'id' | 'createTime'>>): Promise<IPCResponse>

  /**
   * 更新歌单封面
   */
  updateCover(hashId: string, coverImgUrl: string): Promise<IPCResponse>

  /**
   * 搜索歌单
   */
  search(keyword: string, source?: SongList['source']): Promise<IPCResponse<SongList[]>>

  /**
   * 获取歌单统计信息
   */
  getStatistics(): Promise<
    IPCResponse<{
      total: number
      bySource: Record<string, number>
      lastUpdated: string
    }>
  >

  /**
   * 检查歌单是否存在
   */
  exists(hashId: string): Promise<IPCResponse<boolean>>

  // === 歌曲管理 ===

  /**
   * 添加歌曲到歌单
   */
  addSongs(hashId: string, songs: Songs[]): Promise<IPCResponse>

  /**
   * 从歌单移除歌曲
   */
  removeSong(hashId: string, songmid: string | number): Promise<IPCResponse<boolean>>

  /**
   * 批量移除歌曲
   */
  removeSongs(
    hashId: string,
    songmids: (string | number)[]
  ): Promise<IPCResponse<{ removed: number; notFound: number }>>

  /**
   * 清空歌单
   */
  clearSongs(hashId: string): Promise<IPCResponse>

  /**
   * 获取歌单中的歌曲列表
   */
  getSongs(hashId: string): Promise<IPCResponse<readonly Songs[]>>

  /**
   * 获取歌单歌曲数量
   */
  getSongCount(hashId: string): Promise<IPCResponse<number>>

  /**
   * 检查歌曲是否在歌单中
   */
  hasSong(hashId: string, songmid: string | number): Promise<IPCResponse<boolean>>

  /**
   * 根据ID获取歌曲
   */
  getSong(hashId: string, songmid: string | number): Promise<IPCResponse<Songs | null>>

  /**
   * 搜索歌单中的歌曲
   */
  searchSongs(hashId: string, keyword: string): Promise<IPCResponse<Songs[]>>

  /**
   * 获取歌单歌曲统计信息
   */
  getSongStatistics(hashId: string): Promise<
    IPCResponse<{
      total: number
      bySinger: Record<string, number>
      byAlbum: Record<string, number>
      lastModified: string
    }>
  >

  /**
   * 验证歌单完整性
   */
  validateIntegrity(hashId: string): Promise<IPCResponse<{ isValid: boolean; issues: string[] }>>

  /**
   * 修复歌单数据
   */
  repairData(hashId: string): Promise<IPCResponse<{ fixed: boolean; changes: string[] }>>

  /**
   * 强制保存歌单
   */
  forceSave(hashId: string): Promise<IPCResponse>
}

// 错误码枚举
export enum SongListErrorCode {
  INVALID_HASH_ID = 'INVALID_HASH_ID',
  EMPTY_NAME = 'EMPTY_NAME',
  EMPTY_SOURCE = 'EMPTY_SOURCE',
  CREATE_FAILED = 'CREATE_FAILED',
  FILE_CREATE_FAILED = 'FILE_CREATE_FAILED',
  PLAYLIST_NOT_FOUND = 'PLAYLIST_NOT_FOUND',
  DELETE_FAILED = 'DELETE_FAILED',
  EMPTY_UPDATES = 'EMPTY_UPDATES',
  EDIT_FAILED = 'EDIT_FAILED',
  READ_FAILED = 'READ_FAILED',
  INIT_FAILED = 'INIT_FAILED',
  WRITE_FAILED = 'WRITE_FAILED',
  INVALID_ACTION = 'INVALID_ACTION',
  UPDATE_COVER_FAILED = 'UPDATE_COVER_FAILED',
  INVALID_DATA_FORMAT = 'INVALID_DATA_FORMAT',
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_SONG_ID = 'INVALID_SONG_ID',
  SAVE_FAILED = 'SAVE_FAILED',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR'
}

// 歌单来源类型
export type SongListSource = 'local' | 'wy' | 'tx' | 'mg' | 'kg' | 'kw'

// 批量操作结果类型
export interface BatchOperationResult {
  success: string[]
  failed: string[]
}

// 歌曲移除结果类型
export interface RemoveSongsResult {
  removed: number
  notFound: number
}

// 统计信息类型
export interface SongListStatistics {
  total: number
  bySource: Record<string, number>
  lastUpdated: string
}

export interface SongStatistics {
  total: number
  bySinger: Record<string, number>
  byAlbum: Record<string, number>
  lastModified: string
}

// 数据完整性检查结果
export interface IntegrityCheckResult {
  isValid: boolean
  issues: string[]
}

// 数据修复结果
export interface RepairResult {
  fixed: boolean
  changes: string[]
}
