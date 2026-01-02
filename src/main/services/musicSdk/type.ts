export interface sdkArg {
  source: string
  [key: string]: any
}

export interface SearchArg {
  keyword: string
  page: number
  limit: number
}

// 单首歌曲的类型定义
export interface MusicItem {
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: number | string
  source: string
  interval: string
  songmid: number | string
  img: string
  lrc: null | string
  types?: string[]
  _types?: Record<string, any>
  typeUrl?: Record<string, any>
}

// 搜索结果的类型定义
export interface SearchResult {
  list: MusicItem[]
  allPage: number
  limit: number
  total: number
  source: string
}

export interface GetMusicUrlArg {
  pluginId: string
  songInfo: MusicItem
  quality: string
  isCache?: boolean
}

export interface GetMusicPicArg {
  songInfo: MusicItem
}

export interface GetLyricArg {
  songInfo: MusicItem
}

interface Playlist {
  play_count: string // 播放次数，如 "1.8万"
  id: string // 歌单ID
  author: string // 创建者/作者
  name: string // 歌单名称
  time: string // 创建时间，格式为 "YYYY-MM-DD"
  img: string // 封面图片URL
  grade?: string // 评分，可能为undefined
  total: number // 歌曲总数
  desc: string // 歌单描述
  source: string // 音乐来源，如 "wy" 表示网易云音乐
}
export interface PlaylistResult {
  list: Playlist[]
  total: number
  page: number
  source: string
}

export interface GetSongListDetailsArg {
  id: string
  page: number
}

// 歌单详情信息
export interface PlaylistInfo {
  name: string
  img: string
  desc: string
}

// 歌单详情结果
export interface PlaylistDetailResult {
  list: MusicItem[]
  page: number
  limit: number
  total: number
  source: string
  info: PlaylistInfo
}

export interface TagWriteOptions {
  basicInfo?: boolean
  cover?: boolean
  lyrics?: boolean
  downloadLyrics?: boolean
  lyricFormat?: 'lrc' | 'word-by-word'
}

export interface DownloadSingleSongArgs extends GetMusicUrlArg {
  path?: string
  tagWriteOptions?: TagWriteOptions
  lazy?: boolean
}

// 搜索联想结果的类型定义
export type TipSearchResult = string[]
