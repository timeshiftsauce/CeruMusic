import {
  SearchArg,
  SearchResult,
  GetMusicUrlArg,
  GetMusicPicArg,
  GetLyricArg,
  PlaylistResult,
  GetSongListDetailsArg,
  PlaylistDetailResult,
  DownloadSingleSongArgs,
  TipSearchResult,
  GetCommentArg,
  GetAlbumDetailArg
} from './type'
import pluginService from '../plugin/index'
import { assertResourceRef, retargetTrackRef } from '@shiqianjiang/ceru-plugin-sdk'
import { toAppTrack } from '@common/pluginMusic'
import { parseLocalLrc } from '@common/localLyrics'
import { resolveLocalLyrics } from '../localLyrics'
import { localMusicIndexService } from '../LocalMusicIndex'
import { readTags } from '../../utils/tagUtils'
import { musicCacheService } from '../musicCache'
import download from '../../utils/downloadSongs'

const v2Track = toAppTrack

/** Queued/batch downloads use the same current provider routing and cache as playback. */
export async function resolveDownloadUrl(task: {
  pluginId?: string
  songInfo?: GetMusicUrlArg['songInfo']
  quality?: string
}): Promise<string> {
  if (!task.songInfo || !task.quality) throw new Error('Task missing song or quality')
  const result = await main(task.songInfo.source).getMusicUrl({
    pluginId: task.pluginId ?? '', songInfo: task.songInfo, quality: task.quality
  })
  if (typeof result !== 'string') throw new Error(result.error)
  return result
}

function v2Page(result: any): any {
  const items = Array.isArray(result?.items) ? result.items : []
  return {
    list: items.map((item: any) =>
      item?.ref?.kind === 'track'
        ? v2Track(item)
        : {
            id: item?.ref?.id,
            name: item?.title || '',
            author: item?.playlist?.author || item?.subtitle || '',
            total: item?.playlist?.trackCount || 0,
            desc: item?.playlist?.description || '',
            img: item?.playlist?.artworkUrl || '',
            source: item?.ref?.providerId,
            pluginResource: item?.ref
          }
    ),
    total: result?.totalEstimate ?? items.length,
    limit: items.length || 20,
    nextCursor: result?.nextCursor,
    info: {
      name: result.name || '',
      img: result.playlist?.artworkUrl || '',
      author: result.playlist?.author || '',
      desc: result.playlist?.description || ''
    }
  }
}

