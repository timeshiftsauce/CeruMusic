import { ipcMain, dialog, app } from 'electron'
import fs from 'fs'
import fsp from 'fs/promises'
import path from 'node:path'
import crypto from 'crypto'
import { localMusicIndexService } from '../services/LocalMusicIndex'
// remove static import to avoid runtime failures if native module is missing

const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.aac', '.m4a', '.ogg', '.wma'])

function genId(input: string) {
  return crypto.createHash('md5').update(input).digest('hex')
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

function readTags(filePath: string) {
  try {
    const taglib = require('node-taglib-sharp')
    const f = taglib.File.createFromPath(filePath)
    const tag = f.tag
    const title = tag.title || ''
    const album = tag.album || ''
    const performers = Array.isArray(tag.performers) ? tag.performers : []
    let img = ''
    if (Array.isArray(tag.pictures) && tag.pictures.length > 0) {
      try {
        const buf = tag.pictures[0].data
        const mime = tag.pictures[0].mimeType || 'image/jpeg'
        img = `data:${mime};base64,${Buffer.from(buf).toString('base64')}`
      } catch { }
    }
    let lrc: string | null = null
    try {
      const raw = tag.lyrics || ''
      if (raw && typeof raw === 'string') {
        lrc = normalizeLyricsToLrc(raw)
      }
    } catch { }
    f.dispose()
    return { title, album, performers, img, lrc }
  } catch {
    return { title: '', album: '', performers: [], img: '', lrc: null }
  }
}

// 将两种逐字/行内时间歌词统一转换为标准LRC（仅保留行时间标签）
function normalizeLyricsToLrc(input: string): string {
  const lines = String(input).replace(/\r/g, '').split('\n')
  const msFormat = (timeMs: number) => {
    if (!Number.isFinite(timeMs)) return ''
    const m = Math.floor(timeMs / 60000)
    const s = Math.floor((timeMs % 60000) / 1000)
    const ms = Math.floor(timeMs % 1000)
    return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${String(ms).padStart(3, '0')}]`
  }
  const out: string[] = []
  for (let line of lines) {
    if (!line.trim()) { out.push(line); continue }
    const off = /^\[offset:[+-]?\d+\]$/i.exec(line.trim())
    if (off) { out.push(line.trim()); continue }
    let mNew = /^\[(\d+),(\d+)\](.*)$/.exec(line)
    if (mNew) {
      const startMs = parseInt(mNew[1])
      let text = mNew[3] || ''
      text = text.replace(/\(\d+,\d+(?:,\d+)?\)/g, '')
      text = text.replace(/<\d{2}:\d{2}\.\d{3}>/g, '')
      if (/(<\d{2}:\d{2}\.\d{3}>)|(\(\d+,\d+(?:,\d+)?\))/.test(mNew[3] || '')) {
        text = text.replace(/[()]/g, '')
      }
      text = text.replace(/\s+/g, ' ').trim()
      const tag = msFormat(startMs)
      out.push(`${tag}${text}`)
      continue
    }
    let mOld = /^\[(\d{2}:\d{2}\.\d{3})\](.*)$/.exec(line)
    if (mOld) {
      let text = mOld[2] || ''
      text = text.replace(/\(\d+,\d+(?:,\d+)?\)/g, '')
      text = text.replace(/<\d{2}:\d{2}\.\d{3}>/g, '')
      if (/(<\d{2}:\d{2}\.\d{3}>)|(\(\d+,\d+(?:,\d+)?\))/.test(mOld[2] || '')) {
        text = text.replace(/[()]/g, '')
      }
      text = text.replace(/\s+/g, ' ').trim()
      const tag = `[${mOld[1]}]`
      out.push(`${tag}${text}`)
      continue
    }
    out.push(line)
  }
  return out.join('\n')
}

function timeToMs(s: string): number {
  const m = /(\d{2}):(\d{2})\.(\d{3})/.exec(s)
  if (!m) return NaN
  return parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 + parseInt(m[3])
}

function normalizeLyricsToCrLyric(input: string): string {
  const raw = String(input).replace(/\r/g, '')
  const lines = raw.split('\n')
  let offset = 0
  const res: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) { res.push(line); continue }
    const off = /^\[offset:([+-]?\d+)\]$/i.exec(line.trim())
    if (off) { offset = parseInt(off[1]) || 0; res.push(line); continue }
    const yrcLike = /\[\d+,\d+\]/.test(line) && /\(\d+,\d+,\d+\)/.test(line)
    if (yrcLike) { res.push(line); continue }
    const mLine = /^\[(\d{2}:\d{2}\.\d{3})\](.*)$/.exec(line)
    if (!mLine) { res.push(line); continue }
    const lineStart = timeToMs(mLine[1]) + offset
    let rest = mLine[2]
    rest = rest.replace(/\(\d+,\d+(?:,\d+)?\)/g, '')
    const segs: { start: number, text: string }[] = []
    const re = /<(\d{2}:\d{2}\.\d{3})>([^<]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(rest))) {
      const start = timeToMs(m[1]) + offset
      const text = m[2] || ''
      if (text) segs.push({ start, text })
    }
    if (segs.length === 0) { res.push(line); continue }
    let nextLineStart: number | null = null
    for (let j = i + 1; j < lines.length; j++) {
      const ml = /^\[(\d{2}:\d{2}\.\d{3})\]/.exec(lines[j])
      if (ml) { nextLineStart = timeToMs(ml[1]) + offset; break }
      const skip = lines[j].trim()
      if (!skip || /^\[offset:/.test(skip)) continue
      break
    }
    const tokens: string[] = []
    for (let k = 0; k < segs.length; k++) {
      const cur = segs[k]
      const nextStart = k < segs.length - 1 ? segs[k + 1].start : (nextLineStart ?? (cur.start + 1000))
      const span = Math.max(1, nextStart - cur.start)
      const chars = Array.from(cur.text).filter((ch) => !/\s/.test(ch))
      if (chars.length <= 1) {
        if (chars.length === 1) tokens.push(`(${cur.start},${span},0)` + chars[0])
      } else {
        const per = Math.max(1, Math.floor(span / chars.length))
        for (let c = 0; c < chars.length; c++) {
          const cs = cur.start + c * per
          const cd = c === chars.length - 1 ? Math.max(1, nextStart - cs) : per
          tokens.push(`(${cs},${cd},0)` + chars[c])
        }
      }
    }
    const lineEnd = nextLineStart ?? (segs[segs.length - 1].start + Math.max(1, (nextLineStart ?? (segs[segs.length - 1].start + 1000)) - segs[segs.length - 1].start))
    const ld = Math.max(0, lineEnd - lineStart)
    res.push(`[${lineStart},${ld}]` + tokens.join(' '))
  }
  return res.join('\n')
}

ipcMain.handle('local-music:select-dirs', async () => {
  const res = await dialog.showOpenDialog({ properties: ['openDirectory', 'multiSelections'] })
  if (res.canceled) return []
  return res.filePaths
})

ipcMain.handle('local-music:scan', async (_e, dirs: string[]) => {
  if (!Array.isArray(dirs) || dirs.length === 0) {
    return []
  }
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
    const list = files.map((p) => {
      let tags = { title: '', album: '', performers: [] as string[], img: '', lrc: null as null | string }
      try {
        tags = readTags(p)
      } catch { }
      const base = path.basename(p)
      const noExt = base.replace(path.extname(base), '')
      let name = tags.title || ''
      let singer = ''
      if (!name) {
        const segs = noExt.split(/[-_]|\s{2,}/).map((s) => s.trim()).filter(Boolean)
        if (segs.length >= 2) {
          singer = segs[0]
          name = segs.slice(1).join(' ')
        } else {
          name = noExt
        }
      } else {
        singer = Array.isArray(tags.performers) && tags.performers.length > 0 ? tags.performers[0] : ''
      }
      const songmid = genId(p)
      const item = {
        songmid,
        singer: singer || '未知艺术家',
        name: name || '未知曲目',
        albumName: tags.album || '未知专辑',
        albumId: 0,
        source: 'local',
        interval: '',
        img: tags.img || '',
        lrc: tags.lrc || null,
        types: [],
        _types: {},
        typeUrl: {},
        url: 'file://' + p,
        path: p
      }
      return item
    })
    await localMusicIndexService.setDirs(existsDirs)
    await localMusicIndexService.upsertSongs(list)
    try {
      return JSON.stringify(list)
    } catch {
      return '[]'
    }
  } catch (e) {
    return '[]'
  }
})

ipcMain.handle('local-music:write-tags', async (_e, payload: any) => {
  const { filePath, songInfo, tagWriteOptions } = payload || {}
  if (!filePath || !fs.existsSync(filePath)) return { success: false, message: '文件不存在' }
  try {
    const taglib = require('node-taglib-sharp')
    const songFile = taglib.File.createFromPath(filePath)
    taglib.Id3v2Settings.forceDefaultVersion = true
    taglib.Id3v2Settings.defaultVersion = 3
    songFile.tag.title = songInfo?.name || '未知曲目'
    songFile.tag.album = songInfo?.albumName || '未知专辑'
    const artists = songInfo?.singer ? [songInfo.singer] : ['未知艺术家']
    songFile.tag.performers = artists
    songFile.tag.albumArtists = artists
    if (tagWriteOptions?.lyrics && songInfo?.lrc) {
      const normalized = normalizeLyricsToLrc(songInfo.lrc)
      songFile.tag.lyrics = normalized
    }
    if (tagWriteOptions?.cover && songInfo?.img) {
      try {
        if (songInfo.img.startsWith('data:')) {
          const m = songInfo.img.match(/^data:(.*?);base64,(.*)$/)
          if (m) {
            const mime = m[1]
            const buf = Buffer.from(m[2], 'base64')
            const tmp = path.join(path.dirname(filePath), genId(filePath) + '.cover')
            await fsp.writeFile(tmp, buf)
            const pic = taglib.Picture.fromPath(tmp)
            songFile.tag.pictures = [pic]
            try { await fsp.unlink(tmp) } catch { }
          }
        }
      } catch { }
    }
    songFile.save()
    songFile.dispose()
    const songmid = genId(filePath)
    await localMusicIndexService.upsertSong({
      songmid,
      singer: songInfo?.singer || '未知艺术家',
      name: songInfo?.name || '未知曲目',
      albumName: songInfo?.albumName || '未知专辑',
      albumId: 0,
      source: 'local',
      interval: '',
      img: songInfo?.img || '',
      lrc: songInfo?.lrc || null,
      types: [],
      _types: {},
      typeUrl: {},
      url: 'file://' + filePath,
      path: filePath
    })
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || '写入失败' }
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
  return localMusicIndexService.getAllSongs()
})

ipcMain.handle('local-music:get-url', async (_e, id: string | number) => {
  const u = localMusicIndexService.getUrlById(id)
  if (!u) return { error: '未找到本地文件' }
  return u
})

ipcMain.handle('local-music:clear-index', async () => {
  try {
    const fn = (localMusicIndexService as any).clearSongs
    if (typeof fn === 'function') {
      await fn.call(localMusicIndexService)
      return { success: true }
    }
    const dirs = localMusicIndexService.getDirs()
    const file = require('node:path').join(app.getPath('userData'), 'local-music-index.json')
    const data = { songs: {}, dirs: Array.isArray(dirs) ? dirs : [], updatedAt: Date.now() }
    await require('fs/promises').writeFile(file, JSON.stringify(data, null, 2))
    return { success: true }
  } catch (e: any) {
    return { success: false, message: e?.message || '清空失败' }
  }
})
