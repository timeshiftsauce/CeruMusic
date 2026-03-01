import { ipcMain, dialog, BrowserWindow } from 'electron'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'node:path'
import { join } from 'path'
import { localMusicIndexService } from '../services/LocalMusicIndex'
import { coverCacheService } from '../services/CoverCache'
import { genId, genCoverKey, normPath } from '../utils/fileUtils'
import { readTags } from '../utils/tagUtils'
import { is } from '@electron-toolkit/utils'
import wy from '../utils/musicSdk/wy/recognize'
import getLyric from '../utils/musicSdk/wy/lyric'
import { httpFetch } from '../utils/request'

let workerWindow: BrowserWindow | null = null

function getOrCreateWorkerWindow(): Promise<BrowserWindow> {
  return new Promise((resolve) => {
    if (workerWindow && !workerWindow.isDestroyed()) {
      resolve(workerWindow)
      return
    }

    workerWindow = new BrowserWindow({
      show: false,
      webPreferences: {
        preload: join(__dirname, '../preload/index.js'),
        nodeIntegration: true,
        contextIsolation: false,
        backgroundThrottling: false,
        webSecurity: false
      }
    })

    if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
      workerWindow.loadURL(process.env['ELECTRON_RENDERER_URL'] + '/#/recognition-worker')
    } else {
      workerWindow.loadFile(join(__dirname, '../renderer/index.html'), {
        hash: 'recognition-worker'
      })
    }

    const onReady = () => {
      resolve(workerWindow!)
    }
    ipcMain.once('worker:ready', onReady)

    // Fallback
    workerWindow.webContents.once('did-finish-load', () => { })
  })
}

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.wma'])

async function readHeader(filePath: string): Promise<Buffer> {
  const h = Buffer.alloc(64)
  try {
    const f = await fsp.open(filePath, 'r')
    await f.read(h, 0, 64, 0)
    await f.close()
  } catch { }
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

async function walkDir(dir: string, results: string[]) {
  try {
    const items = await fsp.readdir(dir, { withFileTypes: true })
    for (const item of items) {
      const full = path.join(dir, item.name)
      if (item.isDirectory()) {
        await walkDir(full, results)
      } else {
        const ext = path.extname(item.name).toLowerCase()
        if (AUDIO_EXTS.has(ext)) results.push(full)
      }
    }
  } catch { }
}

ipcMain.handle('local-music:select-dirs', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] })
  if (res.canceled) return []
  return res.filePaths
})

ipcMain.handle('local-music:scan', async (e, dirs: string[]) => {
  if (!Array.isArray(dirs) || dirs.length === 0) {
    return []
  }

  const sender = e.sender

  const existsDirs = dirs.filter((d) => {
    try {
      return fs.existsSync(d)
    } catch {
      return false
    }
  })

  const files: string[] = []
  try {
    for (const d of existsDirs) await walkDir(d, files)

    const CHUNK_SIZE = 50 // 每批处理 50 个文件
    const totalFiles = files.length
    let processedCount = 0
    const allSongs: any[] = []

    for (let i = 0; i < totalFiles; i += CHUNK_SIZE) {
      const chunk = files.slice(i, i + CHUNK_SIZE)
      const promises = chunk.map(async (p) => {
        let tags = {
          title: '',
          album: '',
          performers: [] as string[],
          hasCover: false,
          lrc: null as null | string,
          year: 0,
          bitrate: 0,
          sampleRate: 0,
          channels: 0,
          duration: 0
        }
        try {
          tags = readTags(p, false) // 扫描时不读取歌词
        } catch { }

        const base = path.basename(p)
        const noExt = base.replace(path.extname(base), '')
        let name = tags.title || ''
        let singer = ''

        if (!name) {
          const segs = noExt
            .split(/[-_]|\s{2,}/)
            .map((s) => s.trim())
            .filter(Boolean)
          if (segs.length >= 2) {
            singer = segs[0]
            name = segs.slice(1).join(' ')
          } else {
            name = noExt
          }
        } else {
          singer =
            Array.isArray(tags.performers) && tags.performers.length > 0 ? tags.performers[0] : ''
        }

        const songmid = genId(p)

        const formatTime = (sec: number) => {
          if (!sec || !isFinite(sec)) return ''
          const m = Math.floor(sec / 60)
          const s = Math.floor(sec % 60)
          return `${m}:${String(s).padStart(2, '0')}`
        }

        return {
          songmid,
          singer: singer || '未知艺术家',
          name: name || '未知曲目',
          albumName: tags.album || '未知专辑',
          albumId: 0,
          source: 'local',
          interval: tags.duration ? formatTime(tags.duration) : '',
          img: '',
          hasCover: !!(tags as any).hasCover,
          coverKey: genCoverKey(p),
          year: (tags as any).year || 0,
          lrc: null, // 初始歌词为空
          types: [],
          _types: {},
          typeUrl: {},
          url: 'file://' + p,
          path: p,
          bitrate: tags.bitrate,
          sampleRate: tags.sampleRate,
          channels: tags.channels,
          duration: tags.duration
        }
      })

      const chunkSongs = await Promise.all(promises)
      allSongs.push(...chunkSongs)
      processedCount += chunk.length

      // 发送进度更新
      sender.send('local-music:scan-progress', { processed: processedCount, total: totalFiles })

      // 短暂延时，避免完全阻塞 UI
      await new Promise((resolve) => setImmediate(resolve))
    }

    await localMusicIndexService.setDirs(existsDirs)
    await localMusicIndexService.upsertSongs(allSongs)
    await localMusicIndexService.pruneByScan(existsDirs, files)

    // 通知 renderer 扫描完成
    sender.send('local-music:scan-finished', allSongs)

    try {
      return JSON.stringify(allSongs)
    } catch {
      return '[]'
    }
  } catch (e) {
    // 出错也要通知完成，避免界面一直转
    sender.send('local-music:scan-finished', [])
    return '[]'
  }
})

