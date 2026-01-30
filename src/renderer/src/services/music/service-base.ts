import axios, { AxiosInstance } from 'axios'

const timeout: number = 5000

const mobileHeaders = {
  'User-Agent':
    'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148'
}

const axiosClient: AxiosInstance = axios.create({
  timeout: timeout
})

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
  pluginId?: string // 插件ID
  quality?: string // 音质
  source?: string // 音乐源（wy, tx等）
}

type GetLyricArgs = {
  id: string
  lv?: boolean
  yv?: boolean // 获取逐字歌词
  tv?: boolean // 获取歌词翻译
}

type GetToplistArgs = Record<string, never>

type GetToplistDetailArgs = Record<string, never>

type GetListSongsArgs = {
  id: string
  limit?: number
  offset?: number
}

type DownloadSingleSongArgs = {
  id: string
  name: string
  artist: string
  pluginId?: string
  quality?: string
  source?: string
}

type DownloadBatchSongsArgs = {
  tasks: DownloadSingleSongArgs[]
  source?: string
}

type ServiceNamesType =
  | 'search'
  | 'getSongDetail'
  | 'getSongUrl'
  | 'getLyric'
  | 'getToplist'
  | 'getToplistDetail'
  | 'getListSongs'
  | 'downloadSingleSong'
  | 'downloadBatchSongs'

type ServiceArgsType =
  | SearchArgs
  | GetSongDetailArgs
  | GetSongUrlArgs
  | GetLyricArgs
  | GetToplistArgs
  | GetToplistDetailArgs
  | GetListSongsArgs
  | DownloadSingleSongArgs
  | DownloadBatchSongsArgs

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

interface SongResponse {
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

interface SongDetailResponse {
  songs: SongDetail[]
  equalizers: Record<string, unknown>
  code: number
}
interface SongUrlResponse {
  id: number
  url: string // 歌曲地址
  name: string
  artist: string
  pic: string //封面图片
}

interface MusicServiceBase {
  search({ type, keyword, offset, limit }: SearchArgs): Promise<SongResponse>
  getSongDetail({ ids }: GetSongDetailArgs): Promise<SongDetailResponse>
  getSongUrl({ id }: GetSongUrlArgs): Promise<SongUrlResponse>
  getLyric({ id, lv, yv, tv }: GetLyricArgs): Promise<any>
  getToplist({}: GetToplistArgs): Promise<any>
  getToplistDetail({}: GetToplistDetailArgs): Promise<any>
  getListSongs({ id, limit, offset }: GetListSongsArgs): Promise<any>
  downloadSingleSong({ id }: DownloadSingleSongArgs): Promise<any>
}

export type { MusicServiceBase, ServiceNamesType, ServiceArgsType }
export type {
  SearchArgs,
  GetSongDetailArgs,
  GetSongUrlArgs,
  GetLyricArgs,
  GetToplistArgs,
  GetToplistDetailArgs,
  GetListSongsArgs,
  DownloadSingleSongArgs
}
export type { SongResponse, SongDetailResponse, SongUrlResponse }

export { mobileHeaders, axiosClient, type DownloadBatchSongsArgs }
