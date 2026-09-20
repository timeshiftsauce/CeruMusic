import type { ContentEntity, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import { toAppTrack, toPluginTrack } from '@common/pluginMusic'
import songListAPI from '@renderer/api/songList'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore, type SettingsState } from '@renderer/store/Settings'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { useAudioOutputStore } from '@renderer/store/audioOutput'
import { useDlnaStore } from '@renderer/store/dlna'

const PUBLIC_SETTINGS = new Set<keyof SettingsState>([
  'showFloatBall',
  'autoCacheMusic',
  'filenameTemplate',
  'autoImportPlaylistOnOpen',
  'suppressImportPrompt',
  'lyricFontFamily',
  'lyricFontSize',
  'FullPlayLyricFontRate',
  'lyricFontWeight',
  'theme',
  'isDarkMode',
  'followSystemTheme',
  'springFestivalDisabled',
  'routePreloadEnabled',
  'macStatusBarLyricEnabled'
])

const HISTORY_KEY = 'ceru-plugin-playback-history-v1'
const HISTORY_LIMIT = 200

const unwrap = (result: any) => {
  if (!result?.success) throw new Error(result?.error || result?.message || '操作失败')
  return result.data
}

const taskStatus = (status: string) => {
  const statuses: Record<string, string> = {
    queued: 'queued',
    downloading: 'running',
    paused: 'paused',
    completed: 'completed',
    error: 'failed',
    cancelled: 'cancelled'
  }
  const mapped = statuses[status]
  if (!mapped) throw new Error('未知下载状态')
  return mapped
}

export const toPluginDownloadTask = (task: any) => ({
  id: task.id,
  track: toPluginTrack(task.songInfo),
  status: taskStatus(task.status),
  receivedBytes: Number(task.downloadedSize) || 0,
  ...(Number(task.totalSize) > 0 ? { totalBytes: Number(task.totalSize) } : {}),
  ...(task.error ? { error: { code: 'DOWNLOAD_FAILED', message: String(task.error) } } : {})
})

const sameRef = (song: any, ref: ResourceRef) => {
  const resource = song?.pluginResource
  return resource
    ? resource.pluginId === ref.pluginId &&
        resource.providerId === ref.providerId &&
        resource.id === ref.id
    : String(song?.songmid) === ref.id && song?.source === ref.providerId
}

function historyItems(): ContentEntity[] {
  try {
    const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]')
    return Array.isArray(value) ? value.slice(0, HISTORY_LIMIT) : []
  } catch {
    return []
  }
}

export function recordPluginHistory(song: any): void {
  if (!song || song.songmid == null || !song.source) return
  const item = toPluginTrack(song) as ContentEntity
  const items = historyItems().filter(
    (existing) => !sameRef({ pluginResource: existing.ref }, item.ref)
  )
  localStorage.setItem(HISTORY_KEY, JSON.stringify([item, ...items].slice(0, HISTORY_LIMIT)))
}

const lyricTimestamp = (milliseconds: number) => {
  const total = Math.max(0, Math.round(milliseconds))
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const fraction = String(total % 1000).padStart(3, '0')
  return `[${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}.${fraction}]`
}

const lyricsToLrc = (lyrics: any): string => {
  if (typeof lyrics?.plainText === 'string' && !lyrics.lines?.length) return lyrics.plainText
  if (!Array.isArray(lyrics?.lines)) throw new Error('歌词格式无效')
  return lyrics.lines
    .map(
      (line: any) =>
        `${lyricTimestamp(Number(line.startTimeMs) + (Number(lyrics.offsetMs) || 0))}${String(line.text || '')}`
    )
    .join('\n')
}

export function getPluginRoomState() {
  const room = useListenTogetherStore()
  return room.meta
    ? {
        joined: true,
        id: room.meta.code,
        title: room.meta.name,
        role: room.myRole === 'owner' ? 'owner' : 'member',
        members: room.members.length
      }
    : { joined: false }
}

export function getPluginDevices() {
  const local = useAudioOutputStore()
  const dlna = useDlnaStore()
  return [
    ...local.devices.map((device) => ({
      id: 'local:' + device.deviceId,
      name: device.label,
      kind: 'local' as const,
      available: true
    })),
    ...dlna.devices.map((device: any) => ({
      id: 'dlna:' + (device.location || device.id),
      name: device.name || device.friendlyName || 'DLNA',
      kind: 'dlna' as const,
      available: true
    }))
  ]
}

