import { Request } from '@renderer/utils/request'
import { base64ToFile, isBase64 } from '@renderer/utils/file'

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

const API_URL = 'https://api.ceru.shiqianjiang.cn/api'
const request = new Request(API_URL)

const BASE_URL = '/user-songlist'

const unwrap = async <T>(promise: Promise<any>): Promise<T> => {
  const res = await promise
  if (res && typeof res === 'object' && 'data' in res && 'code' in res) {
    return res.data
  }
  return res
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
    const formData = new FormData()
    formData.append('localId', data.localId)
    formData.append('name', data.name)
    formData.append('describe', data.describe || '')

    if (data.cover) {
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

    return unwrap<{ id: string; updatedAt: string }>(request.post(BASE_URL, formData))
  },

  // 更新歌单
  updateUserSongList: async (data: UpdateUserSongListDto) => {
    const formData = new FormData()
    formData.append('listId', data.listId)
    if (data.localId) formData.append('localId', data.localId)
    if (data.name) formData.append('name', data.name)
    if (data.describe) formData.append('describe', data.describe)

    if (data.cover) {
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
  addSongsToList: (id: string, songs: CloudSongDto[]) => {
    return unwrap<{ updatedAt: string }>(
      request.patch(`${BASE_URL}/list`, {
        id,
        songs
      })
    )
  },

  // 从歌单删除歌曲
  removeSongsFromList: (id: string, songmids: string[]) => {
    return unwrap<{ updatedAt: string }>(
      request.delete(`${BASE_URL}/list`, {
        data: {
          id,
          songmids
        }
      })
    )
  }
}
