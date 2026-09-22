import { songKey, selectSong } from '@common/musicItem'
import { mapSongsToCloud } from '@renderer/utils/playlist/cloudList'
import { Request, unwrap } from '@renderer/utils/request'
import { base64ToFile, isBase64 } from '@renderer/utils/file'
import config from '@common/api/config.json'

// Define types locally or export them
export interface CloudSongList {
  id: string
  name: string
  describe: string
  cover: string
  filePath: string
  localId: string
  updatedAt: string
}

export interface SongListTypeDto {
  type: string
  size: string
}

export interface CloudSongDto {
  songmid: string
  hash?: string
  name: string
  singer: string
  albumName: string
  albumId: string
  source: string
  interval: string
  img: string
  types: SongListTypeDto[]
  pos?: number
}

export interface CreateUserSongListDto {
  localId: string
  name: string
  describe: string
  cover?: string | File
  songlist: CloudSongDto[]
}

export interface UpdateUserSongListDto {
  listId: string
  localId?: string
  name?: string
  describe?: string
  cover?: string | File
  songlist?: CloudSongDto[]
}

const API_URL = config.baseUrl[0].url
const request = new Request(API_URL)

const BASE_URL = '/user-songlist'
let capabilityCache: { value: boolean; until: number } | undefined
async function supportsIdentity(): Promise<boolean> {
  if (capabilityCache && capabilityCache.until > Date.now()) return capabilityCache.value
  let value: boolean
  try {
    value = (await unwrap<any>(request.get(`${BASE_URL}/capabilities`))).songIdentity >= 2
  } catch (error: any) {
    if (error.status !== 404) throw error
    value = false
  }
  capabilityCache = { value, until: Date.now() + 60_000 }
  return value
}
function assertLegacyIdentities(songs: any[]) {
  const ids = new Map<string, string>()
  for (const song of songs) {
    const mid = String(song.songmid),
      key = songKey(song)
    if (ids.has(mid) && ids.get(mid) !== key)
      throw new Error('当前云端不支持同 ID 的不同来源歌曲，请升级后端；本地歌曲已保留')
    ids.set(mid, key)
  }
}
async function prepareCloudSongs(songs: any[], listId?: string): Promise<any[]> {
  const normalized = mapSongsToCloud(songs)
  if (!(await supportsIdentity())) {
    if (normalized.some((song) => song.pluginResource)) {
      throw new Error('当前云端不支持保存私有歌曲引用，请升级后端；本地歌曲已保留')
    }
    const existing = listId ? (await cloudSongListAPI.getSongListDetail(listId, 'asc')).list : []
    assertLegacyIdentities([...existing, ...normalized])
  }
  return normalized
}

