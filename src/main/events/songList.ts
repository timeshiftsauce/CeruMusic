import { ipcMain } from 'electron'
import ManageSongList, { SongListError } from '../services/songList/ManageSongList'
import type { SongList, Songs } from '@common/types/songList'

// 创建新歌单
ipcMain.handle(
  'songlist:create',
  async (_, name: string, description: string = '', source: SongList['source']) => {
    try {
      const result = ManageSongList.createPlaylist(name, description, source)
      return { success: true, data: result, message: '歌单创建成功' }
    } catch (error) {
      console.error('创建歌单失败:', error)
      const message = error instanceof SongListError ? error.message : '创建歌单失败'
      return {
        success: false,
        error: message,
        code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
      }
    }
  }
)

// 获取所有歌单
ipcMain.handle('songlist:get-all', async () => {
  try {
    const songLists = ManageSongList.Read()
    return { success: true, data: songLists }
  } catch (error) {
    console.error('获取歌单列表失败:', error)
    const message = error instanceof SongListError ? error.message : '获取歌单列表失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 根据ID获取歌单信息
ipcMain.handle('songlist:get-by-id', async (_, hashId: string) => {
  try {
    const songList = ManageSongList.getById(hashId)
    return { success: true, data: songList }
  } catch (error) {
    console.error('获取歌单信息失败:', error)
    return { success: false, error: '获取歌单信息失败' }
  }
})

// 删除歌单
ipcMain.handle('songlist:delete', async (_, hashId: string) => {
  try {
    ManageSongList.deleteById(hashId)
    return { success: true, message: '歌单删除成功' }
  } catch (error) {
    console.error('删除歌单失败:', error)
    const message = error instanceof SongListError ? error.message : '删除歌单失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 批量删除歌单
ipcMain.handle('songlist:batch-delete', async (_, hashIds: string[]) => {
  try {
    const result = ManageSongList.batchDelete(hashIds)
    return {
      success: true,
      data: result,
      message: `成功删除 ${result.success.length} 个歌单，失败 ${result.failed.length} 个`
    }
  } catch (error) {
    console.error('批量删除歌单失败:', error)
    return { success: false, error: '批量删除歌单失败' }
  }
})

// 编辑歌单信息
ipcMain.handle(
  'songlist:edit',
  async (_, hashId: string, updates: Partial<Omit<SongList, 'id' | 'createTime'>>) => {
    try {
      ManageSongList.editById(hashId, updates)
      return { success: true, message: '歌单信息更新成功' }
    } catch (error) {
      console.error('编辑歌单失败:', error)
      const message = error instanceof SongListError ? error.message : '编辑歌单失败'
      return {
        success: false,
        error: message,
        code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
      }
    }
  }
)

// 更新歌单封面
ipcMain.handle('songlist:update-cover', async (_, hashId: string, coverImgUrl: string) => {
  try {
    ManageSongList.updateCoverImgById(hashId, coverImgUrl)
    return { success: true, message: '封面更新成功' }
  } catch (error) {
    console.error('更新封面失败:', error)
    const message = error instanceof SongListError ? error.message : '更新封面失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 搜索歌单
ipcMain.handle('songlist:search', async (_, keyword: string, source?: SongList['source']) => {
  try {
    const results = ManageSongList.search(keyword, source)
    return { success: true, data: results }
  } catch (error) {
    console.error('搜索歌单失败:', error)
    return { success: false, error: '搜索歌单失败', data: [] }
  }
})

// 获取歌单统计信息
ipcMain.handle('songlist:get-statistics', async () => {
  try {
    const statistics = ManageSongList.getStatistics()
    return { success: true, data: statistics }
  } catch (error) {
    console.error('获取统计信息失败:', error)
    return { success: false, error: '获取统计信息失败' }
  }
})

// 检查歌单是否存在
ipcMain.handle('songlist:exists', async (_, hashId: string) => {
  try {
    const exists = ManageSongList.exists(hashId)
    return { success: true, data: exists }
  } catch (error) {
    console.error('检查歌单存在性失败:', error)
    return { success: false, error: '检查歌单存在性失败', data: false }
  }
})

// === 歌曲管理相关 IPC 事件 ===

// 添加歌曲到歌单
ipcMain.handle('songlist:add-songs', async (_, hashId: string, songs: Songs[]) => {
  try {
    const instance = new ManageSongList(hashId)
    instance.addSongs(songs)
    return { success: true, message: `成功添加 ${songs.length} 首歌曲` }
  } catch (error) {
    console.error('添加歌曲失败:', error)
    const message = error instanceof SongListError ? error.message : '添加歌曲失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 从歌单移除歌曲
ipcMain.handle('songlist:remove-song', async (_, hashId: string, songmid: string | number) => {
  try {
    const instance = new ManageSongList(hashId)
    const removed = instance.removeSong(songmid)
    return {
      success: true,
      data: removed,
      message: removed ? '歌曲移除成功' : '歌曲不存在'
    }
  } catch (error) {
    console.error('移除歌曲失败:', error)
    const message = error instanceof SongListError ? error.message : '移除歌曲失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 批量移除歌曲
ipcMain.handle(
  'songlist:remove-songs',
  async (_, hashId: string, songmids: (string | number)[]) => {
    try {
      const instance = new ManageSongList(hashId)
      const result = instance.removeSongs(songmids)
      return {
        success: true,
        data: result,
        message: `成功移除 ${result.removed} 首歌曲，${result.notFound} 首未找到`
      }
    } catch (error) {
      console.error('批量移除歌曲失败:', error)
      const message = error instanceof SongListError ? error.message : '批量移除歌曲失败'
      return {
        success: false,
        error: message,
        code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
      }
    }
  }
)

// 清空歌单
ipcMain.handle('songlist:clear-songs', async (_, hashId: string) => {
  try {
    const instance = new ManageSongList(hashId)
    instance.clearSongs()
    return { success: true, message: '歌单已清空' }
  } catch (error) {
    console.error('清空歌单失败:', error)
    const message = error instanceof SongListError ? error.message : '清空歌单失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 获取歌单中的歌曲列表
ipcMain.handle('songlist:get-songs', async (_, hashId: string) => {
  try {
    const instance = new ManageSongList(hashId)
    const songs = instance.getSongs()
    return { success: true, data: songs }
  } catch (error) {
    console.error('获取歌曲列表失败:', error)
    const message = error instanceof SongListError ? error.message : '获取歌曲列表失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 获取歌单歌曲数量
ipcMain.handle('songlist:get-song-count', async (_, hashId: string) => {
  try {
    const instance = new ManageSongList(hashId)
    const count = instance.getCount()
    return { success: true, data: count }
  } catch (error) {
    console.error('获取歌曲数量失败:', error)
    const message = error instanceof SongListError ? error.message : '获取歌曲数量失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 检查歌曲是否在歌单中
ipcMain.handle('songlist:has-song', async (_, hashId: string, songmid: string | number) => {
  try {
    const instance = new ManageSongList(hashId)
    const hasSong = instance.hasSong(songmid)
    return { success: true, data: hasSong }
  } catch (error) {
    console.error('检查歌曲存在性失败:', error)
    return { success: false, error: '检查歌曲存在性失败', data: false }
  }
})

// 根据ID获取歌曲
ipcMain.handle('songlist:get-song', async (_, hashId: string, songmid: string | number) => {
  try {
    const instance = new ManageSongList(hashId)
    const song = instance.getSong(songmid)
    return { success: true, data: song }
  } catch (error) {
    console.error('获取歌曲失败:', error)
    return { success: false, error: '获取歌曲失败', data: null }
  }
})

// 搜索歌单中的歌曲
ipcMain.handle('songlist:search-songs', async (_, hashId: string, keyword: string) => {
  try {
    const instance = new ManageSongList(hashId)
    const results = instance.searchSongs(keyword)
    return { success: true, data: results }
  } catch (error) {
    console.error('搜索歌曲失败:', error)
    return { success: false, error: '搜索歌曲失败', data: [] }
  }
})

// 获取歌单歌曲统计信息
ipcMain.handle('songlist:get-song-statistics', async (_, hashId: string) => {
  try {
    const instance = new ManageSongList(hashId)
    const statistics = instance.getStatistics()
    return { success: true, data: statistics }
  } catch (error) {
    console.error('获取歌曲统计信息失败:', error)
    return { success: false, error: '获取歌曲统计信息失败' }
  }
})

// 验证歌单完整性
ipcMain.handle('songlist:validate-integrity', async (_, hashId: string) => {
  try {
    const instance = new ManageSongList(hashId)
    const result = instance.validateIntegrity()
    return { success: true, data: result }
  } catch (error) {
    console.error('验证歌单完整性失败:', error)
    return { success: false, error: '验证歌单完整性失败' }
  }
})

// 修复歌单数据
ipcMain.handle('songlist:repair-data', async (_, hashId: string) => {
  try {
    const instance = new ManageSongList(hashId)
    const result = instance.repairData()
    return {
      success: true,
      data: result,
      message: result.fixed ? `数据修复完成: ${result.changes.join(', ')}` : '数据无需修复'
    }
  } catch (error) {
    console.error('修复歌单数据失败:', error)
    const message = error instanceof SongListError ? error.message : '修复歌单数据失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})

// 强制保存歌单
ipcMain.handle('songlist:force-save', async (_, hashId: string) => {
  try {
    const instance = new ManageSongList(hashId)
    instance.forceSave()
    return { success: true, message: '歌单保存成功' }
  } catch (error) {
    console.error('强制保存歌单失败:', error)
    const message = error instanceof SongListError ? error.message : '强制保存歌单失败'
    return {
      success: false,
      error: message,
      code: error instanceof SongListError ? error.code : 'UNKNOWN_ERROR'
    }
  }
})
