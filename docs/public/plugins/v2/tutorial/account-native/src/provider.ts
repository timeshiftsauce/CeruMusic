import {
  assertResourceRef,
  type ContentEntity,
  type JsonValue,
  type OperationContext,
  type PluginContext,
  type ResourceRef,
} from '@shiqianjiang/ceru-plugin-sdk'
import type { AccountController } from './account'
import {
  CONNECTION_ID,
  cursorOffset,
  fault,
  PAGE_SIZE,
  playlists,
  PROVIDER_ID,
  tracks,
  type PlaylistRecord,
  type TrackRecord,
} from './data'

export type Catalog = {
  resource(kind: 'track' | 'playlist', id: string): ResourceRef
  trackEntity(track: TrackRecord): ContentEntity
  playlistEntity(playlist: PlaylistRecord): ContentEntity
  ownedRef(value: unknown, kind: 'track' | 'playlist'): ResourceRef
}

export function createCatalog(ctx: PluginContext, account: AccountController): Catalog {
  const resource = (kind: 'track' | 'playlist', id: string): ResourceRef => ({
    pluginId: ctx.plugin.id,
    providerId: PROVIDER_ID,
    connectionId: CONNECTION_ID,
    kind,
    id,
    data: { catalog: 'tutorial-v1' },
  })

  const trackEntity = (track: TrackRecord): ContentEntity => ({
    ref: resource('track', track.id),
    title: track.title,
    subtitle: track.artist,
    playable: true,
    durationMs: track.durationMs,
    capabilities: ['play'],
    metadata: {
      artists: [track.artist],
      album: { title: track.album },
      durationMs: track.durationMs,
      qualities: ['128k', '320k'],
    },
  })

  const playlistEntity = (playlist: PlaylistRecord): ContentEntity => ({
    ref: resource('playlist', playlist.id),
    title: playlist.title,
    subtitle: playlist.description,
    capabilities: ['open', 'import'],
    playlist: {
      description: playlist.description,
      author: account.getSession()?.displayName ?? '演示账号',
      trackCount: playlist.trackIds.length,
    },
  })

  const ownedRef = (value: unknown, kind: 'track' | 'playlist') => {
    assertResourceRef(value)
    if (
      value.pluginId !== ctx.plugin.id ||
      value.providerId !== PROVIDER_ID ||
      value.connectionId !== CONNECTION_ID ||
      value.kind !== kind
    ) {
      throw fault('资源不属于当前插件与账号连接', 'NOT_FOUND')
    }
    return value
  }

  return { resource, trackEntity, playlistEntity, ownedRef }
}

export function registerProvider(
  ctx: PluginContext,
  account: AccountController,
  catalog: Catalog,
) {
  ctx.effects.add(
    ctx.providers.register(PROVIDER_ID, {
      tracks: {
        async search(request, operation) {
          operation.signal.throwIfAborted()
          account.requireAccount()
          const query = request.query.trim().toLocaleLowerCase()
          const items = tracks
            .filter((item) => `${item.title} ${item.artist}`.toLocaleLowerCase().includes(query))
            .slice(0, Math.max(1, Math.min(request.limit, 20)))
            .map(catalog.trackEntity)
          return { items, totalEstimate: items.length }
        },
        async resolve(ref, quality, operation) {
          operation.signal.throwIfAborted()
          account.requireAccount()
          if (quality && !['128k', '320k'].includes(quality)) {
            return ctx.playback.failure({ code: 'UNSUPPORTED', message: '不支持该音质' })
          }
          const track = tracks.find((item) => item.id === catalog.ownedRef(ref, 'track').id)
          if (!track) return ctx.playback.failure({ code: 'NOT_FOUND', message: '歌曲不存在' })
          return {
            ok: true,
            url: `http://127.0.0.1:43130/audio/${encodeURIComponent(track.id)}.wav`,
            expiresAt: Date.now() + 60_000,
          }
        },
      },
      playlists: {
        async list(_resource, cursor, operation) {
          operation.signal.throwIfAborted()
          account.requireAccount()
          const offset = cursorOffset(cursor)
          const items = playlists.slice(offset, offset + PAGE_SIZE).map(catalog.playlistEntity)
          return {
            items,
            totalEstimate: playlists.length,
            ...(offset + items.length < playlists.length
              ? { nextCursor: String(offset + items.length) }
              : {}),
          }
        },
        async get(ref, cursor, operation) {
          operation.signal.throwIfAborted()
          account.requireAccount()
          const playlist = playlists.find(
            (item) => item.id === catalog.ownedRef(ref, 'playlist').id,
          )
          if (!playlist) throw fault('歌单不存在', 'NOT_FOUND')
          const offset = cursorOffset(cursor)
          const pageIds = playlist.trackIds.slice(offset, offset + PAGE_SIZE)
          const items = pageIds
            .map((id) => tracks.find((item) => item.id === id))
            .filter((item): item is TrackRecord => !!item)
            .map(catalog.trackEntity)
          return {
            name: playlist.title,
            playlist: catalog.playlistEntity(playlist).playlist,
            items,
            totalEstimate: playlist.trackIds.length,
            ...(offset + items.length < playlist.trackIds.length
              ? { nextCursor: String(offset + items.length) }
              : {}),
          }
        },
      },
    }),
  )

  ctx.effects.add(
    ctx.playlistImporters.register('tutorial-playlist', {
      async getTracks(request, operation) {
        account.requireAccount()
        const playlist = playlists.find((item) => item.id === request.value.trim())
        if (!playlist) throw fault('请输入 demo-favorites 或 demo-evening', 'NOT_FOUND')
        const offset = cursorOffset(request.cursor)
        const size = Math.max(1, Math.min(request.limit, 100))
        const items = playlist.trackIds
          .slice(offset, offset + size)
          .map((id) => tracks.find((item) => item.id === id))
          .filter((item): item is TrackRecord => !!item)
          .map(catalog.trackEntity)
        operation.signal.throwIfAborted()
        return {
          name: playlist.title,
          playlist: catalog.playlistEntity(playlist).playlist,
          items,
          totalEstimate: playlist.trackIds.length,
          ...(offset + items.length < playlist.trackIds.length
            ? { nextCursor: String(offset + items.length) }
            : {}),
        }
      },
    }),
  )
}

export async function playTracks(
  ctx: PluginContext,
  account: AccountController,
  catalog: Catalog,
  value: JsonValue,
  operation: OperationContext,
) {
  account.requireAccount()
  const input = value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
  const values = Array.isArray(input?.refs) ? input.refs : input?.ref ? [input.ref] : []
  const refs = values.map((item) => catalog.ownedRef(item, 'track'))
  if (!refs.length) throw fault('没有可播放的歌曲', 'NOT_FOUND')

  let grant = await ctx.permissions.query({ key: 'playback' })
  if (grant.status !== 'granted') {
    grant = await ctx.permissions.request({ key: 'playback', intent: operation.userIntent })
  }
  if (grant.status !== 'granted') throw fault('请允许插件控制播放', 'PERMISSION_DENIED')

  const items = refs
    .map((ref) => tracks.find((item) => item.id === ref.id))
    .filter((item): item is TrackRecord => !!item)
    .map(catalog.trackEntity)
  if (!items.length) throw fault('歌曲不存在', 'NOT_FOUND')

  const call = { permissionKey: 'playback', operation }
  await ctx.queue.replace(items, call)
  await ctx.player.play(refs[0], call)
  return null
}
