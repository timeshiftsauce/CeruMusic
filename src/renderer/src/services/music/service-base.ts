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

type ServiceNamesType =
  | 'search'
  | 'getSongDetail'
  | 'getSongUrl'
  | 'getLyric'
  | 'getToplist'
  | 'getToplistDetail'
  | 'getListSongs'

type ServiceArgsType =
  | SearchArgs
  | GetSongDetailArgs
  | GetSongUrlArgs
  | GetLyricArgs
  | GetToplistArgs
  | GetToplistDetailArgs
  | GetListSongsArgs

interface MusicServiceBase {
  search({ type, keyword, offset, limit }: SearchArgs): Promise<any>
  getSongDetail({ ids }: GetSongDetailArgs): Promise<any>
  getSongUrl({ id }: GetSongUrlArgs): Promise<any>
  getLyric({ id, lv, yv, tv }: GetLyricArgs): Promise<any>
  getToplist({}: GetToplistArgs): Promise<any>
  getToplistDetail({}: GetToplistDetailArgs): Promise<any>
  getListSongs({ id, limit, offset }: GetListSongsArgs): Promise<any>
}

export type { MusicServiceBase, ServiceNamesType, ServiceArgsType }
export type {
  SearchArgs,
  GetSongDetailArgs,
  GetSongUrlArgs,
  GetLyricArgs,
  GetToplistArgs,
  GetToplistDetailArgs,
  GetListSongsArgs
}
export { mobileHeaders, axiosClient }
