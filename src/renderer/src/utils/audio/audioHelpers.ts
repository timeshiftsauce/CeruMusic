import { toRaw, h, ref } from 'vue'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import { type SongList } from '@renderer/types/audio'
import { getSongRealUrl } from '@renderer/utils/playlist/playlistManager'

const SEARCHABLE_SOURCE_ORDER = ['wy', 'tx', 'kg', 'kw', 'mg', 'bd', 'git']
const NON_SEARCHABLE_SOURCES = new Set(['local', 'share', 'all'])
const SWITCH_DIALOG_SOURCE_LABELS: Record<string, string> = {
  wy: 'wyy',
  kg: 'kg',
  tx: '秋秋',
  kw: 'kw',
  mg: 'mg'
}

const switchDialogSourceLabel = (source?: string | null): string => {
  if (!source) return ''
  return SWITCH_DIALOG_SOURCE_LABELS[source] || source
}

const uniq = <T>(items: T[]): T[] => [...new Set(items)]

export const strSim = (s1: string, s2: string) => {
  const t1 = (s1 || '').toLowerCase().trim()
  const t2 = (s2 || '').toLowerCase().trim()
  if (t1 === t2) return 1
  const bigrams = (str: string) => {
    const res = new Set<string>()
    for (let i = 0; i < str.length - 1; i++) {
      res.add(str.substring(i, i + 2))
    }
    return res
  }
  const b1 = bigrams(t1)
  const b2 = bigrams(t2)
  if (b1.size === 0 || b2.size === 0) return t1 === t2 ? 1 : 0
  let inter = 0
  b1.forEach((x) => {
    if (b2.has(x)) inter++
  })
  return (2.0 * inter) / (b1.size + b2.size)
}

export const parseInterval = (timeStr: string | undefined) => {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  if (parts.length === 2) {
    return parseInt(parts[0]) * 60 + parseInt(parts[1])
  } else if (parts.length === 3) {
    return parseInt(parts[0]) * 3600 + parseInt(parts[1]) * 60 + parseInt(parts[2])
  }
  return 0
}

export const waitForAudioReady = (audio: HTMLAudioElement): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!audio) {
      reject(new Error('音频元素未初始化'))
      return
    }
    // 落雪风格：不等待缓冲，设了 src 就立即放行。
    // 如果播放卡顿由 waiting 事件处理（跳跃恢复策略）。
    resolve()
  })
}

