// import { httpGet, httpFetch } from '../../request'
// import { WIN_MAIN_RENDERER_EVENT_NAME } from '@common/ipcNames'

// import { rendererInvoke } from '@common/rendererIpc'
import kwdecode from './kwdecode'
import { createCipheriv, createDecipheriv } from 'crypto'
import { toMD5 } from '../utils'

// const kw_token = {
//   token: null,
//   isGetingToken: false,
// }

// const translationMap = {
//   "{'": '{"',
//   "'}\n": '"}',
//   "'}": '"}',
//   "':'": '":"',
//   "','": '","',
//   "':{'": '":{"',
//   "':['": '":["',
//   "'}],'": '"}],"',
//   "':[{'": '":[{"',
//   "'},'": '"},"',
//   "'},{'": '"},{"',
//   "':[],'": '":[],"',
//   "':{},'": '":{},"',
//   "'}]}": '"}]}',
// }

// export const objStr2JSON = str => {
//   return JSON.parse(str.replace(/(^{'|'}\n$|'}$|':'|','|':\[{'|'}\],'|':{'|'},'|'},{'|':\['|':\[\],'|':{},'|'}]})/g, s => translationMap[s]))
// }

export const objStr2JSON = (str) => {
  return JSON.parse(
    str.replace(/('(?=(,\s*')))|('(?=:))|((?<=([:,]\s*))')|((?<={)')|('(?=}))/g, '"')
  )
}

export const formatSinger = (rawData) => rawData.replace(/&/g, '、')

export const matchToken = (headers) => {
  try {
    return headers['set-cookie'][0].match(/kw_token=(\w+)/)[1]
  } catch (err) {
    return null
  }
}

// const wait = time => new Promise(resolve => setTimeout(() => resolve(), time))

// export const getToken = (retryNum = 0) => new Promise((resolve, reject) => {
//   if (retryNum > 2) return Promise.reject(new Error('try max num'))

//   if (kw_token.isGetingToken) return wait(1000).then(() => getToken(retryNum).then(token => resolve(token)))
//   if (kw_token.token) return resolve(kw_token.token)
//   kw_token.isGetingToken = true
//   httpGet('http://www.kuwo.cn/', (err, resp) => {
//     kw_token.isGetingToken = false
//     if (err) return getToken(++retryNum)
//     if (resp.statusCode != 200) return reject(new Error('获取失败'))
//     const token = kw_token.token = matchToken(resp.headers)
//     resolve(token)
//   })
// })

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export const decodeLyric = (options) => {
  if (typeof options === 'string') {
    // 兼容旧的调用方式
    return kwdecode(options, false)
  }
  // 新的调用方式，传递对象
  return kwdecode(options.lrcBase64, options.isGetLyricx || false)
}

// export const tokenRequest = async(url, options = {}) => {
//   let token = kw_token.token
//   if (!token) token = await getToken()
//   if (!options.headers) {
//     options.headers = {
//       Referer: 'http://www.kuwo.cn/',
//       csrf: token,
//       cookie: 'kw_token=' + token,
//     }
//   }
//   const requestObj = httpFetch(url, options)
//   requestObj.promise = requestObj.promise.then(resp => {
//     // console.log(resp)
//     if (resp.statusCode == 200) {
//       kw_token.token = matchToken(resp.headers)
//     }
//     return resp
//   })
//   return requestObj
// }

