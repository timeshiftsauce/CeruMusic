import {
  SearchSongArg,
  SearchResult,
  GetMusicUrlArg,
  GetMusicPicArg,
  GetLyricArg,
  PlaylistResult,
  GetSongListDetailsArg,
  PlaylistDetailResult
} from './type'
import pluginService from '../plugin/index'
import musicSdk from '../../utils/musicSdk/index'
function main(source: string) {
  const Api = musicSdk[source]
  return {
    async search({ keyword, page = 1, limit = 30 }: SearchSongArg) {
      return (await Api.musicSearch.search(keyword, page, limit)) as Promise<SearchResult>
    },

    async getMusicUrl({ pluginId, songInfo, quality }: GetMusicUrlArg) {
      try {
        const usePlugin = pluginService.getPluginById(pluginId)
        if (!pluginId || !usePlugin) return { error: '请配置音源来播放歌曲' }
        return await usePlugin.getMusicUrl(source, songInfo, quality)
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
      return (await Api.songList.getListDetail(id, page)) as PlaylistDetailResult
    }
  }
}
export default main
// musicSdk.wy.songList.handleParseId('https://music.163.com/m/playlist?id=13916216005&creatorId=3359622909',2).then(res=>{
//   console.log(res)//13916216005
// })
// main('kg').getHotSonglist().then(res=>{
//   console.log(res.list[0])//13916216005
// })
musicSdk.kg.songList.getListDetail('id_8052780', 1).then((res) => {
  console.log(res) //13916216005
})