export function getPluginPublicSettings(): Record<string, unknown> {
  const settings = useSettingsStore().settings
  return Object.fromEntries([...PUBLIC_SETTINGS].map((key) => [key, settings[key]]))
}

export async function handlePluginHostService(method: string, args: any[]): Promise<any> {
  if (method === 'services.history.list') {
    const items = historyItems()
    const offset = Math.max(0, Number.parseInt(String(args[0] ?? '0'), 10) || 0)
    const page = items.slice(offset, offset + 50)
    return {
      items: page,
      totalEstimate: items.length,
      ...(offset + page.length < items.length ? { nextCursor: String(offset + page.length) } : {})
    }
  }
  if (method.startsWith('services.favorites.')) {
    const favoritesId = await window.api.songList.getFavoritesId()
    if (!favoritesId) throw new Error('尚未创建我喜欢的音乐歌单')
    const refs = args[0] as ResourceRef[]
    if (method.endsWith('.contains'))
      return Promise.all(
        refs.map(async (ref) => !!unwrap(await songListAPI.hasSong(favoritesId, ref.id)))
      )
    if (method.endsWith('.add')) {
      const queue = LocalUserDetailStore().list
      const songs = refs.map((ref) => {
        const song = queue.find((item) => sameRef(item, ref))
        if (!song) throw new Error('收藏歌曲不在当前队列中')
        return song
      })
      unwrap(await songListAPI.addSongs(favoritesId, songs))
      return null
    }
    unwrap(
      await songListAPI.removeSongs(
        favoritesId,
        refs.map((ref) => ref.id)
      )
    )
    return null
  }
  if (method.startsWith('services.downloads.')) {
    const name = method.slice('services.downloads.'.length)
    if (name === 'create') {
      const request = args[0] ?? {}
      const queue = LocalUserDetailStore().list
      const local = await window.api.localMusic.getList()
      const history = historyItems().map(toAppTrack)
      const songs = (request.tracks as ResourceRef[]).map((ref) => {
        const song = [...queue, ...local, ...history].find((item) => sameRef(item, ref))
        if (!song) throw new Error(`无法解析下载歌曲: ${ref.id}`)
        return song
      })
      const settings = useSettingsStore().settings
      const results = await window.api.music.requestSdk('downloadBatchSongs', {
        source: songs[0]?.source,
        tasks: songs.map((song, index) => {
          const ref = request.tracks[index] as ResourceRef
          const quality =
            request.quality ||
            song.types?.[0]?.type ||
            song.types?.[0] ||
            song.pluginResource?.data?.quality ||
            '128k'
          return {
            pluginId: ref.pluginId,
            source: ref.providerId,
            quality,
            path: request.internalDirectoryPath,
            songInfo: { ...song, template: settings.filenameTemplate || '%t - %s' },
            tagWriteOptions: settings.tagWriteOptions,
            lazy: false
          }
        })
      })
      const created = results.filter((result: any) => result.success).map(toPluginDownloadTask)
      if (!created.length) throw new Error(results[0]?.error || '创建下载任务失败')
      return created
    }
    const tasks = await window.api.download.getTasks()
    if (name === 'list') return tasks.map(toPluginDownloadTask)
    if (name === 'reveal') {
      const task = tasks.find((item: any) => item.id === args[0])
      if (!task) throw new Error('下载任务不存在')
      await window.api.download.openFileLocation(task.filePath)
      return null
    }
    const ids = args[0] as string[]
    for (const id of ids) {
      if (!tasks.some((task: any) => task.id === id)) throw new Error('下载任务不存在')
      if (name === 'pause') await window.api.download.pauseTask(id)
      else if (name === 'resume') await window.api.download.resumeTask(id)
      else if (name === 'cancel') await window.api.download.cancelTask(id)
      else if (name === 'retry') await window.api.download.retryTask(id)
      else throw new Error('不支持的下载操作')
    }
    return null
  }
  if (method.startsWith('services.localMusic.')) {
    const name = method.slice('services.localMusic.'.length)
    if (name === 'list') {
      const songs = await window.api.localMusic.getList()
      const offset = Math.max(0, Number(args[0]) || 0)
      const items = songs.slice(offset, offset + 100).map((song: any) => toPluginTrack(song))
      return {
        items,
        totalEstimate: songs.length,
        ...(offset + items.length < songs.length
          ? { nextCursor: String(offset + items.length) }
          : {})
      }
    }
    if (name === 'scan') {
      await window.api.localMusic.scan(args[0])
      return { taskId: crypto.randomUUID() }
    }
    if (name === 'getTags') return (await window.api.localMusic.getTags(args[0].id, true)) ?? {}
    if (name === 'writeTags') {
      const songs = await window.api.localMusic.getList()
      const song = songs.find((item: any) => String(item.songmid) === String(args[0].id))
      if (!song?.path) throw new Error('本地歌曲不存在')
      const tags = args[1] ?? {}
      const result = await window.api.localMusic.writeTags(
        song.path,
        {
          ...song,
          name: tags.title ?? song.name,
          singer: tags.artists?.join('、') ?? song.singer,
          albumName: tags.album ?? song.albumName,
          lrc: tags.lyrics ? lyricsToLrc(tags.lyrics) : song.lrc
        },
        {
          basicInfo: true,
          lyrics: !!tags.lyrics,
          cover: false,
          downloadLyrics: false,
          lyricFormat: 'lrc'
        }
      )
      if (!result?.success) throw new Error(result?.message || '写入标签失败')
      return null
    }
  }
  if (method.startsWith('services.settings.')) {
    const store = useSettingsStore()
    if (method.endsWith('.get')) {
      if (!Array.isArray(args[0]) || args[0].length > 50) throw new Error('设置项列表无效')
      return Object.fromEntries(
        (args[0] as string[])
          .filter((key) => PUBLIC_SETTINGS.has(key as keyof SettingsState))
          .map((key) => [key, (store.settings as any)[key]])
      )
    }
    const values = args[0] ?? {}
    if (!values || typeof values !== 'object' || Array.isArray(values))
      throw new Error('设置值无效')
    if (JSON.stringify(values).length > 32_768) throw new Error('设置数据过大')
    if (Object.keys(values).some((key) => !PUBLIC_SETTINGS.has(key as keyof SettingsState)))
      throw new Error('包含不可由插件修改的设置')
    store.updateSettings(values)
    return null
  }
  if (method.startsWith('services.rooms.')) {
    const room = useListenTogetherStore()
    if (method.endsWith('.getState')) return getPluginRoomState()
    if (method.endsWith('.join')) {
      await room.resolveAndJoin(String(args[0]))
      return getPluginRoomState()
    }
    if (method.endsWith('.leave')) {
      room.leaveRoom()
      return null
    }
    if (method.endsWith('.requestTrack')) {
      const ref = args[0] as ResourceRef
      const song = LocalUserDetailStore().list.find((item) => sameRef(item, ref))
      if (!song) throw new Error('点播歌曲不在当前队列中')
      room.requestSong({
        songmid: String(song.songmid),
        source: song.source,
        name: song.name,
        singer: song.singer,
        cover: song.img,
        albumName: song.albumName
      })
      return null
    }
  }
  if (method.startsWith('services.devices.')) {
    const local = useAudioOutputStore()
    const dlna = useDlnaStore()
    if (method.endsWith('.list')) {
      await local.scanDevices()
      return getPluginDevices()
    }
    const id = String(args[0])
    if (id.startsWith('local:')) await local.setDevice(id.slice(6))
    else if (id.startsWith('dlna:')) {
      const target = id.slice(5)
      const device = dlna.devices.find((item: any) => (item.location || item.id) === target)
      if (!device) throw new Error('音频设备不可用')
      dlna.currentDevice = device
    } else throw new Error('音频设备不存在')
    return null
  }
  if (method === 'services.ai.generate') {
    const request = args[0] ?? {}
    const prompt = String(request.prompt || '')
    if (!prompt || prompt.length > 20_000)
      throw new Error('AI 提示词长度必须在 1 到 20000 字符之间')
    const limit = request.maxOutputChars == null ? 20_000 : Number(request.maxOutputChars)
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50_000)
      throw new Error('AI 输出上限必须在 1 到 50000 字符之间')
    const result = await window.api.ai.ask(prompt)
    const text = typeof result === 'string' ? result : (result?.text ?? result?.content)
    if (typeof text !== 'string') throw new Error('AI 服务返回了无效结果')
    return { text: text.slice(0, limit) }
  }
  if (method === 'services.window.control') throw new Error('迷你播放器模式尚未提供')
  throw new Error('尚未接入的宿主业务能力: ' + method)
}