ipcMain.handle('local-music:write-tags', async (_e, payload: any) => {
  const { filePath, songInfo, tagWriteOptions } = payload || {}
  if (!filePath || !fs.existsSync(filePath)) return { success: false, message: '文件不存在' }
  try {
    const taglib = require('node-taglib-sharp')
    // 先备份原文件，确保失败时可回滚
    const dir = path.dirname(filePath)
    const base = path.basename(filePath)
    const backupPath = path.join(dir, `${base}.bak_${Date.now()}`)
    await fsp.copyFile(filePath, backupPath)

    let targetFilePath = filePath
    let ext = (path.extname(targetFilePath) || '').toLowerCase()
    const detected = await detectFormat(filePath)
    const shouldExt = extForFormat(detected)
    if (shouldExt && shouldExt !== ext) {
      const baseNoExt = path.basename(filePath, ext)
      const proposed = path.join(dir, `${baseNoExt}${shouldExt}`)
      if (tagWriteOptions?.fixExt === true) {
        let target = proposed
        if (fs.existsSync(target)) {
          const uniq = `${baseNoExt}.${Date.now()}${shouldExt}`
          target = path.join(dir, uniq)
        }
        await fsp.rename(targetFilePath, target)
        targetFilePath = target
        ext = (path.extname(targetFilePath) || '').toLowerCase()
      } else {
        return {
          success: false,
          code: 'NEED_FIX_EXT',
          message: '扩展名与实际格式不一致，需修复后再写入',
          detected,
          currentExt: ext,
          proposedExt: shouldExt,
          proposedPath: proposed
        }
      }
    }
    // 不支持的格式（如 WAV）提前提示
    if (ext === '.wav') {
      return { success: false, message: 'WAV 文件不支持写入封面/歌词标签' }
    }

    const songFile = taglib.File.createFromPath(targetFilePath)
    if (ext === '.mp3') {
      try {
        taglib.Id3v2Settings.forceDefaultVersion = true
        taglib.Id3v2Settings.defaultVersion = 3
      } catch { }
    }
    songFile.tag.title = songInfo?.name || '未知曲目'
    songFile.tag.album = songInfo?.albumName || '未知专辑'
    const artists = songInfo?.singer ? [songInfo.singer] : ['未知艺术家']
    songFile.tag.performers = artists
    songFile.tag.albumArtists = artists
    if (tagWriteOptions?.lyrics && songInfo?.lrc) {
      const finalLrc = songInfo.lrc

      songFile.tag.lyrics = finalLrc
    }
    if (tagWriteOptions?.cover && songInfo?.img) {
      try {
        if (songInfo.img.startsWith('data:')) {
          const m = songInfo.img.match(/^data:(.*?);base64,(.*)$/)
          if (m) {
            const mime = m[1]
            const buf = Buffer.from(m[2], 'base64')
            const ext =
              mime && /jpeg|jpg/i.test(mime) ? '.jpg' : mime && /png/i.test(mime) ? '.png' : '.img'
            const tmp = path.join(path.dirname(targetFilePath), genId(targetFilePath) + ext)
            await fsp.writeFile(tmp, buf)
            const pic = taglib.Picture.fromPath(tmp)
            songFile.tag.pictures = [pic]
            try {
              await fsp.unlink(tmp)
            } catch { }
          }
        }
      } catch { }
    }
    try {
      if (typeof songInfo?.year === 'number' && songInfo.year > 0) {
        songFile.tag.year = songInfo.year
      }
    } catch { }
    songFile.save()
    songFile.dispose()

    // 基本校验：保存后能否重新打开
    try {
      const check = taglib.File.createFromPath(targetFilePath)
      check.dispose()
    } catch (e: any) {
      // 恢复备份并返回失败
      try {
        await fsp.copyFile(backupPath, targetFilePath)
      } catch { }
      try {
        await fsp.unlink(backupPath)
      } catch { }
      return { success: false, message: '写入后校验失败，已回滚' }
    }

    // 写入成功，清理备份
    try {
      await fsp.unlink(backupPath)
    } catch { }

    // Fix: Use normalized path to find the correct existing song ID
    const normalizedPath = normPath(targetFilePath)
    // If normPath returns null (shouldn't happen here), fallback to empty
    const songmid = genId(normalizedPath || targetFilePath)

    const exists = localMusicIndexService.getSongById(songmid) || ({} as any)
    const updated = {
      // 原有字段优先保留
      ...exists,
      path: targetFilePath,
      url: exists.url || `file://${targetFilePath}`,
      singer: songInfo?.singer ?? exists.singer ?? '未知艺术家',
      name: songInfo?.name ?? exists.name ?? '未知曲目',
      albumName: songInfo?.albumName ?? exists.albumName ?? '未知专辑',
      year: Number(songInfo?.year ?? exists.year ?? 0) || 0
    }
    await localMusicIndexService.upsertSong(updated as any)
    // 如果发生了重命名，移除旧路径对应的索引，避免重复
    if (targetFilePath !== filePath) {
      await localMusicIndexService.removeSongByPath(filePath)
    }
    // 通知 renderer 刷新列表（复用 scan-finished 通道）
    try {
      const all = localMusicIndexService.getAllSongs()
        ; (_e as any)?.sender?.send?.('local-music:scan-finished', all)
    } catch { }
    return { success: true }
  } catch (e: any) {
    // 失败时尝试回滚
    try {
      const dir = path.dirname(filePath)
      const base = path.basename(filePath)
      const pattern = new RegExp(`^${base}\\.bak_\\d+$`)
      const items: any = await fsp.readdir(dir)
      const latestBak = items
        .filter((n) => pattern.test(n))
        .map((n) => path.join(dir, n))
        .sort()
        .pop()
        .pop()
      if (latestBak) {
        try {
          await fsp.copyFile(latestBak, filePath)
        } catch { }
        try {
          await fsp.unlink(latestBak)
        } catch { }
      }
    } catch { }
    const msg: string = e?.message || '写入失败'
    const mapped = /MPEG audio header not found/i.test(msg)
      ? '文件不是有效的 MP3，或扩展名与实际格式不匹配'
      : msg
    return { success: false, message: mapped }
  }
})

