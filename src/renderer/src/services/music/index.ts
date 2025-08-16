import { LoadingPlugin, NotifyPlugin } from 'tdesign-vue-next'
import type { LoadingInstance } from 'tdesign-vue-next'

import { MusicServiceBase } from './service-base'

import { netEaseService } from './net-ease-service'
import { AxiosError } from 'axios'

const musicService: MusicServiceBase = netEaseService

type ApiMethod = 'search' | 'getSongDetail' | 'getSongUrl' | 'getLyric'

// 定义每个 API 方法对应的参数类型
type SearchArgs = {
  type: number
  keyword: string
  offset?: number
  limit: number
}

type GetSongDetailArgs = {
  ids: string[]
}

type GetSongUrlArgs = {
  id: string
}

type GetLyricArgs = {
  id: string
  lv?: boolean
  yv?: boolean
  tv?: boolean
}
interface Artist {
  id: number
  name: string
  picUrl: string | null
  alias: string[]
  albumSize: number
  picId: number
  fansGroup: null
  img1v1Url: string
  img1v1: number
  trans: null
}

interface Album {
  id: number
  name: string
  artist: {
    id: number
    name: string
    picUrl: string | null
    alias: string[]
    albumSize: number
    picId: number
    fansGroup: null
    img1v1Url: string
    img1v1: number
    trans: null
  }
  publishTime: number
  size: number
  copyrightId: number
  status: number
  picId: number
  alia?: string[]
  mark: number
}

interface Song {
  id: number
  name: string
  artists: Artist[]
  album: Album
  duration: number
  copyrightId: number
  status: number
  alias: string[]
  rtype: number
  ftype: number
  mvid: number
  fee: number
  rUrl: null
  mark: number
  transNames?: string[]
}

export interface SongResponse {
  songs: Song[]
  songCount: number
}
interface AlbumDetail {
  name: string
  id: number
  type: string
  size: number
  picId: number
  blurPicUrl: string
  companyId: number
  pic: number
  picUrl: string
  publishTime: number
  description: string
  tags: string
  company: string
  briefDesc: string
  artist: {
    name: string
    id: number
    picId: number
    img1v1Id: number
    briefDesc: string
    picUrl: string
    img1v1Url: string
    albumSize: number
    alias: string[]
    trans: string
    musicSize: number
    topicPerson: number
  }
  songs: any[]
  alias: string[]
  status: number
  copyrightId: number
  commentThreadId: string
  artists: Artist[]
  subType: string
  transName: null
  onSale: boolean
  mark: number
  gapless: number
  dolbyMark: number
}
interface MusicQuality {
  name: null
  id: number
  size: number
  extension: string
  sr: number
  dfsId: number
  bitrate: number
  playTime: number
  volumeDelta: number
}
interface SongDetail {
  name: string
  id: number
  position: number
  alias: string[]
  status: number
  fee: number
  copyrightId: number
  disc: string
  no: number
  artists: Artist[]
  album: AlbumDetail
  starred: boolean
  popularity: number
  score: number
  starredNum: number
  duration: number
  playedNum: number
  dayPlays: number
  hearTime: number
  sqMusic: MusicQuality
  hrMusic: null
  ringtone: null
  crbt: null
  audition: null
  copyFrom: string
  commentThreadId: string
  rtUrl: null
  ftype: number
  rtUrls: any[]
  copyright: number
  transName: null
  sign: null
  mark: number
  originCoverType: number
  originSongSimpleData: null
  single: number
  noCopyrightRcmd: null
  hMusic: MusicQuality
  mMusic: MusicQuality
  lMusic: MusicQuality
  bMusic: MusicQuality
  mvid: number
  mp3Url: null
  rtype: number
  rurl: null
}
export interface SongDetailResponse {
  songs: SongDetail[]
  equalizers: Record<string, unknown>
  code: number
}

// 使用函数重载定义不同的调用方式
async function request(
  api: 'search',
  args: SearchArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<SongResponse>
async function request(
  api: 'getSongDetail',
  args: GetSongDetailArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<SongDetailResponse['songs']>
async function request(
  api: 'getSongUrl',
  args: GetSongUrlArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: 'getLyric',
  args: GetLyricArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: ApiMethod,
  args: SearchArgs | GetSongDetailArgs | GetSongUrlArgs | GetLyricArgs,
  isLoading = false,
  showError = true
): Promise<any> {
  let instance: LoadingInstance | null = null
  if (isLoading) {
    instance = LoadingPlugin({ fullscreen: true, attach: 'body', preventScrollThrough: true })
  }

  try {
    switch (api) {
      case 'search':
        return await musicService.search(args as SearchArgs)
      case 'getSongDetail':
        return await musicService.getSongDetail(args as GetSongDetailArgs)
      case 'getSongUrl':
        return await musicService.getSongUrl(args as GetSongUrlArgs)
      case 'getLyric':
        return await musicService.getLyric(args as GetLyricArgs)
      default:
        throw new Error(`未知的方法: ${api}`)
    }
  } catch (error: any) {
    if (error instanceof AxiosError) {
      error.message = '网络错误'
    }

    if (showError) {
      await NotifyPlugin.error({ title: 'error', content: error.message })
    }

    console.error('请求失败: ', error)
    throw new Error(error.message)
  } finally {
    instance?.hide()
  }
}

export default request
