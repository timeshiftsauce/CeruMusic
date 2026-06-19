/**
 * CeruMusic NAS 同步服务插件
 *
 * 把部署在 NAS 上的多端同步服务作为澜音服务插件接入。
 *
 * @name NAS 多端同步
 * @author CeruMusic
 * @version 1.0.2
 * @description 连接你部署在 NAS 上的同步服务器，用于歌单备份与多端同步
 */

const pluginInfo = {
  name: 'NAS 多端同步',
  version: '1.0.2',
  author: 'CeruMusic',
  description: '连接你部署在 NAS 上的同步服务器，用于歌单备份与多端同步'
}

const configSchema = [
  {
    key: 'enabled',
    label: '启用 NAS 同步',
    type: 'switch',
    default: false
  },
  {
    key: 'serverUrl',
    label: 'NAS 同步服务器地址',
    type: 'text',
    required: true,
    placeholder: '填写你部署在 NAS 上的同步服务地址，例如 http://192.168.1.10:31231'
  },
  {
    key: 'pairCode',
    label: '登录绑定码',
    type: 'text',
    placeholder: '填写 NAS 同步服务端生成的一次性绑定码'
  }
]

function normalizeBaseUrl(serverUrl) {
  return String(serverUrl || '').trim().replace(/\/+$/, '')
}

async function requestNas(config, endpoint, options) {
  const baseUrl = normalizeBaseUrl(config.serverUrl)
  if (!baseUrl) throw new Error('请先填写 NAS 同步服务器地址')

  const opts = options || {}
  const headers = {
    Accept: 'application/json',
    'Content-Type': 'application/json'
  }
  if (opts.token !== '') {
    const token = opts.token || config.accessToken
    if (token) headers.Authorization = 'Bearer ' + token
  }

  return new Promise((resolve, reject) => {
    cerumusic.request(
      baseUrl + endpoint,
      {
        method: opts.method || 'GET',
        timeout: opts.timeout || 15000,
        headers: headers,
        body: opts.body ? JSON.stringify(opts.body) : undefined
      },
      (error, result) => {
        if (error) {
          reject(new Error(error.message || 'NAS 同步服务请求失败'))
          return
        }
        if (!result) {
          reject(new Error('NAS 同步服务无响应'))
          return
        }
        if (result.statusCode < 200 || result.statusCode >= 300) {
          const message = result.body && result.body.error ? result.body.error : 'NAS 同步服务请求失败'
          reject(new Error(message + '：' + result.statusCode))
          return
        }
        const body = result.body
        if (body && body.success === false) {
          reject(new Error(body.error || 'NAS 同步服务请求失败'))
          return
        }
        if (body && body.success === true && Object.prototype.hasOwnProperty.call(body, 'data')) {
          resolve(body.data)
          return
        }
        resolve(body)
      }
    )
  })
}

async function testConnection(config) {
  try {
    if (!config.serverUrl) {
      return { success: false, message: '请填写服务器地址' }
    }
    if (!config.accessToken) {
      await requestNas(config, '/health', { token: '' })
      return { success: false, message: '服务器可访问，请先登录 NAS 同步服务' }
    }

    await requestNas(config, '/me')
    return { success: true, message: 'NAS 同步服务已连接' }
  } catch (error) {
    return { success: false, message: error.message || 'NAS 同步服务未连接' }
  }
}

module.exports = {
  pluginInfo: pluginInfo,
  pluginType: 'service',
  serviceRole: 'nas-sync',
  sources: [],
  configSchema: configSchema,
  testConnection: testConnection
}
