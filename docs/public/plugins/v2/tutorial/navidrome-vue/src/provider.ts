import type {
  CrLyric,
  PluginContext,
  ProviderImplementation,
  ResourceRef
} from '@shiqianjiang/ceru-plugin-sdk'
import { api, signedUrl } from './api'
import { list, providerId, qualities, text, type Account, type Song } from './model'

function makeRef(ctx: PluginContext, current: Account, songId: string): ResourceRef {
  return {
    pluginId: ctx.plugin.id,
    providerId,
    connectionId: current.id,
    kind: 'track',
    id: `nd:${current.id}:${encodeURIComponent(songId)}`
  }
}

function songId(ctx: PluginContext, current: Account, resource: ResourceRef) {
  if (resource.pluginId !== ctx.plugin.id || resource.providerId !== providerId) {
    throw new Error('这不是本插件创建的歌曲')
  }
  const match = /^nd:([a-f0-9]{24}):(.+)$/.exec(resource.id)
  if (!match || match[1] !== current.id) throw new Error('歌曲属于另一个服务器或账号')
  return decodeURIComponent(match[2])
}

function toTrack(ctx: PluginContext, current: Account, song: Song) {
  const id = text(song.id)
  const artist = text(song.artist, '未知歌手')
  const durationMs = Math.max(0, Number(song.duration) || 0) * 1000
  if (!id) throw new Error('Navidrome 返回的歌曲缺少 id')
  return {
    ref: makeRef(ctx, current, id),
    title: text(song.title, '未知歌曲'),
    subtitle: artist,
    playable: true,
    durationMs,
    capabilities: ['music.resolve@1', 'music.lyrics@1'],
    metadata: {
      artists: [artist],
      album: song.album ? { id: text(song.albumId), title: song.album } : undefined,
      durationMs,
      qualities
    }
  }
}

export function createProvider(
  ctx: PluginContext,
  getAccount: () => Account | null
): ProviderImplementation {
  const currentAccount = () => {
    const current = getAccount()
    if (!current) throw new Error('请先打开 Navidrome 连接页并登录')
    return current
  }

  return {
    tracks: {
      async search(request, operation) {
        const current = currentAccount()
        const page = request.cursor ? Number(request.cursor) : 0
        if (!Number.isInteger(page) || page < 0) throw new Error('分页游标无效')
        const size = Math.max(1, Math.min(request.limit, 100))
        const response = await api(
          ctx,
          current,
          'search3',
          {
            query: request.query.trim(),
            artistCount: 0,
            albumCount: 0,
            songCount: size + 1,
            songOffset: page * size
          },
          operation
        )
        const songs = list(response.searchResult3?.song)
        return {
          items: songs.slice(0, size).map((song) => toTrack(ctx, current, song)),
          nextCursor: songs.length > size ? String(page + 1) : undefined
        }
      },

      async resolve(resource, quality, operation) {
        try {
          const current = currentAccount()
          const id = songId(ctx, current, resource)
          const selected = qualities.includes(quality ?? '') ? quality : 'original'
          const transcode =
            selected === 'original'
              ? { format: 'raw' }
              : { format: 'mp3', maxBitRate: Number.parseInt(selected ?? '320', 10) }
          await api(ctx, current, 'ping', {}, operation)
          return { ok: true, url: signedUrl(current, 'stream', { id, ...transcode }) }
        } catch (error) {
          const message = error instanceof Error ? error.message : '无法生成播放地址'
          const code = !getAccount()
            ? 'AUTH_REQUIRED'
            : message.includes('权限')
              ? 'PERMISSION_DENIED'
              : 'NOT_FOUND'
          return ctx.playback.failure({
            code,
            message,
            recovery: getAccount()
              ? undefined
              : {
                  mode: 'await-user',
                  actions: [
                    { kind: 'plugin-command', commandId: 'connection.open', label: '去连接' }
                  ]
                }
          })
        }
      },

      async lyrics(resource, operation) {
        const current = currentAccount()
        const id = songId(ctx, current, resource)
        const response = await api(ctx, current, 'getLyricsBySongId', { id }, operation)
        const entries = list(response.lyricsList?.structuredLyrics)
        const chosen = entries.find((entry) => entry.synced) ?? entries[0]
        const document: CrLyric = {
          format: 'crlyric',
          version: 1,
          track: resource,
          offsetMs: Number(chosen?.offset) || 0,
          lines: chosen?.synced
            ? list(chosen.line)
                .filter((line) => Number.isFinite(line.start) && typeof line.value === 'string')
                .map((line) => ({ startTimeMs: Number(line.start), text: text(line.value) }))
                .sort((a, b) => a.startTimeMs - b.startTimeMs)
            : []
        }
        if (!chosen?.synced) {
          document.plainText = list(chosen?.line)
            .map((line) => text(line.value))
            .join('\n')
        }
        return document
      }
    }
  }
}
