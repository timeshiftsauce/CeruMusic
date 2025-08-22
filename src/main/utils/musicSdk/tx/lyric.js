import { httpFetch } from '../../request'
import getMusicInfo from './musicInfo'

const songIdMap = new Map()
const promises = new Map()

export default {
  successCode: 0,
  async getSongId({ songId, songmid }) {
    if (songId) return songId
    if (songIdMap.has(songmid)) return songIdMap.get(songmid)
    if (promises.has(songmid)) return (await promises.get(songmid)).songId
    const promise = getMusicInfo(songmid)
    promises.set(promise)
    const info = await promise
    songIdMap.set(songmid, info.songId)
    promises.delete(songmid)
    return info.songId
  },
  getLyric(mInfo, retryNum = 0) {
    if (retryNum > 3) return Promise.reject(new Error('Get lyric failed'))

    return {
      promise: this.getSongId(mInfo).then((songId) => {
        const requestObj = httpFetch('https://u.y.qq.com/cgi-bin/musicu.fcg', {
          method: 'post',
          headers: {
            referer: 'https://y.qq.com',
            'user-agent':
              'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.198 Safari/537.36'
          },
          body: {
            comm: {
              ct: '19',
              cv: '1859',
              uin: '0'
            },
            req: {
              method: 'GetPlayLyricInfo',
              module: 'music.musichallSong.PlayLyricInfo',
              param: {
                format: 'json',
                crypt: 1,
                ct: 19,
                cv: 1873,
                interval: 0,
                lrc_t: 0,
                qrc: 1,
                qrc_t: 0,
                roma: 1,
                roma_t: 0,
                songID: songId,
                trans: 1,
                trans_t: 0,
                type: -1
              }
            }
          }
        })
        return requestObj.promise.then(({ body }) => {
          // console.log(body)
          if (body.code != this.successCode || body.req.code != this.successCode)
            return this.getLyric(songId, ++retryNum)
          const data = body.req.data
          return this.parseLyric(data.lyric, data.trans, data.roma)
        })
      })
    }
  }
}
