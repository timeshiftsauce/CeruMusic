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

function main(source: string) {
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

        // 生成歌曲唯一标识
        const songId = `${songInfo.name}-${songInfo.singer}-${source}-${quality}`

        // 先检查缓存（isCache !== false 时）
        if (isCache !== false) {
          const cachedUrl = await musicCacheService.getCachedMusicUrl(songId)
          if (cachedUrl) {
            return cachedUrl
          }
        }

        // 没有缓存时才发起网络请求
        const originalUrl = await usePlugin.getMusicUrl(source, songInfo, quality)
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

    async getLyric({ songInfo }: GetLyricArg) {
      try {
        const res = await Api.getLyric(songInfo).promise
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
      tagWriteOptions
    }: DownloadSingleSongArgs) {
      const url = await this.getMusicUrl({ pluginId, songInfo, quality })
      if (typeof url === 'object') throw new Error('无法获取歌曲链接')
      return await download(url, songInfo, tagWriteOptions)
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
    }
  }
}
export default main
