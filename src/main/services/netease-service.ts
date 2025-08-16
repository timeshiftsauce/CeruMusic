import NeteaseApi from 'NeteaseCloudMusicApi'
import axios from 'axios'

const axiosClient = axios.create({
  timeout: 10000,
  headers: {
    'User-Agent':
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
  }
})

const baseUrl: string = 'https://music.163.com'
const baseTwoUrl: string = 'https://www.lihouse.xyz/coco_widget'

// 字段选择器工具函数
function fieldsSelector(obj: any, fields: string[]): any {
  const result: any = {}
  fields.forEach((field) => {
    if (obj[field] !== undefined) {
      result[field] = obj[field]
    }
  })
  return result
}

export class NetEaseService {
  async search({ type, keyword, offset, limit }: any): Promise<any> {
    try {
      const response = await axiosClient.get(`${baseUrl}/api/search/get/web`, {
        params: {
          s: keyword,
          type: type,
          limit: limit,
          offset: offset ?? 0
        }
      })

      const { data } = response
      if (data.code !== 200) {
        console.error(data)
        throw new Error(data.msg)
      }
      return data.result
    } catch (error) {
      console.error('Search error:', error)
      throw error
    }
  }

  async getSongDetail({ ids }: any): Promise<any> {
    try {
      const response = await axiosClient.get(`${baseUrl}/api/song/detail?ids=[${ids.join(',')}]`)
      const { data } = response

      if (data.code !== 200) {
        console.error(data)
        throw new Error(data.msg)
      }
      return data.songs
    } catch (error) {
      console.error('Get song detail error:', error)
      throw error
    }
  }

  async getSongUrl({ id }: any): Promise<any> {
    try {
      const response = await axiosClient.get(`${baseTwoUrl}/music_resource/id/${id}`)
      const { data } = response

      if (!data.status) {
        throw new Error('歌曲不存在')
      }
      return data.song_data
    } catch (error) {
      console.error('Get song URL error:', error)
      throw error
    }
  }

  async getLyric({ id, lv, yv, tv }: any): Promise<any> {
    try {
      const optionalParams: any = {}
      if (lv) optionalParams.lv = -1
      if (yv) optionalParams.yv = -1
      if (tv) optionalParams.tv = -1

      const response = await axiosClient.get(`${baseUrl}/api/song/lyric`, {
        params: {
          id: id,
          ...optionalParams
        }
      })

      const { data } = response
      if (data.code !== 200) {
        console.error(data)
        throw new Error(data.msg)
      }

      const requiredFields = ['lyricUser', 'lrc', 'tlyric', 'yrc']
      return fieldsSelector(data, requiredFields)
    } catch (error) {
      console.error('Get lyric error:', error)
      throw error
    }
  }

  async getToplist(args: any): Promise<any> {
    try {
      const result = await NeteaseApi.toplist(args)
      return result.body.list
    } catch (err: any) {
      console.error({
        code: err.body?.code,
        msg: err.body?.msg?.message
      })
      throw err.body?.msg || err
    }
  }

  async getToplistDetail(args: any): Promise<any> {
    try {
      const result = await NeteaseApi.toplist_detail(args)
      return result.body.list
    } catch (err: any) {
      console.error({
        code: err.body?.code,
        msg: err.body?.msg?.message
      })
      throw err.body?.msg || err
    }
  }

  async getListSongs(args: any): Promise<any> {
    try {
      const result = await NeteaseApi.playlist_track_all(args)
      const requiredFields = ['songs', 'privileges']
      return fieldsSelector(result.body, requiredFields)
    } catch (err: any) {
      console.error({
        code: err.body?.code,
        msg: err.body?.msg?.message
      })
      throw err.body?.msg || err
    }
  }
}
