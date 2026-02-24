import { normalizeLyricsToCrLyric } from './lrcParser'

export function readTags(filePath: string, includeLrc = false) {
  try {
    const taglib = require('node-taglib-sharp')
    const f = taglib.File.createFromPath(filePath)
    const tag = f.tag
    const props = f.properties
    const title = tag.title || ''
    const album = tag.album || ''
    const performers = Array.isArray(tag.performers) ? tag.performers : []
    const hasCover = Array.isArray(tag.pictures) && tag.pictures.length > 0
    const bitrate = props?.audioBitrate || 0
    const sampleRate = props?.audioSampleRate || 0
    const channels = props?.audioChannels || 0
    const duration = props?.duration?.totalSeconds || 0
    let year = 0
    try {
      year = tag.year || 0
    } catch {}
    let lrc: string | null = null
    if (includeLrc) {
      try {
        const raw = tag.lyrics || ''
        if (raw && typeof raw === 'string') {
          lrc = normalizeLyricsToCrLyric(raw)
        }
      } catch {}
    }
    f.dispose()
    return {
      title,
      album,
      performers,
      hasCover,
      lrc,
      year,
      bitrate,
      sampleRate,
      channels,
      duration
    }
  } catch {
    return {
      title: '',
      album: '',
      performers: [],
      hasCover: false,
      lrc: null,
      year: 0,
      bitrate: 0,
      sampleRate: 0,
      channels: 0,
      duration: 0
    }
  }
}
