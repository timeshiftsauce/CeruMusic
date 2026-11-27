import { randomUUID } from 'node:crypto'
import { pathToFileURL } from 'node:url'
import type { MusicRegistry } from '@shiqianjiang/ceru-plugin-core/music'
import {
  assertSearchRequest,
  type SearchRequest,
  type ResourceRef
} from '@shiqianjiang/ceru-plugin-sdk'

const handles = new Map<string, { id: string; expires: number }>()
export async function localMediaPath(address: string): Promise<string | undefined> {
  const url = new URL(address)
  if (url.protocol !== 'ceru-local:' || url.hostname !== 'track') return
  const token = url.pathname.slice(1),
    handle = handles.get(token)
  if (!handle || handle.expires <= Date.now()) {
    handles.delete(token)
    return
  }
  const { localMusicIndexService } = await import('../LocalMusicIndex')
  return localMusicIndexService.getSongById(handle.id)?.path
}

export async function openLocalMedia(request: Request): Promise<Response> {
  const file = ['GET', 'HEAD'].includes(request.method) && await localMediaPath(request.url)
  if (!file) return new Response(null, { status: 404 })
  const { net } = await import('electron')
  return net.fetch(pathToFileURL(file).href, {
    method: request.method,
    signal: request.signal,
    headers: request.headers.has('range') ? { Range: request.headers.get('range')! } : {}
  })
}
export async function searchLocal(request: SearchRequest) {
  assertSearchRequest(request)
  if (!request.kinds.includes('track') && request.kinds.length) return { items: [] }
  const offset = request.cursor === undefined ? 0 : Number(request.cursor)
  if (!Number.isSafeInteger(offset) || offset < 0) throw Error('无效的本地曲库分页')
  const { getMusicDatabase } = await import('../MusicDatabase')
  const rows = getMusicDatabase().searchTracks(request.query, offset, request.limit + 1)
  return {
    items: rows
      .slice(0, request.limit)
      .map((row) => ({
        ref: { kind: 'track', scope: 'provider' as const, providerId: 'local', id: row.songmid },
        title: row.name,
        metadata: {
          artists: [row.singer],
          album: { title: row.albumName },
          durationMs: Math.max(0, Math.round((row.duration || 0) * 1000))
        },
        playable: true,
        capabilities: ['play']
      })),
    ...(rows.length > request.limit ? { nextCursor: String(offset + request.limit) } : {})
  }
}
export function registerLocalSource(registry: MusicRegistry) {
  return registry.register(
    {
      pluginId: 'host',
      providerId: 'local',
      runtime: 'host',
      declaration: { id: 'local', name: '本地音乐', protocols: ['tracks'] },
      methods: ['tracks.search', 'tracks.resolve', 'tracks.lyrics', 'tracks.artwork']
    },
    async (method, args, operation) => {
      if (method === 'tracks.search') return searchLocal(args[0])
      const ref = args[0] as ResourceRef
      const { localMusicIndexService } = await import('../LocalMusicIndex')
      const song = localMusicIndexService.getSongById(ref.id)
      if (!song?.path) throw Error('未找到这首本地歌曲')
      operation.signal.throwIfAborted()
      if (method === 'tracks.resolve') {
        const token = randomUUID(),
          expiresAt = Date.now() + 3600000
        if (handles.size >= 512) handles.delete(handles.keys().next().value!)
        handles.set(token, { id: ref.id, expires: expiresAt })
        return { ok: true, url: 'ceru-local://track/' + token, expiresAt }
      }
      if (method === 'tracks.artwork') {
        const { coverCacheService } = await import('../CoverCache'),
          { genCoverKey } = await import('../../utils/fileUtils')
        return (
          (await coverCacheService.getCoverByFile(song.path, genCoverKey(song.path))) || undefined
        )
      }
      const { resolveLocalLyrics } = await import('../localLyrics'),
        { readTags } = await import('../../utils/tagUtils')
      let embedded = song.lrc ?? ''
      if (!embedded) {
        try {
          embedded = readTags(song.path, true).lrc || ''
        } catch {}
      }
      return (
        (await resolveLocalLyrics({
          audioPath: song.path,
          embedded,
          track: ref,
          converters: []
        })) ?? { format: 'crlyric', version: 1, track: ref, offsetMs: 0, lines: [] }
      )
    }
  )
}
