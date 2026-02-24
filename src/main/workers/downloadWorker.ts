import { File, Picture, Id3v2Settings } from 'node-taglib-sharp'
import path from 'node:path'
import axios from 'axios'
import fs from 'fs'
import fsPromise from 'fs/promises'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'url'
import { parentPort, isMainThread } from 'worker_threads'
import type { DownloadTask } from '../types/download'

if (!isMainThread) {
  parentPort?.on('message', async (message: DownloadTask | { type: 'pause' | 'cancel' }) => {
    if (typeof message === 'object' && 'type' in message) {
      if (message.type === 'pause') {
        // The manager will handle the task state. Here we just stop the download.
        if (currentResponseStream) {
          currentResponseStream.destroy()
        }
      } else if (message.type === 'cancel') {
        if (currentResponseStream) {
          currentResponseStream.destroy()
        }
        // Clean up temp file on cancel
        if (currentTask) {
          const tempFilePath = currentTask.filePath + '.temp'
          if (fs.existsSync(tempFilePath)) {
            await fsPromise.unlink(tempFilePath).catch(() => {})
          }
        }
      }
      return
    }

    currentTask = message
    try {
      const result = await download(currentTask)
      parentPort?.postMessage({ type: 'completed', result })
    } catch (error) {
      parentPort?.postMessage({
        type: 'error',
        error: error instanceof Error ? error.message : String(error)
      })
    } finally {
      currentTask = null
      currentResponseStream = null
    }
  })
}

let currentTask: DownloadTask | null = null
let currentResponseStream: any = null

// This worker will handle the download of a single song.
// It receives song information and download options from the main thread.

import { convertLrcFormat, convertToStandardLrc } from '../utils/lrcParser'

const fileLock: Record<string, boolean> = {}

async function readHeader(filePath: string): Promise<Buffer> {
  const h = Buffer.alloc(64)
  try {
    const f = await fsPromise.open(filePath, 'r')
    await f.read(h, 0, 64, 0)
    await f.close()
  } catch {}
  return h
}

async function detectFormat(filePath: string): Promise<string> {
  const h = await readHeader(filePath)
  const s3 = h.slice(0, 3).toString('ascii')
  const s4 = h.slice(0, 4).toString('ascii')
  const sFTYP = h.slice(4, 8).toString('ascii')
  if (s3 === 'ID3') return 'mp3'
  if (s4 === 'fLaC') return 'flac'
  if (h[0] === 0x4f && h[1] === 0x67 && h[2] === 0x67 && h[3] === 0x53) return 'ogg'
  if (h[0] === 0x30 && h[1] === 0x26 && h[2] === 0xb2 && h[3] === 0x75) return 'wma'
  if (
    h[0] === 0x52 &&
    h[1] === 0x49 &&
    h[2] === 0x46 &&
    h[3] === 0x46 &&
    h[8] === 0x57 &&
    h[9] === 0x41 &&
    h[10] === 0x56 &&
    h[11] === 0x45
  )
    return 'wav'
  if (sFTYP === 'ftyp') return 'm4a'
  if (h[0] === 0xff && (h[1] & 0xe0) === 0xe0) return 'mp3'
  return ''
}

function extForFormat(fmt: string): string {
  switch (fmt) {
    case 'mp3':
      return '.mp3'
    case 'flac':
      return '.flac'
    case 'm4a':
      return '.m4a'
    case 'wav':
      return '.wav'
    case 'ogg':
      return '.ogg'
    case 'wma':
      return '.wma'
    default:
      return ''
  }
}

