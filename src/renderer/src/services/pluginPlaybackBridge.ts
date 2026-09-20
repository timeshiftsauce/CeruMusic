import { assertContentPage, assertResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import type { ContentEntity, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import type { Router } from 'vue-router'
import { toAppTrack, toPluginTrack } from '@common/pluginMusic'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { PlayMode } from '@renderer/types/audio'

export const pluginPlaybackMethods = [
  'services.player.getState',
  'services.player.play',
  'services.player.pause',
  'services.player.next',
  'services.player.previous',
  'services.player.seek',
  'services.player.setVolume',
  'services.player.setMode',
  'services.queue.get',
  'services.queue.append',
  'services.queue.replace',
  'services.queue.remove',
  'services.queue.reorder'
] as const

let queueRevision = crypto.randomUUID()

export function markPluginQueueChanged(): void {
  queueRevision = crypto.randomUUID()
}

const sameRef = (a: ResourceRef | undefined, b: ResourceRef) =>
  !!a &&
  a.pluginId === b.pluginId &&
  a.providerId === b.providerId &&
  a.kind === b.kind &&
  a.id === b.id &&
  a.connectionId === b.connectionId

/** Main has already checked player.control and the calling plugin's resource ownership. */
export async function handlePluginPlayback(method: string, args: unknown[]): Promise<unknown> {
  const store = LocalUserDetailStore()
  if (!store.initialization) store.init()
  const currentRef = useGlobalPlayStatusStore().player.songInfo?.pluginResource
  const queueState = () => ({
    items: store.list.map((song) => toPluginTrack(song)),
    currentIndex: currentRef
      ? store.list.findIndex((song) => sameRef(song.pluginResource, currentRef))
      : -1,
    revision: queueRevision
  })
  if (method === 'services.queue.get') return queueState()
  if (method.startsWith('services.queue.')) {
    if (useListenTogetherStore().isInRoom) throw new Error('请先退出一起听，再修改本地播放队列')
    if (method === 'services.queue.remove') {
      const refs = args[0] as ResourceRef[]
      store.list = store.list.filter(
        (song) => !refs.some((ref) => sameRef(song.pluginResource, ref))
      )
    } else if (method === 'services.queue.reorder') {
      if (args[1] !== queueRevision) throw new Error('播放队列已变化，请重新读取后再排序')
      const refs = args[0] as ResourceRef[]
      if (refs.length !== store.list.length) throw new Error('排序必须包含当前队列的全部歌曲')
      const reordered = refs.map((ref) =>
        store.list.find((song) => sameRef(song.pluginResource, ref))
      )
      if (reordered.some((song) => !song)) throw new Error('排序包含不在当前队列中的歌曲')
      store.list = reordered as any[]
    } else {
      const items = args[0] as ContentEntity[]
      assertContentPage({ items })
      if (items.some((item) => item.ref.kind !== 'track')) throw new Error('播放队列只接收歌曲')
      const incoming = items.map(toAppTrack)
      store.list = method === 'services.queue.replace' ? incoming : [...store.list, ...incoming]
      const seen = new Set<string>()
      store.list = store.list.filter((song) => {
        const ref = song.pluginResource
        const key = JSON.stringify([ref?.pluginId, ref?.providerId, ref?.connectionId, ref?.id])
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
    }
    queueRevision = crypto.randomUUID()
    return queueState()
  }
  const audio = ControlAudioStore().Audio
  const playback = await import('@renderer/utils/audio/globaPlayList')
  if (method === 'services.player.getState') {
    const mode = playback.playMode.value
    const currentSong = useGlobalPlayStatusStore().player.songInfo
    return {
      status: audio.isPlay ? 'playing' : currentRef ? 'paused' : 'idle',
      track: currentSong ? toPluginTrack(currentSong) : null,
      positionMs: Math.round((audio.currentTime || 0) * 1000),
      durationMs: Math.round((audio.duration || 0) * 1000),
      volume: Math.max(0, Math.min(1, (audio.volume || 0) / 100)),
      muted: !!audio.audio?.muted,
      repeat: mode === PlayMode.SINGLE ? 'one' : mode === PlayMode.SEQUENCE ? 'all' : 'off',
      shuffle: mode === PlayMode.RANDOM
    }
  }
  if (method === 'services.player.play') {
    if (args[0] == null) {
      await playback.handlePlay()
      return null
    }
    assertResourceRef(args[0])
    const ref = args[0]
    const song = store.list.find((item) => sameRef(item.pluginResource, ref))
    if (!song) throw new Error('歌曲不在播放队列中，请先添加歌曲')
    await playback.playSong(song)
    return null
  }
  if (method === 'services.player.pause') await playback.handlePause()
  else if (method === 'services.player.next') await playback.playNext()
  else if (method === 'services.player.previous') await playback.playPrevious()
  else if (method === 'services.player.seek') playback.seekTo(Number(args[0]) / 1000)
  else if (method === 'services.player.setVolume') {
    const volume = Number(args[0])
    if (!Number.isFinite(volume) || volume < 0 || volume > 1)
      throw new Error('音量必须在 0 到 1 之间')
    playback.setVolume(Math.round(volume * 100))
  } else if (method === 'services.player.setMode') {
    const mode = (args[0] ?? {}) as any
    if (mode.shuffle === true) playback.playMode.value = PlayMode.RANDOM
    else if (mode.repeat === 'one') playback.playMode.value = PlayMode.SINGLE
    else if (mode.repeat === 'all' || mode.shuffle === false)
      playback.playMode.value = PlayMode.SEQUENCE
    if (typeof mode.muted === 'boolean' && audio.audio) audio.audio.muted = mode.muted
  } else throw new Error('不支持的插件播放操作')
  return null
}

/** Standard playlist navigation. Platform-specific playlist metadata stays with the provider. */
export async function openPluginPlaylist(
  router: Router,
  ref: ResourceRef,
  details: {
    title?: string
    author?: string
    cover?: string
    total?: number | string
    description?: string
  } = {}
): Promise<void> {
  assertResourceRef(ref)
  if (ref.kind !== 'playlist') throw new Error('只能打开歌单资源')
  await router.push({
    name: 'list',
    params: { id: ref.id },
    query: { ...details, source: ref.providerId, resourceRef: JSON.stringify(ref) }
  })
}

/** Preserve opaque provider data across navigation, reloads and playlist pagination. */
export function readPluginPlaylistRef(
  serialized: unknown,
  id: unknown,
  source: unknown
): ResourceRef | undefined {
  if (serialized === undefined) return undefined
  if (typeof serialized !== 'string') throw new Error('无效的歌单资源')
  const ref: unknown = JSON.parse(serialized)
  assertResourceRef(ref)
  if (ref.kind !== 'playlist' || ref.id !== id || ref.providerId !== source)
    throw new Error('歌单资源与页面不匹配')
  return ref
}
