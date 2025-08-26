import { NotifyPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { toRaw } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next';

interface MusicItem {
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number
  img: string
  lrc: null | string
  types: string[]
  _types: Record<string, any>
  typeUrl: Record<string, any>
}

const qualityMap: Record<string, string> = {
  '128k': '标准音质',
  '192k': '高品音质',
  '320k': '超高品质',
  flac: '无损音质',
  flac24bit: '超高解析',
  hires: '高清臻音',
  atmos: '全景环绕',
  master: '超清母带'
}
const qualityKey = Object.keys(qualityMap)

async function downloadSingleSong(songInfo: MusicItem): Promise<void> {
  
  try {
    const LocalUserDetail = LocalUserDetailStore()
     let quality = LocalUserDetail.userSource.quality as string
    if (
      qualityKey.indexOf(quality) >
      qualityKey.indexOf((songInfo.types[songInfo.types.length - 1] as unknown as { type: any }).type)
    ) {
      quality = (songInfo.types[songInfo.types.length - 1] as unknown as { type: any }).type
    }
    const tip = MessagePlugin.success('开始下载歌曲：'+ songInfo.name)
    const result = await window.api.music.requestSdk('downloadSingleSong',{
      pluginId:LocalUserDetail.userSource.pluginId?.toString() || '',
      source:songInfo.source,
      quality,
      songInfo:toRaw(songInfo)
    })
    ;(await tip).close()
    if (!Object.hasOwn(result, 'path')) {
      MessagePlugin.info(result.message)
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
      content: `${error.message.includes('歌曲正在')? '歌曲正在下载中':'未知错误'}`
    })
  }
}

export { downloadSingleSong }
