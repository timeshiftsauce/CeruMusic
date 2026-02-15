import { NotifyPlugin, MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import { toRaw, h } from 'vue'
import {
  getQualityDisplayName,
  buildQualityFormats,
  compareQuality,
  calculateBestQuality
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

function parseTimeTagMs(tag: string): number {
  const m = tag.match(/\[(\d{2}):(\d{2})\.(\d{2,3})]/)
  if (!m) return Number.NaN
  const mm = Number(m[1]) || 0
  const ss = Number(m[2]) || 0
  const fracRaw = m[3] || '0'
  const frac = fracRaw.length === 2 ? Number(fracRaw) * 10 : Number(fracRaw)
  return mm * 60_000 + ss * 1_000 + frac
}

function mergeLyricWithTranslation(baseLyric: string, tlyric?: string): string {
  if (!baseLyric || !tlyric) return baseLyric || ''

  const baseLines = String(baseLyric).replace(/\r/g, '').split('\n')
  const transLines = String(tlyric).replace(/\r/g, '').split('\n')

  const transTimed = transLines
    .map((line) => {
      const m = line.match(/^((?:\[\d{2}:\d{2}\.\d{2,3}])+)(.*)$/)
      if (!m) return null
      const firstTag = (m[1].match(/\[\d{2}:\d{2}\.\d{2,3}]/g) || [])[0]
      if (!firstTag) return null
      return {
        ms: parseTimeTagMs(firstTag),
        text: (m[2] || '').trim()
      }
    })
    .filter((v): v is { ms: number; text: string } => !!v && Number.isFinite(v.ms) && !!v.text)
    .sort((a, b) => a.ms - b.ms)

  if (transTimed.length === 0) return baseLyric

  const used = new Set<number>()
  let cursor = 0
  const maxDiffMs = 300
  const out: string[] = []

  for (const line of baseLines) {
    out.push(line)
    const m = line.match(/^((?:\[\d{2}:\d{2}\.\d{2,3}])+)(.*)$/)
    if (!m) continue

    const tags = m[1].match(/\[\d{2}:\d{2}\.\d{2,3}]/g) || []
    const firstTag = tags[0]
    const baseText = (m[2] || '').trim()
    if (!firstTag || !baseText) continue

    const baseMs = parseTimeTagMs(firstTag)
    if (!Number.isFinite(baseMs)) continue

    while (cursor < transTimed.length && transTimed[cursor].ms < baseMs - maxDiffMs) cursor++

    let best = -1
    let bestDiff = Number.POSITIVE_INFINITY
    for (let i = cursor; i < transTimed.length; i++) {
      if (used.has(i)) continue
      const diff = Math.abs(transTimed[i].ms - baseMs)
      if (diff > maxDiffMs && transTimed[i].ms > baseMs + maxDiffMs) break
      if (diff <= maxDiffMs && diff < bestDiff) {
        best = i
        bestDiff = diff
      }
    }

    if (best >= 0) {
      const text = transTimed[best].text
      if (text && text !== baseText) {
        out.push(`${firstTag}${text}`)
        used.add(best)
      }
    }
  }

  return out.join('\n')
}

// 创建音质选择弹窗
export function createQualityDialog(
  songInfoOrTypes: MusicItem | Array<{ type: string; size?: string }>,
  userQuality: string,
  title: string = '选择下载音质(可滚动)'
): Promise<string | null> {
  return new Promise((resolve) => {
    let types: Array<{ type: string; size?: string }> = []
    if (Array.isArray(songInfoOrTypes)) {
      types = songInfoOrTypes
    } else {
      types = songInfoOrTypes.types || []
    }

    // 获取歌曲支持的音质列表
    const availableQualities = buildQualityFormats(types)
    const qualityOptions = [...availableQualities]

    // 按音质优先级排序（高→低）
    qualityOptions.sort((a, b) => compareQuality(a.type, b.type))

    const dialog = DialogPlugin.confirm({
      header: title,
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
    let lrcData: any = {}
    let retryCount = 0
    const maxRetries = 3

    while (retryCount < maxRetries) {
      try {
        lrcData = await window.api.music.requestSdk('getLyric', {
          source: toRaw(songInfo.source),
          songInfo: toRaw(songInfo) as any
        })

        // Check if valid result (not error and has content)
        if (lrcData && !lrcData.error && (lrcData.lyric || lrcData.crlyric)) {
          break
        }
        // If we got an error object, treat it as failure and retry
        if (lrcData && lrcData.error) {
          console.warn(`获取歌词返回错误 (尝试 ${retryCount + 1}/${maxRetries}):`, lrcData.error)
        }
      } catch (e) {
        console.warn(`获取歌词抛出异常 (尝试 ${retryCount + 1}/${maxRetries}):`, e)
      }

      retryCount++
      if (retryCount < maxRetries) {
        // Linear backoff: 500ms, 1000ms, 1500ms...
        await new Promise((r) => setTimeout(r, 500 * retryCount))
      }
    }

    const { crlyric, lyric, tlyric } = lrcData || {}
    console.log(songInfo)
    const baseLyric =
      tlyric && lyric ? lyric : crlyric && songInfo.source !== 'tx' ? crlyric : lyric
    songInfo.lrc = mergeLyricWithTranslation(baseLyric || '', tlyric)

    // 显示音质选择弹窗
    const selectedQuality = await createQualityDialog(songInfo, userQuality)

    // 如果用户取消选择，直接返回
    if (!selectedQuality) {
      return
    }

    let quality = selectedQuality as string

    // 检查选择的音质是否超出歌曲支持的最高音质
    const calculatedQuality = calculateBestQuality(songInfo.types, quality)
    if (calculatedQuality && calculatedQuality !== quality) {
      quality = calculatedQuality
      MessagePlugin.warning(`所选音质不可用，已自动调整为: ${getQualityDisplayName(quality)}`)
    }

    console.log(`使用音质下载: ${quality} - ${getQualityDisplayName(quality)}`)
    const tip = MessagePlugin.success('开始下载歌曲：' + songInfo.name)

    const songInfoWithTemplate = {
      ...toRaw(songInfo),
      template: settingsStore.settings.filenameTemplate || '%t - %s'
    }

    const result = await window.api.music.requestSdk('downloadSingleSong', {
      pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
      source: songInfo.source,
      quality,
      songInfo: songInfoWithTemplate as any,
      tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions),
      isCache: true
    })

    ;(await tip).close()

    // 兼容 DownloadManager 返回的 Task 对象 (包含 filePath) 和旧版返回对象 (包含 path)
    const savePath = result.filePath || result.path

    if (!savePath) {
      MessagePlugin.info(result.message || '未知状态')
    } else {
      await NotifyPlugin.success({
        title: '已添加到下载队列',
        content: `歌曲已添加，可在下载管理中查看进度`
      })
    }
  } catch (error: any) {
    console.error('下载失败:', error)
    // Handle specific error messages from backend
    const msg = error.message || ''
    if (msg.includes('歌曲正在下载中')) {
      await NotifyPlugin.warning({
        title: '提示',
        content: '该歌曲正在下载中，请勿重复添加'
      })
    } else if (msg.includes('歌曲已下载完成')) {
      await NotifyPlugin.info({
        title: '提示',
        content: '该歌曲已下载完成'
      })
    } else {
      await NotifyPlugin.error({
        title: '下载失败',
        content: msg || '未知错误'
      })
    }
  }
}

export { downloadSingleSong }
