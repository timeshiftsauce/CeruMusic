import { NotifyPlugin, MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import { toRaw, h } from 'vue'
import {
  QUALITY_ORDER,
  getQualityDisplayName,
  buildQualityFormats,
  getHighestQualityType,
  compareQuality,
  type KnownQuality
} from '@common/utils/quality'

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

// 创建音质选择弹窗
function createQualityDialog(songInfo: MusicItem, userQuality: string): Promise<string | null> {
  return new Promise((resolve) => {
    // 获取歌曲支持的音质列表
    const availableQualities = buildQualityFormats(songInfo.types || [])
    const qualityOptions = [...availableQualities]

    // 按音质优先级排序（高→低）
    qualityOptions.sort((a, b) => compareQuality(a.type, b.type))

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
              qualityOptions.map((quality) => {
                const disabled = false
                return h(
                  'div',
                  {
                    key: quality.type,
                    class: 'quality-item',
                    title: undefined,
                    style: {
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '12px 16px',
                      margin: '8px 0',
                      border: '1px solid ' + (disabled ? '#f0f0f0' : '#e7e7e7'),
                      borderRadius: '6px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor:
                        quality.type === userQuality ? (disabled ? '#f5faff' : '#e6f7ff') : '#fff',
                      opacity: disabled ? 0.55 : 1
                    },
                    onClick: () => {
                      if (disabled) return
                      dialog.destroy()
                      resolve(quality.type)
                    },
                    onMouseenter: (e: MouseEvent) => {
                      if (disabled) return
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
                        getQualityDisplayName(quality.type)
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
              })
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
    console.log('开始下载', toRaw(songInfo))
    const LocalUserDetail = LocalUserDetailStore()
    const userQuality =
      (LocalUserDetail.userInfo.sourceQualityMap || {})[toRaw(songInfo.source) as any] ||
      (LocalUserDetail.userSource.quality as string)
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

    let quality = selectedQuality as string

    // 检查选择的音质是否超出歌曲支持的最高音质
    const songMaxQuality = getHighestQualityType(songInfo.types)
    if (
      songMaxQuality &&
      QUALITY_ORDER.indexOf(quality as KnownQuality) <
      QUALITY_ORDER.indexOf(songMaxQuality as KnownQuality)
    ) {
      quality = songMaxQuality
      MessagePlugin.warning(`所选音质不可用，已自动调整为: ${getQualityDisplayName(quality)}`)
    }

    console.log(`使用音质下载: ${quality} - ${getQualityDisplayName(quality)}`)
    const tip = MessagePlugin.success('开始下载歌曲：' + songInfo.name)

    const result = await window.api.music.requestSdk('downloadSingleSong', {
      pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
      source: songInfo.source,
      quality,
      songInfo: toRaw(songInfo) as any,
      tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions),
      isCache: true
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
      content: `${error.message.includes('歌曲正在') ? error.message : '未知错误'}`
    })
  }
}

export { downloadSingleSong }
