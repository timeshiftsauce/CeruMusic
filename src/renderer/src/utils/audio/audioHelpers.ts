import { toRaw } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { type SongList } from '@renderer/types/audio'
import { getSongRealUrl } from '@renderer/utils/playlist/playlistManager'

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
    if (audio.readyState >= 3) {
      resolve()
      return
    }
    const timeout = setTimeout(() => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      reject(new Error('音频加载超时'))
    }, 10000)
    const onCanPlay = () => {
      clearTimeout(timeout)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      resolve()
    }
    const onError = () => {
      clearTimeout(timeout)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      reject(new Error('音频加载失败'))
    }
    audio.addEventListener('canplay', onCanPlay, { once: true })
    audio.addEventListener('error', onError, { once: true })
  })
}

export const getCandidateSongs = async (
  originalSong: SongList,
  userInfo: any
): Promise<SongList[]> => {
  MessagePlugin.loading('当前源播放失败，正在尝试自动换源...')
  const qualityMap = userInfo.sourceQualityMap || {}
  let sources = Object.keys(qualityMap)
  if (sources.length === 0) {
    sources = ['wy', 'tx', 'kg', 'kw', 'mg']
  }
  // 移除当前源
  sources = sources.filter((s) => s !== originalSong.source)

  const searchKeyword = `${originalSong.name} ${originalSong.singer}`.trim()
  const originalDuration = parseInterval(originalSong.interval)

  const searchPromises = sources.map(async (source) => {
    try {
      const res = await (window as any).api.music.requestSdk('search', {
        source,
        keyword: searchKeyword,
        page: 1,
        limit: 15
      })
      return (res.list || []).map((item: any) => ({ ...item, source }))
    } catch {
      return []
    }
  })

  const results = (await Promise.all(searchPromises)).flat()
  const ranked = results
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
    .filter((x) => x.score > 0.6) // 稍微严格一点的匹配
    .sort((a, b) => b.score - a.score)

  if (ranked.length === 0) {
    throw new Error('未找到其他源的匹配歌曲')
  }

  return ranked.map((r) => r.item)
}

export const autoSwitchSource = async (originalSong: SongList, userInfo: any): Promise<string> => {
  const candidates = await getCandidateSongs(originalSong, userInfo)
  for (const item of candidates) {
    try {
      const url = await getSongRealUrl(toRaw(item))
      if (url && typeof url === 'string' && !url.includes('error')) {
        MessagePlugin.success(`已自动切换到 ${item.source} 源播放`)
        return url
      }
    } catch {
      continue
    }
  }
  throw new Error('其他源也无法播放')
}
