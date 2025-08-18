import { NotifyPlugin } from 'tdesign-vue-next'
import musicService from '@renderer/services/music'

async function downloadSingleSong(songId: string): Promise<void> {
  try {
    const result = await musicService.request('downloadSingleSong', { id: songId }, false, false)

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