export const cloudSongListAPI = {
  // 获取用户的所有歌单
  getUserSongLists: () => {
    return unwrap<CloudSongList[]>(request.get(BASE_URL))
  },

  // 获取歌单详情
  getSongListDetail: (id: string, sort: 'asc' | 'desc' = 'asc', limit?: number, pos?: number) => {
    if (!id) throw new Error('List ID is required')
    return unwrap<{ list: CloudSongDto[]; total: number }>(
      request.get(`${BASE_URL}/list`, {
        params: { id, sort, limit, pos }
      })
    )
  },

  // 创建歌单
  createUserSongList: async (data: CreateUserSongListDto) => {
    data = { ...data, songlist: await prepareCloudSongs(data.songlist) }
    const formData = new FormData()
    formData.append('localId', data.localId)
    formData.append('name', data.name)
    formData.append('describe', data.describe || '')

    if (data.cover) {
      // 鉴黄拦截
      try {
        const { checkImageIsSafe } = await import('@renderer/utils/nsfwCheck')
        const isSafe = await checkImageIsSafe(data.cover)
        if (!isSafe) {
          throw new Error('歌单封面包含违规内容，请更换图片')
        }
      } catch (e: any) {
        if (e.message && e.message.includes('违规内容')) {
          return Promise.reject(e)
        }
        console.warn('NSFW 图片检测流程异常或跳过', e)
      }

      if (typeof data.cover === 'string') {
        console.log('data.cover', data.cover, isBase64(data.cover))
        if (isBase64(data.cover)) {
          // Convert base64 to file and append
          formData.append('cover', base64ToFile(data.cover, 'cover.png'))
        } else if (data.cover.startsWith('blob:')) {
          try {
            const res = await fetch(data.cover)
            const blob = await res.blob()
            formData.append('cover', blob, 'cover.png')
          } catch (e) {
            console.error('Failed to fetch blob cover', e)
          }
        } else {
          formData.append('cover', data.cover.trim())
        }
      } else {
        formData.append('cover', data.cover)
      }
    }

    // JSON stringify songlist
    formData.append('songlist', JSON.stringify(data.songlist))

    return unwrap<CloudSongList>(request.post(BASE_URL, formData))
  },

  // 更新歌单
  updateUserSongList: async (data: UpdateUserSongListDto) => {
    if (data.songlist) data = { ...data, songlist: await prepareCloudSongs(data.songlist) }
    const formData = new FormData()
    formData.append('listId', data.listId)
    if (data.localId) formData.append('localId', data.localId)
    if (data.name) formData.append('name', data.name)
    if (data.describe) formData.append('describe', data.describe)

    if (data.cover) {
      // 鉴黄拦截
      try {
        const { checkImageIsSafe } = await import('@renderer/utils/nsfwCheck')
        const isSafe = await checkImageIsSafe(data.cover)
        if (!isSafe) {
          throw new Error('歌单封面包含违规内容，请更换图片')
        }
      } catch (e: any) {
        if (e.message && e.message.includes('违规内容')) {
          return Promise.reject(e)
        }
        console.warn('NSFW 图片检测流程异常或跳过', e)
      }

      if (typeof data.cover === 'string') {
        if (isBase64(data.cover)) {
          // Convert base64 to file and append
          formData.append('cover', base64ToFile(data.cover, 'cover.png'))
        } else if (data.cover.startsWith('blob:')) {
          try {
            const res = await fetch(data.cover)
            const blob = await res.blob()
            formData.append('cover', blob, 'cover.png')
          } catch (e) {
            console.error('Failed to fetch blob cover', e)
          }
        } else {
          formData.append('cover', data.cover.trim())
        }
      } else {
        formData.append('cover', data.cover)
      }
    }

    if (data.songlist) {
      formData.append('songlist', JSON.stringify(data.songlist))
    }

    return unwrap<{ id: string; updatedAt: string }>(request.patch(BASE_URL, formData))
  },

  // 删除歌单
  deleteUserSongList: (id: string) => {
    return unwrap(
      request.delete(BASE_URL, {
        data: { listId: id }
      })
    )
  },

  // 添加歌曲到歌单
  addSongsToList: async (id: string, songs: CloudSongDto[]) => {
    songs = await prepareCloudSongs(songs, id)
    return unwrap<{ updatedAt: string }>(
      request.patch(`${BASE_URL}/list`, {
        id,
        songs
      })
    )
  },

  // 从歌单删除歌曲
  removeSongsFromList: async (id: string, songmids: string[]) => {
    const modern = await supportsIdentity()
    const existing = (await cloudSongListAPI.getSongListDetail(id, 'asc')).list
    const selected = songmids.map((id) => selectSong(existing as any[], id)).filter(Boolean)
    if (!modern) {
      assertLegacyIdentities(existing)
      songmids = selected.map((song) => String(song!.songmid))
    }
    return unwrap<{ updatedAt: string }>(
      request.delete(`${BASE_URL}/list`, {
        data: {
          id,
          ...(modern ? { songKeys: selected.map(songKey) } : { songmids })
        }
      })
    )
  }
}
