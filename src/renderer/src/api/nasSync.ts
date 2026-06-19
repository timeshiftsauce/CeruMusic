import { useSettingsStore } from '@renderer/store/Settings'
import type {
  CloudSongDto,
  CloudSongList,
  CreateUserSongListDto,
  UpdateUserSongListDto
} from '@renderer/api/cloudSongList'
import type {
  CeruFavoriteMutationResult,
  CeruFavoriteSyncPage,
  CeruPlaylistFavorite,
  CeruPlaylistFavoriteMutationInput
} from '@ceru/shared-contract'

export type NasSyncSession = {
  accessToken: string
  expiresAt: number
  user: {
    id: string
    username: string
    nickname?: string
    email?: string
  }
}

type RequestOptions = {
  method?: string
  token?: string
  body?: unknown
}

type NasSyncConfig = {
  enabled?: boolean
  serverUrl?: string
  accessToken?: string
  status?: 'connected' | 'disconnected'
  [key: string]: unknown
}

let cachedNasPluginId = ''

const normalizeBaseUrl = (serverUrl?: string) => (serverUrl || '').trim().replace(/\/+$/, '')

const findNasSyncPluginId = async () => {
  if (cachedNasPluginId) return cachedNasPluginId
  const plugins = await window.api.plugins.loadAllPlugins().catch(() => [])
  if (!Array.isArray(plugins)) return ''

  const plugin = plugins.find((item: any) => item?.pluginType === 'service' && item?.serviceRole === 'nas-sync')
  if (plugin?.pluginId) {
    cachedNasPluginId = plugin.pluginId
    return cachedNasPluginId
  }
  return ''
}

const getPluginNasConfig = async (): Promise<NasSyncConfig | null> => {
  const pluginId = await findNasSyncPluginId()
  if (!pluginId) return null
  const result = await window.api.plugins.getConfig(pluginId).catch(() => null)
  return result?.data || null
}

const getLegacyNasConfig = (): NasSyncConfig => {
  const settings = useSettingsStore().settings
  return {
    enabled: settings.nasSyncEnabled,
    serverUrl: settings.nasSyncServerUrl,
    accessToken: settings.nasSyncToken,
    status: settings.nasSyncStatus
  }
}

const getNasConfig = async () => {
  const pluginConfig = await getPluginNasConfig()
  return pluginConfig || getLegacyNasConfig()
}

export const canUseNasSync = async () => {
  const config = await getNasConfig()
  return Boolean(config.enabled && config.serverUrl && config.accessToken)
}

export const getNasSyncLastRevision = () => {
  const raw = localStorage.getItem('ceru_nas_sync_last_revision') || '0'
  const value = Number(raw)
  return Number.isFinite(value) ? value : 0
}

export const setNasSyncLastRevision = (revision: number) => {
  if (!Number.isFinite(revision)) return
  localStorage.setItem('ceru_nas_sync_last_revision', String(Math.max(0, Math.floor(revision))))
}

const unwrapNasResponse = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => null)
  if (!response.ok || body?.success === false) {
    throw new Error(body?.error || `NAS 同步服务请求失败：${response.status}`)
  }
  if (body?.success === true && 'data' in body) {
    return body.data as T
  }
  return body as T
}

const requestNas = async <T>(endpoint: string, options: RequestOptions = {}) => {
  const config = await getNasConfig()
  const baseUrl = normalizeBaseUrl(config.serverUrl)
  if (!baseUrl) throw new Error('请先填写 NAS 同步服务器地址')

  const response = await fetch(`${baseUrl}${endpoint}`, {
    method: options.method || 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(options.token || config.accessToken
        ? { Authorization: `Bearer ${options.token || config.accessToken}` }
        : {})
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })

  return unwrapNasResponse<T>(response)
}

const normalizePlaylistFavoritePage = (payload: unknown): CeruFavoriteSyncPage<CeruPlaylistFavorite> => {
  const data = payload as
    | CeruPlaylistFavorite[]
    | {
        items?: CeruPlaylistFavorite[]
        revision?: number
        updatedAt?: string
      }
  const items = Array.isArray(data) ? data : data.items || []
  return {
    items: items.filter((item) => item.playlistId),
    revision: Array.isArray(data) ? undefined : data.revision,
    updatedAt: Array.isArray(data) ? undefined : data.updatedAt
  }
}

const coverToString = (cover: string | File | undefined) => (typeof cover === 'string' ? cover : undefined)

export const nasSyncAPI = {
  health: () => requestNas<{ status: string; service: string }>('/health', { token: '' }),
  me: () => requestNas<NasSyncSession['user']>('/me'),
  pair: (pairCode: string) => requestNas<NasSyncSession>('/auth/pair', { method: 'POST', token: '', body: { pairCode } }),
  sync: (sinceRevision: number) => requestNas<{ revision: number; events: unknown[] }>(`/sync?sinceRevision=${sinceRevision}`)
}

export const nasCloudSongListAPI = {
  getUserSongLists: () => requestNas<CloudSongList[]>('/user-songlist'),
  getSongListDetail: (id: string, sort: 'asc' | 'desc' = 'asc', limit?: number, pos?: number) => {
    const params = new URLSearchParams({ id, sort })
    if (typeof limit === 'number') params.set('limit', String(limit))
    if (typeof pos === 'number') params.set('pos', String(pos))
    return requestNas<{ list: CloudSongDto[]; total: number }>(`/user-songlist/list?${params.toString()}`)
  },
  createUserSongList: (data: CreateUserSongListDto) =>
    requestNas<{ id: string; updatedAt: string; revision?: number }>('/user-songlist', {
      method: 'POST',
      body: {
        localId: data.localId,
        name: data.name,
        describe: data.describe || '',
        cover: coverToString(data.cover),
        songlist: data.songlist
      }
    }),
  updateUserSongList: (data: UpdateUserSongListDto) =>
    requestNas<{ id: string; updatedAt: string; revision?: number }>('/user-songlist', {
      method: 'PATCH',
      body: {
        listId: data.listId,
        localId: data.localId,
        name: data.name,
        describe: data.describe,
        cover: coverToString(data.cover),
        songlist: data.songlist
      }
    }),
  deleteUserSongList: (id: string) =>
    requestNas('/user-songlist', {
      method: 'DELETE',
      body: { listId: id }
    }),
  addSongsToList: (id: string, songs: CloudSongDto[]) =>
    requestNas<{ updatedAt: string; revision?: number }>('/user-songlist/list', {
      method: 'PATCH',
      body: { id, songs }
    }),
  removeSongsFromList: (id: string, songmids: string[]) =>
    requestNas<{ updatedAt: string; revision?: number }>('/user-songlist/list', {
      method: 'DELETE',
      body: { id, songmids }
    })
}

export const nasFavoriteAPI = {
  listPlaylistFavorites: async () => normalizePlaylistFavoritePage(await requestNas<unknown>('/playlist-favorites')),
  favoritePlaylist: (input: CeruPlaylistFavoriteMutationInput) =>
    requestNas<CeruFavoriteMutationResult>('/playlist-favorites', { method: 'POST', body: input }),
  unfavoritePlaylist: (playlistId: string) =>
    requestNas<CeruFavoriteMutationResult>('/playlist-favorites', {
      method: 'DELETE',
      body: { playlistId }
    })
}

export const getPreferredSongListAPI = async () => (await canUseNasSync() ? nasCloudSongListAPI : null)
export const getPreferredFavoriteAPI = async () => (await canUseNasSync() ? nasFavoriteAPI : null)