function resolveCoverExt(imgUrl: string, contentType?: string): string {
  const validExts = new Set(['.jpg', '.jpeg', '.png', '.webp', '.bmp'])
  let urlExt: string | undefined
  try {
    const pathname = new URL(imgUrl).pathname
    const i = pathname.lastIndexOf('.')
    if (i !== -1) {
      urlExt = pathname.substring(i).toLowerCase()
    }
  } catch {}

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

async function download(task: DownloadTask): Promise<any> {
  const { url, filePath, songInfo, tagWriteOptions } = task
  const tempFilePath = filePath + '.temp'

  if (fileLock[filePath]) {
    throw new Error('歌曲正在下载中')
  }

  if (fs.existsSync(filePath)) {
    return {
      message: '歌曲已存在'
    }
  }

  fileLock[filePath] = true

  try {
    await fsPromise.mkdir(path.dirname(filePath), { recursive: true })

    let startByte = 0
    if (fs.existsSync(tempFilePath)) {
      const stats = await fsPromise.stat(tempFilePath)
      startByte = stats.size
    }

    if (url.startsWith('file://')) {
      const sourcePath = fileURLToPath(url)
      const stats = await fsPromise.stat(sourcePath)
      const totalSize = stats.size

      parentPort?.postMessage({
        type: 'progress',
        progress: 50,
        speed: totalSize,
        totalSize,
        downloadedSize: totalSize / 2,
        remainingTime: 0
      })

      await pipeline(fs.createReadStream(sourcePath), fs.createWriteStream(filePath))

      parentPort?.postMessage({
        type: 'progress',
        progress: 100,
        speed: totalSize,
        totalSize,
        downloadedSize: totalSize,
        remainingTime: 0
      })
    } else {
      const headers: Record<string, string> = {}
      if (startByte > 0) {
        headers.Range = `bytes=${startByte}-`
      }

      const response = await axios({
        method: 'GET',
        url: url,
        responseType: 'stream',
        headers
      })
      currentResponseStream = response.data

      const totalSize = parseInt(response.headers['content-length'] || '0', 10) + startByte
      let downloadedSize = startByte
      let lastReportedTime = Date.now()
      let lastDownloadedSize = startByte

      response.data.on('data', (chunk: Buffer) => {
        downloadedSize += chunk.length
        const now = Date.now()
        const timeDiff = now - lastReportedTime

        if (timeDiff >= 1000) {
          const sizeDiff = downloadedSize - lastDownloadedSize
          const speed = sizeDiff / (timeDiff / 1000)
          const progress = totalSize > 0 ? (downloadedSize / totalSize) * 100 : 0
          const remainingTime = speed > 0 ? (totalSize - downloadedSize) / speed : null

          parentPort?.postMessage({
            type: 'progress',
            progress: Math.min(100, progress),
            speed,
            totalSize,
            downloadedSize,
            remainingTime
          })

          lastReportedTime = now
          lastDownloadedSize = downloadedSize
        }
      })

      await pipeline(response.data, fs.createWriteStream(tempFilePath, { flags: 'a' }))
      await fsPromise.rename(tempFilePath, filePath)
    }

    let finalPath = filePath
    try {
      const detected = await detectFormat(filePath)
      const shouldExt = extForFormat(detected)
      const curExt = path.extname(filePath).toLowerCase()
      if (shouldExt && shouldExt !== curExt) {
        const baseNoExt = path.basename(filePath, curExt)
        let proposed = path.join(path.dirname(filePath), `${baseNoExt}${shouldExt}`)
        if (fs.existsSync(proposed)) {
          proposed = path.join(path.dirname(filePath), `${baseNoExt}.${Date.now()}${shouldExt}`)
        }
        await fsPromise.rename(filePath, proposed)
        finalPath = proposed
      }
    } catch {}

    if (tagWriteOptions && songInfo?.source !== 'update' && isAudioFile(finalPath)) {
      await processSongFiles(finalPath, songInfo, tagWriteOptions)
    }

    return {
      message: '下载成功',
      path: finalPath
    }
  } catch (error) {
    if (fs.existsSync(filePath)) {
      await fsPromise.unlink(filePath).catch(() => {})
    }
    if (fs.existsSync(tempFilePath)) {
      await fsPromise.unlink(tempFilePath).catch(() => {})
    }
    throw error
  } finally {
    delete fileLock[filePath]
  }
}

async function processSongFiles(songPath: string, songInfo: any, tagWriteOptions: any) {
  const baseName = path.basename(songPath, path.extname(songPath))
  const dirName = path.dirname(songPath)
  let coverPath: string | undefined

  try {
    if (tagWriteOptions.cover && songInfo?.img) {
      try {
        const coverRes = await axios.get(songInfo.img, {
          responseType: 'arraybuffer',
          timeout: 10000
        })
        const ct = (coverRes.headers?.['content-type'] as string) || undefined
        const coverExt = resolveCoverExt(songInfo.img, ct)
        coverPath = path.join(dirName, `${baseName}${coverExt}`)
        await fsPromise.writeFile(coverPath, Buffer.from(coverRes.data))
      } catch (e) {
        console.warn('下载封面失败:', e instanceof Error ? e.message : e)
        coverPath = undefined
      }
    }

    if (tagWriteOptions.downloadLyrics && songInfo?.lrc) {
      try {
        const lrcPath = path.join(dirName, `${baseName}.lrc`)
        const lrcContent =
          tagWriteOptions.lyricFormat === 'word-by-word'
            ? convertLrcFormat(songInfo.lrc)
            : convertToStandardLrc(songInfo.lrc)
        if (lrcContent) {
          await fsPromise.writeFile(lrcPath, lrcContent)
        }
      } catch (error) {
        console.warn('单独下载歌词文件失败:', error)
      }
    }

    const songFile = File.createFromPath(songPath)
    const ext = path.extname(songPath).toLowerCase()
    if (ext === '.mp3') {
      try {
        Id3v2Settings.forceDefaultVersion = true
        Id3v2Settings.defaultVersion = 3
      } catch {}
    }

    songFile.tag.title = songInfo?.name || '未知曲目'
    songFile.tag.album = songInfo?.albumName || '未知专辑'
    const artists = songInfo?.singer ? [songInfo.singer] : ['未知艺术家']
    songFile.tag.performers = artists
    songFile.tag.albumArtists = artists

    if (tagWriteOptions.lyrics && songInfo?.lrc) {
      songFile.tag.lyrics =
        tagWriteOptions.lyricFormat === 'word-by-word'
          ? convertLrcFormat(songInfo.lrc)
          : convertToStandardLrc(songInfo.lrc)
    }

    if (coverPath && fs.existsSync(coverPath)) {
      songFile.tag.pictures = [Picture.fromPath(coverPath)]
    }

    if (ext !== '.wav') {
      songFile.save()
    }
    songFile.dispose()
  } catch (error) {
    console.warn('写入音乐元信息或LRC文件失败:', error)
  } finally {
    if (coverPath && fs.existsSync(coverPath)) {
      await fsPromise.unlink(coverPath).catch(() => {})
    }
  }
}

function isAudioFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return ['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.wma'].includes(ext)
}
