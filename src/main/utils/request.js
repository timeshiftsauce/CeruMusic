import axios from 'axios'
import { bHh } from './musicSdk/options'
import { deflateRaw } from 'zlib'
import { HttpsProxyAgent, HttpProxyAgent } from 'hpagent'

// 常量定义
const DEFAULT_TIMEOUT = 15000
const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Linux; Android 6.0; Nexus 5 Build/MRA58N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Mobile Safari/537.36'
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
  let proxyUrl
  if (proxy.enable && proxy.host) {
    const auth = proxy.username && proxy.password ? `${proxy.username}:${proxy.password}@` : ''
    proxyUrl = `http://${auth}${proxy.host}:${proxy.port}`
  } else if (proxy.envProxy) {
    proxyUrl = `http://${proxy.envProxy.host}:${proxy.envProxy.port}`
  }

  if (proxyUrl) {
    return httpsRxp.test(url)
      ? new HttpsProxyAgent({ proxy: proxyUrl })
      : new HttpProxyAgent({ proxy: proxyUrl })
  }
  return undefined
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
    cancelToken: axios.CancelToken.source(),
    cancelHttp: () => {
      if (obj.isCancelled) return
      obj.isCancelled = true
      obj.cancelToken.cancel('已取消')
    }
  }

  obj.promise = new Promise(async (resolve, reject) => {
    try {
      debugRequest && console.log(`\n---send request------${url}------------`)
      const response = await fetchData(url, options.method, {
        ...options,
        cancelToken: obj.cancelToken.token
      })
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(response.data)
      resolve(response)
    } catch (err) {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(err.message)
      reject(err)
    }
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
    if (axios.isCancel(err)) {
      return Promise.reject(new Error('已取消'))
    }
    if (err.code === 'ECONNABORTED' || err.message.includes('timeout')) {
      return Promise.reject(new Error('超时'))
    }
    if (err.code === 'ENOTFOUND') {
      return Promise.reject(new Error('未连接'))
    }
    if (err.message === 'socket hang up') {
      return Promise.reject(new Error('无法请求'))
    }
    return Promise.reject(err)
  })
  return requestObj
}

/**
 * 取消HTTP请求
 * @param {Object} requestObj - 请求对象
 */
export const cancelHttp = (requestObj) => {
  if (!requestObj || !requestObj.cancelHttp) return
  requestObj.cancelHttp()
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
 */
const fetchData = async (url, method = 'get', options = {}) => {
  const {
    headers = {},
    format = 'json',
    timeout = DEFAULT_TIMEOUT,
    data,
    body,
    form,
    formData,
    cancelToken,
    ...restOptions
  } = options

  console.log('---start---', url)

  const requestHeaders = Object.assign({}, defaultHeaders, headers)

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

  // 处理请求数据
  let requestData = data || body || form || formData

  // 处理表单数据
  if (form || formData) {
    if (form) {
      requestHeaders['Content-Type'] = 'application/x-www-form-urlencoded'
      if (typeof form === 'object') {
        requestData = new URLSearchParams(form).toString()
      }
    }
  }

  const axiosConfig = {
    method: method.toLowerCase(),
    url,
    headers: requestHeaders,
    timeout,
    httpsAgent: getRequestAgent(url),
    httpAgent: getRequestAgent(url),
    ...restOptions
  }

  // 添加取消令牌
  if (cancelToken) {
    axiosConfig.cancelToken = cancelToken
  }

  // 根据方法添加数据
  if (['post', 'put', 'patch'].includes(method.toLowerCase()) && requestData) {
    axiosConfig.data = requestData
  } else if (['get', 'delete'].includes(method.toLowerCase()) && requestData) {
    axiosConfig.params = requestData
  }

  // 处理响应格式
  if (format !== 'json') {
    axiosConfig.responseType = format === 'script' ? 'text' : format
  } else {
    // 对于可能需要原始数据的请求，使用 arraybuffer
    if (url.includes('newlyric.kuwo.cn')) {
      axiosConfig.responseType = 'arraybuffer'
    }
  }

  try {
    const response = await axios(axiosConfig)

    // 处理不同类型的响应数据
    let bodyData = response.data
    let rawData

    if (axiosConfig.responseType === 'arraybuffer') {
      rawData = Buffer.from(response.data)
      // 尝试解析为 JSON，如果失败则保持原始数据
      try {
        bodyData = JSON.parse(rawData.toString())
      } catch {
        bodyData = rawData.toString()
      }
    } else {
      rawData = Buffer.isBuffer(response.data)
        ? response.data
        : Buffer.from(
            typeof response.data === 'string' ? response.data : JSON.stringify(response.data)
          )
    }

    return {
      statusCode: response.status,
      headers: response.headers,
      body: bodyData,
      data: bodyData,
      raw: rawData
    }
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const err = new Error(error.message)
      err.code = error.code
      err.response = error.response
      throw err
    }
    throw error
  }
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

  fetchData(url, options.method, options)
    .then((resp) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(resp.body)
      cb(null, resp, resp.body)
    })
    .catch((err) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(JSON.stringify(err))
      cb(err, null, null)
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

  fetchData(url, 'get', options)
    .then((resp) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(resp.body)
      callback(null, resp, resp.body)
    })
    .catch((err) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(JSON.stringify(err))
      callback(err, null, null)
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

  fetchData(url, 'post', options)
    .then((resp) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(resp.body)
      callback(null, resp, resp.body)
    })
    .catch((err) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(JSON.stringify(err))
      callback(err, null, null)
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

  options.format = 'text'

  debugRequest && console.log(`\n---send request-------${url}------------`)

  fetchData(url, 'get', options)
    .then((resp) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(resp.body)
      try {
        const body = JSON.parse(
          resp.body.replace(new RegExp(`^${jsonpCallback}\\(({.*})\\)$`), '$1')
        )
        callback(null, resp, body)
      } catch (err) {
        callback(err, resp, null)
      }
    })
    .catch((err) => {
      debugRequest && console.log(`\n---response------${url}------------`)
      debugRequest && console.log(JSON.stringify(err))
      callback(err, null, null)
    })
}

/**
 * 检查URL可用性
 * @param {string} url - 请求URL
 * @param {Object} options - 请求选项
 */
export const checkUrl = (url, options = {}) => {
  return new Promise((resolve, reject) => {
    fetchData(url, 'head', options)
      .then((resp) => {
        if (resp.statusCode === 200) {
          resolve()
        } else {
          reject(new Error(resp.statusCode))
        }
      })
      .catch((err) => {
        reject(err)
      })
  })
}
