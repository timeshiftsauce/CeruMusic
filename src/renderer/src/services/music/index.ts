import { LoadingPlugin, NotifyPlugin } from 'tdesign-vue-next'

import { MusicServiceBase, ServiceNamesType, ServiceArgsType } from './service-base'
import {
  GetToplistArgs,
  SearchArgs,
  GetLyricArgs,
  GetSongDetailArgs,
  GetSongUrlArgs,
  GetToplistDetailArgs,
  GetListSongsArgs
} from './service-base'

import { netEaseService } from './net-ease-service'
import { AxiosError } from 'axios'

const musicService: MusicServiceBase = netEaseService

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
  api: ServiceNamesType,
  args: ServiceArgsType,
  isLoading: boolean = false,
  showError: boolean = true
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
      case 'getToplist':
        return await musicService.getToplist(args as GetToplistArgs)
      case 'getToplistDetail':
        return await musicService.getToplistDetail(args as GetToplistDetailArgs)
      case 'getListSongs':
        return await musicService.getListSongs(args as GetListSongsArgs)
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
