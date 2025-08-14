import { LoadingPlugin, NotifyPlugin } from 'tdesign-vue-next'

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

// 使用函数重载定义不同的调用方式
async function request(
  api: 'search',
  args: SearchArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
async function request(
  api: 'getSongDetail',
  args: GetSongDetailArgs,
  isLoading?: boolean,
  showError?: boolean
): Promise<any>
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
  if (isLoading) {
    LoadingPlugin({ fullscreen: true, attach: 'body', preventScrollThrough: true })
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
  }
}

export default request
