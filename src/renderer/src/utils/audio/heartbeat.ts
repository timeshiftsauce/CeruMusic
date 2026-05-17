import type { SongList } from '@renderer/types/audio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

interface HeartbeatRecommendation {
  name: string
  artist: string
  reason: string
}

const recommendationCache = new Map<string, HeartbeatRecommendation[]>()

export function getCacheKey(songName: string, artist: string): string {
  return `${songName}::${artist}`
}

function getSource(): string {
  const store = LocalUserDetailStore()
  return store.userInfo.selectSources || 'wy'
}

function getPluginId(): string | undefined {
  const store = LocalUserDetailStore()
  return store.userInfo.pluginId
}

async function searchSong(
  name: string,
  artist: string
): Promise<SongList | null> {
  try {
    const keyword = `${name} ${artist}`.trim()
    const source = getSource()
    const res = await (window as any).api.music.requestSdk('search', {
      source,
      keyword,
      page: 1,
      limit: 5
    })
    const list: SongList[] = res.list || []
    if (list.length === 0) {
      console.log(`[heartbeat] 搜索"${keyword}" → 无结果 (${source})`)
      return null
    }

    const nameLower = name.toLowerCase()
    const artistLower = artist.toLowerCase()

    const best = list.find((item) => {
      const itemName = (item.name || '').toLowerCase()
      const itemArtist = (item.singer || '').toLowerCase()
      return itemName.includes(nameLower) && itemArtist.includes(artistLower)
    })

    const result = (best || list[0]) as any
    if (!result.img) {
      result.img =
        result.pic || result.cover || result.albumPic || result.image || result.albumImg || ''
    }
    if (!result.img) {
      try {
        const picUrl = await (window as any).api.music.requestSdk('getPic', {
          source: result.source,
          songInfo: result
        })
        if (picUrl && typeof picUrl === 'string') {
          result.img = picUrl
        }
      } catch {
        console.log(`[heartbeat] 获取封面失败: ${result.name}`)
      }
    }
    console.log(`[heartbeat] 搜索"${keyword}" → ${result.name} - ${result.singer} (${source})`)
    return result
  } catch (e) {
    console.log(`[heartbeat] 搜索"${name} ${artist}" 失败:`, e)
    return null
  }
}

export async function getHeartbeatRecommendation(
  currentSong: SongList,
  playlistSongIds: Set<string | number>,
  recentSongs: Array<{ name: string; artist: string; playedRatio: number }> = []
): Promise<SongList | null> {
  const songName = currentSong.name || ''
  const artist = currentSong.singer || ''

  if (!songName || !artist) {
    console.log('[heartbeat] 跳过：歌曲信息不完整')
    return null
  }

  const pluginId = getPluginId()
  if (!pluginId) {
    console.log('[heartbeat] 跳过：未安装插件')
    return null
  }

  const cacheKey = getCacheKey(songName, artist)
  let recommendations = recommendationCache.get(cacheKey)

  if (!recommendations) {
    const liked = recentSongs.filter((s) => s.playedRatio >= 0.5)
    const skipped = recentSongs.filter((s) => s.playedRatio < 0.5)
    const recentInfo = recentSongs
      .map((s) => `《${s.name}》(${(s.playedRatio * 100).toFixed(0)}%)`)
      .join('、')
    console.log(`[heartbeat] AI 分析中... 近期播放: ${recentInfo || `《${songName}》(种子)`}`)
    try {
      let contextPrompt = ''
      if (recentSongs.length > 0) {
        const recentList = recentSongs
          .map(
            (s) =>
              `《${s.name}》 - ${s.artist}（播放比例: ${(s.playedRatio * 100).toFixed(0)}%）`
          )
          .join('\n')
        contextPrompt = `\n用户最近在这个心动周期内听过的歌曲及播放完成度:\n${recentList}\n`
        if (skipped.length > 0) {
          contextPrompt += `注意: 播放比例低于50%表示用户可能不喜欢这类歌曲风格或切歌了，请降低该类歌曲在推荐中的权重。\n`
        }
        if (liked.length > 0) {
          contextPrompt += `播放比例高于50%表示用户喜欢这类，优先推荐风格相近的歌曲。\n`
        }
        contextPrompt += `请基于以上所有歌曲的整体风格和用户偏好来推荐。`
      }
      recommendations = await (window as any).api.ai.recommendSongs(songName, artist, {
        recentSongs,
        contextPrompt
      } as any)
      if (recommendations && recommendations.length > 0) {
        console.log('[heartbeat] AI 推荐结果:')
        recommendations.forEach((r, i) =>
          console.log(`  ${i + 1}. 《${r.name}》 - ${r.artist} —— ${r.reason}`)
        )
      } else {
        console.log('[heartbeat] AI 未返回推荐结果')
      }
    } catch (e) {
      console.log('[heartbeat] AI 推荐调用失败:', e)
      recommendations = []
    }
    recommendationCache.set(cacheKey, recommendations || [])
  } else {
    console.log(`[heartbeat] 命中缓存: 《${songName}》`)
  }

  if (!recommendations || recommendations.length === 0) return null

  for (const rec of recommendations) {
    const found = await searchSong(rec.name, rec.artist)
    if (found && !playlistSongIds.has(found.songmid)) {
      console.log(`[heartbeat] 选中推荐: 《${found.name}》 - ${found.singer}`)
      recommendationCache.delete(cacheKey)
      return found
    }
    if (found) {
      console.log(`[heartbeat] 《${found.name}》已存在歌单中，跳过`)
    }
  }

  console.log('[heartbeat] 所有推荐歌曲均已在歌单中或搜索不到')
  recommendationCache.delete(cacheKey)
  return null
}

export function clearHeartbeatCache(): void {
  recommendationCache.clear()
}