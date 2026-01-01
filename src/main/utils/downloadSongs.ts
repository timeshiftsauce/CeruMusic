import { File, Picture, Id3v2Settings } from 'node-taglib-sharp'
import path from 'node:path'
import axios from 'axios'
import fs from 'fs'
import fsPromise from 'fs/promises'
import { configManager } from '../services/ConfigManager'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'url'

const fileLock: Record<string, boolean> = {}

/**
 * 转换LRC格式
 * 将带有字符位置信息的LRC格式转换为标准的逐字时间戳格式
 * @param lrcContent 原始LRC内容
 * @returns 转换后的LRC内容
 */
export function convertLrcFormat(lrcContent: string): string {
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
      const baseTimeMs = parseInt(startTimeMs, 10)
      if (!/\(\d+,\d+,\d+\)/.test(content)) {
        convertedLines.push(`[${formatTimestamp(baseTimeMs)}]${content}`)
        continue
      }
      const convertedLine = convertNewFormat(baseTimeMs, content)
      convertedLines.push(convertedLine ?? `[${formatTimestamp(baseTimeMs)}]${content}`)
      continue
    }

    // 检查是否是旧格式：[mm:ss.xxx]字符(偏移,持续时间)
    const oldFormatMatch = line.match(/^\[(\d{2}:\d{2}\.\d{3})\](.*)$/)
    if (oldFormatMatch) {
      const [, timestamp, content] = oldFormatMatch

      // 如果内容中没有位置信息，直接返回原行
      if (!/\(\d+,\d+\)/.test(content)) {
        convertedLines.push(line)
        continue
      }

      const convertedLine = convertOldFormat(timestamp, content)
      convertedLines.push(convertedLine ?? line)
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
  const t = Math.max(0, Math.floor(timeMs))
  const minutes = Math.floor(t / 60000)
  const seconds = Math.floor((t % 60000) / 1000)
  const milliseconds = t % 1000

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}

// 根据图片 URL 和 Content-Type 解析扩展名，默认返回 .jpg
function resolveCoverExt(imgUrl: string, contentType?: string): string {
  const validExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])
  let urlExt: string | undefined
  try {
    const pathname = new URL(imgUrl).pathname
    const i = pathname.lastIndexOf('.')
    if (i !== -1) {
      urlExt = pathname.substring(i).toLowerCase()
    }
  } catch { }

  if (urlExt && validExts.has(urlExt)) {
    return urlExt === '.jpeg' ? '.jpg' : urlExt
  }

  if (contentType) {
    if (contentType.includes('image/png')) return '.png'
    if (contentType.includes('image/webp')) return '.webp'
    if (contentType.includes('image/jpeg') || contentType.includes('image/jpg')) return '.jpg'
    if (contentType.includes('image/bmp')) return '.bmp'
  }

  return '.jpg'
}

/**
 * 转换新格式：[开始时间,持续时间](开始时间,字符持续时间,0)字符
 */
