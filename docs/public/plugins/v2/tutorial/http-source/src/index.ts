import { definePlugin } from '@shiqianjiang/ceru-plugin-sdk'
import type { OperationContext } from '@shiqianjiang/ceru-plugin-sdk'
import {
  readOffset,
  readTrackId,
  toLyrics,
  toTrack,
  type LyricsResponse,
  type SearchResponse,
} from './api'

type TutorialConfig = { apiOrigin: string }

export default definePlugin(async (ctx) => {
  const config = await ctx.config.get<TutorialConfig>()
  const origin = new URL(config.apiOrigin)
  const baseURL = new URL('v1/', origin.href.endsWith('/') ? origin.href : `${origin.href}/`).href
  const client = ctx.http.create({
    baseURL,
    permissionKey: 'source.http',
    requestPermission: true,
  })

  async function allowPrivateNetwork(operation: OperationContext) {
    const isLocal = ['localhost', '127.0.0.1', '::1'].includes(origin.hostname)
    if (!isLocal) return
    let grant = await ctx.permissions.query({ key: 'source.private' })
    if (grant.status === 'prompt') {
      grant = await ctx.permissions.request({
        key: 'source.private',
        intent: operation.userIntent,
      })
    }
    if (grant.status !== 'granted') throw new Error('需要允许“访问本机模拟音乐服务”')
  }

  ctx.actions.register('source.check', async (_input, operation) => {
    await allowPrivateNetwork(operation)
    const result = await client.get<{ ok: boolean; tracks: number }>('health', { operation })
    await ctx.ui.toast({
      level: 'success',
      message: `演示服务已连接，共 ${result.tracks} 首歌`,
    })
    return result
  })

  ctx.providers.register('tutorial-source', {
    tracks: {
      async search(request, operation) {
        await allowPrivateNetwork(operation)
        const limit = Math.max(1, Math.min(request.limit, 50))
        const offset = readOffset(request.cursor)
        const result = await client.get<SearchResponse>('tracks', {
          operation,
          query: { q: request.query.trim(), limit, offset },
        })
        return {
          items: result.items.map((track) => toTrack(ctx.plugin.id, track)),
          nextCursor: result.nextOffset == null ? undefined : String(result.nextOffset),
        }
      },

      async resolve(resource, quality, operation) {
        try {
          await allowPrivateNetwork(operation)
          const id = readTrackId(resource, ctx.plugin.id)
          const selected = ['128k', '320k', 'lossless'].includes(quality ?? '')
            ? quality
            : '320k'
          return {
            ok: true,
            url: new URL(
              `tracks/${encodeURIComponent(id)}/stream?quality=${selected}`,
              baseURL,
            ).href,
          }
        } catch (error) {
          return ctx.playback.failure({
            code: 'NOT_FOUND',
            message: error instanceof Error ? error.message : '无法解析播放地址',
          })
        }
      },

      async lyrics(resource, operation) {
        await allowPrivateNetwork(operation)
        const id = readTrackId(resource, ctx.plugin.id)
        const result = await client.get<LyricsResponse>(
          `tracks/${encodeURIComponent(id)}/lyrics`,
          { operation },
        )
        return toLyrics(resource, result)
      },
    },
  })
})