export const getCandidateSongs = async (
  originalSong: SongList,
  userInfo: any,
  options: { lightweight?: boolean; silent?: boolean } = {}
): Promise<SongList[]> => {
  if (!options.silent) MessagePlugin.loading('正在查找可切换的音源...')
  const supportedSources = userInfo.supportedSources || {}
  const qualityMap = userInfo.sourceQualityMap || {}
  const configuredSources = uniq([...Object.keys(supportedSources), ...Object.keys(qualityMap)])
  let sources = configuredSources.length > 0 ? configuredSources : SEARCHABLE_SOURCE_ORDER
  sources = sources
    .filter((s) => s !== originalSong.source)
    .filter((s) => !NON_SEARCHABLE_SOURCES.has(s))
    .sort((a, b) => {
      const ai = SEARCHABLE_SOURCE_ORDER.indexOf(a)
      const bi = SEARCHABLE_SOURCE_ORDER.indexOf(b)
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
    })

  const baseKeywords = options.lightweight
    ? [`${originalSong.name} ${originalSong.singer}`.trim()]
    : [
        `${originalSong.name} ${originalSong.singer}`.trim(),
        originalSong.name,
        `${originalSong.name} ${String(originalSong.albumName || '')}`.trim()
      ]
  const searchKeywords = uniq(baseKeywords.filter(Boolean))
  const searchLimit = options.lightweight ? 12 : 30
  const originalDuration = parseInterval(originalSong.interval)

  const searchPromises = sources.flatMap((source) =>
    searchKeywords.map(async (keyword) => {
      try {
        const res = await (window as any).api.music.requestSdk('search', {
          source,
          keyword,
          page: 1,
          limit: searchLimit
        })
        return (res.list || []).map((item: any) => ({ ...item, source }))
      } catch {
        return []
      }
    })
  )

  const results = (await Promise.all(searchPromises)).flat()
  const seen = new Set<string>()
  const deduped = results.filter((item) => {
    const key = `${item.source}:${item.songmid || item.hash || item.name + item.singer}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
  const ranked = deduped
    .map((item) => {
      const nameScore = strSim(item.name, originalSong.name)
      const singerScore = strSim(item.singer, originalSong.singer)
      let score = nameScore * 0.6 + singerScore * 0.4

      // 时长匹配逻辑
      const itemDuration = parseInterval(item.interval)
      if (originalDuration > 0 && itemDuration > 0) {
        const diff = Math.abs(originalDuration - itemDuration)
        if (diff <= 5) {
          score += 0.2 // 时长非常接近，加分
        } else if (diff > 40) {
          score -= 0.3 // 时长差异过大，减分
        }
      }
      return { item, score }
    })
    .filter((x) => x.score > 0.45)
    .sort((a, b) => b.score - a.score)

  if (ranked.length === 0) {
    throw new Error('未找到其他源的匹配歌曲')
  }

  return ranked.map((r) => r.item)
}

export const createSourceSwitchDialog = async (
  originalSong: SongList,
  userInfo: any,
  title: string = '切换音源'
): Promise<SongList | null> =>
  await new Promise((resolve) => {
    const loading = ref(true)
    const candidates = ref<SongList[]>([])
    let resolved = false

    const finish = (song: SongList | null) => {
      if (resolved) return
      resolved = true
      dialog.destroy()
      resolve(song)
    }

    const dialog = DialogPlugin({
      header: title,
      width: 520,
      placement: 'center',
      body: () =>
        h('div', { class: 'source-switch-dialog', style: { display: 'flex', flexDirection: 'column', gap: '10px' } }, [
          h(
            'div',
            {
              style: {
                fontSize: '13px',
                lineHeight: '1.5',
                color: 'var(--td-text-color-secondary)'
              }
            },
            loading.value
              ? '正在查找可切换的音源...'
              : candidates.value.length > 0
                ? `已找到 ${candidates.value.length} 个可用音源，选择一个继续播放或下载。`
                : '未找到可切换的其他音源'
          ),
          ...(loading.value
            ? [
                h(
                  'div',
                  {
                    style: {
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--td-border-level-1-color)',
                      color: 'var(--td-text-color-secondary)'
                    }
                  },
                  '搜索中，请稍候...'
                )
              ]
            : candidates.value.map((song) =>
                h(
                  'button',
                  {
                    key: `${song.source}-${song.songmid || song.hash || song.name}`,
                    type: 'button',
                    style: {
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'flex-start',
                      gap: '4px',
                      width: '100%',
                      padding: '12px 14px',
                      borderRadius: '8px',
                      border: '1px solid var(--td-border-level-1-color)',
                      background: 'var(--td-bg-color-container)',
                      textAlign: 'left',
                      cursor: 'pointer'
                    },
                    onClick: () => finish(song)
                  },
                  [
                    h('div', { style: { fontWeight: '600', color: 'var(--td-text-color-primary)' } }, switchDialogSourceLabel(song.source)),
                    h(
                      'div',
                      {
                        style: {
                          fontSize: '13px',
                          color: 'var(--td-text-color-secondary)'
                        }
                      },
                      `${song.name || '未知歌曲'} · ${song.singer || '未知歌手'}`
                    ),
                    h(
                      'div',
                      {
                        style: {
                          fontSize: '12px',
                          color: 'var(--td-text-color-placeholder)'
                        }
                      },
                      [song.albumName, song.interval].filter(Boolean).join(' · ')
                    )
                  ]
                )
              ))
        ]),
      confirmBtn: null,
      cancelBtn: '关闭',
      onCancel: () => finish(null),
      onClose: () => finish(null)
    })

    getCandidateSongs(originalSong, userInfo, { silent: true })
      .then((items) => {
        if (resolved) return
        candidates.value = items.filter(
          (song, index, arr) => arr.findIndex((item) => item.source === song.source) === index
        )
      })
      .catch(() => {
        if (resolved) return
        candidates.value = []
      })
      .finally(() => {
        if (!resolved) loading.value = false
      })
  })

export const autoSwitchSource = async (originalSong: SongList, userInfo: any): Promise<string> => {
  const candidates = await getCandidateSongs(originalSong, userInfo)
  for (const item of candidates) {
    try {
      const url = await getSongRealUrl(toRaw(item))
      if (url && typeof url === 'string' && !url.includes('error')) {
        MessagePlugin.success(`已自动切换到 ${switchDialogSourceLabel(item.source)} 源播放`)
        return url
      }
    } catch {
      continue
    }
  }
  throw new Error('其他源也无法播放')
}
