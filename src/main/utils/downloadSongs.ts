import { configManager } from '../services/ConfigManager'
import { downloadManager } from '../services/DownloadManager'
import path from 'node:path'
import { formatMusicInfo } from '@common/utils/format'

const getDownloadDirectory = (): string => {
  const directories = configManager.getDirectories()
  return directories.downloadDir
}

export default function download(
  songInfo: any,
  url: string,
  tagWriteOptions: any,
  pluginId?: string,
  quality?: string
): any {
  const downloadDir = getDownloadDirectory()
  const fileExtension = getFileExtension(url, quality)
  const fileName = `${formatMusicInfo(songInfo.template, songInfo)}.${fileExtension}`
    .replace(/[/\\:*?"<>|]/g, '')
    .replace(/^\.+/, '')
    .replace(/\.+$/, '')
    .trim()
  const filePath = path.join(downloadDir, fileName)
  const priority = tagWriteOptions.priority || 0

  return downloadManager.addTask(
    songInfo,
    url,
    filePath,
    tagWriteOptions,
    priority,
    pluginId,
    quality
  )
}

function getFileExtension(url: string, quality?: string): string {
  if (url) {
    try {
      const urlObj = new URL(url)
      const pathname = urlObj.pathname
      const lastDotIndex = pathname.lastIndexOf('.')
      if (lastDotIndex !== -1 && lastDotIndex < pathname.length - 1) {
        const extension = pathname.substring(lastDotIndex + 1).toLowerCase()
        const validExtensions = ['mp3', 'flac', 'wav', 'aac', 'm4a', 'ogg', 'wma']
        if (validExtensions.includes(extension)) {
          return extension
        }
      }
    } catch (error) {
      console.warn('解析URL失败，使用默认扩展名:', error)
    }
  }

  // If URL is empty or extension not found, try to guess from quality
  if (quality) {
    if (quality.includes('flac')) return 'flac'
    if (quality.includes('m4a')) return 'm4a'
    if (quality.includes('ogg')) return 'ogg'
    if (quality.includes('wav')) return 'wav'
  }

  return 'mp3'
}
