import { NotifyPlugin, MessagePlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { toRaw } from 'vue'

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

    // 检查是否为特殊音质（高清臻音、全景环绕或超清母带）
    const isSpecialQuality = ['hires', 'atmos', 'master'].includes(quality)

    // 如果是特殊音质，先尝试获取对应链接
    if (isSpecialQuality) {
      try {
        console.log(`尝试下载特殊音质: ${quality} - ${qualityMap[quality]}`)
        const tip = MessagePlugin.success('开始下载歌曲：' + songInfo.name)

        const specialResult = await window.api.music.requestSdk('downloadSingleSong', {
          pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
          source: songInfo.source,
          quality,
          songInfo: toRaw(songInfo)
        })

          ; (await tip).close()

        // 如果成功获取特殊音质链接，处理结果并返回
        if (specialResult && 'error' in specialResult && !specialResult.error) {
          if (!Object.hasOwn(specialResult, 'path')) {
            MessagePlugin.info(specialResult.message)
          } else {
            await NotifyPlugin.success({
              title: '下载成功',
              content: `${specialResult.message} 保存位置: ${specialResult.path}`
            })
          }
          return
        }

        console.log(`下载${qualityMap[quality]}音质失败，回退到标准逻辑`)
        // 如果获取特殊音质失败，继续执行原有逻辑
      } catch (specialError) {
        console.log(`下载${qualityMap[quality]}音质出错，回退到标准逻辑:`, specialError)
        // 特殊音质获取失败，继续执行原有逻辑
      }
      MessagePlugin.error('下载失败了，向下兼容音质')
    }

    // 原有逻辑：检查歌曲支持的最高音质
    if (
      qualityKey.indexOf(quality) >
      qualityKey.indexOf(
        (songInfo.types[songInfo.types.length - 1] as unknown as { type: any }).type
      )
    ) {
      quality = (songInfo.types[songInfo.types.length - 1] as unknown as { type: any }).type
    }

    console.log(`使用音质下载: ${quality} - ${qualityMap[quality]}`)
    const tip = MessagePlugin.success('开始下载歌曲：' + songInfo.name)
    const result = await window.api.music.requestSdk('downloadSingleSong', {
      pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
      source: songInfo.source,
      quality,
      songInfo: toRaw(songInfo)
    })
      ; (await tip).close()
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
      content: `${error.message.includes('歌曲正在') ? '歌曲正在下载中' : '未知错误'}`
    })
  }
}

export { downloadSingleSong }
