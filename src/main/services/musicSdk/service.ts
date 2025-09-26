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
import NodeID3 from 'node-id3'
import ffmpegStatic from 'ffmpeg-static'
import ffmpeg from 'fluent-ffmpeg'

const fileLock: Record<string, boolean> = {}

/**
 * 转换LRC格式
 * 将带有字符位置信息的LRC格式转换为标准的逐字时间戳格式
 * @param lrcContent 原始LRC内容
 * @returns 转换后的LRC内容
 */
function convertLrcFormat(lrcContent: string): string {
  if (!lrcContent) return ''

  const lines = lrcContent.split('\n')
  const convertedLines: string[] = []

  for (const line of lines) {
    // 跳过空行
    if (!line.trim()) {
      convertedLines.push(line)
      continue
    }

    // 检查是否是新格式：[开始时间,持续时间](开始时间,字符持续时间,0)字符
    const newFormatMatch = line.match(/^\[(\d+),(\d+)\](.*)$/)
    if (newFormatMatch) {
      const [, startTimeMs, , content] = newFormatMatch
      const convertedLine = convertNewFormat(parseInt(startTimeMs), content)
      convertedLines.push(convertedLine)
      continue
    }

    // 检查是否是旧格式：[mm:ss.xxx]字符(偏移,持续时间)
    const oldFormatMatch = line.match(/^\[(\d{2}:\d{2}\.\d{3})\](.*)$/)
    if (oldFormatMatch) {
      const [, timestamp, content] = oldFormatMatch

      // 如果内容中没有位置信息，直接返回原行
      if (!content.includes('(') || !content.includes(')')) {
        convertedLines.push(line)
        continue
      }

      const convertedLine = convertOldFormat(timestamp, content)
      convertedLines.push(convertedLine)
      continue
    }

    // 其他行直接保留
    convertedLines.push(line)
  }

  return convertedLines.join('\n')
}

/**
 * 将毫秒时间戳格式化为 mm:ss.xxx 格式
 * @param timeMs 毫秒时间戳
 * @returns 格式化的时间字符串
 */
function formatTimestamp(timeMs: number): string {
  const minutes = Math.floor(timeMs / 60000)
  const seconds = Math.floor((timeMs % 60000) / 1000)
  const milliseconds = timeMs % 1000

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}

/**
 * 转换新格式：[开始时间,持续时间](开始时间,字符持续时间,0)字符
 */
function convertNewFormat(baseTimeMs: number, content: string): string {
  const baseTimestamp = formatTimestamp(baseTimeMs)
  let convertedContent = `<${baseTimestamp}>`

  // 匹配模式：(开始时间,字符持续时间,0)字符
  const charPattern = /\((\d+),(\d+),(\d+)\)([^(]*?)(?=\(|$)/g
  let match
  let isFirstChar = true

  while ((match = charPattern.exec(content)) !== null) {
    const [, charStartMs, , , char] = match
    const charTimeMs = parseInt(charStartMs)
    const charTimestamp = formatTimestamp(charTimeMs)

    if (isFirstChar) {
      // 第一个字符直接添加
      convertedContent += char.trim()
      isFirstChar = false
    } else {
      convertedContent += `<${charTimestamp}>${char.trim()}`
    }
  }

  return `[${baseTimestamp}]${convertedContent}`
}

/**
 * 转换旧格式：[mm:ss.xxx]字符(偏移,持续时间)
 */
function convertOldFormat(timestamp: string, content: string): string {
  // 解析基础时间戳（毫秒）
  const [minutes, seconds] = timestamp.split(':')
  const [sec, ms] = seconds.split('.')
  const baseTimeMs = parseInt(minutes) * 60 * 1000 + parseInt(sec) * 1000 + parseInt(ms)

  let convertedContent = `<${timestamp}>`

  // 匹配所有字符(偏移,持续时间)的模式
  const charPattern = /([^()]+)\((\d+),(\d+)\)/g
  let match
  let lastIndex = 0
  let isFirstChar = true

  while ((match = charPattern.exec(content)) !== null) {
    const [fullMatch, char, offsetMs, _durationMs] = match
    const charTimeMs = baseTimeMs + parseInt(offsetMs)
    const charTimestamp = formatTimestamp(charTimeMs)

    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      const beforeText = content.substring(lastIndex, match.index)
      if (beforeText.trim()) {
        convertedContent += beforeText
      }
    }

    // 添加带时间戳的字符
    if (isFirstChar) {
      // 第一个字符直接添加，不需要额外的时间戳
      convertedContent += char
      isFirstChar = false
    } else {
      convertedContent += `<${charTimestamp}>${char}`
    }
    lastIndex = match.index + fullMatch.length
  }

  // 添加剩余的普通文本
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex)
    if (remainingText.trim()) {
      convertedContent += remainingText
    }
  }

  return `[${timestamp}]${convertedContent}`
}

