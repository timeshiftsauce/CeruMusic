import type { JsonObject, LibraryPlaylist } from '@shiqianjiang/ceru-plugin-sdk'
import type { PluginDescriptor } from './pluginDescriptor'

export type PlaylistSectionContext = { pageId: string; playlist: LibraryPlaylist }

export function playlistSectionProps(
  descriptor: PluginDescriptor,
  surfaceId: string,
  context: PlaylistSectionContext
): JsonObject {
  if (
    descriptor.runtime !== 3 ||
    !descriptor.pages.some(
      (page) =>
        page.id === context?.pageId && page.mount === 'playlist-section' && page.view === surfaceId
    )
  )
    throw Error('插件未声明此歌单区块')
  const playlist = context.playlist,
    reference = playlist?.ref
  if (
    !reference ||
    typeof reference.id !== 'string' ||
    !/^[a-zA-Z0-9_-]{1,128}$/.test(reference.id) ||
    !['local', 'cloud'].includes(reference.location) ||
    typeof playlist.name !== 'string' ||
    typeof playlist.writable !== 'boolean'
  )
    throw Error('歌单上下文无效')
  const summary: JsonObject = {
    ref: { id: reference.id, location: reference.location },
    name: playlist.name.slice(0, 256),
    writable: playlist.writable
  }
  if (typeof playlist.description === 'string')
    summary.description = playlist.description.slice(0, 2048)
  if (
    typeof playlist.trackCount === 'number' &&
    Number.isSafeInteger(playlist.trackCount) &&
    playlist.trackCount >= 0
  )
    summary.trackCount = playlist.trackCount
  return { playlist: summary }
}
