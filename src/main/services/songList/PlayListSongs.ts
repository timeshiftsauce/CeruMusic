import type { Songs as SongItem } from '@common/types/songList'
import { getPlaylistDatabase } from './PlaylistDatabase'

class PlayListError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message)
    this.name = 'PlayListError'
  }
}

function isValidSong(song: any): song is SongItem {
  return (
    song &&
    typeof song === 'object' &&
    (typeof song.songmid === 'string' || typeof song.songmid === 'number') &&
    String(song.songmid).trim().length > 0
  )
}

export default class PlayListSongs {
  protected readonly hashId: string

  constructor(hashId: string) {
    if (!hashId || typeof hashId !== 'string' || !hashId.trim()) {
      throw new PlayListError('无效的歌单ID', 'INVALID_HASH_ID')
    }
    this.hashId = hashId.trim()
  }

  protected get db() {
    return getPlaylistDatabase()
  }

  /** 歌单行是否存在（替代旧的歌单文件存在性检查） */
  static hasListFile(hashId: string): boolean {
    if (!hashId || typeof hashId !== 'string') return false
    try {
      return getPlaylistDatabase().playlistExists(hashId.trim())
    } catch {
      return false
    }
  }

  addSongs(songs: SongItem[], desc: boolean = false): number {
    if (!Array.isArray(songs) || songs.length === 0) return 0
    const valid = songs.filter(isValidSong)
    if (valid.length === 0) {
      console.warn('没有有效的歌曲可添加')
      return 0
    }
    try {
      const added = this.db.addSongsHead(this.hashId, valid, desc)
      if (added > 0) {
        console.log(`成功添加 ${added} 首歌曲，跳过 ${valid.length - added} 首重复歌曲`)
      } else {
        console.log('所有歌曲都已存在，未添加任何歌曲')
      }
      return added
    } catch (error) {
      console.error('添加歌曲失败:', error)
      throw new PlayListError(
        `添加歌曲失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'SAVE_FAILED'
      )
    }
  }

  removeSong(songmid: string | number): boolean {
    if (!songmid && songmid !== 0) {
      throw new PlayListError('无效的歌曲ID', 'INVALID_SONG_ID')
    }
    try {
      return this.db.removeSong(this.hashId, songmid)
    } catch (error) {
      console.error('移除歌曲失败:', error)
      throw new PlayListError(
        `移除歌曲失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'SAVE_FAILED'
      )
    }
  }

  removeSongs(songmids: (string | number)[]): { removed: number; notFound: number } {
    if (!Array.isArray(songmids) || songmids.length === 0) {
      return { removed: 0, notFound: 0 }
    }
    const valid = songmids.filter(
      (id) => (id || id === 0) && (typeof id === 'string' || typeof id === 'number')
    )
    try {
      const removed = this.db.removeSongs(this.hashId, valid)
      return { removed, notFound: valid.length - removed }
    } catch (error) {
      console.error('批量移除歌曲失败:', error)
      throw new PlayListError(
        `批量移除歌曲失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'SAVE_FAILED'
      )
    }
  }

  reorderSongs(songmids: (string | number)[]): number {
    if (!Array.isArray(songmids) || songmids.length === 0) return 0
    try {
      return this.db.reorderSongs(this.hashId, songmids)
    } catch (error) {
      console.error('重排歌单失败:', error)
      throw new PlayListError(
        `重排歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'SAVE_FAILED'
      )
    }
  }

  moveSong(songmid: string | number, toIndex: number): boolean {
    if ((!songmid && songmid !== 0) || !Number.isFinite(toIndex)) {
      throw new PlayListError('无效的参数', 'INVALID_SONG_ID')
    }
    try {
      return this.db.moveSong(this.hashId, songmid, toIndex)
    } catch (error) {
      console.error('移动歌曲失败:', error)
      throw new PlayListError(
        `移动歌曲失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'SAVE_FAILED'
      )
    }
  }

  clearSongs(): void {
    try {
      this.db.clearSongs(this.hashId)
    } catch (error) {
      console.error('清空歌单失败:', error)
      throw new PlayListError(
        `清空歌单失败: ${error instanceof Error ? error.message : '未知错误'}`,
        'SAVE_FAILED'
      )
    }
  }

  /** SQLite 是即时持久化的，这里保留兼容 no-op。*/
  forceSave(): void {
    /* no-op */
  }

  getSongs(): readonly SongItem[] {
    return Object.freeze(this.db.listSongs(this.hashId))
  }

  /** 供子类在需要时按需访问完整歌曲列表（如 updateCoverIfNeeded）。 */
  protected get list(): SongItem[] {
    return this.db.listSongs(this.hashId)
  }

  getCount(): number {
    return this.db.countSongs(this.hashId)
  }

  hasSong(songmid: string | number): boolean {
    if (!songmid && songmid !== 0) return false
    return this.db.hasSong(this.hashId, songmid)
  }

  getSong(songmid: string | number): SongItem | null {
    if (!songmid && songmid !== 0) return null
    return this.db.getSong(this.hashId, songmid)
  }

  searchSongs(keyword: string): SongItem[] {
    if (!keyword || typeof keyword !== 'string') return []
    return this.db.searchSongs(this.hashId, keyword)
  }

  getStatistics(): {
    total: number
    bySinger: Record<string, number>
    byAlbum: Record<string, number>
    lastModified: string
  } {
    return {
      total: this.db.countSongs(this.hashId),
      bySinger: this.db.aggregateBy(this.hashId, 'singer'),
      byAlbum: this.db.aggregateBy(this.hashId, 'albumName'),
      lastModified: new Date().toISOString()
    }
  }

  validateIntegrity(): { isValid: boolean; issues: string[] } {
    const issues: string[] = []
    if (!this.db.playlistExists(this.hashId)) {
      issues.push('歌单不存在')
    }
    return { isValid: issues.length === 0, issues }
  }

  /** 主键已经保证了去重与一致性，这里仅保留兼容 API。 */
  repairData(): { fixed: boolean; changes: string[] } {
    return { fixed: false, changes: [] }
  }
}

export { PlayListError }
