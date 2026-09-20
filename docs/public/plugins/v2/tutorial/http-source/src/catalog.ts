import type { PluginContext, ResourceRef, TrackProvider } from '@shiqianjiang/ceru-plugin-sdk'
import type { Api } from './network'
import { readOffset, toTrack, type SearchResponse } from './api'

import { toLyrics, type LyricsResponse } from './lyrics'

function readTrackId(ref: ResourceRef, pluginId: string): string {
  if (
    ref.pluginId !== pluginId ||
    ref.providerId !== 'tutorial-source' ||
    ref.kind !== 'track' ||
    !ref.id
  )
    throw new Error('这不是本音源创建的歌曲引用')
  return ref.id
}

export function registerCatalog(ctx: PluginContext, api: Api) {
  const tracks = {
    async search(request, operation) {
      const offset = readOffset(request.cursor)
      await api.allowLocal(operation)
      const result = await api.client.get<SearchResponse>('tracks', {
        operation,
        query: {
          q: request.query.trim(),
          limit: Math.max(1, Math.min(request.limit, 50)),
          offset
        }
      })
      return {
        items: result.items.map((track) => toTrack(ctx.plugin.id, track)),
        nextCursor: result.nextOffset == null ? undefined : String(result.nextOffset)
      }
    },
    async resolve(resource, quality, operation) {
      let id: string
      try {
        id = readTrackId(resource, ctx.plugin.id)
      } catch {
        return ctx.playback.failure({ code: 'NOT_FOUND', message: '歌曲引用不属于本音源' })
      }
      if (quality && quality !== 'lossless') {
        return ctx.playback.failure({ code: 'UNSUPPORTED', message: '演示服务仅提供 WAV 音频' })
      }
      await api.allowLocal(operation)
      await api.client.authorize('source.http', new URL(api.baseURL).origin, operation)
      return {
        ok: true,
        url: new URL('tracks/' + encodeURIComponent(id) + '/stream', api.baseURL).href
      }
    },
    async lyrics(resource, operation) {
      const id = readTrackId(resource, ctx.plugin.id)
      await api.allowLocal(operation)
      const result = await api.client.get<LyricsResponse>(
        'tracks/' + encodeURIComponent(id) + '/lyrics',
        { operation }
      )
      return toLyrics(resource, result)
    }
  } satisfies TrackProvider

  ctx.providers.register('tutorial-source', { tracks })
  return tracks
}
