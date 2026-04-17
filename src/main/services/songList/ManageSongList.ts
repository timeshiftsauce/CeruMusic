import type { SongList, Songs } from '@common/types/songList'
import PlayListSongs from './PlayListSongs'
import crypto from 'crypto'
import { getPlaylistDatabase } from './PlaylistDatabase'

const DEFAULT_COVER_IDENTIFIER = 'default-cover'

class SongListError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'SongListError'
  }
}

function isValidHashId(hashId: string): boolean {
  return Boolean(hashId && typeof hashId === 'string' && hashId.trim().length > 0)
}

function isValidCoverUrl(url: string | undefined | null): boolean {
  return Boolean(url && url.trim() !== '' && url !== DEFAULT_COVER_IDENTIFIER)
}

function generateUniqueId(name: string): string {
  return crypto.createHash('md5').update(`${name}_${Date.now()}_${Math.random()}`).digest('hex')
}

export default class ManageSongList extends PlayListSongs {
  constructor(hashId: string) {
    if (!isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }
    super(hashId)
  }

  static createPlaylist(
    name: string,
    description: string = '',
    source: SongList['source'],
    meta?: Record<string, any>
  ): { id: string } {
    if (!name?.trim()) throw new SongListError('歌单名称不能为空', 'EMPTY_NAME')
    if (!source) throw new SongListError('歌单来源不能为空', 'EMPTY_SOURCE')

    try {
      const id = generateUniqueId(name)
      const now = new Date().toISOString()
      const info: SongList = {
        id,
        name: name.trim(),
        description: description?.trim() || '',
        coverImgUrl: DEFAULT_COVER_IDENTIFIER,
        source,
        meta: meta || {},
        createTime: now,
        updateTime: now
      }
      getPlaylistDatabase().insertPlaylist(info)
      return { id }
    } catch (error) {
      console.error('创建歌单失败:', error)
      if (error instanceof SongListError) throw error
      throw new SongListError(
        `创建歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'CREATE_FAILED'
      )
    }
  }

  delete(): void {
    try {
      if (!ManageSongList.exists(this.hashId)) {
        throw new SongListError('歌单不存在', 'PLAYLIST_NOT_FOUND')
      }
      getPlaylistDatabase().deletePlaylist(this.hashId)
    } catch (error) {
      console.error('删除歌单失败:', error)
      if (error instanceof SongListError) throw error
      throw new SongListError(
        `删除歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'DELETE_FAILED'
      )
    }
  }

  edit(updates: Partial<Omit<SongList, 'id' | 'createTime'>>): void {
    if (!updates || Object.keys(updates).length === 0) {
      throw new SongListError('更新内容不能为空', 'EMPTY_UPDATES')
    }
    try {
      if (!ManageSongList.exists(this.hashId)) {
        throw new SongListError('歌单不存在', 'PLAYLIST_NOT_FOUND')
      }
      const clean = ManageSongList.validateAndCleanUpdates(updates)
      getPlaylistDatabase().updatePlaylist(this.hashId, clean)
    } catch (error) {
      console.error('修改歌单失败:', error)
      if (error instanceof SongListError) throw error
      throw new SongListError(
        `修改歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'EDIT_FAILED'
      )
    }
  }

  private static validateAndCleanUpdates(
    updates: Partial<Omit<SongList, 'id' | 'createTime'>>
  ): Partial<Omit<SongList, 'id' | 'createTime'>> {
    const clean: Partial<Omit<SongList, 'id' | 'createTime'>> = {}
    if (updates.name !== undefined) {
      const trimmed = updates.name.trim()
      if (!trimmed) throw new SongListError('歌单名称不能为空', 'EMPTY_NAME')
      clean.name = trimmed
    }
    if (updates.description !== undefined) {
      clean.description = updates.description?.trim() || ''
    }
    if (updates.coverImgUrl !== undefined) {
      clean.coverImgUrl = updates.coverImgUrl || DEFAULT_COVER_IDENTIFIER
    }
    if (updates.source !== undefined) {
      if (!updates.source) throw new SongListError('歌单来源不能为空', 'EMPTY_SOURCE')
      clean.source = updates.source
    }
    if (updates.meta !== undefined) {
      clean.meta = updates.meta
    }
    return clean
  }

  static Read(): SongList[] {
    try {
      return getPlaylistDatabase().listPlaylists()
    } catch (error) {
      console.error('读取歌单列表失败:', error)
      if (error instanceof SongListError) throw error
      throw new SongListError(
        `读取歌单列表失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'READ_FAILED'
      )
    }
  }

