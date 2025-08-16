import { axiosClient, MusicServiceBase } from './service-base'
import { fieldsSelector } from '@renderer/utils/object'

const baseUrl: string = 'https://music.163.com'
const baseTwoUrl: string = 'https://www.lihouse.xyz/coco_widget'

export const netEaseService: MusicServiceBase = {
  async search({
    type,
    keyword,
    offset,
    limit
  }: {
    type: number
    keyword: string
    offset?: number
    limit: number
  }) {
    return await axiosClient
      .get(`${baseUrl}/api/search/get/web`, {
        params: {
          s: keyword,
          type: type,
          limit: limit,
          offset: offset ?? 0
        }
      })
      .then(({ data }) => {
        if (data.code !== 200) {
          console.error(data)
          throw new Error(data.msg)
        }
        return data.result
      })
  },
  async getSongDetail({ ids }: { ids: string[] }): Promise<any> {
    return await axiosClient
      .get(`${baseUrl}/api/song/detail?ids=[${ids.join(',')}]`)
      .then(({ data }) => {
        if (data.code !== 200) {
          console.error(data)
          throw new Error(data.msg)
        }

        return data.songs
      })
  },
  async getSongUrl({ id }: { id: string }): Promise<any> {
    return await axiosClient.get(`${baseTwoUrl}/music_resource/id/${id}`).then(({ data }) => {
      if (!data.status) {
        throw new Error('歌曲不存在')
      }

      return data.song_data
    })
  },
  async getLyric({
    id,
    lv,
    yv,
    tv
  }: {
    id: string
    lv?: boolean // 获取歌词
    yv?: boolean // 获取逐字歌词
    tv?: boolean // 获取歌词翻译
  }): Promise<any> {
    // 默认什么都不获取
    const lyricOptionParams: any = {}
    if (lv) {
      lyricOptionParams.lv = -1
    }
    if (yv) {
      lyricOptionParams.yv = -1
    }
    if (tv) {
      lyricOptionParams.tv = -1
    }

    return await axiosClient
      .get(`${baseUrl}/api/song/lyric`, {
        params: {
          id: id,
          ...lyricOptionParams
        }
      })
      .then(({ data }) => {
        if (data.code !== 200) {
          console.error(data)
          throw Error(data.msg)
        }

        const requiredFields = ['lyricUser', 'lrc', 'tlyric', 'yrc']
        return fieldsSelector(data, requiredFields)
      })
  }
}
