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
import { musicCacheService } from '../musicCache'
import path from 'node:path'
import fs from 'fs'
import fsPromise from 'fs/promises'
import axios from 'axios'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'url'
import { configManager } from '../ConfigManager'

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

        // 生成歌曲唯一标识
        const songId = `${songInfo.name}-${songInfo.singer}-${source}-${quality}`

        // 先检查缓存
        const cachedUrl = await musicCacheService.getCachedMusicUrl(songId)
        if (cachedUrl) {
          return cachedUrl
        }

        // 没有缓存时才发起网络请求
        const originalUrl = await usePlugin.getMusicUrl(source, songInfo, quality)
        // 异步缓存，不阻塞返回
        musicCacheService.cacheMusic(songId, originalUrl).catch((error) => {
          console.warn('缓存歌曲失败:', error)
        })

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

    async downloadSingleSong({ pluginId, songInfo, quality }: DownloadSingleSongArgs) {
      const url = await this.getMusicUrl({ pluginId, songInfo, quality })
      if (typeof url === 'object') throw new Error('无法获取歌曲链接')

      // 获取自定义下载目录
      const getDownloadDirectory = (): string => {
        // 使用配置管理服务获取下载目录
        const directories = configManager.getDirectories()
        return directories.downloadDir
      }

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
      const downloadDir = getDownloadDirectory()
      const songPath = path.join(
        downloadDir,
        `${songInfo.name}-${songInfo.singer}-${songInfo.source}.${fileExtension}`
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
    }
  }
}
export default main