// 写入音频标签的辅助函数
async function writeAudioTags(filePath: string, songInfo: any, tagWriteOptions: any) {
  try {
    console.log('开始写入音频标签:', filePath, tagWriteOptions, songInfo)

    // 获取文件扩展名来判断格式
    const fileExtension = path.extname(filePath).toLowerCase().substring(1)
    console.log('文件格式:', fileExtension)

    // 根据文件格式选择不同的标签写入方法
    if (fileExtension === 'mp3') {
      await writeMP3Tags(filePath, songInfo, tagWriteOptions)
    } else if (['flac', 'ogg', 'opus'].includes(fileExtension)) {
      await writeVorbisCommentTags(filePath, songInfo, tagWriteOptions)
    } else if (['m4a', 'mp4', 'aac'].includes(fileExtension)) {
      await writeMP4Tags(filePath, songInfo, tagWriteOptions)
    } else {
      console.warn('不支持的音频格式:', fileExtension)
      // 尝试使用 NodeID3 作为后备方案
      await writeMP3Tags(filePath, songInfo, tagWriteOptions)
    }
  } catch (error) {
    console.error('写入音频标签时发生错误:', error)
    throw error
  }
}

// MP3 格式标签写入
async function writeMP3Tags(filePath: string, songInfo: any, tagWriteOptions: any) {
  const tags: any = {}

  // 写入基础信息
  if (tagWriteOptions.basicInfo) {
    tags.title = songInfo.name || ''
    tags.artist = songInfo.singer || ''
    tags.album = songInfo.albumName || ''
    tags.year = songInfo.year || ''
    tags.genre = songInfo.genre || ''
  }

  // 写入歌词
  if (tagWriteOptions.lyrics && songInfo.lrc) {
    const convertedLrc = convertLrcFormat(songInfo.lrc)
    tags.unsynchronisedLyrics = {
      language: 'chi',
      shortText: 'Lyrics',
      text: convertedLrc
    }
  }

  // 写入封面
  if (tagWriteOptions.cover && songInfo.img) {
    try {
      const coverResponse = await axios({
        method: 'GET',
        url: songInfo.img,
        responseType: 'arraybuffer',
        timeout: 10000
      })

      if (coverResponse.data) {
        tags.image = {
          mime: 'image/jpeg',
          type: {
            id: 3,
            name: 'front cover'
          },
          description: 'Cover',
          imageBuffer: Buffer.from(coverResponse.data)
        }
      }
    } catch (coverError) {
      console.warn('获取封面失败:', coverError)
    }
  }

  // 写入标签到文件
  if (Object.keys(tags).length > 0) {
    const success = NodeID3.write(tags, filePath)
    if (success) {
      console.log('MP3音频标签写入成功:', filePath)
    } else {
      console.warn('MP3音频标签写入失败:', filePath)
    }
  }
}

// FLAC/OGG 格式标签写入 (使用 Vorbis Comment)
async function writeVorbisCommentTags(filePath: string, songInfo: any, tagWriteOptions: any) {
  try {
    console.log('开始写入 FLAC 标签:', filePath)

    // 准备新的标签数据
    const newTags: any = {}

    // 写入基础信息
    if (tagWriteOptions.basicInfo) {
      if (songInfo.name) newTags.TITLE = songInfo.name
      if (songInfo.singer) newTags.ARTIST = songInfo.singer
      if (songInfo.albumName) newTags.ALBUM = songInfo.albumName
      if (songInfo.year) newTags.DATE = songInfo.year.toString()
      if (songInfo.genre) newTags.GENRE = songInfo.genre
    }

    // 写入歌词
    if (tagWriteOptions.lyrics && songInfo.lrc) {
      const convertedLrc = convertLrcFormat(songInfo.lrc)
      newTags.LYRICS = convertedLrc
    }

    console.log('准备写入的标签:', newTags)

    // 使用 ffmpeg-static 写入 FLAC 标签
    if (path.extname(filePath).toLowerCase() === '.flac') {
      await writeFLACTagsWithFFmpeg(filePath, newTags, songInfo, tagWriteOptions)
    } else {
      console.warn('暂不支持该格式的标签写入:', path.extname(filePath))
    }
  } catch (error) {
    console.error('写入 Vorbis Comment 标签失败:', error)
    throw error
  }
}

