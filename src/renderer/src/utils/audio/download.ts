import { NotifyPlugin, MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import { toRaw, h } from 'vue'

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
  types: Array<{ type: string; size: string }>
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

// 创建音质选择弹窗
function createQualityDialog(songInfo: MusicItem, userQuality: string): Promise<string | null> {
  return new Promise((resolve) => {
    const LocalUserDetail = LocalUserDetailStore()

    // 获取歌曲支持的音质列表
    const availableQualities = songInfo.types || []

    // 检查用户设置的音质是否为特殊音质
    const isSpecialQuality = ['hires', 'atmos', 'master'].includes(userQuality)

    // 如果是特殊音质且用户支持，添加到选项中（不管歌曲是否有这个音质）
    const qualityOptions = [...availableQualities]
    if (isSpecialQuality && LocalUserDetail.userSource.quality === userQuality) {
      const hasSpecialQuality = availableQualities.some((q) => q.type === userQuality)
      if (!hasSpecialQuality) {
        qualityOptions.push({ type: userQuality, size: '源站无法得知此音质的文件大小' })
      }
    }

    // 按音质优先级排序
    qualityOptions.sort((a, b) => {
      const aIndex = qualityKey.indexOf(a.type)
      const bIndex = qualityKey.indexOf(b.type)
      return bIndex - aIndex // 降序排列，高音质在前
    })

    const dialog = DialogPlugin.confirm({
      header: '选择下载音质(可滚动)',
      width: 400,
      placement: 'center',
      body: () =>
        h(
          'div',
          {
            class: 'quality-selector'
          },
          [
            h(
              'div',
              {
                class: 'quality-list',
                style: {
                  maxHeight:
                    'max(calc(calc(70vh - 2 * var(--td-comp-paddingTB-xxl)) - 24px - 32px - 32px),100px)',
                  overflow: 'auto',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none'
                }
              },
              qualityOptions.map((quality) =>
                h(
                  'div',
                  {
                    key: quality.type,
                    class: 'quality-item',
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      margin: '8px 0',
                      border: '1px solid #e7e7e7',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor: quality.type === userQuality ? '#e6f7ff' : '#fff'
                    },
                    onClick: () => {
                      dialog.destroy()
                      resolve(quality.type)
                    },
                    onMouseenter: (e: MouseEvent) => {
                      const target = e.target as HTMLElement
                      target.style.backgroundColor = '#f0f9ff'
                      target.style.borderColor = '#1890ff'
                    },
                    onMouseleave: (e: MouseEvent) => {
                      const target = e.target as HTMLElement
                      target.style.backgroundColor =
                        quality.type === userQuality ? '#e6f7ff' : '#fff'
                      target.style.borderColor = '#e7e7e7'
                    }
                  },
                  [
                    h('div', { class: 'quality-info' }, [
                      h(
                        'div',
                        {
                          style: {
                            fontWeight: '500',
                            fontSize: '14px',
                            color: quality.type === userQuality ? '#1890ff' : '#333'
                          }
                        },
                        qualityMap[quality.type] || quality.type
                      ),
                      h(
                        'div',
                        {
                          style: {
                            fontSize: '12px',
                            color: '#999',
                            marginTop: '2px'
                          }
                        },
                        quality.type.toUpperCase()
                      )
                    ]),
                    h(
                      'div',
                      {
                        class: 'quality-size',
                        style: {
                          fontSize: '12px',
                          color: '#666',
                          fontWeight: '500'
                        }
                      },
                      quality.size
                    )
                  ]
                )
              )
            )
          ]
        ),
      confirmBtn: null,
      cancelBtn: null,
      footer: false
    })
  })
}

async function downloadSingleSong(songInfo: MusicItem): Promise<void> {
  try {
    const LocalUserDetail = LocalUserDetailStore()
    const userQuality = LocalUserDetail.userSource.quality as string
    const settingsStore = useSettingsStore()

    // 获取歌词
    const { crlyric, lyric } = await window.api.music.requestSdk('getLyric', {
      source: toRaw(songInfo.source),
      songInfo: toRaw(songInfo) as any
    })
    console.log(songInfo)
    songInfo.lrc = crlyric && songInfo.source !== 'tx' ? crlyric : lyric

    // 显示音质选择弹窗
    const selectedQuality = await createQualityDialog(songInfo, userQuality)

    // 如果用户取消选择，直接返回
    if (!selectedQuality) {
      return
    }

    let quality = selectedQuality
    const isSpecialQuality = ['hires', 'atmos', 'master'].includes(quality)

    // 如果选择的是特殊音质，先尝试下载
    if (isSpecialQuality) {
      try {
        console.log(`尝试下载特殊音质: ${quality} - ${qualityMap[quality]}`)
        const tip = MessagePlugin.success('开始下载歌曲：' + songInfo.name)

        const specialResult = await window.api.music.requestSdk('downloadSingleSong', {
          pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
          source: songInfo.source,
          quality,
          songInfo: toRaw(songInfo) as any,
          tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions)
        })

        ;(await tip).close()

        // 如果成功获取特殊音质链接，处理结果并返回
        if (specialResult) {
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

        console.log(`下载${qualityMap[quality]}音质失败，重新选择音质`)
        MessagePlugin.error('该音质下载失败，请重新选择音质')

        // 特殊音质下载失败，重新弹出选择框
        const retryQuality = await createQualityDialog(songInfo, userQuality)
        if (!retryQuality) {
          return
        }
        quality = retryQuality
      } catch (specialError) {
        console.log(`下载${qualityMap[quality]}音质出错:`, specialError)
        MessagePlugin.error('该音质下载失败，请重新选择音质')

        // 特殊音质下载出错，重新弹出选择框
        const retryQuality = await createQualityDialog(songInfo, userQuality)
        if (!retryQuality) {
          return
        }
        quality = retryQuality
      }
    }

    // 检查选择的音质是否超出歌曲支持的最高音质
    const songMaxQuality = songInfo.types[songInfo.types.length - 1]?.type
    if (songMaxQuality && qualityKey.indexOf(quality) > qualityKey.indexOf(songMaxQuality)) {
      quality = songMaxQuality
      MessagePlugin.warning(`所选音质不可用，已自动调整为: ${qualityMap[quality]}`)
    }

    console.log(`使用音质下载: ${quality} - ${qualityMap[quality]}`)
    const tip = MessagePlugin.success('开始下载歌曲：' + songInfo.name)

    const result = await window.api.music.requestSdk('downloadSingleSong', {
      pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
      source: songInfo.source,
      quality,
      songInfo: toRaw(songInfo) as any,
      tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions)
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
      content: `${error.message.includes('歌曲正在') ? '歌曲正在下载中' : '未知错误'}`
    })
  }
}

export { downloadSingleSong }
