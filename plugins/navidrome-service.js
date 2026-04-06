/**
 * CeruMusic Navidrome 服务插件
 *
 * 通过 Subsonic API 连接 Navidrome 服务器，
 * 将服务器上的歌单和音乐导入到 CeruMusic 本地歌单。
 *
 * @name Navidrome 音乐服务
 * @author CeruMusic
 * @version 1.0.0
 * @description 连接 Navidrome/Subsonic 服务器，将歌单导入到本地播放
 */

const SUBSONIC_API_VERSION = '1.16.1'
const CLIENT_NAME = 'CeruMusic'

const pluginInfo = {
  name: 'Navidrome 音乐服务',
  version: '1.0.0',
  author: 'CeruMusic',
  description: '连接 Navidrome/Subsonic 兼容服务器，将歌单导入到本地播放'
}

const configSchema = [
  {
    key: 'serverUrl',
    label: '服务器地址',
    type: 'text',
    required: true,
    placeholder: 'http://192.168.1.100:4533'
  },
  {
    key: 'username',
    label: '用户名',
    type: 'text',
    required: true,
    placeholder: '请输入 Navidrome 用户名'
  },
  {
    key: 'password',
    label: '密码',
    type: 'password',
    required: true,
    placeholder: '请输入密码'
  }
]

// ==================== 工具函数 ====================

/**
 * 生成随机 salt
 */
function generateSalt(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let result = ''
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return result
}

/**
 * 构造 Subsonic API 认证参数
 * 使用 salt+token 方式: t=md5(password+salt), s=salt
 */
function getAuthParams(config) {
  const salt = generateSalt(12)
  const token = cerumusic.utils.crypto.md5(config.password + salt)
  return `u=${encodeURIComponent(config.username)}&t=${token}&s=${salt}&v=${SUBSONIC_API_VERSION}&c=${CLIENT_NAME}&f=json`
}

/**
 * 构造完整的 API URL
 * endpoint 中可以用 & 附带额外参数，如 'getPlaylist&id=xxx'
 */
function buildApiUrl(config, endpoint) {
  const baseUrl = config.serverUrl.replace(/\/+$/, '')
  // 将 endpoint 中的额外参数拆出来，确保放在 ? 之后
  const parts = endpoint.split('&')
  const endpointName = parts[0]
  const extraParams = parts.slice(1).join('&')
  let url = baseUrl + '/rest/' + endpointName + '?' + getAuthParams(config)
  if (extraParams) {
    url += '&' + extraParams
  }
  return url
}

/**
 * 构造流媒体 URL（用于播放）
 */
function buildStreamUrl(config, songId) {
  return buildApiUrl(config, `stream&id=${songId}`)
}

/**
 * 构造封面图片 URL
 */
function buildCoverArtUrl(config, coverId, size) {
  let url = buildApiUrl(config, `getCoverArt&id=${coverId}`)
  if (size) {
    url += `&size=${size}`
  }
  return url
}

/**
 * 发起 Subsonic API 请求
 */
async function apiRequest(config, endpoint) {
  const url = buildApiUrl(config, endpoint)

  return new Promise((resolve, reject) => {
    cerumusic.request(url, { method: 'GET', timeout: 15000 }, (error, result) => {
      if (error) {
        reject(new Error('请求失败: ' + error.message))
        return
      }

      if (!result || result.statusCode !== 200) {
        reject(new Error('HTTP 错误: ' + (result ? result.statusCode : 'unknown')))
        return
      }

      const body = result.body
      if (!body) {
        reject(new Error('响应为空'))
        return
      }

      // Subsonic API 响应格式
      const response = body['subsonic-response']
      if (!response) {
        reject(new Error('无效的 Subsonic 响应格式'))
        return
      }

      if (response.status === 'failed') {
        const err = response.error
        reject(new Error(err ? `[${err.code}] ${err.message}` : '请求失败'))
        return
      }

      resolve(response)
    })
  })
}

/**
 * 格式化时长（秒 -> m:ss）
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

/**
 * 通过 getLyricsBySongId 获取同步歌词 (OpenSubsonic 扩展)
 * 返回 LRC 格式字符串，优先返回 synced 歌词
 */
