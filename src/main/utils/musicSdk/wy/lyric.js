import { httpFetch } from '../../request'
import { eapi } from './utils/crypto'
// import { decodeName } from '../..'

// const parseLyric = (str, lrc) => {
//   if (!str) return ''

//   str = str.replace(/\r/g, '')

//   let crlyric = str.replace(/\[((\d+),\d+)\].*/g, str => {
//     let result = str.match(/\[((\d+),\d+)\].*/)
//     let time = parseInt(result[2])
//     let ms = time % 1000
//     time /= 1000
//     let m = parseInt(time / 60).toString().padStart(2, '0')
//     time %= 60
//     let s = parseInt(time).toString().padStart(2, '0')
//     time = `${m}:${s}.${ms}`
//     str = str.replace(result[1], time)

//     let startTime = 0
//     str = str.replace(/\(0,1\) /g, ' ').replace(/\(\d+,\d+\)/g, time => {
//       const [start, end] = time.replace(/^\((\d+,\d+)\)$/, '$1').split(',')

//       time = `<${parseInt(startTime + parseInt(start))},${end}>`
//       startTime = parseInt(startTime + parseInt(end))
//       return time
//     })

//     return str
//   })

//   crlyric = decodeName(crlyric)
//   return crlyric.trim()
// }

const eapiRequest = (url, data) => {
  return httpFetch('https://interface3.music.163.com/eapi/song/lyric/v1', {
    method: 'post',
    headers: {
      'User-Agent':
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
      origin: 'https://music.163.com'
      // cookie: 'os=pc; deviceId=A9C064BB4584D038B1565B58CB05F95290998EE8B025AA2D07AE; osver=Microsoft-Windows-10-Home-China-build-19043-64bit; appver=2.5.2.197409; channel=netease; MUSIC_A=37a11f2eb9de9930cad479b2ad495b0e4c982367fb6f909d9a3f18f876c6b49faddb3081250c4980dd7e19d4bd9bf384e004602712cf2b2b8efaafaab164268a00b47359f85f22705cc95cb6180f3aee40f5be1ebf3148d888aa2d90636647d0c3061cd18d77b7a0; __csrf=05b50d54082694f945d7de75c210ef94; mode=Z7M-KP5(7)GZ; NMTID=00OZLp2VVgq9QdwokUgq3XNfOddQyIAAAF_6i8eJg; ntes_kaola_ad=1',
    },
    form: eapi(url, data)
  })
  // requestObj.promise = requestObj.promise.then(({ body }) => {
  //   // console.log(raw)
  //   console.log(body)
  //   // console.log(eapiDecrypt(raw))
  //   // return eapiDecrypt(raw)
  //   return body
  // })
  // return requestObj
}

