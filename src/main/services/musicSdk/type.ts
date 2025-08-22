export interface sdkArg {
  source: string
  [key:string]: any
}

export interface SearchSongArg {
  keyword: string
  page: number
  limit: number
} 
// 可以添加到 src/main/services/music/service-base.ts 文件中

// 单首歌曲的类型定义
export interface MusicItem {
  hash?: string
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number
  img: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
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
}

export interface GetMusicPicArg {
  songInfo: MusicItem
}

export interface GetLyricArg {
  songInfo: MusicItem
}