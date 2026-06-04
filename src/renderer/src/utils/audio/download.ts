import { NotifyPlugin, MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import { toRaw, h, ref } from 'vue'
import { sourceLabel } from '@renderer/utils/sourceName'
import { createSourceSwitchDialog, getCandidateSongs } from '@renderer/utils/audio/audioHelpers'
import {
  getQualityDisplayName,
  compareQuality,
  calculateBestQuality,
  QUALITY_ORDER
} from '@common/utils/quality'
import { getDownloadableQualityFormats } from '@renderer/utils/audio/qualityAvailability'

interface MusicItem {
  singer: string
  name: string
  albumName: string
  albumId: number
  source: string
  interval: string
  songmid: number
  hash?: string
  img: string
  lrc: null | string
  types: Array<string | { type: string; size?: string }>
  _types: Record<string, any>
  typeUrl: Record<string, any>
}

const DOWNLOAD_SOURCE_LABELS: Record<string, string> = {
  wy: 'wyy',
  wyy: 'wyy',
  kg: 'kg',
  tx: '秋秋',
  qq: '秋秋',
  kw: 'kw',
  mg: 'mg'
}

const downloadSourceLabel = (source?: string | null): string => {
  if (!source) return ''
  return DOWNLOAD_SOURCE_LABELS[source] || sourceLabel(source)
}

const createDownloadSourceDialog = (
  initialSongInfo: MusicItem,
  userInfo: any,
  getQualities?: (song: MusicItem) => Promise<Array<string | { type: string; size?: string }>>
): Promise<{ song: MusicItem; qualities: Array<string | { type: string; size?: string }> } | null> =>
  new Promise((resolve) => {
    const selectedSongInfo = ref<MusicItem>(initialSongInfo)
    const checking = ref(false)
    const checked = ref(false)
    const availableQualities = ref<Array<string | { type: string; size?: string }>>([])
    let resolved = false

    const finish = (result: { song: MusicItem; qualities: Array<string | { type: string; size?: string }> } | null) => {
      if (resolved) return
      resolved = true
      dialog.destroy()
      resolve(result)
    }

    const selectOtherSource = async () => {
      const switchedSong = await createSourceSwitchDialog(
        toRaw(selectedSongInfo.value) as any,
        userInfo,
        '切换下载音源'
      )
      if (resolved) return
      if (switchedSong) {
        selectedSongInfo.value = switchedSong as any
        checked.value = false
        availableQualities.value = []
      }
    }

    const useCurrentSource = async () => {
      if (!getQualities) {
        finish({ song: selectedSongInfo.value, qualities: [] })
        return
      }
      checking.value = true
      checked.value = true
      try {
        const qualities = await getQualities(selectedSongInfo.value)
        if (resolved) return
        availableQualities.value = qualities
        if (qualities.length > 0) {
          finish({ song: selectedSongInfo.value, qualities })
        }
      } finally {
        if (!resolved) checking.value = false
      }
    }

    const dialog = DialogPlugin({
      header: '选择下载音源',
      width: 520,
      placement: 'center',
      body: () =>
        h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, [
          h(
            'div',
            {
              style: {
                fontSize: '13px',
                lineHeight: '1.5',
                color: 'var(--td-text-color-secondary)'
              }
            },
            '先确认下载音源，再只显示该音源当前歌曲真实提供的音质。'
          ),
          h(
            'div',
            {
              style: {
                padding: '12px 14px',
                borderRadius: '8px',
                border: '1px solid var(--td-border-level-1-color)',
                background: 'var(--td-bg-color-container)'
              }
            },
            [
              h('div', { style: { fontSize: '12px', color: 'var(--td-text-color-secondary)' } }, '当前选择源'),
              h(
                'div',
                { style: { marginTop: '4px', fontWeight: '600' } },
                downloadSourceLabel(selectedSongInfo.value.source)
              ),
              h(
                'div',
                {
                  style: {
                    marginTop: '6px',
                    fontSize: '12px',
                    color: 'var(--td-text-color-placeholder)'
                  }
                },
                `${selectedSongInfo.value.name || '未知歌曲'} · ${selectedSongInfo.value.singer || '未知歌手'}`
              ),
              checked.value
                ? h(
                    'div',
                    {
                      style: {
                        marginTop: '10px',
                        fontSize: '13px',
                        color:
                          availableQualities.value.length > 0
                            ? 'var(--td-success-color)'
                            : 'var(--td-warning-color)'
                      }
                    },
                    checking.value
                      ? '正在检测当前源真实可下载音质...'
                      : availableQualities.value.length > 0
                        ? `已找到 ${availableQualities.value.length} 个真实可下载音质`
                        : '当前源没有真实可下载音质，可以选择其他源或关闭。'
                  )
                : null
            ]
          )
        ]),
      footer: () =>
        h(
          'div',
          {
            style: {
              display: 'flex',
              justifyContent: 'flex-end',
              gap: '12px'
            }
          },
          [
            h(
              'button',
              {
                type: 'button',
                class: 't-button t-button--variant-base t-button--theme-default',
                onClick: () => finish(null)
              },
              '取消'
            ),
            h(
              'button',
              {
                type: 'button',
                class: 't-button t-button--variant-base t-button--theme-default',
                onClick: async () => selectOtherSource()
              },
              '选择其他源'
            ),
            h(
              'button',
              {
                type: 'button',
                class: 't-button t-button--variant-base t-button--theme-primary',
                onClick: async () => useCurrentSource()
              },
              '使用当前源'
            )
          ]
        ),
      onClose: () => finish(null)
    })
  })

