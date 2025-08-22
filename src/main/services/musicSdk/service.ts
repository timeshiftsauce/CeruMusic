import { SearchSongArg, SearchResult, GetMusicUrlArg, GetMusicPicArg } from './type'
import pluginService from '../plugin/index'
import musicSdk from '../../utils/musicSdk/index'
function main(source: string) {
  const Api = musicSdk[source]
  Api.songList
  return {
    async search({ keyword, page = 1, limit = 30 }: SearchSongArg) {
      return await Api.musicSearch.search(keyword, page, limit) as Promise<SearchResult>
    },

    async getMusicUrl({ pluginId, songInfo, quality }: GetMusicUrlArg) {
      try {
        const usePlugin =  pluginService.getPluginById(pluginId)
        if (!pluginId || !usePlugin) return { error: '请配置音源来播放歌曲' }
        return await usePlugin.getMusicUrl(source, songInfo , quality)
      } catch (e: any) {
        return {
          error: '获取歌曲失败 ' + e.error || e
        }
      }
    },
    
    async getPic({songInfo}: GetMusicPicArg) {
      try {
        return await Api.getPic(songInfo)
      } catch (e: any) {
        return {
          error: '获取歌曲失败 ' + e.error || e
        }
      }
    }
  }
}
export default main