import { LoadingPlugin, NotifyPlugin } from 'tdesign-vue-next'

import { MusicServiceBase } from './service-base'

import { netEaseService } from './net-ease-service'
import { AxiosError } from 'axios'

const musicService: MusicServiceBase = netEaseService

async function request(api: string, args: any, isLoading = false, showError = true): Promise<any> {
  if (isLoading) {
    LoadingPlugin({ fullscreen: true, attach: 'body', preventScrollThrough: true })
  }

  try {
    switch (api) {
      case 'search':
        return await musicService.search(args)
      case 'getSongDetail':
        return await musicService.getSongDetail(args)
      case 'getSongUrl':
        return await musicService.getSongUrl(args)
      case 'getLyric':
        return await musicService.getLyric(args)
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

export { request }