const parseTools = {
  rxps: {
    info: /^{"/,
    lineTime: /^\[(\d+),\d+\]/,
    wordTime: /\(\d+,\d+,\d+\)/,
    wordTimeAll: /(\(\d+,\d+,\d+\))/g
  },
  msFormat(timeMs) {
    if (Number.isNaN(timeMs)) return ''
    const ms = timeMs % 1000
    timeMs /= 1000
    const m = parseInt(timeMs / 60)
      .toString()
      .padStart(2, '0')
    timeMs %= 60
    const s = parseInt(timeMs).toString().padStart(2, '0')
    return `[${m}:${s}.${ms}]`
  },
  parseLyric(lines) {
    const lxlrcLines = []
    const lrcLines = []

    for (let line of lines) {
      line = line.trim()
      const result = this.rxps.lineTime.exec(line)
      if (!result) {
        if (line.startsWith('[offset')) {
          lxlrcLines.push(line)
          lrcLines.push(line)
        }
        continue
      }

      const startMsTime = parseInt(result[1])
      const startTimeStr = this.msFormat(startMsTime)
      if (!startTimeStr) continue

      const words = line.replace(this.rxps.lineTime, '')

      lrcLines.push(`${startTimeStr}${words.replace(this.rxps.wordTimeAll, '')}`)

      // 保持网易云音乐逐字歌词的原始格式 [start,duration](start,duration)xxx
      const originalTimeTag = result[0] // 保持原始的 [start,duration] 格式
      lxlrcLines.push(`${originalTimeTag}${words}`)
    }
    return {
      lyric: lrcLines.join('\n'),
      crlyric: lxlrcLines.join('\n')
    }
  },
  parseHeaderInfo(str) {
    str = str.trim()
    str = str.replace(/\r/g, '')
    if (!str) return null
    const lines = str.split('\n')
    return lines.map((line) => {
      if (!this.rxps.info.test(line)) return line
      try {
        const info = JSON.parse(line)
        const timeTag = this.msFormat(info.t)
        return timeTag ? `${timeTag}${info.c.map((t) => t.tx).join('')}` : ''
      } catch {
        return ''
      }
    })
  },
  getIntv(interval) {
    if (!interval) return 0
    if (!interval.includes('.')) interval += '.0'
    const arr = interval.split(/:|\./)
    while (arr.length < 3) arr.unshift('0')
    const [m, s, ms] = arr
    return parseInt(m) * 3600000 + parseInt(s) * 1000 + parseInt(ms)
  },
  fixTimeTag(lrc, targetlrc) {
    let lrcLines = lrc.split('\n')
    const targetlrcLines = targetlrc.split('\n')
    const timeRxp = /^\[([\d:.]+)\]/
    let temp = []
    const newLrc = []
    targetlrcLines.forEach((line) => {
      const result = timeRxp.exec(line)
      if (!result) return
      const words = line.replace(timeRxp, '')
      if (!words.trim()) return
      const t1 = this.getIntv(result[1])

      while (lrcLines.length) {
        const lrcLine = lrcLines.shift()
        const lrcLineResult = timeRxp.exec(lrcLine)
        if (!lrcLineResult) continue
        const t2 = this.getIntv(lrcLineResult[1])
        if (Math.abs(t1 - t2) < 100) {
          const lrc = line.replace(timeRxp, lrcLineResult[0]).trim()
          if (!lrc) continue
          newLrc.push(lrc)
          break
        }
        temp.push(lrcLine)
      }
      lrcLines = [...temp, ...lrcLines]
      temp = []
    })
    return newLrc.join('\n')
  },
  parse(ylrc, ytlrc, yrlrc, lrc, tlrc, rlrc) {
    const info = {
      lyric: '',
      tlyric: '',
      rlyric: '',
      crlyric: ''
    }
    if (ylrc) {
      const lines = this.parseHeaderInfo(ylrc)
      if (lines) {
        const result = this.parseLyric(lines)
        if (ytlrc) {
          const lines = this.parseHeaderInfo(ytlrc)
          if (lines) {
            // if (lines.length == result.lyricLines.length) {
            info.tlyric = this.fixTimeTag(result.lyric, lines.join('\n'))
            // } else info.tlyric = lines.join('\n')
          }
        }
        if (yrlrc) {
          const lines = this.parseHeaderInfo(yrlrc)
          if (lines) {
            // if (lines.length == result.lyricLines.length) {
            info.rlyric = this.fixTimeTag(result.lyric, lines.join('\n'))
            // } else info.rlyric = lines.join('\n')
          }
        }

        const timeRxp = /^\[[\d:.]+\]/
        const headers = lines.filter((l) => timeRxp.test(l)).join('\n')
        info.lyric = `${headers}\n${result.lyric}`
        info.crlyric = result.crlyric
        return info
      }
    }
    if (lrc) {
      const lines = this.parseHeaderInfo(lrc)
      if (lines) info.lyric = lines.join('\n')
    }
    if (tlrc) {
      const lines = this.parseHeaderInfo(tlrc)
      if (lines) info.tlyric = lines.join('\n')
    }
    if (rlrc) {
      const lines = this.parseHeaderInfo(rlrc)
      if (lines) info.rlyric = lines.join('\n')
    }

    return info
  }
}

// https://github.com/Binaryify/NeteaseCloudMusicApi/pull/1523/files
// export default songmid => {
//   const requestObj = httpFetch('https://music.163.com/api/linux/forward', {
//     method: 'post',
//     'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/60.0.3112.90 Safari/537.36',
//     form: linuxapi({
//       method: 'POST',
//       url: 'https://music.163.com/api/song/lyric?_nmclfl=1',
//       params: {
//         id: songmid,
//         tv: -1,
//         lv: -1,
//         rv: -1,
//         kv: -1,
//       },
//     }),
//   })
//   requestObj.promise = requestObj.promise.then(({ body }) => {
//     if (body.code !== 200 || !body?.lrc?.lyric) return Promise.reject(new Error('Get lyric failed'))
//     // console.log(body)
//     return {
//       lyric: body.lrc.lyric,
//       tlyric: body.tlyric?.lyric ?? '',
//       rlyric: body.romalrc?.lyric ?? '',
//       // crlyric: parseLyric(body.klyric.lyric),
//     }
//   })
//   return requestObj
// }

// https://github.com/lyswhut/lx-music-mobile/issues/370
const fixTimeLabel = (lrc, tlrc, romalrc) => {
  if (lrc) {
    const newLrc = lrc.replace(/\[(\d{2}:\d{2}):(\d{2})]/g, '[$1.$2]')
    const newTlrc = tlrc?.replace(/\[(\d{2}:\d{2}):(\d{2})]/g, '[$1.$2]') ?? tlrc
    if (newLrc != lrc || newTlrc != tlrc) {
      lrc = newLrc
      tlrc = newTlrc
      if (romalrc)
        romalrc = romalrc
          .replace(/\[(\d{2}:\d{2}):(\d{2,3})]/g, '[$1.$2]')
          .replace(/\[(\d{2}:\d{2}\.\d{2})0]/g, '[$1]')
    }
  }

  return { lrc, tlrc, romalrc }
}

// https://github.com/Binaryify/NeteaseCloudMusicApi/blob/master/module/lyric_new.js
export default (songmid) => {
  let requestObj
  let isCanceled = false
  const retryLimit = 3

  const tryGetLyric = async (retryCount = 0) => {
    if (isCanceled) throw new Error('Request canceled')
    console.log('第', retryCount + 1, '次尝试获取歌词')
    requestObj = eapiRequest('/api/song/lyric/v1', {
      id: songmid,
      cp: false,
      tv: 0,
      lv: 0,
      rv: 0,
      kv: 0,
      yv: 0,
      ytv: 0,
      yrv: 0
    })

    try {
      const { body } = await requestObj.promise
      // console.log(body)
      if (body.code !== 200 || !body?.lrc?.lyric) throw new Error('Get lyric failed')
      const fixTimeLabelLrc = fixTimeLabel(body.lrc.lyric, body.tlyric?.lyric, body.romalrc?.lyric)
      const info = parseTools.parse(
        body.yrc?.lyric,
        body.ytlrc?.lyric,
        body.yromalrc?.lyric,
        fixTimeLabelLrc.lrc,
        fixTimeLabelLrc.tlrc,
        fixTimeLabelLrc.romalrc
      )
      // console.log(info)
      if (!info.lyric) throw new Error('Get lyric failed')
      return info
    } catch (err) {
      if (isCanceled) throw err
      if (retryCount < retryLimit) {
        return tryGetLyric(retryCount + 1)
      }
      throw err
    }
  }

  return {
    promise: tryGetLyric(),
    cancelHttp: () => {
      isCanceled = true
      if (requestObj && requestObj.cancelHttp) requestObj.cancelHttp()
    }
  }
}
