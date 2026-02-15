import {
  SearchArg,
  SearchResult,
  GetMusicUrlArg,
  GetMusicPicArg,
  GetLyricArg,
  PlaylistResult,
  GetSongListDetailsArg,
  PlaylistDetailResult,
  DownloadSingleSongArgs,
  TipSearchResult
} from './type'
import pluginService from '../plugin/index'
import musicSdk from '../../utils/musicSdk/index'
import { musicCacheService } from '../musicCache'
import download from '../../utils/downloadSongs'

function main(source: string = 'wy') {
  const Api = musicSdk[source]
  return {
    async search({ keyword, page = 1, limit = 30 }: SearchArg) {
      return (await Api.musicSearch.search(keyword, page, limit)) as Promise<SearchResult>
    },

    async tipSearch({ keyword }: { keyword: string }) {
      if (!Api.tipSearch?.search) {
        // 如果音乐源没有实现tipSearch方法，返回空结果
        return [] as TipSearchResult
      }
      return (await Api.tipSearch.search(keyword)) as Promise<TipSearchResult>
    },

    async getMusicUrl({ pluginId, songInfo, quality, isCache }: GetMusicUrlArg) {
      try {
        const usePlugin = pluginService.getPluginById(pluginId)
        if (!pluginId || !usePlugin) return { error: '请配置音源来播放歌曲' }

        const currentSource = songInfo.source || source
        // 生成歌曲唯一标识
        const songId = `${songInfo.name}-${songInfo.singer}-${currentSource}-${quality}`

        // 先检查缓存（isCache !== false 时）
        if (isCache !== false) {
          const cachedUrl = await musicCacheService.getCachedMusicUrl(songId)
          if (cachedUrl) {
            return cachedUrl
          }
        }

        // 没有缓存时才发起网络请求
        const originalUrl = await usePlugin.getMusicUrl(currentSource, songInfo, quality)
        // 按需异步缓存，不阻塞返回
        if (isCache !== false) {
          musicCacheService.cacheMusic(songId, originalUrl).catch((error) => {
            console.warn('缓存歌曲失败:', error)
          })
        }

        return originalUrl
      } catch (e: any) {
        return {
          error: '获取歌曲失败 ' + e.error || e
        }
      }
    },

    async getPic({ songInfo }: GetMusicPicArg) {
      try {
        return await Api.getPic(songInfo)
      } catch (e: any) {
        return {
          error: '获取歌曲失败 ' + e.error || e
        }
      }
    },

    async getLyric({ songInfo, grepLyricInfo = false, useStrictMode = true }: GetLyricArg) {
      try {
        // console.log('getLyric', songInfo, grepLyricInfo, useStrictMode)
        const res = await Api.getLyric(songInfo).promise
        // console.log('getLyric res', res)
        if (res && grepLyricInfo) {
          const grepKeyRaw = [
            '作曲',
            '作词',
            '编曲',
            '制作人',
            '专辑',
            '时间',
            '时长',
            '发行',
            'OP',
            'SP',
            '词',
            '曲',
            '吉他',
            '贝斯',
            '录音',
            '混音',
            '出品',
            '演唱',
            '和声',
            '弦乐',
            '企划',
            '录音室',
            '鼓',
            '弦',
            '弦乐部分'
          ]
          const grepKey = grepKeyRaw.map((key) => `.*${key.split('').join('.*')}.*`)
          const regex = new RegExp(`^.*(${grepKey.join('|')})[:：]\s*(.+)(\n)*$`, 'gm')
          // 匹配带冒号的行（含时间戳前缀）
          const pureLyric = (lyric: string[]) => {
            return lyric.filter((line) => {
              const raw = line.replace(/\[.*]/g, '')
              // console.log('raw', raw, !raw.includes(':') && !raw.includes('：'))
              return !raw.includes(':') && !raw.includes('：')
            })
          }

          const lyric = {}
          for (const key in res) {
            if (!useStrictMode) {
              lyric[key] = res[key]?.replace(regex, '') || ''
            } else {
              lyric[key] = pureLyric(res[key]?.split('\n') || []).join('\n') || ''
            }
          }
          return lyric
        }
        return res
      } catch (e: any) {
        return {
          error: '获取歌词失败 ' + (e.error || e.message || e)
        }
      }
    },

    async getHotSonglist() {
      return (await Api.songList.getList(Api.songList.sortList[0].id, '', 1)) as PlaylistResult
    },

    async getPlaylistTags() {
      return await Api.songList.getTags()
    },

    async getCategoryPlaylists({
      sortId = Api.songList.sortList[0].id,
      tagId = '',
      page = 1,
      limit = Api.songList.limit_list
    }: {
      sortId?: string
      tagId?: string
      page?: number
      limit?: number
    }) {
      const res =
        source === 'wy'
          ? await Api.songList.getList(sortId, tagId, page, limit)
          : await Api.songList.getList(sortId, tagId, page)
      return {
        category: { id: tagId || 'hot', name: tagId || '热门' },
        ...res
      }
    },

    async getPlaylistDetail({ id, page }: GetSongListDetailsArg) {
      // 酷狗音乐特殊处理：直接调用getUserListDetail
      if (source === 'kg' && /https?:\/\//.test(id)) {
        return (await Api.songList.getUserListDetail(id, page)) as PlaylistDetailResult
      }
      return (await Api.songList.getListDetail(id, page)) as PlaylistDetailResult
    },

    async downloadSingleSong({
      pluginId,
      songInfo,
      quality,
      tagWriteOptions,
      lazy
    }: DownloadSingleSongArgs) {
      let url = ''
      if (!lazy) {
        const result = await this.getMusicUrl({ pluginId, songInfo, quality })
        if (typeof result === 'object') throw new Error('无法获取歌曲链接')
        url = result
      }
      return await download(songInfo, url, tagWriteOptions, pluginId, quality)
    },

    async downloadBatchSongs({ tasks }: { tasks: DownloadSingleSongArgs[] }) {
      const results: any[] = []
      for (const task of tasks) {
        try {
          const res = await this.downloadSingleSong(task)
          results.push({ success: true, songmid: task.songInfo.songmid, ...res })
        } catch (e: any) {
          results.push({
            success: false,
            songmid: task.songInfo.songmid,
            error: e.message || String(e)
          })
        }
      }
      return results
    },

    async parsePlaylistId({ url }: { url: string }) {
      try {
        return await Api.songList.handleParseId(url)
      } catch (e: any) {
        return {
          error: '解析歌单链接失败 ' + (e.error || e.message || e)
        }
      }
    },

    async getPlaylistDetailById(id: string, page: number = 1) {
      try {
        return await Api.songList.getListDetail(id, page)
      } catch (e: any) {
        return {
          error: '获取歌单详情失败 ' + (e.error || e.message || e)
        }
      }
    },
    async searchPlaylist({ keyword, page = 1, limit = 30 }: SearchArg) {
      return (await Api.songList.search(keyword, page, limit)) as PlaylistResult
    },

    async getLeaderboards() {
      if (Api.leaderboard && Api.leaderboard.getBoards) {
        const res = await Api.leaderboard.getBoards()
        return res.list
      }
      return []
    },

    async getLeaderboardDetail({ id, page }: { id: string; page: number }) {
      if (Api.leaderboard && Api.leaderboard.getList) {
        return (await Api.leaderboard.getList(id, page)) as PlaylistDetailResult
      }
      return { list: [], total: 0 } as unknown as PlaylistDetailResult
    }
  }
}
export default main
