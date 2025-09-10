import {
  SearchSongArg,
  SearchResult,
  GetMusicUrlArg,
  GetMusicPicArg,
  GetLyricArg,
  PlaylistResult,
  GetSongListDetailsArg,
  PlaylistDetailResult,
  DownloadSingleSongArgs
} from './type'
import pluginService from '../plugin/index'
import musicSdk from '../../utils/musicSdk/index'
import { getAppDirPath } from '../../utils/path'
import { musicCacheService } from '../musicCache'
import path from 'node:path'
import fs from 'fs'
import fsPromise from 'fs/promises'
import axios from 'axios'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'url'

const fileLock: Record<string, boolean> = {}


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

        // 获取原始URL
        const originalUrlPromise = usePlugin.getMusicUrl(source, songInfo, quality)


        // 生成歌曲唯一标识
        const songId = `${songInfo.name}-${songInfo.singer}-${source}-${quality}`

        // 尝试获取缓存的URL
        try {
          const cachedUrl = await musicCacheService.getCachedMusicUrl(songId, originalUrlPromise)
          return cachedUrl
        } catch (cacheError) {
          console.warn('缓存获取失败，使用原始URL:', cacheError)
          const originalUrl = await originalUrlPromise
          return originalUrl
        }
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
    },

    async downloadSingleSong({ pluginId, songInfo, quality }: DownloadSingleSongArgs) {
      const url = await this.getMusicUrl({ pluginId, songInfo, quality })
      if (typeof url === 'object') throw new Error('无法获取歌曲链接')

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
        getAppDirPath('music'),
        'CeruMusic',
        'songs',
        `${songInfo.name}-${songInfo.singer}-${source}.${fileExtension}`
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

        if (url.startsWith('file://')) {
          const filePath = fileURLToPath(url)

          const readStream = fs.createReadStream(filePath)
          const writeStream = fs.createWriteStream(songPath)

          await pipeline(readStream, writeStream)
        } else {
          const songDataRes = await axios({
            method: 'GET',
            url: url,
            responseType: 'stream'
          })

          await pipeline(songDataRes.data, fs.createWriteStream(songPath))
        }
      } finally {
        delete fileLock[songPath]
      }

      return {
        message: '下载成功',
        path: songPath
      }
    },

    async parsePlaylistId({url}: {url: string}) {
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
    }
  }
}
export default main
