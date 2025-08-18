import { LoadingPlugin, NotifyPlugin } from 'tdesign-vue-next'

import {
  ServiceNamesType,
  ServiceArgsType,
  SongDetailResponse,
  SongResponse,
  SongUrlResponse
} from './service-base'

import {
  GetToplistArgs,
  SearchArgs,
  GetLyricArgs,
  GetSongDetailArgs,
  GetSongUrlArgs,
  GetToplistDetailArgs,
  GetListSongsArgs,
  DownloadSingleSongArgs
} from './service-base'

type Response = {
  success: boolean
  data?: any
  error?: any
}

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
): Promise<SongUrlResponse>
async function request(
  api: 'getLyric',
  args: GetLyricArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: 'getToplist',
  args: GetToplistArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: 'getToplistDetail',
  args: GetToplistDetailArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: 'getListSongs',
  args: GetListSongsArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: 'downloadSingleSong',
  args: DownloadSingleSongArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: ServiceNamesType,
  args: ServiceArgsType,
  isLoading: boolean = false,
  showError: boolean = true
): Promise<any> {
  if (isLoading) {
    LoadingPlugin({ fullscreen: true, attach: 'body', preventScrollThrough: true })
  }

  // ipc request music service
  const musicServiceRes: Response = await window.api.music.request(api, args)
  if (musicServiceRes.success) {
    return musicServiceRes.data
  } else {
    const musicServiceError: any = musicServiceRes.error

    if (showError) {
      await NotifyPlugin.error({ title: 'error', content: musicServiceError.message })
    }

    console.error('请求失败: ', musicServiceError)
    throw new Error(musicServiceError.message)
  }
}

export default { request }
export type { SongResponse, SongDetailResponse }