function main(source: string = 'wy') {
  if (source === 'all') throw new Error('v2 模式不支持内置聚合音源，请安装提供多个 Provider 的插件')
  const requireV2 = (method?: string) => {
    const provider = pluginService.getV2Provider(source, undefined, method)
    if (!provider) throw new Error(`未安装提供「${source}」的音源插件，请先安装插件`)
    return provider
  }
  const optionalAction = async (action: string, songInfo: any, input: any, fallback: any) => {
    const resource = songInfo?.pluginResource
    if (resource) assertResourceRef(resource)
    const provider = pluginService.getV2Action(
      resource?.providerId || source,
      action,
      resource?.pluginId
    )
    if (!provider) return fallback
    return provider.host.invokeV2Action(action, { ...input, source: resource?.providerId || source })
  }
  return {
    async search({ keyword, page = 1, limit = 30 }: SearchArg) {
      const provider = requireV2('tracks.search')
      const result = await provider.host.invokeV2Provider(source, 'tracks.search', [
        {
          query: keyword,
          kinds: ['track'],
          filters: {},
          cursor: page > 1 ? String(page) : undefined,
          limit
        }
      ])
      return v2Page(result) as SearchResult
    },

    async tipSearch({ keyword }: { keyword: string }) {
      const provider = pluginService.getV2Action(source, 'search.tips')
      if (!provider) return [] as TipSearchResult
      try {
        const result = await provider.host.invokeV2Action('search.tips', { source, query: keyword })
        return result as TipSearchResult
      } catch {
        return [] as TipSearchResult
      }
    },

    async getMusicUrl({ songInfo, quality, isCache }: GetMusicUrlArg) {
      try {
        const resource = songInfo.pluginResource
        if (resource) {
          assertResourceRef(resource)
          if (resource.kind !== 'track') throw new Error('只能播放歌曲资源')
        }
        const currentSource = resource?.providerId || songInfo.source || source
        const provider = pluginService.getV2Provider(
          currentSource,
          resource?.scope === 'provider' ? undefined : resource?.pluginId,
          'tracks.resolve'
        )
        if (!provider) throw new Error('请先安装提供该音源的插件')
        const effectiveRef = resource
          ? retargetTrackRef(resource, provider.host.getPluginInfo().id)
          : undefined
        // Resolve selection first: changing playback implementations must also change the cache.
        const songId = JSON.stringify([
          provider.pluginId,
          currentSource,
          effectiveRef?.connectionId ?? null,
          effectiveRef?.id ?? songInfo.hash ?? songInfo.songmid ?? `${songInfo.name}-${songInfo.singer}`,
          quality
        ])

        // 先检查缓存（isCache !== false 时）
        if (isCache !== false) {
          const cachedUrl = await musicCacheService.getCachedMusicUrl(songId)
          if (cachedUrl) {
            return cachedUrl
          }
        }

        // 没有缓存时才发起网络请求
        const originalUrl = await provider.host.getMusicUrl(
          currentSource,
          effectiveRef ? { ...songInfo, pluginResource: effectiveRef } : songInfo,
          quality
        )
        // 按需异步缓存，不阻塞返回
        if (isCache !== false) {
          musicCacheService.cacheMusic(songId, originalUrl).catch((error) => {
            console.warn('缓存歌曲失败:', error)
          })
        }

        return originalUrl
      } catch (e: any) {
        return {
          error: '获取歌曲失败 ' + (e.message || e.error || String(e))
        }
      }
    },

    async getPic({ songInfo }: GetMusicPicArg) {
      try {
        const resource = songInfo.pluginResource
        if (resource) assertResourceRef(resource)
        const currentSource = resource?.providerId || songInfo.source || source
        const provider = pluginService.getV2Action(currentSource, 'artwork.get', resource?.pluginId)
        return songInfo.img || (await provider?.host.getPic(currentSource, songInfo))
      } catch (e: any) {
        return {
          error: '获取歌曲失败 ' + (e.message || e.error || String(e))
        }
      }
    },

    async getLyric({ songInfo, useFormat = null }: GetLyricArg): Promise<any> {
      try {
        const resource = songInfo.pluginResource
        if (resource) {
          assertResourceRef(resource)
          if (resource.kind !== 'track') throw new Error('只能获取歌曲资源的歌词')
        }
        const currentSource = resource?.providerId || songInfo.source || source
        const provider = pluginService.getV2Provider(
          currentSource,
          resource?.scope === 'provider' ? undefined : resource?.pluginId,
          'tracks.lyrics'
        )
        if (!provider) throw new Error('请安装这首歌曲所需的插件')
        const res = await provider.host.invokeV2Provider(currentSource, 'tracks.lyrics', [
          resource ? retargetTrackRef(resource, provider.host.getPluginInfo().id) : {
            pluginId: provider.host.getPluginInfo().id,
            providerId: currentSource,
            kind: 'track',
            id: String(songInfo.songmid || songInfo.hash || (songInfo as any).id),
            data: { song: songInfo }
          }
        ])
        if (useFormat !== null)
          return (
            await provider.host.convertLyrics('export', {
              document: res,
              format: useFormat === 'word-by-word' ? 'enhanced-lrc' : 'lrc'
            })
          ).text
        return { crlyric: res }
      } catch (e: any) {
        return {
          error: '获取歌词失败 ' + (e.error || e.message || e)
        }
      }
    },

    async getHotSonglist() {
      const provider = requireV2('playlists.list')
      return v2Page(
        await provider.host.invokeV2Provider(source, 'playlists.list', [
          { pluginId: provider.pluginId, providerId: source, kind: 'playlist-category', id: 'hot' },
          '1'
        ])
      ) as PlaylistResult
    },
    async parseLyrics({ text, track }: { text: string; track: any }): Promise<any> {
      if (source === 'local') {
        const song = localMusicIndexService.getSongById(String(track?.id ?? ''))
        if (song?.path) return resolveLocalLyrics({
          audioPath: song.path,
          embedded: readTags(song.path, true).lrc || '',
          track: { pluginId: 'local.library', providerId: 'local', kind: 'track', id: String(track.id) },
          converters: pluginService.getLyricConverters().flatMap(host =>
            (host.getManifest().contributes?.lyricConverters ?? []).map((converter: any) => ({
              formats: converter.formats,
              parse: (request: import('@shiqianjiang/ceru-plugin-sdk').LyricParseRequest) =>
                host.convertLyrics('parse', request, converter.id, 3000)
            }))
          )
        })
        const local = parseLocalLrc(text, track)
        if (local) return local
      }
      const converter = pluginService.getLyricConverter()
      if (!converter) throw new Error('内嵌歌词已读取，请先使用支持歌词转换的插件后重试')
      return converter.convertLyrics('parse', { text, format: 'auto', track })
    },
    async exportLyrics({
      document,
      format
    }: {
      document: any
      format: 'lrc' | 'enhanced-lrc' | 'yrc'
    }): Promise<any> {
      const converter = pluginService.getLyricConverter()
      if (!converter) throw new Error('请安装歌词转换插件')
      return converter.convertLyrics('export', { document, format })
    },

    async getPlaylistTags() {
      const provider = requireV2('playlists.categories')
      const result = await provider.host.invokeV2Provider(source, 'playlists.categories', [])
      const groups = new Map<string, any[]>()
      const hotTag: any[] = []
      for (const item of result.items) {
        const group = item.extensions?.group || '分类'
        const tag = { id: item.ref.id, name: item.title }
        if (item.extensions?.hot) hotTag.push(tag)
        const list = groups.get(group) ?? []
        list.push(tag)
        groups.set(group, list)
      }
      return { tags: [...groups].map(([name, list]) => ({ name, list })), hotTag }
    },

    async getCategoryPlaylists({
      sortId = '',
      tagId = '',
      page = 1,
      limit = 30
    }: {
      sortId?: string
      tagId?: string
      page?: number
      limit?: number
    }) {
      const provider = requireV2('playlists.list')
      const res = await provider.host.invokeV2Provider(source, 'playlists.list', [
        {
          pluginId: provider.host.getPluginInfo().id,
          providerId: source,
          kind: 'playlist-category',
          id: tagId || 'hot',
          data: { sortId, limit }
        },
        String(page)
      ])
      return { category: { id: tagId || 'hot', name: tagId || '热门' }, ...v2Page(res) }
    },

    async getPlaylistDetail({ id, page, ref, cursor }: GetSongListDetailsArg) {
      if (ref) {
        assertResourceRef(ref)
        if (ref.kind !== 'playlist' || ref.id !== id || ref.providerId !== source)
          throw new Error('歌单资源与请求不匹配')
      }
      const provider = pluginService.getV2Provider(source, ref?.pluginId, 'playlists.get')
      if (!provider) throw new Error('未安装提供此歌单的插件，请先安装并启用原插件')
      const res = await provider.host.invokeV2Provider(source, 'playlists.get', [
        ref ?? { pluginId: provider.host.getPluginInfo().id, providerId: source, kind: 'playlist', id },
        ref ? cursor : String(page)
      ])
      return v2Page(res) as PlaylistDetailResult
    },

    async downloadSingleSong({
      pluginId,
      songInfo,
      quality,
      tagWriteOptions,
      lazy
    }: DownloadSingleSongArgs) {
      let url = ''
      if (lazy && songInfo.typeUrl && songInfo.typeUrl[quality]) {
        url = songInfo.typeUrl[quality]
      }
      if (!url) {
        const result = await this.getMusicUrl({ pluginId, songInfo, quality })
        if (typeof result === 'object') throw new Error('无法获取歌曲链接')
        url = result
      }
      if (!url) throw new Error('无法获取歌曲下载链接')
      return await download(songInfo, url, tagWriteOptions, pluginId, quality)
    },

    async downloadBatchSongs({ tasks }: { tasks: DownloadSingleSongArgs[] }) {
      const results: any[] = []
      for (const task of tasks) {
        try {
          // 直接加入 DownloadManager 队列，URL 由 urlFetcher 按需获取（受并发数控制）。
          // 若已有现成 URL（lazy 模式）则直接使用，避免重复请求。
          const url =
            task.lazy && task.songInfo.typeUrl?.[task.quality]
              ? task.songInfo.typeUrl[task.quality]
              : ''
          const res = download(
            task.songInfo,
            url,
            task.tagWriteOptions,
            task.pluginId,
            task.quality
          )
          results.push({ success: true, songmid: task.songInfo.songmid, ...res })
        } catch (e: any) {
          results.push({
            success: false,
            songmid: task.songInfo.songmid,
            error: e.message || String(e)
          })
        }
      }
      return results
    },

    async parsePlaylistId({ url }: { url: string }) {
      try {
        const provider = pluginService.getV2Action(source, 'playlist.parse')
        if (!provider) throw new Error('未安装歌单链接解析能力')
        return await provider.host.invokeV2Action('playlist.parse', { source, url })
      } catch (e: any) {
        return {
          error: '解析歌单链接失败 ' + (e.error || e.message || e)
        }
      }
    },

    async getPlaylistDetailById(id: string, page: number = 1) {
      try {
        const provider = requireV2('playlists.get')
        const result = await provider.host.invokeV2Provider(source, 'playlists.get', [
          { pluginId: provider.pluginId, providerId: source, kind: 'playlist', id },
          String(page)
        ])
        return v2Page(result)
      } catch (e: any) {
        return {
          error: '获取歌单详情失败 ' + (e.error || e.message || e)
        }
      }
    },
    async searchPlaylist({ keyword, page = 1, limit = 30 }: SearchArg) {
      const provider = requireV2('playlists.search')
      const result = await provider.host.invokeV2Provider(source, 'playlists.search', [
        {
          query: keyword,
          kinds: ['playlist'],
          filters: {},
          cursor: page > 1 ? String(page) : undefined,
          limit
        }
      ])
      return v2Page(result) as PlaylistResult
    },

    async getLeaderboards() {
      const provider = requireV2('charts.list')
      const result = await provider.host.invokeV2Provider(source, 'charts.list', [])
      return (result?.items || []).map((item: any) => ({
        id: item.ref?.id,
        board_id: item.ref?.id,
        name: item.title,
        pic: item.chart?.artworkUrl,
        update_frequency: item.chart?.updateFrequency,
        source: item.ref.providerId
      }))
    },

    async getLeaderboardDetail({ id, page }: { id: string; page: number }) {
      const provider = requireV2('charts.getTracks')
      const result = await provider.host.invokeV2Provider(source, 'charts.getTracks', [
        { pluginId: provider.pluginId, providerId: source, kind: 'chart', id },
        String(page)
      ])
      return v2Page(result) as PlaylistDetailResult
    },
    // 热门评论
    async getHotComment({ songInfo, page = 1, limit = 100 }: GetCommentArg) {
      return optionalAction('comments.hot', songInfo, {
        source,
        song: songInfo,
        page,
        limit
      }, { source, comments: [], total: 0, page, limit, maxPage: 0 })
    },
    // 最新评论
    async getComment({ songInfo, page = 1, limit = 20 }: GetCommentArg) {
      return optionalAction('comments.get', songInfo, {
        source,
        song: songInfo,
        page,
        limit
      }, { source, comments: [], total: 0, page, limit, maxPage: 0 })
    },
    // 听歌识曲
    async recognize({ fp, duration }: { fp: string; duration: number }) {
      const provider = pluginService.getV2Action(source, 'recognize')
      if (!provider) throw new Error('未安装听歌识曲能力')
      return await provider.host.invokeV2Action('recognize', { source, fp, duration })
    },
    // 获取专辑列表
    async getAlbumList({ songInfo, page = 1, limit = 10 }: GetAlbumDetailArg) {
      const resource = songInfo.pluginResource
      if (resource) assertResourceRef(resource)
      const currentSource = resource?.providerId || songInfo.source || source
      const provider = pluginService.getV2Action(currentSource, 'album.list', resource?.pluginId)
      if (!provider) throw new Error('未安装专辑列表能力')
      return await provider.host.invokeV2Action('album.list', {
        source: currentSource,
        song: songInfo,
        page,
        limit
      })
    }
  }
}
export default main
