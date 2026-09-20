import { assertContentPage, assertResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import type { ContentEntity, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import type { Router } from 'vue-router'
import { toAppTrack, toPluginTrack } from '@common/pluginMusic'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

export const pluginPlaybackMethods = ['services.queue.replace', 'services.player.play'] as const

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
  if (method === 'services.queue.replace') {
    const items = args[0] as ContentEntity[]
    assertContentPage({ items })
    if (items.some((item) => item.ref.kind !== 'track')) throw new Error('播放队列只接收歌曲')
    const { useListenTogetherStore } = await import('@renderer/store/ListenTogether')
    if (useListenTogetherStore().isInRoom) throw new Error('请先退出一起听，再替换本地播放队列')
    const { useGlobalPlayStatusStore } = await import('@renderer/store/GlobalPlayStatus')
    const currentRef = useGlobalPlayStatusStore().player.songInfo?.pluginResource
    const seen = new Set<string>()
    store.list = items
      .filter((item) => {
        const key = JSON.stringify([
          item.ref.pluginId,
          item.ref.providerId,
          item.ref.connectionId,
          item.ref.id
        ])
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .map(toAppTrack)
    return {
      items: store.list.map((song) => toPluginTrack(song)),
      currentIndex: currentRef
        ? store.list.findIndex((song) => sameRef(song.pluginResource, currentRef))
        : -1,
      revision: crypto.randomUUID()
    }
  }
  if (method === 'services.player.play') {
    const playback = await import('@renderer/utils/audio/globaPlayList')
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
  throw new Error('不支持的插件播放操作')
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