async function fetchLyricsBySongId(config, songId) {
  try {
    const response = await apiRequest(config, 'getLyricsBySongId&id=' + songId)
    const lyricsList = response.lyricsList
    if (!lyricsList || !lyricsList.structuredLyrics) return null

    const structured = lyricsList.structuredLyrics
    const items = Array.isArray(structured) ? structured : [structured]

    // 优先选 synced 歌词
    let synced = null
    let plain = null
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.synced && !synced) synced = item
      if (!item.synced && !plain) plain = item
    }

    const chosen = synced || plain
    if (!chosen || !chosen.line || chosen.line.length === 0) return null

    const lines = Array.isArray(chosen.line) ? chosen.line : [chosen.line]

    if (chosen.synced) {
      // 转成 LRC 格式
      const lrcLines = []
      for (let j = 0; j < lines.length; j++) {
        const line = lines[j]
        const startMs = line.start || 0
        const totalSec = Math.floor(startMs / 1000)
        const min = Math.floor(totalSec / 60)
        const sec = totalSec % 60
        const ms = Math.floor((startMs % 1000) / 10)
        const tag =
          '[' +
          String(min).padStart(2, '0') +
          ':' +
          String(sec).padStart(2, '0') +
          '.' +
          String(ms).padStart(2, '0') +
          ']'
        lrcLines.push(tag + (line.value || ''))
      }
      return lrcLines.join('\n')
    } else {
      // 纯文本，也包成 LRC（每行间隔4秒）
      const lrcLines = []
      for (let k = 0; k < lines.length; k++) {
        const totalSec = k * 4
        const min = Math.floor(totalSec / 60)
        const sec = totalSec % 60
        const tag = '[' + String(min).padStart(2, '0') + ':' + String(sec).padStart(2, '0') + '.00]'
        lrcLines.push(tag + (lines[k].value || ''))
      }
      return lrcLines.join('\n')
    }
  } catch {
    return null
  }
}

// ==================== 插件方法 ====================

/**
 * 测试连接
 */
async function testConnection(config) {
  try {
    if (!config.serverUrl) {
      return { success: false, message: '请填写服务器地址' }
    }
    if (!config.username) {
      return { success: false, message: '请填写用户名' }
    }
    if (!config.password) {
      return { success: false, message: '请填写密码' }
    }

    const response = await apiRequest(config, 'ping')

    if (response.status === 'ok') {
      let message = '连接成功!'
      if (response.serverVersion) {
        message += ` 服务器版本: ${response.serverVersion}`
      }
      return { success: true, message }
    }

    return { success: false, message: '连接失败: 未知错误' }
  } catch (error) {
    return { success: false, message: '连接失败: ' + error.message }
  }
}

/**
 * 获取歌单列表
 */
async function getPlaylists(config) {
  const response = await apiRequest(config, 'getPlaylists')
  const playlists = response.playlists?.playlist || []

  if (!Array.isArray(playlists)) {
    // 单个歌单时可能不是数组
    return playlists ? [mapPlaylist(config, playlists)] : []
  }

  return playlists.map(function (pl) {
    return mapPlaylist(config, pl)
  })
}

function mapPlaylist(config, pl) {
  return {
    id: String(pl.id),
    name: pl.name || '未命名歌单',
    songCount: pl.songCount || 0,
    coverImg: pl.coverArt ? buildCoverArtUrl(config, pl.coverArt, 200) : '',
    description: pl.comment || ''
  }
}

/**
 * 获取歌单中的歌曲
 */
async function getPlaylistSongs(config, playlistId) {
  const response = await apiRequest(config, 'getPlaylist&id=' + playlistId)
  const playlist = response.playlist
  if (!playlist) {
    return { songs: [], total: 0 }
  }

  const entries = playlist.entry || []
  const songList = Array.isArray(entries) ? entries : entries ? [entries] : []

  const songs = songList.map(function (song) {
    return {
      name: song.title || song.name || '未知歌曲',
      singer: song.artist || '未知歌手',
      albumName: song.album || '',
      albumId: String(song.albumId || ''),
      interval: formatDuration(song.duration),
      img: song.coverArt ? buildCoverArtUrl(config, song.coverArt, 300) : '',
      source: 'navidrome',
      songmid: 'navidrome_' + song.id,
      url: buildStreamUrl(config, song.id),
      types: ['navidrome'],
      _types: { navidrome: { size: song.size || 0 } },
      lrc: null
    }
  })

  return {
    songs: songs,
    total: songs.length
  }
}

/**
 * 异步获取单首歌曲的歌词（播放时按需调用）
 * 使用 OpenSubsonic getLyricsBySongId 接口获取带时间戳的同步歌词
 */
async function getLyric(config, songInfo) {
  // 从 songmid 中提取原始 navidrome song id
  const songmid = songInfo.songmid || ''
  const navId = String(songmid).replace('navidrome_', '')
  if (!navId) return { lyric: '' }

  const lrc = await fetchLyricsBySongId(config, navId)
  return { lyric: lrc || '' }
}

module.exports = {
  pluginInfo: pluginInfo,
  pluginType: 'service',
  sources: [],
  configSchema: configSchema,
  testConnection: testConnection,
  getPlaylists: getPlaylists,
  getPlaylistSongs: getPlaylistSongs,
  getLyric: getLyric
}