// 创建音质选择弹窗
export function createQualityDialog(
  songInfoOrTypes: MusicItem | Array<string | { type: string; size?: string }>,
  userQuality: string,
  title: string = '选择下载音质(可滚动)'
): Promise<string | null> {
  return new Promise((resolve) => {
    let types: Array<string | { type: string; size?: string }> = []
    if (Array.isArray(songInfoOrTypes)) {
      types = songInfoOrTypes
    } else {
      types = songInfoOrTypes.types || []
    }

    // 只展示调用方传入的真实可用音质；没有真实音质信息时不展示假选项
    const qualityOptions = types
      .map((item: any) => (typeof item === 'string' ? { type: item } : item))
      .filter((item) => item?.type)
      .sort((a, b) => compareQuality(a.type, b.type))

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
                      border:
                        '1px solid ' +
                        (disabled
                          ? 'var(--td-border-level-2-color)'
                          : 'var(--td-border-level-1-color)'),
                      borderRadius: '6px',
                      cursor: disabled ? 'not-allowed' : 'pointer',
                      transition: 'all 0.2s ease',
                      backgroundColor:
                        quality.type === userQuality
                          ? 'var(--td-brand-color-light)'
                          : 'var(--td-bg-color-container)',
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
                      target.style.backgroundColor = 'var(--td-bg-color-secondarycontainer)'
                      target.style.borderColor = 'var(--td-brand-color)'
                    },
                    onMouseleave: (e: MouseEvent) => {
                      const target = e.target as HTMLElement
                      target.style.backgroundColor =
                        quality.type === userQuality
                          ? 'var(--td-brand-color-light)'
                          : 'var(--td-bg-color-container)'
                      target.style.borderColor = 'var(--td-border-level-1-color)'
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
                            color:
                              quality.type === userQuality
                                ? 'var(--td-brand-color)'
                                : 'var(--td-text-color-primary)'
                          }
                        },
                        getQualityDisplayName(quality.type)
                      ),
                      h(
                        'div',
                        {
                          style: {
                            fontSize: '12px',
                            color: 'var(--td-text-color-secondary)',
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
                          color: 'var(--td-text-color-secondary)',
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

const createBatchDownloadQualityDialog = (userQuality: string): Promise<string | null> =>
  createQualityDialog(
    QUALITY_ORDER.map((type) => ({ type, size: '' })),
    userQuality,
    '选择批量下载目标音质（逐首自动换源/降级）'
  )

const qualityTypes = (qualities: Array<string | { type: string; size?: string }>): string[] =>
  qualities.map((item: any) => (typeof item === 'string' ? item : item?.type)).filter(Boolean)

const buildDownloadTask = (
  songInfo: MusicItem,
  quality: string,
  settingsStore: ReturnType<typeof useSettingsStore>,
  LocalUserDetail: ReturnType<typeof LocalUserDetailStore>
) => {
  const d = new Date()
  const songInfoWithTemplate = {
    ...toRaw(songInfo),
    template: settingsStore.settings.filenameTemplate || '%t - %s',
    date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  }
  const hasDirectUrl = !!(songInfo as any).url && typeof (songInfo as any).url === 'string'
  return {
    pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
    source: songInfo.source,
    quality,
    songInfo: hasDirectUrl
      ? { ...songInfoWithTemplate, typeUrl: { [quality]: (songInfo as any).url } }
      : (songInfoWithTemplate as any),
    tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions),
    isCache: true,
    lazy: true
  }
}

const resolveBatchDownloadSong = async (
  songInfo: MusicItem,
  targetQuality: string,
  userInfo: any
): Promise<
  | {
      song: MusicItem
      quality: string
      downgraded: boolean
      matchedTarget: boolean
    }
  | { failed: true; reason: string }
> => {
  const candidates: MusicItem[] = [toRaw(songInfo) as MusicItem]
  try {
    const otherSongs = await getCandidateSongs(toRaw(songInfo) as any, userInfo, { silent: true })
    candidates.push(...(otherSongs as any[]))
  } catch {}

  const fallbackPool: Array<{ song: MusicItem; qualities: Array<string | { type: string; size?: string }> }> = []
  const seen = new Set<string>()

  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.songmid || candidate.hash || `${candidate.name}_${candidate.singer}`}`
    if (seen.has(key)) continue
    seen.add(key)

    const qualities = await getDownloadableQualityFormats(candidate as any)
    if (qualities.length === 0) continue
    const types = qualityTypes(qualities)
    if (types.includes(targetQuality)) {
      return {
        song: candidate,
        quality: targetQuality,
        downgraded: false,
        matchedTarget: true
      }
    }
    fallbackPool.push({ song: candidate, qualities })
  }

  let best: { song: MusicItem; quality: string } | null = null
  for (const item of fallbackPool) {
    const quality = calculateBestQuality(item.qualities, targetQuality)
    if (!quality) continue
    if (!best || compareQuality(quality, best.quality) < 0) {
      best = { song: item.song, quality }
    }
  }

  if (best) {
    return {
      song: best.song,
      quality: best.quality,
      downgraded: best.quality !== targetQuality,
      matchedTarget: false
    }
  }

  return { failed: true, reason: '无真实可下载音质' }
}

async function downloadBatchSongs(songs: MusicItem[]): Promise<void> {
  if (!songs || songs.length === 0) {
    MessagePlugin.warning('未选择歌曲')
    return
  }

  const LocalUserDetail = LocalUserDetailStore()
  const settingsStore = useSettingsStore()
  const userQuality = await createBatchDownloadQualityDialog(
    (LocalUserDetail.userSource.quality as string) || '128k'
  )
  if (!userQuality) return

  const tip = MessagePlugin.loading(`正在解析批量下载 0/${songs.length}`)
  const tasks: any[] = []
  let targetCount = 0
  let downgradedCount = 0
  let failedCount = 0

  try {
    for (let i = 0; i < songs.length; i++) {
      const song = songs[i]
      ;(await tip).close()
      const nextTip = MessagePlugin.loading(`正在解析批量下载 ${i + 1}/${songs.length}：${song.name || '未知歌曲'}`)
      const resolved = await resolveBatchDownloadSong(song, userQuality, LocalUserDetail.userInfo)
      ;(await nextTip).close()
      if ('failed' in resolved) {
        failedCount++
        continue
      }
      if (resolved.matchedTarget) targetCount++
      if (resolved.downgraded) downgradedCount++
      tasks.push(buildDownloadTask(resolved.song, resolved.quality, settingsStore, LocalUserDetail))
    }
  } finally {
    try {
      ;(await tip).close()
    } catch {}
  }

  if (tasks.length === 0) {
    MessagePlugin.warning('没有找到真实可下载的歌曲')
    return
  }

  await window.api.music.requestSdk('downloadBatchSongs', {
    source: tasks[0]?.source || 'wy',
    tasks
  })

  MessagePlugin.success(
    `已添加 ${tasks.length} 首到下载队列：${targetCount} 首使用${getQualityDisplayName(userQuality)}，${downgradedCount} 首自动降级${failedCount > 0 ? `，${failedCount} 首跳过` : ''}`
  )
}

async function downloadSingleSong(songInfo: MusicItem): Promise<void> {
  try {
    console.log('开始下载', toRaw(songInfo))
    const LocalUserDetail = LocalUserDetailStore()
    const settingsStore = useSettingsStore()

    const downloadSourceResult = await createDownloadSourceDialog(
      songInfo,
      LocalUserDetail.userInfo,
      (song) => getDownloadableQualityFormats(song as any)
    )

    if (!downloadSourceResult) {
      return
    }

    const targetSongInfo = downloadSourceResult.song

    const userQuality =
      (LocalUserDetail.userInfo.sourceQualityMap || {})[toRaw(targetSongInfo.source) as any] ||
      (LocalUserDetail.userSource.quality as string) || '320k'

    const verifiedQualities = downloadSourceResult.qualities

    const selectedQuality = await createQualityDialog(
      verifiedQualities,
      userQuality,
      `选择下载音质 · ${downloadSourceLabel(targetSongInfo.source)}`
    )

    if (!selectedQuality) {
      return
    }

    const quality = selectedQuality as string

    console.log(`使用音质下载: ${quality} - ${getQualityDisplayName(quality)}`)
    const tip = MessagePlugin.success('开始下载歌曲：' + targetSongInfo.name)

    const songInfoWithTemplate = {
      ...toRaw(targetSongInfo),
      template: settingsStore.settings.filenameTemplate || '%t - %s'
    }

    // 服务插件歌曲（如 navidrome）：自带 url，无需插件解析，使用 lazy 模式直接传 url
    const hasDirectUrl =
      !!(targetSongInfo as any).url && typeof (targetSongInfo as any).url === 'string'

    const result = await window.api.music.requestSdk('downloadSingleSong', {
      pluginId: LocalUserDetail.userSource.pluginId?.toString() || '',
      source: targetSongInfo.source,
      quality,
      songInfo: hasDirectUrl
        ? { ...songInfoWithTemplate, typeUrl: { [quality]: (targetSongInfo as any).url } }
        : (songInfoWithTemplate as any),
      tagWriteOptions: toRaw(settingsStore.settings.tagWriteOptions),
      isCache: true,
      lazy: hasDirectUrl
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

export { downloadSingleSong, downloadBatchSongs }
