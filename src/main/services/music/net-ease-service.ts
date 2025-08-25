import path from 'path'
import fs from 'fs'
import fsPromise from 'fs/promises'

import NeteaseCloudMusicApi from 'NeteaseCloudMusicApi'
import { axiosClient, MusicServiceBase } from './service-base'
import { pipeline } from 'node:stream/promises'
import pluginService from '../plugin'
import musicSdk from '../../utils/musicSdk'

import {
  SearchArgs,
  GetSongDetailArgs,
  GetSongUrlArgs,
  GetToplistDetailArgs,
  GetListSongsArgs,
  GetLyricArgs,
  GetToplistArgs,
  DownloadSingleSongArgs
} from './service-base'

import { SongDetailResponse, SongResponse } from './service-base'

import { fieldsSelector } from '../../utils/object'
import { getAppDirPath } from '../../utils/path'

// 音乐源映射
const MUSIC_SOURCES = {
  kg: 'kg', // 酷狗音乐
  wy: 'wy', // 网易云音乐
  tx: 'tx', // QQ音乐
  kw: 'kw', // 酷我音乐
  mg: 'mg' // 咪咕音乐
}

// 扩展搜索参数接口
interface ExtendedSearchArgs extends SearchArgs {
  source?: string // 音乐源参数 kg|wy|tx|kw|mg
}

// 扩展歌曲详情参数接口
interface ExtendedGetSongDetailArgs extends GetSongDetailArgs {
  source?: string
}

// 扩展歌词参数接口
interface ExtendedGetLyricArgs extends GetLyricArgs {
  source?: string
}

const baseUrl: string = 'https://music.163.com'
const baseTwoUrl: string = 'https://www.lihouse.xyz/coco_widget'

const fileLock: Record<string, boolean> = {}

/**
 * 获取支持的音乐源列表
 */
export const getSupportedSources = () => {
  return Object.keys(MUSIC_SOURCES).map((key) => ({
    id: key,
    name: getSourceName(key),
    available: !!musicSdk[key]
  }))
}

/**
 * 获取音乐源名称
 */
const getSourceName = (source: string): string => {
  const sourceNames = {
    kg: '酷狗音乐',
    wy: '网易云音乐',
    tx: 'QQ音乐',
    kw: '酷我音乐',
    mg: '咪咕音乐'
  }
  return sourceNames[source] || source
}

/**
 * 智能音乐匹配（使用musicSdk的findMusic功能）
 */
export const findMusic = async (musicInfo: {
  name: string
  singer?: string
  albumName?: string
  interval?: string
  source?: string
}) => {
  try {
    return await musicSdk.findMusic(musicInfo)
  } catch (error) {
    console.error('智能音乐匹配失败:', error)
    return []
  }
}

