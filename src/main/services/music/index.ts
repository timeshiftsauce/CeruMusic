import { MusicServiceBase, ServiceNamesType, ServiceArgsType } from './service-base'
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
import { netEaseService } from './net-ease-service'
import { AxiosError } from 'axios'

const musicService: MusicServiceBase = netEaseService

type Response = {
  success: boolean
  data?: any
  error?: any
}

async function request(api: ServiceNamesType, args: ServiceArgsType): Promise<any> {
  const res: Response = { success: false }
  try {
    switch (api) {
      case 'search':
        res.data = await musicService.search(args as SearchArgs)
        break
      case 'getSongDetail':
        res.data = await musicService.getSongDetail(args as GetSongDetailArgs)
        break
      case 'getSongUrl':
        res.data = await musicService.getSongUrl(args as GetSongUrlArgs)
        break
      case 'getLyric':
        res.data = await musicService.getLyric(args as GetLyricArgs)
        break
      case 'getToplist':
        res.data = await musicService.getToplist(args as GetToplistArgs)
        break
      case 'getToplistDetail':
        res.data = await musicService.getToplistDetail(args as GetToplistDetailArgs)
        break
      case 'getListSongs':
        res.data = await musicService.getListSongs(args as GetListSongsArgs)
        break
      case 'downloadSingleSong':
        res.data = await musicService.downloadSingleSong(args as DownloadSingleSongArgs)
        break
      default:
        throw new Error(`未知的方法: ${api}`)
    }

    res.success = true
  } catch (error: any) {
    if (error instanceof AxiosError) {
      error.message = '网络错误'
    }

    console.error('请求失败: ', error)
    res.error = error
  }

  return res
}

export default { request }
// netEaseService
//   .search({
//     keyword: '稻香',
//     type: 1,
//     limit: 25
//   })
//   .then((res) => {
//     console.log(res)
//   })
