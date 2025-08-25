import { inflate } from 'zlib'
import { decodeName } from './util'

// https://github.com/lyswhut/lx-music-desktop/issues/296#issuecomment-683285784
const enc_key = Buffer.from(
  [0x40, 0x47, 0x61, 0x77, 0x5e, 0x32, 0x74, 0x47, 0x51, 0x36, 0x31, 0x2d, 0xce, 0xd2, 0x6e, 0x69],
  'binary'
)
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const decodeLyric = (str) =>
  new Promise((resolve, reject) => {
    if (!str.length) return
    const buf_str = Buffer.from(str, 'base64').subarray(4)
    for (let i = 0, len = buf_str.length; i < len; i++) {
      buf_str[i] = buf_str[i] ^ enc_key[i % 16]
    }
    inflate(buf_str, (err, result) => {
      if (err) return reject(err)
      resolve(result.toString())
    })
  })

const headExp = /^.*\[id:\$\w+\]\n/

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
const parseLyric = (str) => {
  str = str.replace(/\r/g, '')
  if (headExp.test(str)) str = str.replace(headExp, '')
  let trans = str.match(/\[language:([\w=\\/+]+)\]/)
  let lyric
  let rlyric
  let tlyric
  if (trans) {
    str = str.replace(/\[language:[\w=\\/+]+\]\n/, '')
    let json = JSON.parse(Buffer.from(trans[1], 'base64').toString())
    for (const item of json.content) {
      switch (item.type) {
        case 0:
          rlyric = item.lyricContent
          break
        case 1:
          tlyric = item.lyricContent
          break
      }
    }
  }
  let i = 0
  let crlyric = str.replace(/\[((\d+),\d+)\].*/g, (str) => {
    let result = str.match(/\[((\d+),\d+)\].*/)
    let lineStartTime = parseInt(result[2]) // 行开始时间
    let time = lineStartTime
    let ms = time % 1000
    time /= 1000
    let m = parseInt(time / 60)
      .toString()
      .padStart(2, '0')
    time %= 60
    let s = parseInt(time).toString().padStart(2, '0')
    time = `${m}:${s}.${ms}`
    if (rlyric) rlyric[i] = `[${time}]${rlyric[i]?.join('') ?? ''}`
    if (tlyric) tlyric[i] = `[${time}]${tlyric[i]?.join('') ?? ''}`
    i++

    // 保持原始的 [start,duration] 格式，将相对时间戳转换为绝对时间戳
    let processedStr = str.replace(/<(\d+),(\d+),(\d+)>/g, (match, start, duration, param) => {
      const absoluteStart = lineStartTime + parseInt(start)
      return `(${absoluteStart},${duration},${param})`
    })

    return processedStr
  })
  rlyric = rlyric ? rlyric.join('\n') : ''
  tlyric = tlyric ? tlyric.join('\n') : ''
  // 保留完整的时间戳格式 (startTime,duration,param)
  crlyric = crlyric.replace(/<(\d+,\d+,\d+)>/g, '($1)')
  crlyric = decodeName(crlyric)
  lyric = crlyric.replace(/\(\d+,\d+,\d+\)/g, '')
  rlyric = decodeName(rlyric)
  tlyric = decodeName(tlyric)
  return {
    lyric,
    tlyric,
    rlyric,
    crlyric
  }
}

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const decodeKrc = async (data) => {
  return decodeLyric(data).then(parseLyric)
}
