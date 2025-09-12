import type {
  SongListAPI,
  IPCResponse,
  BatchOperationResult,
  RemoveSongsResult,
  SongListStatistics,
  SongStatistics,
  IntegrityCheckResult,
  RepairResult
} from '../../../types/songList'
import type { SongList, Songs } from '@common/types/songList'

// 检查是否在 Electron 环境中
const isElectron = typeof window !== 'undefined' && window.api && window.api.songList

/**
 * 歌单管理 API 封装类
 */
class SongListService implements SongListAPI {
  private get songListAPI() {
    if (!isElectron) {
      throw new Error('当前环境不支持 Electron API 调用')
    }
    return window.api.songList
  }

  // === 歌单管理方法 ===

  /**
   * 创建新歌单
   */
  async create(
    name: string,
    description: string = '',
    source: SongList['source'] = 'local'
  ): Promise<IPCResponse<{ id: string }>> {
    try {
      return await this.songListAPI.create(name, description, source)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '创建歌单失败'
      }
    }
  }

  /**
   * 获取所有歌单
   */
  async getAll(): Promise<IPCResponse<SongList[]>> {
    try {
      return await this.songListAPI.getAll()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取歌单列表失败'
      }
    }
  }

  /**
   * 根据ID获取歌单信息
   */
  async getById(hashId: string): Promise<IPCResponse<SongList | null>> {
    try {
      return await this.songListAPI.getById(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取歌单信息失败'
      }
    }
  }

  /**
   * 删除歌单
   */
  async delete(hashId: string): Promise<IPCResponse> {
    try {
      return await this.songListAPI.delete(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '删除歌单失败'
      }
    }
  }

  /**
   * 批量删除歌单
   */
  async batchDelete(hashIds: string[]): Promise<IPCResponse<BatchOperationResult>> {
    try {
      return await this.songListAPI.batchDelete(hashIds)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '批量删除歌单失败'
      }
    }
  }

  /**
   * 编辑歌单信息
   */
  async edit(
    hashId: string,
    updates: Partial<Omit<SongList, 'id' | 'createTime'>>
  ): Promise<IPCResponse> {
    try {
      return await this.songListAPI.edit(hashId, updates)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '编辑歌单失败'
      }
    }
  }

  /**
   * 更新歌单封面
   */
  async updateCover(hashId: string, coverImgUrl: string): Promise<IPCResponse> {
    try {
      return await this.songListAPI.updateCover(hashId, coverImgUrl)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '更新封面失败'
      }
    }
  }

  /**
   * 搜索歌单
   */
  async search(keyword: string, source?: SongList['source']): Promise<IPCResponse<SongList[]>> {
    try {
      return await this.songListAPI.search(keyword, source)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '搜索歌单失败'
      }
    }
  }

  /**
   * 获取歌单统计信息
   */
  async getStatistics(): Promise<IPCResponse<SongListStatistics>> {
    try {
      return await this.songListAPI.getStatistics()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取统计信息失败'
      }
    }
  }

  /**
   * 检查歌单是否存在
   */
  async exists(hashId: string): Promise<IPCResponse<boolean>> {
    try {
      return await this.songListAPI.exists(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '检查歌单存在性失败'
      }
    }
  }

  // === 歌曲管理方法 ===

  /**
   * 添加歌曲到歌单
   */
  async addSongs(hashId: string, songs: Songs[]): Promise<IPCResponse> {
    try {
      return await this.songListAPI.addSongs(hashId, songs)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '添加歌曲失败'
      }
    }
  }

  /**
   * 从歌单移除歌曲
   */
  async removeSong(hashId: string, songmid: string | number): Promise<IPCResponse<boolean>> {
    try {
      return await this.songListAPI.removeSong(hashId, songmid)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '移除歌曲失败'
      }
    }
  }

  /**
   * 批量移除歌曲
   */
  async removeSongs(
    hashId: string,
    songmids: (string | number)[]
  ): Promise<IPCResponse<RemoveSongsResult>> {
    try {
      return await this.songListAPI.removeSongs(hashId, songmids)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '批量移除歌曲失败'
      }
    }
  }

  /**
   * 清空歌单
   */
  async clearSongs(hashId: string): Promise<IPCResponse> {
    try {
      return await this.songListAPI.clearSongs(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '清空歌单失败'
      }
    }
  }

  /**
   * 获取歌单中的歌曲列表
   */
  async getSongs(hashId: string): Promise<IPCResponse<readonly Songs[]>> {
    try {
      return await this.songListAPI.getSongs(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取歌曲列表失败'
      }
    }
  }

  /**
   * 获取歌单歌曲数量
   */
  async getSongCount(hashId: string): Promise<IPCResponse<number>> {
    try {
      return await this.songListAPI.getSongCount(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取歌曲数量失败'
      }
    }
  }

  /**
   * 检查歌曲是否在歌单中
   */
  async hasSong(hashId: string, songmid: string | number): Promise<IPCResponse<boolean>> {
    try {
      return await this.songListAPI.hasSong(hashId, songmid)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '检查歌曲存在性失败'
      }
    }
  }

  /**
   * 根据ID获取歌曲
   */
  async getSong(hashId: string, songmid: string | number): Promise<IPCResponse<Songs | null>> {
    try {
      return await this.songListAPI.getSong(hashId, songmid)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取歌曲信息失败'
      }
    }
  }

  /**
   * 搜索歌单中的歌曲
   */
  async searchSongs(hashId: string, keyword: string): Promise<IPCResponse<Songs[]>> {
    try {
      return await this.songListAPI.searchSongs(hashId, keyword)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '搜索歌曲失败'
      }
    }
  }

  /**
   * 获取歌单歌曲统计信息
   */
  async getSongStatistics(hashId: string): Promise<IPCResponse<SongStatistics>> {
    try {
      return await this.songListAPI.getSongStatistics(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '获取歌曲统计信息失败'
      }
    }
  }

  /**
   * 验证歌单完整性
   */
  async validateIntegrity(hashId: string): Promise<IPCResponse<IntegrityCheckResult>> {
    try {
      return await this.songListAPI.validateIntegrity(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '验证数据完整性失败'
      }
    }
  }

  /**
   * 修复歌单数据
   */
  async repairData(hashId: string): Promise<IPCResponse<RepairResult>> {
    try {
      return await this.songListAPI.repairData(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '修复数据失败'
      }
    }
  }

  /**
   * 强制保存歌单
   */
  async forceSave(hashId: string): Promise<IPCResponse> {
    try {
      return await this.songListAPI.forceSave(hashId)
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : '强制保存失败'
      }
    }
  }

  // === 便捷方法 ===

  /**
   * 创建本地歌单的便捷方法
   */
  async createLocal(name: string, description?: string): Promise<IPCResponse<{ id: string }>> {
    return this.create(name, description, 'local')
  }

  /**
   * 获取歌单详细信息（包含歌曲列表）
   */
  async getPlaylistDetail(hashId: string): Promise<{
    playlist: SongList | null
    songs: readonly Songs[]
    success: boolean
    error?: string
  }> {
    try {
      const [playlistRes, songsRes] = await Promise.all([
        this.getById(hashId),
        this.getSongs(hashId)
      ])

      if (!playlistRes.success) {
        return {
          playlist: null,
          songs: [],
          success: false,
          error: playlistRes.error
        }
      }

      return {
        playlist: playlistRes.data || null,
        songs: songsRes.success ? songsRes.data || [] : [],
        success: true
      }
    } catch (error) {
      return {
        playlist: null,
        songs: [],
        success: false,
        error: error instanceof Error ? error.message : '获取歌单详情失败'
      }
    }
  }

  /**
   * 安全删除歌单（带确认）
   */
  async safeDelete(hashId: string, confirmCallback?: () => Promise<boolean>): Promise<IPCResponse> {
    if (confirmCallback) {
      const confirmed = await confirmCallback()
      if (!confirmed) {
        return {
          success: false,
          error: '用户取消删除操作'
        }
      }
    }
    return this.delete(hashId)
  }

  /**
   * 检查并修复歌单数据
   */
  async checkAndRepair(hashId: string): Promise<{
    needsRepair: boolean
    repairResult?: RepairResult
    success: boolean
    error?: string
  }> {
    try {
      const integrityRes = await this.validateIntegrity(hashId)
      if (!integrityRes.success) {
        return {
          needsRepair: false,
          success: false,
          error: integrityRes.error
        }
      }

      const { isValid } = integrityRes.data!
      if (isValid) {
        return {
          needsRepair: false,
          success: true
        }
      }

      const repairRes = await this.repairData(hashId)
      return {
        needsRepair: true,
        repairResult: repairRes.data,
        success: repairRes.success,
        error: repairRes.error
      }
    } catch (error) {
      return {
        needsRepair: false,
        success: false,
        error: error instanceof Error ? error.message : '检查修复失败'
      }
    }
  }
}

// 创建单例实例
export const songListAPI = new SongListService()

// 默认导出
export default songListAPI

// 导出类型
export type { SongListAPI, IPCResponse }
