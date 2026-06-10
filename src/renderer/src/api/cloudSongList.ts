import { Request, unwrap } from '@renderer/utils/request'
import { base64ToFile, isBase64 } from '@renderer/utils/file'
import config from '@common/api/config.json'

import type {
  CeruFavoriteMutationResult,
  CeruFavoriteSyncPage,
  CeruMusicSource,
  CeruPlaylistFavorite,
  CeruPlaylistFavoriteMutationInput,
} from '@ceru/shared-contract'

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

const PLAYLIST_FAVORITES_BASE_URL = '/playlist-favorites'

type BackendPlaylistFavorite = Partial<CeruPlaylistFavorite> & {
  playlist?: Partial<CeruPlaylistFavorite> & {
    id?: string
    name?: string
    title?: string
    describe?: string
    description?: string
    cover?: string
    coverUrl?: string
    filePath?: string
  }
  name?: string
  describe?: string
  cover?: string
  filePath?: string
}

const normalizePlaylistFavorite = (item: BackendPlaylistFavorite): CeruPlaylistFavorite => {
  const playlist = item.playlist || {}
  const playlistId = String(item.playlistId || playlist.id || item.id || '')
  return {
    id: String(item.id || playlistId),
    playlistId,
    sourcePlaylistId: item.sourcePlaylistId || playlist.sourcePlaylistId,
    source: (item.source || playlist.source) as CeruMusicSource | undefined,
    title: item.title || item.name || playlist.title || playlist.name || '未命名歌单',
    description: item.description || item.describe || playlist.description || playlist.describe || '',
    coverUrl: item.coverUrl || item.cover || item.filePath || playlist.coverUrl || playlist.cover || playlist.filePath,
    ownerName: item.ownerName || playlist.ownerName,
    createdAt: item.createdAt || playlist.createdAt,
    updatedAt: item.updatedAt || playlist.updatedAt,
    deletedAt: item.deletedAt || playlist.deletedAt || null,
    revision: item.revision || playlist.revision
  }
}

const normalizePlaylistFavoritePage = (payload: unknown): CeruFavoriteSyncPage<CeruPlaylistFavorite> => {
  const data = payload as
    | BackendPlaylistFavorite[]
    | {
        items?: BackendPlaylistFavorite[]
        list?: BackendPlaylistFavorite[]
        favorites?: BackendPlaylistFavorite[]
        data?: BackendPlaylistFavorite[]
        revision?: number
        updatedAt?: string
      }
  const items = Array.isArray(data)
    ? data
    : data.items || data.list || data.favorites || data.data || []
  return {
    items: items.map(normalizePlaylistFavorite).filter((item) => item.playlistId),
    revision: Array.isArray(data) ? undefined : data.revision,
    updatedAt: Array.isArray(data) ? undefined : data.updatedAt
  }
}

export const cloudFavoriteAPI = {
  listPlaylistFavorites: async () => {
    const payload = await unwrap<unknown>(request.get(PLAYLIST_FAVORITES_BASE_URL))
    return normalizePlaylistFavoritePage(payload)
  },

  favoritePlaylist: (input: CeruPlaylistFavoriteMutationInput) => {
    return unwrap<CeruFavoriteMutationResult>(request.post(PLAYLIST_FAVORITES_BASE_URL, input))
  },

  unfavoritePlaylist: (playlistId: string) => {
    return unwrap<CeruFavoriteMutationResult>(
      request.delete(PLAYLIST_FAVORITES_BASE_URL, {
        data: { playlistId }
      })
    )
  }
}