ipcMain.handle('local-music:get-dirs', async () => {
  return localMusicIndexService.getDirs()
})

ipcMain.handle('local-music:set-dirs', async (_e, dirs: string[]) => {
  await localMusicIndexService.setDirs(Array.isArray(dirs) ? dirs : [])
  return { success: true }
})

ipcMain.handle('local-music:get-list', async () => {
  console.log('获取本地音乐列表')
  const songs = localMusicIndexService.getAllSongs()
  console.log('获取本地音乐列表', songs[0])
  return songs
})

ipcMain.handle('local-music:get-lyric', async (_e, songmid: string) => {
  if (!songmid) return null
  const song = localMusicIndexService.getSongById(songmid)
  if (!song || !song.path) return null

  try {
    const tags = readTags(song.path, true) // 读取歌词
    return tags.lrc || ''
  } catch {
    return null
  }
})

ipcMain.handle('local-music:get-url', async (_e, id: string | number) => {
  const u = localMusicIndexService.getUrlById(id)
  if (!u) return { error: '未找到本地文件' }
  return u
})

ipcMain.handle('local-music:get-cover', async (_e, trackId: string) => {
  if (!trackId) return ''
  console.log('获取封面:', trackId)
  const song = localMusicIndexService.getSongById(trackId)
  if (!song || !song.path) return ''
  try {
    const key = genCoverKey(song.path)
    const data = await coverCacheService.getCoverByFile(song.path, key)
    return data || ''
  } catch {
    return ''
  }
})

ipcMain.handle('local-music:get-covers', async (_e, trackIds: string[]) => {
  if (!Array.isArray(trackIds) || trackIds.length === 0) return {}
  const res: Record<string, string> = {}
  for (const id of trackIds) {
    const s = localMusicIndexService.getSongById(id)
    if (!s?.path) continue
    try {
      const data = await coverCacheService.getCoverByFile(s.path, genCoverKey(s.path))
      if (data) res[id] = data
    } catch { }
  }
  return res
})

