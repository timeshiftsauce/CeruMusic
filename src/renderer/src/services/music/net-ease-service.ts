import { MusicServiceBase } from './service-base'
import {
  SearchArgs,
  GetSongDetailArgs,
  GetSongUrlArgs,
  GetToplistDetailArgs,
  GetListSongsArgs,
  GetLyricArgs,
  GetToplistArgs
} from './service-base'

import { SongDetailResponse, SongResponse } from './service-base'

// 通过IPC调用主进程的网易云音乐服务
export const netEaseService: MusicServiceBase = {
  async search({ type, keyword, offset, limit }: SearchArgs): Promise<SongResponse> {
    try {
      return await window.api.netease.search({ type, keyword, offset, limit })
    } catch (error) {
      console.error('Search error:', error)
      throw error
    }
  },

  async getSongDetail({ ids }: GetSongDetailArgs): Promise<SongDetailResponse> {
    try {
      return await window.api.netease.getSongDetail({ ids })
    } catch (error) {
      console.error('Get song detail error:', error)
      throw error
    }
  },

  async getSongUrl({ id }: GetSongUrlArgs): Promise<any> {
    try {
      return await window.api.netease.getSongUrl({ id })
    } catch (error) {
      console.error('Get song URL error:', error)
      throw error
    }
  },

  async getLyric({ id, lv, yv, tv }: GetLyricArgs): Promise<any> {
    try {
      return await window.api.netease.getLyric({ id, lv, yv, tv })
    } catch (error) {
      console.error('Get lyric error:', error)
      throw error
    }
  },

  async getToplist(args: GetToplistArgs): Promise<any> {
    try {
      return await window.api.netease.getToplist(args)
    } catch (error) {
      console.error('Get toplist error:', error)
      throw error
    }
  },

  async getToplistDetail(args: GetToplistDetailArgs): Promise<any> {
    try {
      return await window.api.netease.getToplistDetail(args)
    } catch (error) {
      console.error('Get toplist detail error:', error)
      throw error
    }
  },

  async getListSongs(args: GetListSongsArgs): Promise<any> {
    try {
      return await window.api.netease.getListSongs(args)
    } catch (error) {
      console.error('Get list songs error:', error)
      throw error
    }
  }
}