// 使用 fluent-ffmpeg 写入 FLAC 标签
async function writeFLACTagsWithFFmpeg(
  filePath: string,
  tags: any,
  songInfo: any,
  tagWriteOptions: any
) {
  let tempOutputPath: string | null = null
  let tempCoverPath: string | null = null

  try {
    if (!ffmpegStatic) {
      throw new Error('ffmpeg-static 不可用')
    }
    ffmpeg.setFfmpegPath(ffmpegStatic.replace('app.asar', 'app.asar.unpacked'))

    // 创建临时输出文件
    tempOutputPath = filePath + '.temp.flac'

    // 创建 fluent-ffmpeg 实例
    let command = ffmpeg(filePath)
      .audioCodec('copy') // 复制音频编解码器，不重新编码
      .output(tempOutputPath)

    // 添加元数据标签
    for (const [key, value] of Object.entries(tags)) {
      if (value) {
        // fluent-ffmpeg 会自动处理特殊字符转义
        command = command.outputOptions(['-metadata', `${key}=${value}`])
      }
    }

    // 处理封面
    if (tagWriteOptions.cover && songInfo.img) {
      try {
        console.log('开始下载封面:', songInfo.img)
        const coverResponse = await axios({
          method: 'GET',
          url: songInfo.img,
          responseType: 'arraybuffer',
          timeout: 10000
        })

        if (coverResponse.data) {
          // 保存临时封面文件
          tempCoverPath = path.join(path.dirname(filePath), 'temp_cover.jpg')
          await fsPromise.writeFile(tempCoverPath, Buffer.from(coverResponse.data))

          // 添加封面作为输入
          command = command.input(tempCoverPath).outputOptions([
            '-map',
            '0:a', // 映射原始文件的音频流
            '-map',
            '1:v', // 映射封面的视频流
            '-c:v',
            'copy', // 复制视频编解码器
            '-disposition:v:0',
            'attached_pic' // 设置为附加图片
          ])

          console.log('封面已添加到命令中')
        }
      } catch (coverError) {
        console.warn(
          '下载封面失败，跳过封面写入:',
          coverError instanceof Error ? coverError.message : coverError
        )
      }
    }

    // 执行 ffmpeg 命令
    await new Promise<void>((resolve, reject) => {
      command
        .on('start', () => {
          console.log('执行 ffmpeg 命令')
        })
        .on('progress', (progress) => {
          if (progress.percent) {
            console.log('处理进度:', Math.round(progress.percent) + '%')
          }
        })
        .on('end', () => {
          console.log('ffmpeg 处理完成')
          resolve()
        })
        .on('error', (err, _, stderr) => {
          console.error('ffmpeg 错误:', err.message)
          if (stderr) {
            console.error('ffmpeg stderr:', stderr)
          }
          reject(new Error(`ffmpeg 处理失败: ${err.message}`))
        })
        .run()
    })

    // 检查临时文件是否创建成功
    if (!fs.existsSync(tempOutputPath)) {
      throw new Error('ffmpeg 未能创建输出文件')
    }

    // 替换原文件
    await fsPromise.rename(tempOutputPath, filePath)
    tempOutputPath = null // 标记已处理，避免重复清理

    console.log('使用 fluent-ffmpeg 写入 FLAC 标签成功:', filePath)
  } catch (error) {
    console.error('使用 fluent-ffmpeg 写入 FLAC 标签失败:', error)
    throw error
  } finally {
    // 清理所有临时文件
    const filesToClean = [tempOutputPath, tempCoverPath].filter(Boolean) as string[]

    for (const tempFile of filesToClean) {
      try {
        if (fs.existsSync(tempFile)) {
          await fsPromise.unlink(tempFile)
          console.log('已清理临时文件:', tempFile)
        }
      } catch (cleanupError) {
        console.warn(
          '清理临时文件失败:',
          tempFile,
          cleanupError instanceof Error ? cleanupError.message : cleanupError
        )
      }
    }
  }
}

// MP4/M4A 格式标签写入
async function writeMP4Tags(filePath: string, _songInfo: any, _tagWriteOptions: any) {
  console.log('MP4/M4A 格式标签写入暂未实现:', filePath)
  // 可以使用 ffmpeg 或其他工具实现
}

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

    async downloadSingleSong({
      pluginId,
      songInfo,
      quality,
      tagWriteOptions
    }: DownloadSingleSongArgs) {
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

      // 写入标签信息
      if (tagWriteOptions && fs.existsSync(songPath)) {
        try {
          await writeAudioTags(songPath, songInfo, tagWriteOptions)
        } catch (error) {
          console.warn('写入音频标签失败:', error)
          throw ffmpegStatic
        }
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
