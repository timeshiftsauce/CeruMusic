import { desktopBridge } from '@renderer/services/desktopBridge'
import songListAPI from '@renderer/api/songList'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import { useAuthStore } from '@renderer/store/Auth'
import { playlistImporters, libraryRevision } from '@renderer/services/pluginState'
import { toAppTrack } from '@common/pluginMusic'
import { songKey } from '@common/musicItem'
import { mapSongsToCloud } from '@renderer/utils/playlist/cloudList'
import { exportPlaylistToFile } from '@renderer/utils/playlist/playlistExportImport'
import type { OperationInputs } from '@shiqianjiang/ceru-plugin-sdk'

type Name = Extract<keyof OperationInputs, `playlist.${string}`>
const unwrap = (result: any) => {
  if (!result?.success) throw Error(result?.error || '歌单操作失败')
  return result.data
}
const changed = () => {
  libraryRevision.value++
  window.dispatchEvent(new Event('playlist-updated'))
}

/** Runs after the main-process hook pipeline; never enters it a second time. */
export async function performPlaylistTool(
  name: Name,
  input: OperationInputs[Name],
  signal: AbortSignal | undefined,
  pickImporter: () => Promise<string | null>
): Promise<null> {
  const check = () => signal?.throwIfAborted()
  const requireAccount = () => {
    if (!useAuthStore().isAuthenticated) throw Error('请先登录澜音')
  }
  check()
  if (name === 'playlist.create' && 'location' in input) {
    if (input.location === 'cloud') {
      requireAccount()
      await cloudSongListAPI.createUserSongList(
        { localId: crypto.randomUUID(), name: input.name, describe: '', songlist: [] },
        signal
      )
    } else unwrap(await songListAPI.create(input.name, '', 'local'))
    changed()
    return null
  }
  if (name === 'playlist.import' && 'value' in input) {
    const id = input.importerId ?? (await pickImporter())
    check()
    if (!id) return null
    const importer = playlistImporters.value.find((item) => item.publicId === id)
    if (!importer) throw Error('所选歌单导入器已停用或不存在')
    const tracks = new Map<string, any>(),
      seen = new Set<string>()
    let cursor: string | undefined,
      label = importer.title,
      description = '',
      artwork = ''
    do {
      check()
      if (!playlistImporters.value.some((item) => item.publicId === id))
        throw Error('歌单导入器已停用')
      const result = await desktopBridge.api.plugins.importerTracks(
        importer.pluginId,
        importer.id,
        { value: input.value, cursor, limit: 100 }
      )
      check()
      label = result.name || label
      description = result.playlist?.description || description
      artwork = result.playlist?.artworkUrl || artwork
      for (const item of result.items) tracks.set(JSON.stringify(item.ref), toAppTrack(item))
      cursor = result.nextCursor
      if (cursor && seen.has(cursor)) throw Error('插件返回了重复的分页游标')
      if (cursor) seen.add(cursor)
      if (seen.size > 1000 || tracks.size > 100000) throw Error('歌单过大，请分批导入')
    } while (cursor)
    if (!tracks.size) return null
    check()
    const created = unwrap(
      await songListAPI.create(label + ' (导入)', description, importer.providerId || 'local', {
        playlistId: input.value,
        pluginId: importer.pluginId,
        importerId: importer.id
      })
    )
    try {
      check()
      unwrap(await songListAPI.addSongs(created.id, [...tracks.values()]))
      check()
      if (artwork) unwrap(await songListAPI.updateCover(created.id, artwork))
    } catch (error) {
      unwrap(await songListAPI.delete(created.id))
      throw error
    }
    changed()
    return null
  }
  if (!('playlist' in input)) throw Error('无效的歌单操作')
  const target = input.playlist
  const local = target.location === 'cloud' ? null : unwrap(await songListAPI.getById(target.id))
  const cloudId =
    target.location === 'cloud'
      ? target.id
      : target.location === 'both'
        ? local?.meta?.cloudId
        : null
  if (target.location !== 'cloud' && (!local || local.name !== target.name))
    throw Error('歌单已更改，请重新选择')
  if (target.location !== 'local') {
    requireAccount()
    if (!cloudId) throw Error('未找到对应的云端歌单')
    const cloud = (await cloudSongListAPI.getUserSongLists()).find((item) => item.id === cloudId)
    if (!cloud || (target.location === 'cloud' && cloud.name !== target.name))
      throw Error('云端歌单已更改，请重新选择')
  }
  check()
  if (name === 'playlist.delete') {
    if (cloudId) await cloudSongListAPI.deleteUserSongList(cloudId, signal)
    check()
    if (local) unwrap(await songListAPI.delete(local.id))
    changed()
    return null
  }
  if (name === 'playlist.export' && 'format' in input) {
    const songs: any[] = local ? unwrap(await songListAPI.getSongs(local.id)) : []
    if (!local) {
      let offset = 0
      while (true) {
        check()
        const page = await cloudSongListAPI.getSongListDetail(cloudId, 'asc', 100, offset)
        songs.push(...page.list)
        offset += page.list.length
        if (page.list.length < 100 || offset >= page.total) break
        if (offset >= 100000) throw Error('歌单过大，请分批导出')
      }
    }
    check()
    const portable = songs.filter((song) => song.source !== 'local')
    if (!portable.length) throw Error('歌单中没有可导出的歌曲')
    const safeName = target.name.replace(/[\\/:*?"<>|]+/g, '_')
    await exportPlaylistToFile(portable, `CeruMusic-${safeName}.${input.format}`, input.format)
    return null
  }
  if (!('tracks' in input)) throw Error('无效的歌单操作')
  const songs = input.tracks.map((item) =>
    toAppTrack({ ...item, ref: { ...item.ref, scope: 'provider' } })
  )
  if (!songs.length) return null
  const adding = name === 'playlist.addTracks'
  if (local) {
    check()
    unwrap(
      adding
        ? await songListAPI.addSongs(local.id, songs)
        : await songListAPI.removeSongs(local.id, songs.map(songKey))
    )
    changed()
  }
  check()
  if (cloudId) {
    if (adding) await cloudSongListAPI.addSongsToList(cloudId, mapSongsToCloud(songs), signal)
    else await cloudSongListAPI.removeSongsFromList(cloudId, songs.map(songKey), signal)
    changed()
  }
  return null
}
