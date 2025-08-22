import needle from 'needle'
import { bHh } from './musicSdk/options'
import { deflateRaw } from 'zlib'
import { httpOverHttp, httpsOverHttp } from 'tunnel'

// 常量定义
const DEFAULT_TIMEOUT = 15000
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; WOW64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/69.0.3497.100 Safari/537.36'
const debugRequest = false

const httpsRxp = /^https:/
const regx = /(?:\d\w)+/g

// 代理配置对象
let proxy = {
  enable: false,
  host: '',
  port: 0,
  username: '',
  password: '',
  envProxy: null
}

/**
 * 设置代理配置
 * @param {Object} proxyConfig - 代理配置
 */
export const setProxy = (proxyConfig) => {
  proxy = { ...proxy, ...proxyConfig }
}

/**
 * 获取代理配置
 */
export const getProxy = () => {
  return { ...proxy }
}

/**
 * 清除代理配置
 */
export const clearProxy = () => {
  proxy = {
    enable: false,
    host: '',
    port: 0,
    username: '',
    password: '',
    envProxy: null
  }
}

/**
 * 获取请求代理
 * @param {string} url - 请求URL
 */
const getRequestAgent = (url) => {
  let options
  if (proxy.enable && proxy.host) {
    options = {
      proxy: {
        host: proxy.host,
        port: proxy.port
      }
    }
    // 如果有用户名和密码，添加认证
    if (proxy.username && proxy.password) {
      options.proxy.proxyAuth = `${proxy.username}:${proxy.password}`
    }
  } else if (proxy.envProxy) {
    options = {
      proxy: {
        host: proxy.envProxy.host,
        port: proxy.envProxy.port
      }
    }
  }
  return options ? (httpsRxp.test(url) ? httpsOverHttp : httpOverHttp)(options) : undefined
}

/**
 * 核心请求函数
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @param {Function} callback - 回调函数
 */
const request = (url, options, callback) => {
  let data
  if (options.body) {
    data = options.body
  } else if (options.form) {
    data = options.form
    options.json = false
  } else if (options.formData) {
    data = options.formData
    options.json = false
  }
  options.response_timeout = options.timeout

  return needle.request(options.method || 'get', url, data, options, (err, resp, body) => {
    if (!err) {
      body = resp.body = resp.raw.toString()
      try {
        resp.body = JSON.parse(resp.body)
      } catch (_) {}
      body = resp.body
    }
    callback(err, resp, body)
  }).request
}

/**
 * 默认请求头
 */
const defaultHeaders = {
  'User-Agent': DEFAULT_USER_AGENT
}

/**
 * 构建HTTP Promise请求
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 */
const buildHttpPromise = (url, options) => {
  let obj = {
    isCancelled: false,
    cancelHttp: () => {
      if (!obj.requestObj) return (obj.isCancelled = true)
      cancelHttp(obj.requestObj)
      obj.requestObj = null
      obj.promise = obj.cancelHttp = null
      obj.cancelFn(new Error('已取消'))
      obj.cancelFn = null
    }
  }
  obj.promise = new Promise((resolve, reject) => {
    obj.cancelFn = reject
    debugRequest && console.log(`\n---send request------${url}------------`)
    fetchData(url, options.method, options, (err, resp, body) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(body)
      obj.requestObj = null
      obj.cancelFn = null
      if (err) return reject(err)
      resolve(resp)
    }).then((ro) => {
      obj.requestObj = ro
      if (obj.isCancelled) obj.cancelHttp()
    })
  })
  return obj
}

/**
 * HTTP请求（支持自动重试）
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 */
export const httpFetch = (url, options = { method: 'get' }) => {
  const requestObj = buildHttpPromise(url, options)
  requestObj.promise = requestObj.promise.catch((err) => {
    if (err.message === 'socket hang up') {
      return Promise.reject(new Error('无法请求'))
    }
    switch (err.code) {
      case 'ETIMEDOUT':
      case 'ESOCKETTIMEDOUT':
        return Promise.reject(new Error('超时'))
      case 'ENOTFOUND':
        return Promise.reject(new Error('未连接'))
      default:
        return Promise.reject(err)
    }
  })
  return requestObj
}

/**
 * 取消HTTP请求
 * @param {Object} requestObj - 请求对象
 */
