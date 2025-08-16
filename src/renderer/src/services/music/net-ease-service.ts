import NeteaseApi from 'NeteaseCloudMusicApi'

import { axiosClient, MusicServiceBase } from './service-base'
import {
  SearchArgs,
  GetSongDetailArgs,
  GetSongUrlArgs,
  GetToplistDetailArgs,
  GetListSongsArgs,
  GetLyricArgs,
  GetToplistArgs
} from './service-base'

import { fieldsSelector } from '@renderer/utils/object'

const baseUrl: string = 'https://music.163.com'
const baseTwoUrl: string = 'https://www.lihouse.xyz/coco_widget'

export const netEaseService: MusicServiceBase = {
  async search({ type, keyword, offset, limit }: SearchArgs): Promise<any> {
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
  async getSongDetail({ ids }: GetSongDetailArgs): Promise<any> {
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
  async getSongUrl({ id }: GetSongUrlArgs): Promise<any> {
    return await axiosClient.get(`${baseTwoUrl}/music_resource/id/${id}`).then(({ data }) => {
      if (!data.status) {
        throw new Error('歌曲不存在')
      }

      return data.song_data
    })
  },
  async getLyric({ id, lv, yv, tv }: GetLyricArgs): Promise<any> {
    // 默认什么都不获取
    const optionalParams: any = {}
    if (lv) {
      optionalParams.lv = -1
    }
    if (yv) {
      optionalParams.yv = -1
    }
    if (tv) {
      optionalParams.tv = -1
    }

    return await axiosClient
      .get(`${baseUrl}/api/song/lyric`, {
        params: {
          id: id,
          ...optionalParams
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
  },
  async getToplist({}: GetToplistArgs): Promise<any> {
    return await NeteaseApi.toplist({})
      .then(({ body: data }) => {
        return data.list
      })
      .catch((err) => {
        console.error({
          code: err.body.code,
          msg: err.body.msg.message
        })
        throw err.body.msg
      })
  },
  async getToplistDetail({}: GetToplistDetailArgs): Promise<any> {
    return await NeteaseApi.toplist_detail({})
      .then(({ body: data }) => {
        return data.list
      })
      .catch((err) => {
        console.error({
          code: err.body.code,
          msg: err.body.msg.message
        })
        throw err.body.msg
      })
  },
  async getListSongs(args: GetListSongsArgs): Promise<any> {
    return await NeteaseApi.playlist_track_all(args)
      .then(({ body: data }) => {
        const requiredFields = ['songs', 'privileges']
        return fieldsSelector(data, requiredFields)
      })
      .catch((err) => {
        console.error({
          code: err.body.code,
          msg: err.body.msg.message
        })
        throw err.body.msg
      })
  }
}