ipcMain.handle('local-music:get-tags', async (_e, songmid: string, includeLyrics: boolean) => {
  if (!songmid) return null
  const s = localMusicIndexService.getSongById(songmid)
  if (!s?.path) return null
  try {
    const tags = readTags(s.path, !!includeLyrics)
    return {
      name: tags.title || '',
      singer:
        Array.isArray(tags.performers) && tags.performers.length > 0 ? tags.performers[0] : '',
      albumName: tags.album || '',
      year: tags.year || 0,
      lrc: tags.lrc || ''
    }
  } catch {
    return null
  }
})

ipcMain.handle('local-music:clear-index', async () => {
  try {
    await localMusicIndexService.clearSongs()
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || '清空失败' }
  }
})

ipcMain.handle('local-music:batch-match', async (e, songmids: string[]) => {
  const sender = e.sender
  if (!Array.isArray(songmids) || songmids.length === 0)
    return { success: false, message: '无任务' }

  const allSongs = localMusicIndexService.getAllSongs()
  const songs = songmids
    .map((id) => allSongs.find((s) => String(s.songmid) === String(id)))
    .filter(Boolean)

  if (songs.length === 0) return { success: false, message: '未找到歌曲' }

  // Prepare worker
  const win = await getOrCreateWorkerWindow()

  const total = songs.length
  let processed = 0
  let matched = 0

  const pendingTasks = new Map<string, { resolve: Function; song: any }>()

  const onResult = async (_e, { id, fp, duration }: any) => {
    const task = pendingTasks.get(id)
    if (!task) return
    pendingTasks.delete(id)

    try {
      const results = await wy.recognize(fp, duration)
      if (results && results.length > 0) {
        const best = results[0]

        // Fetch Lyric
        let lrc = ''
        try {
          const lrcRes = await getLyric(best.songmid).promise
          if (lrcRes && lrcRes.lyric) lrc = lrcRes.lyric
        } catch (e) {
          console.error('Fetch lyric failed', e)
        }

        // Fetch Cover
        let coverPath = ''
        if (best.img) {
          try {
            const coverRes = await httpFetch(best.img, { format: 'arraybuffer' }).promise
            const buf = coverRes.body
            if (Buffer.isBuffer(buf)) {
              const ext = (best.img.match(/\.(png|jpg|jpeg)/i) || ['.jpg'])[0]
              const tmpPath = path.join(path.dirname(task.song.path), genId(task.song.path) + ext)
              await fsp.writeFile(tmpPath, buf)
              coverPath = tmpPath
            }
          } catch (e) {
            console.error('Fetch cover failed', e)
          }
        }

        // Update Tags
        try {
          const taglib = require('node-taglib-sharp')
          const file = taglib.File.createFromPath(task.song.path)
          file.tag.title = best.name
          file.tag.performers = [best.singer]
          file.tag.album = best.albumName
          if (lrc) file.tag.lyrics = lrc
          if (coverPath) {
            const pic = taglib.Picture.fromPath(coverPath)
            file.tag.pictures = [pic]
          }
          file.save()
          file.dispose()

          if (coverPath) {
            try {
              await fsp.unlink(coverPath)
            } catch { }
          }

          // Update Index
          task.song.name = best.name
          task.song.singer = best.singer
          task.song.albumName = best.albumName
          if (best.img) {
            task.song.img = best.img
            task.song.hasCover = true
          }
          if (lrc) {
            task.song.lrc = lrc
          }
          await localMusicIndexService.upsertSong(task.song)
          matched++
        } catch (err) {
          console.error('Write tag failed', err)
          if (coverPath) {
            try {
              await fsp.unlink(coverPath)
            } catch { }
          }
        }
      }
    } catch (err) {
      console.error('Recognition failed', err)
    }

    processed++
    sender.send('local-music:batch-match-progress', { processed, total, matched })
    task.resolve()
  }

  const onError = (_e, { id, error }: any) => {
    const task = pendingTasks.get(id)
    if (!task) return
    pendingTasks.delete(id)
    console.error('Worker error', id, error)
    processed++
    sender.send('local-music:batch-match-progress', { processed, total, matched })
    task.resolve()
  }

  ipcMain.on('worker:fp-generated', onResult)
  ipcMain.on('worker:fp-error', onError)

  const CONCURRENCY = 3
  for (let i = 0; i < songs.length; i += CONCURRENCY) {
    const chunk = songs.slice(i, i + CONCURRENCY)
    const promises = chunk.map((song) => {
      return new Promise<void>((resolve) => {
        const id = String(song!.songmid)
        pendingTasks.set(id, { resolve, song })
        win.webContents.send('worker:start-task', { id, filePath: song!.path })
      })
    })
    await Promise.all(promises)
  }

  ipcMain.removeListener('worker:fp-generated', onResult)
  ipcMain.removeListener('worker:fp-error', onError)

  const finalSongs = localMusicIndexService.getAllSongs()
  sender.send('local-music:batch-match-finished', { matched })
  sender.send('local-music:scan-finished', finalSongs)

  return { success: true, matched }
})