export const lrcTools = {
  rxps: {
    wordLine: /^(\[\d{1,2}:.*\d{1,4}\])\s*(\S+(?:\s+\S+)*)?\s*/,
    tagLine: /\[(ver|ti|ar|al|offset|by|kuwo):\s*(\S+(?:\s+\S+)*)\s*\]/,
    wordTimeAll: /<(-?\d+),(-?\d+)(?:,-?\d+)?>/g,
    wordTime: /<(-?\d+),(-?\d+)(?:,-?\d+)?>/
  },
  offset: 1,
  offset2: 1,
  isOK: false,
  lines: [],
  tags: [],
  getWordInfo(str, str2, prevWord, lineStartTime = 0) {
    // 使用原始的酷我音乐时间计算逻辑，但输出绝对时间戳
    const offset = parseInt(str)
    const offset2 = parseInt(str2)
    let startTime = Math.abs((offset + offset2) / (this.offset * 2))
    let duration = Math.abs((offset - offset2) / (this.offset2 * 2))

    // 转换为基于行开始时间的绝对时间戳
    const absoluteStartTime = lineStartTime + startTime
    const endTime = absoluteStartTime + duration

    if (prevWord) {
      if (absoluteStartTime < prevWord.endTime) {
        prevWord.endTime = absoluteStartTime
        if (prevWord.absoluteStartTime > prevWord.endTime) {
          prevWord.absoluteStartTime = prevWord.endTime
        }
        prevWord.newTimeStr = `(${prevWord.absoluteStartTime},${prevWord.endTime - prevWord.absoluteStartTime},0)`
      }
    }
    return {
      startTime,
      absoluteStartTime,
      endTime,
      duration,
      timeStr: `(${absoluteStartTime},${duration},0)`
    }
  },
  parseLine(line) {
    if (line.length < 6) return
    let result = this.rxps.wordLine.exec(line)
    if (result) {
      const time = result[1]
      let words = result[2]
      if (words == null) {
        words = ''
      }
      const wordTimes = words.match(this.rxps.wordTimeAll)
      if (!wordTimes) return

      // 提取原始时间戳信息 [start,duration]
      const timeMatch = time.match(/\[(\d+):(\d+)\.(\d+)\]/)
      let lineStartTime = 0
      let lineDuration = 0
      if (timeMatch) {
        const minutes = parseInt(timeMatch[1])
        const seconds = parseInt(timeMatch[2])
        const milliseconds = parseInt(timeMatch[3])
        lineStartTime = minutes * 60000 + seconds * 1000 + milliseconds
        // 计算行持续时间（这里需要根据实际情况调整）
        lineDuration = 5000 // 默认5秒，实际应该根据下一行时间计算
      }

      let preTimeInfo
      for (const timeStr of wordTimes) {
        const result = this.rxps.wordTime.exec(timeStr)
        const wordInfo = this.getWordInfo(result[1], result[2], preTimeInfo, lineStartTime)
        const newTimeStr = `(${wordInfo.absoluteStartTime},${wordInfo.duration},0)`
        words = words.replace(timeStr, newTimeStr)
        if (preTimeInfo?.newTimeStr)
          words = words.replace(preTimeInfo.timeStr, preTimeInfo.newTimeStr)
        preTimeInfo = wordInfo
        preTimeInfo.timeStr = newTimeStr
      }

      // 使用 [start,duration] 格式而不是标准时间格式
      const originalTimeTag = `[${lineStartTime},${lineDuration}]`
      this.lines.push(originalTimeTag + words)
      return
    }
    result = this.rxps.tagLine.exec(line)
    if (!result) return
    if (result[1] == 'kuwo') {
      let content = result[2]
      if (content != null && content.includes('][')) {
        content = content.substring(0, content.indexOf(']['))
      }
      const valueOf = parseInt(content, 8)
      this.offset = Math.trunc(valueOf / 10)
      this.offset2 = Math.trunc(valueOf % 10)
      if (
        this.offset == 0 ||
        Number.isNaN(this.offset) ||
        this.offset2 == 0 ||
        Number.isNaN(this.offset2)
      ) {
        this.isOK = false
      }
    } else {
      this.tags.push(line)
    }
  },
  parse(lrc) {
    // console.log(lrc)
    const lines = lrc.split(/\r\n|\r|\n/)
    const tools = Object.create(this)
    tools.isOK = true
    tools.offset = 1
    tools.offset2 = 1
    tools.lines = []
    tools.tags = []

    for (const line of lines) {
      if (!tools.isOK) throw new Error('failed')
      tools.parseLine(line)
    }
    if (!tools.lines.length) return ''
    let lrcs = tools.lines.join('\n')
    if (tools.tags.length) lrcs = `${tools.tags.join('\n')}\n${lrcs}`
    // console.log(lrcs)
    return lrcs
  }
}

const createAesEncrypt = (buffer, mode, key, iv) => {
  const cipher = createCipheriv(mode, key, iv)
  return Buffer.concat([cipher.update(buffer), cipher.final()])
}

const createAesDecrypt = (buffer, mode, key, iv) => {
  const cipher = createDecipheriv(mode, key, iv)
  return Buffer.concat([cipher.update(buffer), cipher.final()])
}

export const wbdCrypto = {
  aesMode: 'aes-128-ecb',
  aesKey: Buffer.from(
    [112, 87, 39, 61, 199, 250, 41, 191, 57, 68, 45, 114, 221, 94, 140, 228],
    'binary'
  ),
  aesIv: '',
  appId: 'y67sprxhhpws',
  decodeData(base64Result) {
    const data = Buffer.from(decodeURIComponent(base64Result), 'base64')
    return JSON.parse(createAesDecrypt(data, this.aesMode, this.aesKey, this.aesIv).toString())
  },
  createSign(data, time) {
    const str = `${this.appId}${data}${time}`
    return toMD5(str).toUpperCase()
  },
  buildParam(jsonData) {
    const data = Buffer.from(JSON.stringify(jsonData))
    const time = Date.now()

    const encodeData = createAesEncrypt(data, this.aesMode, this.aesKey, this.aesIv).toString(
      'base64'
    )
    const sign = this.createSign(encodeData, time)

    return `data=${encodeURIComponent(encodeData)}&time=${time}&appId=${this.appId}&sign=${sign}`
  }
}