  static getById(hashId: string): SongList | null {
    if (!isValidHashId(hashId)) return null
    try {
      return getPlaylistDatabase().getPlaylist(hashId)
    } catch (error) {
      console.error('获取歌单信息失败:', error)
      return null
    }
  }

  updateCoverImg(coverImgUrl: string): void {
    try {
      const finalCover = coverImgUrl || DEFAULT_COVER_IDENTIFIER
      getPlaylistDatabase().updateCover(this.hashId, finalCover)
    } catch (error) {
      console.error('更新封面失败:', error)
      if (error instanceof SongListError) throw error
      throw new SongListError(
        `更新封面失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'UPDATE_COVER_FAILED'
      )
    }
  }

  addSongs(songs: Songs[], desc: boolean = false): number {
    if (!Array.isArray(songs) || songs.length === 0) return 0
    const added = super.addSongs(songs, desc) || 0
    if (added > 0) {
      setImmediate(() => this.updateCoverIfNeeded(songs))
    }
    return added
  }

  private updateCoverIfNeeded(newSongs: Songs[]): void {
    try {
      const current = ManageSongList.getById(this.hashId)
      if (!current) return
      if (!this.shouldUpdateCover(current.coverImgUrl)) return
      const valid = this.findValidCoverFromSongs(newSongs)
      if (valid) {
        this.updateCoverImg(valid)
      } else if (!current.coverImgUrl || current.coverImgUrl === DEFAULT_COVER_IDENTIFIER) {
        this.updateCoverImg(DEFAULT_COVER_IDENTIFIER)
      }
    } catch (error) {
      console.error('更新封面失败:', error)
    }
  }

  private shouldUpdateCover(currentCoverUrl: string): boolean {
    return !currentCoverUrl || currentCoverUrl === DEFAULT_COVER_IDENTIFIER
  }

  private findValidCoverFromSongs(songs: Songs[]): string | null {
    for (const s of songs) {
      if (isValidCoverUrl(s.img)) return s.img
    }
    try {
      for (const s of this.list) {
        if (isValidCoverUrl(s.img)) return s.img
      }
    } catch (error) {
      console.error('获取歌单歌曲列表失败:', error)
    }
    return null
  }

  static exists(hashId: string): boolean {
    if (!isValidHashId(hashId)) return false
    try {
      return getPlaylistDatabase().playlistExists(hashId)
    } catch (error) {
      console.error('检查歌单存在性失败:', error)
      return false
    }
  }

  static getStatistics(): {
    total: number
    bySource: Record<string, number>
    lastUpdated: string
  } {
    try {
      const lists = getPlaylistDatabase().listPlaylists()
      const bySource: Record<string, number> = {}
      for (const p of lists) {
        const s = p.source || 'unknown'
        bySource[s] = (bySource[s] || 0) + 1
      }
      return {
        total: lists.length,
        bySource,
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      console.error('获取统计信息失败:', error)
      return { total: 0, bySource: {}, lastUpdated: new Date().toISOString() }
    }
  }

  getPlaylistInfo(): SongList | null {
    return ManageSongList.getById(this.hashId)
  }

  static batchDelete(hashIds: string[]): { success: string[]; failed: string[] } {
    const result = { success: [] as string[], failed: [] as string[] }
    for (const id of hashIds) {
      try {
        ManageSongList.deleteById(id)
        result.success.push(id)
      } catch (error) {
        console.error(`删除歌单 ${id} 失败:`, error)
        result.failed.push(id)
      }
    }
    return result
  }

  static search(keyword: string, source?: SongList['source']): SongList[] {
    if (!keyword?.trim()) return []
    try {
      const lists = getPlaylistDatabase().listPlaylists()
      const lower = keyword.toLowerCase()
      return lists.filter((p) => {
        const kwMatch =
          p.name.toLowerCase().includes(lower) ||
          (p.description || '').toLowerCase().includes(lower)
        const srcMatch = !source || p.source === source
        return kwMatch && srcMatch
      })
    } catch (error) {
      console.error('搜索歌单失败:', error)
      return []
    }
  }

  static deleteById(hashId: string): void {
    if (!isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }
    new ManageSongList(hashId).delete()
  }

  static editById(hashId: string, updates: Partial<Omit<SongList, 'id' | 'createTime'>>): void {
    if (!isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }
    new ManageSongList(hashId).edit(updates)
  }

  static updateCoverImgById(hashId: string, coverImgUrl: string): void {
    if (!isValidHashId(hashId)) {
      throw new SongListError('无效的歌单ID', 'INVALID_HASH_ID')
    }
    new ManageSongList(hashId).updateCoverImg(coverImgUrl)
  }

  static Delete = ManageSongList.deleteById
  static Edit = ManageSongList.editById
  static read = ManageSongList.Read
}

export { SongListError }
