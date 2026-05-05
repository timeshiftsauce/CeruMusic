import axios from 'axios'
import { Request, unwrap } from '@renderer/utils/request'

const API_URL = 'https://api.ceru.shiqianjiang.cn/api'
const request = new Request(API_URL)

const BASE = '/share'

/** 公开 GET（不需要登录），用于通过分享 deep-link 拉取分享元数据 */
function getPublicBase(): string {
  const isDev = process.env.NODE_ENV === 'development' && false
  return isDev ? 'http://localhost:8000/api' : API_URL
}

export interface PrecheckPayload {
  pluginMd5: string
}

export interface PrecheckResult {
  hasPlugin: boolean
}

export interface UploadPluginPayload {
  pluginCode: string
  md5: string
  type: 'cr' | 'lx'
}

export interface UploadPluginResult {
  ok: boolean
  message?: string
}

export interface ShareSongInfo {
  songmid: string | number
  hash?: string
  name: string
  singer: string
  albumName?: string
  albumId?: string | number
  source: string
  interval?: string
  img?: string
  types?: any[]
  _types?: Record<string, any>
  [key: string]: any
}

export interface ShareLyric {
  lrc?: string
  yrc?: string
  qrc?: string
  ttml?: string
  trans?: string
  format?: 'lrc' | 'yrc' | 'qrc' | 'ttml'
}

export interface ShareComment {
  userName: string
  avatar?: string
  text: string
  likedCount?: number
  timeStr?: string
  location?: string
}

export interface CreateSharePayload {
  pluginMd5: string
  source: string
  ttlDays: number
  quality?: string
  song: ShareSongInfo
  lyric?: ShareLyric
  hotComments?: ShareComment[]
}

export interface CreateShareResult {
  id: string
  url: string
  template: string
}

export interface ShareDetail {
  id: string
  username: string
  source: string
  quality?: string
  song: ShareSongInfo
  lyric?: ShareLyric
  hotComments?: ShareComment[]
  createdAt: number
  expiresAt: number
  audioUrl: string
  coverProxyUrl: string | null
}

export interface PlaylistShareSongInfo {
  songmid: string | number
  hash?: string
  name: string
  singer: string
  albumName: string
  albumId: string | number
  source: string
  interval: string
  img: string
  types: any[]
  pos?: number
}

export interface PlaylistShareDetail {
  id: string
  username: string
  allowWebPlayback: boolean
  canPlay: boolean
  playExpiresAt: number | null
  createdAt: number
  openInAppScheme: string
  playlist: {
    id: string
    name: string
    describe: string
    cover: string
    updatedAt: string
    total: number
    songs: PlaylistShareSongInfo[]
  }
}

export interface CreatePlaylistSharePayload {
  cloudPlaylistId: string
  allowWebPlayback: boolean
  ttlDays?: number
  pluginMd5?: string
  quality?: string
}

export interface CreatePlaylistShareResult {
  id: string
  url: string
  template: string
  playExpiresAt: number | null
}

const unwrapBody = <T>(body: any): T => {
  if (body && typeof body === 'object' && 'data' in body && 'code' in body) {
    return (body as any).data as T
  }
  return body as T
}

export const shareAPI = {
  /** 检查插件是否已存在于后端 */
  precheck: (payload: PrecheckPayload) =>
    unwrap<PrecheckResult>(request.post(`${BASE}/precheck`, payload)),

  /** 上传插件源码到后端 */
  uploadPlugin: (payload: UploadPluginPayload) =>
    unwrap<UploadPluginResult>(request.post(`${BASE}/upload-plugin`, payload)),

  /** 创建歌曲分享 */
  create: (payload: CreateSharePayload) =>
    unwrap<CreateShareResult>(request.post(`${BASE}/create`, payload)),

  /** 创建歌单分享 */
  createPlaylist: (payload: CreatePlaylistSharePayload) =>
    unwrap<CreatePlaylistShareResult>(request.post(`${BASE}/playlist/create`, payload)),

  /** 通过歌曲分享 id 获取分享元数据（公开接口，不需登录） */
  getById: async (id: string): Promise<ShareDetail> => {
    const res = await axios.get(`${getPublicBase()}${BASE}/${encodeURIComponent(id)}`, {
      timeout: 30000
    })
    return unwrapBody<ShareDetail>(res?.data)
  },

  /** 通过歌单分享 id 获取分享元数据（公开接口，不需登录，支持分页） */
  getPlaylistById: async (
    id: string,
    limit?: number,
    pos?: number
  ): Promise<PlaylistShareDetail> => {
    const params: Record<string, any> = {}
    if (limit !== undefined) params.limit = limit
    if (pos !== undefined) params.pos = pos
    const res = await axios.get(`${getPublicBase()}${BASE}/playlist/${encodeURIComponent(id)}`, {
      timeout: 30000,
      params
    })
    return unwrapBody<PlaylistShareDetail>(res?.data)
  }
}

export default shareAPI