function convertNewFormat(baseTimeMs: number, content: string): string | null {
  const baseTimestamp = formatTimestamp(baseTimeMs)
  let convertedContent = `<${formatTimestamp(0)}>`

  // 匹配模式：(开始时间,字符持续时间,0)字符
  const charPattern = /\((\d+),(\d+),(\d+)\)([^(]*?)(?=\(|$)/g
  let match
  let isFirstChar = true
  let lastConsumedIndex = 0

  while ((match = charPattern.exec(content)) !== null) {
    const [, charStartMs, , , char] = match
    const charTimeMs = parseInt(charStartMs, 10)
    const charTimestamp = formatTimestamp(charTimeMs)
    const text = char ?? ''
    lastConsumedIndex = match.index + match[0].length

    if (isFirstChar) {
      if (charTimeMs !== 0) {
        convertedContent += `<${charTimestamp}>${text}`
      } else {
        convertedContent += text
      }
      isFirstChar = false
    } else {
      convertedContent += `<${charTimestamp}>${text}`
    }
  }

  if (isFirstChar) return null

  if (lastConsumedIndex < content.length) {
    const remainingText = content.substring(lastConsumedIndex)
    if (remainingText) convertedContent += remainingText
  }

  return `[${baseTimestamp}]${convertedContent}`
}

/**
 * 转换旧格式：[mm:ss.xxx]字符(偏移,持续时间)
 */
function convertOldFormat(timestamp: string, content: string): string | null {
  let convertedContent = `<${formatTimestamp(0)}>`

  // 匹配所有字符(偏移,持续时间)的模式
  const charPattern = /\s*([^()]+?)\s*\((\d+),(\d+)\)/g
  let match
  let lastIndex = 0
  let isFirstChar = true
  let matched = false

  while ((match = charPattern.exec(content)) !== null) {
    const [fullMatch, char, offsetMs, _durationMs] = match
    const charTimeMs = parseInt(offsetMs, 10)
    const charTimestamp = formatTimestamp(charTimeMs)
    matched = true

    // 添加匹配前的普通文本
    if (match.index > lastIndex) {
      const beforeText = content.substring(lastIndex, match.index)
      if (beforeText.trim()) {
        convertedContent += beforeText
      }
    }

    // 添加带时间戳的字符
    if (isFirstChar) {
      if (charTimeMs !== 0) {
        convertedContent += `<${charTimestamp}>${char}`
      } else {
        convertedContent += char
      }
      isFirstChar = false
    } else {
      convertedContent += `<${charTimestamp}>${char}`
    }
    lastIndex = match.index + fullMatch.length
  }

  if (!matched) return null

  // 添加剩余的普通文本
  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex)
    if (remainingText.trim()) {
      convertedContent += remainingText
    }
  }

  return `[${timestamp}]${convertedContent}`
}

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

export default async function download(
  url: string,
  songInfo: any,
  tagWriteOptions: any
): Promise<any> {
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

  // 写入标签信息（使用 node-taglib-sharp）
  if (tagWriteOptions && fs.existsSync(songPath)) {
    try {
      const baseName = path.basename(songPath, path.extname(songPath))
      const dirName = path.dirname(songPath)
      let coverExt = '.jpg'
      let coverPath = path.join(dirName, `${baseName}${coverExt}`)
      let coverDownloaded = false

      // 下载封面（仅当启用且有URL）
      if (tagWriteOptions.cover && songInfo?.img) {
        try {
          const coverRes = await axios.get(songInfo.img, {
            responseType: 'arraybuffer',
            timeout: 10000
          })

          const ct =
            (coverRes.headers && (coverRes.headers['content-type'] as string | undefined)) ||
            undefined
          coverExt = resolveCoverExt(songInfo.img, ct)
          coverPath = path.join(dirName, `${baseName}${coverExt}`)
          await fsPromise.writeFile(coverPath, Buffer.from(coverRes.data))
          coverDownloaded = true
        } catch (e) {
          console.warn('下载封面失败:', e instanceof Error ? e.message : e)
        }
      }

      // 读取歌曲文件并设置标签
      const songFile = File.createFromPath(songPath)

      // 使用默认 ID3v2.3
      Id3v2Settings.forceDefaultVersion = true
      Id3v2Settings.defaultVersion = 3

      songFile.tag.title = songInfo?.name || '未知曲目'
      songFile.tag.album = songInfo?.albumName || '未知专辑'
      const artists = songInfo?.singer ? [songInfo.singer] : ['未知艺术家']
      songFile.tag.performers = artists
      songFile.tag.albumArtists = artists
      // 写入歌词（转换为标准 LRC）
      if (tagWriteOptions.lyrics && songInfo?.lrc) {
        const convertedLrc = convertLrcFormat(songInfo.lrc)
        songFile.tag.lyrics = convertedLrc
      }

      // 写入封面
      if (tagWriteOptions.cover && coverDownloaded) {
        const songCover = Picture.fromPath(coverPath)
        songFile.tag.pictures = [songCover]
      }

      // 保存并释放
      songFile.save()
      songFile.dispose()

      // 删除临时封面
      if (coverDownloaded) {
        try {
          await fsPromise.unlink(coverPath)
        } catch { }
      }
    } catch (error) {
      console.warn('写入音乐元信息失败:', error)
    }
  }
  return {
    message: '下载成功',
    path: songPath
  }
}