export const cancelHttp = (requestObj) => {
  if (!requestObj || !requestObj.abort) return
  requestObj.abort()
}

/**
 * 处理deflateRaw压缩
 * @param {Buffer} data - 数据
 */
const handleDeflateRaw = (data) =>
  new Promise((resolve, reject) => {
    deflateRaw(data, (err, buf) => {
      if (err) return reject(err)
      resolve(buf)
    })
  })

/**
 * 核心数据获取函数
 * @param {string} url - 请求URL
 * @param {string} method - 请求方法
 * @param {Object} options - 请求选项
 * @param {Function} callback - 回调函数
 */
const fetchData = async (url, method, options, callback) => {
  const { headers = {}, format = 'json', timeout = DEFAULT_TIMEOUT, ...restOptions } = options

  console.log('---start---', url)

  const requestHeaders = Object.assign({}, headers)

  // 处理特殊头部
  if (requestHeaders[bHh]) {
    const path = url.replace(/^https?:\/\/[\w.:]+\//, '/')
    let s = Buffer.from(bHh, 'hex').toString()
    s = s.replace(s.substr(-1), '')
    s = Buffer.from(s, 'base64').toString()
    let v = process.versions.app
      .split('-')[0]
      .split('.')
      .map((n) => (n.length < 3 ? n.padStart(3, '0') : n))
      .join('')
    let v2 = process.versions.app.split('-')[1] || ''
    requestHeaders[s] =
      !s ||
      `${(await handleDeflateRaw(Buffer.from(JSON.stringify(`${path}${v}`.match(regx), null, 1).concat(v)).toString('base64'))).toString('hex')}&${parseInt(v)}${v2}`
    delete requestHeaders[bHh]
  }

  return request(
    url,
    {
      ...restOptions,
      method,
      headers: Object.assign({}, defaultHeaders, requestHeaders),
      timeout,
      agent: getRequestAgent(url),
      json: format === 'json'
    },
    (err, resp, body) => {
      if (err) return callback(err, null)
      callback(null, resp, body)
    }
  )
}

/**
 * 通用HTTP请求
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @param {Function} cb - 回调函数
 */
export const http = (url, options, cb) => {
  if (typeof options === 'function') {
    cb = options
    options = {}
  }

  if (options.method == null) options.method = 'get'

  debugRequest && console.log(`\n---send request------${url}------------`)
  return fetchData(url, options.method, options, (err, resp, body) => {
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    }
    cb(err, resp, body)
  })
}

/**
 * HTTP GET请求
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @param {Function} callback - 回调函数
 */
export const httpGet = (url, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  debugRequest && console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'get', options, function (err, resp, body) {
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    }
    callback(err, resp, body)
  })
}

/**
 * HTTP POST请求
 * @param {string} url - 请求URL
 * @param {*} data - 请求数据
 * @param {Object} options - 请求选项
 * @param {Function} callback - 回调函数
 */
export const httpPost = (url, data, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }
  options.data = data

  debugRequest && console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'post', options, function (err, resp, body) {
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    }
    callback(err, resp, body)
  })
}

/**
 * HTTP JSONP请求
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 * @param {Function} callback - 回调函数
 */
export const http_jsonp = (url, options, callback) => {
  if (typeof options === 'function') {
    callback = options
    options = {}
  }

  let jsonpCallback = 'jsonpCallback'
  if (url.indexOf('?') < 0) url += '?'
  url += `&${options.jsonpCallback}=${jsonpCallback}`

  options.format = 'script'

  debugRequest && console.log(`\n---send request-------${url}------------`)
  return fetchData(url, 'get', options, function (err, resp, body) {
    debugRequest && console.log(`\n---response------${url}------------`)
    debugRequest && console.log(body)
    if (err) {
      debugRequest && console.log(JSON.stringify(err))
    } else {
      body = JSON.parse(body.replace(new RegExp(`^${jsonpCallback}\\(({.*})\\)$`), '$1'))
    }

    callback(err, resp, body)
  })
}

/**
 * 检查URL可用性
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 */
export const checkUrl = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    fetchData(url, 'head', options, (err, resp) => {
      if (err) return reject(err)
      if (resp.statusCode === 200) {
        resolve()
      } else {
        reject(new Error(resp.statusCode))
      }
    })
  })
}
