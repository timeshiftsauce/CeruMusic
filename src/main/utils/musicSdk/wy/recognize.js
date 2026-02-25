import { httpFetch } from '../../request'
import { formatPlayTime, sizeFormate } from '../../index'
import { formatSingerName } from '../utils'
import crypto from 'crypto'

export default {
  async recognize(fp, duration) {
    const params = new URLSearchParams({
      sessionId: crypto.randomUUID(),
      algorithmCode: 'shazam_v2',
      duration: String(Math.floor(duration)),
      rawdata: fp,
      times: '1',
      decrypt: '1'
    })

    const url = `https://interface.music.163.com/api/music/audio/match?${params.toString()}`

    const requestObj = httpFetch(url, {
      method: 'POST'
    })

    const { body } = await requestObj.promise

    if (body.data && body.data.result && body.data.result.length > 0) {
      // console.log('Recognition success:', body.data.result)

      const tasks = body.data.result.map(async (item) => {
        const rawSong = item.song
        if (!rawSong) return null

        const artists = rawSong.artist || rawSong.artists || []
        const artistName = formatSingerName(artists, 'name')
        const album = rawSong.album || {}
        const startTime = item.startTime || 0

        try {
          const requestObj = httpFetch(
            `https://music.163.com/api/song/music/detail/get?songId=${rawSong.id}`,
            {
              method: 'get',
              headers: {
                'User-Agent':
                  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
                origin: 'https://music.163.com'
              }
            }
          )

          const { body: detailBody, statusCode } = await requestObj.promise

          if (statusCode !== 200 || !detailBody || detailBody.code !== 200) {
            throw new Error('Failed to get song quality information')
          }

          const types = []
          const _types = {}
          let size
          const data = detailBody.data

          if (data.jm && data.jm.size) {
            size = sizeFormate(data.jm.size)
            types.push({ type: 'master', size })
            _types.master = { size }
          }
          if (data.db && data.db.size) {
            size = sizeFormate(data.db.size)
            types.push({ type: 'dolby', size })
            _types.dolby = { size }
          }
          if (data.hr && data.hr.size) {
            size = sizeFormate(data.hr.size)
            types.push({ type: 'hires', size })
            _types.hires = { size }
          }
          if (data.sq && data.sq.size) {
            size = sizeFormate(data.sq.size)
            types.push({ type: 'flac', size })
            _types.flac = { size }
          }
          if (data.h && data.h.size) {
            size = sizeFormate(data.h.size)
            types.push({ type: '320k', size })
            _types['320k'] = { size }
          }
          if (data.m && data.m.size) {
            size = sizeFormate(data.m.size)
            types.push({ type: '128k', size })
            _types['128k'] = { size }
          } else if (data.l && data.l.size) {
            size = sizeFormate(data.l.size)
            types.push({ type: '128k', size })
            _types['128k'] = { size }
          }

          types.reverse()

          return {
            songmid: rawSong.id,
            name: rawSong.name,
            singer: artistName,
            albumName: album.name || '',
            albumId: album.id || 0,
            source: 'wy',
            interval: formatPlayTime(rawSong.duration / 1000),
            img: album.picUrl || album.blurPicUrl || '',
            lrc: null,
            types,
            _types,
            typeUrl: {},
            startTime
          }
        } catch (error) {
          console.error(error)
          return null
        }
      })

      const results = (await Promise.all(tasks)).filter((item) => item !== null)
      return results
    }
    return []
  }
}