export const netEaseService: MusicServiceBase = {
  async search({
    type,
    keyword,
    offset,
    limit,
    source
  }: ExtendedSearchArgs): Promise<SongResponse> {
    // 如果指定了音乐源且不是网易云，使用对应的musicSdk
    if (source && source !== 'wy' && MUSIC_SOURCES[source]) {
      try {
        const sourceModule = musicSdk[source]
        if (sourceModule && sourceModule.musicSearch) {
          const page = Math.floor((offset || 0) / (limit || 25)) + 1
          const result = await sourceModule.musicSearch.search(keyword, page, limit || 25)

          // 转换为统一格式
          return {
            songs: result.list || [],
            songCount: result.total || result.list?.length || 0
          }
        } else {
          throw new Error(`不支持的音乐源: ${source}`)
        }
      } catch (error: any) {
        console.error(`${source}音乐源搜索失败:`, error)
        // 如果指定源失败，回退到网易云
        console.log('回退到网易云音乐搜索')
      }
    }

    // 默认使用网易云音乐搜索
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
  async getSongDetail({ ids, source }: ExtendedGetSongDetailArgs): Promise<SongDetailResponse> {
    // 如果指定了音乐源且不是网易云，使用对应的musicSdk
    if (source && source !== 'wy' && MUSIC_SOURCES[source]) {
      try {
        const sourceModule = musicSdk[source]
        if (sourceModule && sourceModule.musicInfo) {
          // 对于多个ID，并行获取详情
          const promises = ids.map((id) => sourceModule.musicInfo.getMusicInfo(id))
          const results = await Promise.all(promises)
          return results.filter((result: any) => result) // 过滤掉失败的结果
        } else {
          throw new Error(`不支持的音乐源: ${source}`)
        }
      } catch (error: any) {
        console.error(`${source}音乐源获取歌曲详情失败:`, error)
        // 如果指定源失败，回退到网易云
        console.log('回退到网易云音乐获取歌曲详情')
      }
    }

    // 默认使用网易云音乐
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
  async getSongUrl({ id, pluginId, quality, source }: GetSongUrlArgs): Promise<any> {
    // 如果提供了插件ID、音质和音乐源，则使用插件获取音乐URL
    if (pluginId && (quality || source)) {
      try {
        // 获取插件实例
        const plugin = pluginService.getPluginById(pluginId)
        if (!plugin) {
          throw new Error(`未找到ID为 ${pluginId} 的插件`)
        }

        // 准备音乐信息对象，确保符合MusicInfo类型要求
        const musicInfo = {
          songmid: id as unknown as number,
          singer: '',
          name: '',
          albumName: '',
          albumId: 0,
          source: source || 'wy',
          interval: '',
          img: '',
          lrc: null,
          types: [],
          _types: {},
          typeUrl: {}
        }

        // 调用插件的getMusicUrl方法获取音乐URL
        const url: string = await plugin.getMusicUrl(
          source || 'wy',
          musicInfo,
          quality || 'standard'
        )

        // 构建返回对象
        return { url }
      } catch (error: any) {
        console.error('通过插件获取音乐URL失败:', error)
        throw new Error(`插件获取音乐URL失败: ${error.message}`)
      }
    }

    // 如果没有提供插件信息或插件调用失败，则使用默认方法获取
    return await axiosClient.get(`${baseTwoUrl}/music_resource/id/${id}`).then(({ data }) => {
      if (!data.status) {
        throw new Error('歌曲不存在')
      }

      return data.song_data
    })
  },
  async getLyric({ id, lv, yv, tv, source }: ExtendedGetLyricArgs): Promise<any> {
    // 如果指定了音乐源且不是网易云，使用对应的musicSdk
    if (source && source !== 'wy' && MUSIC_SOURCES[source]) {
      try {
        const sourceModule = musicSdk[source]
        if (sourceModule && sourceModule.getLyric) {
          // 构建歌曲信息对象，不同源可能需要不同的参数
          const songInfo = { id, songmid: id, hash: id }
          const result = await sourceModule.getLyric(songInfo)

          // 转换为统一格式
          return {
            lrc: { lyric: result.lyric || '' },
            tlyric: { lyric: result.tlyric || '' },
            yrc: { lyric: result.yrc || '' }
          }
        } else {
          throw new Error(`不支持的音乐源: ${source}`)
        }
      } catch (error: any) {
        console.error(`${source}音乐源获取歌词失败:`, error)
        // 如果指定源失败，回退到网易云
        console.log('回退到网易云音乐获取歌词')
      }
    }

    // 默认使用网易云音乐
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
    return await NeteaseCloudMusicApi.toplist({})
      .then(({ body: data }) => {
        return data.list
      })
      .catch((err: any) => {
        console.error({
          code: err.body?.code,
          msg: err.body?.msg?.message
        })
        throw err.body?.msg ?? err
      })
  },
  async getToplistDetail({}: GetToplistDetailArgs): Promise<any> {
    return await NeteaseCloudMusicApi.toplist_detail({})
      .then(({ body: data }) => {
        return data.list
      })
      .catch((err: any) => {
        console.error({
          code: err.body?.code,
          msg: err.body?.msg?.message
        })
        throw err.body?.msg ?? err
      })
  },
  async getListSongs(args: GetListSongsArgs): Promise<any> {
    return await NeteaseCloudMusicApi.playlist_track_all(args)
      .then(({ body: data }) => {
        const requiredFields = ['songs', 'privileges']
        return fieldsSelector(data, requiredFields)
      })
      .catch((err: any) => {
        console.error({
          code: err.body?.code,
          msg: err.body?.msg?.message
        })
        throw err.body?.msg ?? err
      })
  },
  async downloadSingleSong({
    id,
    name,
    artist,
    pluginId,
    source,
    quality
  }: DownloadSingleSongArgs) {
    const { url } = await this.getSongUrl({ id, pluginId, source, quality })

    // 从URL中提取文件扩展名，如果没有则默认为mp3
    const getFileExtension = (url: string): string => {
      try {
        const urlObj = new URL(url)
        const pathname = urlObj.pathname
        const lastDotIndex = pathname.lastIndexOf('.')
        if (lastDotIndex !== -1 && lastDotIndex < pathname.length - 1) {
          const extension = pathname.substring(lastDotIndex + 1).toLowerCase()
          // 验证是否为常见的音频格式
          const validExtensions = ['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'wma']
          if (validExtensions.includes(extension)) {
            return extension
          }
        }
      } catch (error) {
        console.warn('解析URL失败，使用默认扩展名:', error)
      }
      return 'mp3' // 默认扩展名
    }

    const fileExtension = getFileExtension(url)
    const songPath = path.join(
      getAppDirPath(),
      'download',
      'songs',
      `${name}-${artist}-${id}.${fileExtension}`
        .replace(/[/\\:*?"<>|]/g, '')
        .replace(/^\.+/, '')
        .replace(/\.+$/, '')
        .trim()
    )

    if (fileLock[songPath]) {
      throw new Error('歌曲正在下载中')
    } else {
      fileLock[songPath] = true
    }

    try {
      if (fs.existsSync(songPath)) {
        return {
          message: '歌曲已存在'
        }
      }

      await fsPromise.mkdir(path.dirname(songPath), { recursive: true })

      const songDataRes = await axiosClient({
        method: 'GET',
        url: url,
        responseType: 'stream'
      })

      await pipeline(songDataRes.data, fs.createWriteStream(songPath))
    } finally {
      delete fileLock[songPath]
    }

    return {
      message: '下载成功',
      path: songPath
    }
  }
}
