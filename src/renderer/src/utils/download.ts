import { NotifyPlugin } from 'tdesign-vue-next'
import musicService from '@renderer/services/music'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

async function downloadSingleSong(songId: string, name: string, artist: string): Promise<void> {
  try {
    const LocalUserDetail = LocalUserDetailStore()
    const result = await musicService.request(
      'downloadSingleSong',
      { id: songId, name, artist, ...LocalUserDetail.userSource },
      false,
      false
    )

    if (!Object.hasOwn(result, 'path')) {
      await NotifyPlugin.info({
        title: '提示',
        content: result.message
      })
    } else {
      await NotifyPlugin.success({
        title: '下载成功',
        content: `${result.message} 保存位置: ${result.path}`
      })
    }
  } catch (error: any) {
    console.error('下载失败:', error)
    await NotifyPlugin.error({
      title: '下载失败',
      content: `${error.message ?? '未知错误'}`
    })
  }
}

export { downloadSingleSong }
