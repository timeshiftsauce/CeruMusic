import { ipcMain } from 'electron'
import * as crypto from 'crypto'
import pluginService from '../services/plugin'
import { createShareDescriptor, readShareDescriptor } from '../services/plugin/sharing'
import { normalizeMusicItem } from '@common/musicItem'
import { toPluginTrack } from '@common/pluginMusic'

/**
 * 分享相关 IPC：仅暴露最小必要能力 —— 获取当前插件的源码 + md5 指纹。
 * 真正的 HTTP 调用（precheck / upload-plugin / create）由 renderer 通过已封装好的
 * Request（带 Logto Bearer）发起，避免主进程二次实现鉴权。
 */
export default function InitShareService() {
  ipcMain.handle('share:playlist-resolver:export', async (_event, sources: string[]) => {
    if (
      !Array.isArray(sources) ||
      !sources.length ||
      sources.length > 64 ||
      sources.some((source) => typeof source !== 'string')
    )
      throw new Error('歌单音源列表无效')
    const modules = new Map<string, { code: string; sources: string[] }>()
    let commonQualities: string[] | undefined
    for (const source of [...new Set(sources)]) {
      if (source === 'local')
        throw new Error('歌单包含本地歌曲，无法使用音源插件在网页播放；可关闭网页播放后分享')
      const provider = pluginService.getV2Provider(source, undefined, 'tracks.resolve', true)
      if (!provider) throw new Error(`没有可解析 ${source} 的音源插件`)
      const qualities: string[] = provider.host.getSupportedSources()[source]?.qualitys ?? []
      commonQualities = commonQualities
        ? commonQualities.filter((quality) => qualities.includes(quality))
        : [...qualities]
      const existing = modules.get(provider.pluginId)
      if (existing) existing.sources.push(source)
      else
        modules.set(provider.pluginId, {
          code: await provider.host.getShareResolverCode(),
          sources: [source]
        })
    }
    if (!commonQualities?.length)
      throw new Error('歌单中各平台没有共同支持的音质，无法生成统一网页播放分享')
    const entries = [...modules.values()]
    const code =
      entries.length === 1
        ? entries[0].code
        : [
            '/* CeruMusic playlist playback resolvers */',
            ...entries.map(
              (entry, index) =>
                `const resolver${index} = (() => { const module={exports:{}}; const exports=module.exports;\n${entry.code}\nreturn module.exports; })();`
            ),
            `const routing = {${entries.flatMap((entry, index) => entry.sources.map((source) => `${JSON.stringify(source)}:resolver${index}`)).join(',')}};`,
            `module.exports = { pluginInfo: { name: '歌单分享解析', version: '1.0.0', author: 'CeruMusic' }, sources:Object.fromEntries(Object.entries(routing).map(([source,resolver])=>[source,resolver.sources[source]])), async musicUrl(source,musicInfo,quality) { if(!Object.prototype.hasOwnProperty.call(routing,source))throw new Error('不支持的音源'); return routing[source].musicUrl(source,musicInfo,quality); } };`
          ].join('\n')
    if (Buffer.byteLength(code, 'utf8') > 200 * 1024)
      throw new Error('歌单解析模块超过服务器 200 KiB 限制，请拆分歌单分享')
    return {
      code,
      md5: crypto.createHash('md5').update(code).digest('hex'),
      type: 'cr',
      qualities: commonQualities
    }
  })
  ipcMain.handle('share:resolver:export', async (_event, source: string, song: any) => {
    // Provider-scoped tracks are public platform IDs and may use another
    // implementation's share resolver (for example, 聆澜 for 网易云账号的 wy).
    // Private resources must remain bound to their owning plugin.
    const resource = song?.pluginResource
    const ownerId = resource?.scope === 'provider' ? undefined : resource?.pluginId
    const provider = pluginService.getV2Provider(source, ownerId, 'tracks.resolve', true)
    if (!provider) throw new Error('请先使用提供该歌曲播放解析的插件')
    const code = await provider.host.getShareResolverCode()
    if (Buffer.byteLength(code, 'utf8') > 200 * 1024)
      throw new Error('分享解析模块超过服务器 200 KiB 限制，请使用精简分享模块')
    const qualities = provider.host.getSupportedSources()[source]?.qualitys ?? []
    if (!qualities.length) throw new Error('当前音源没有可分享的音质，请先选择可用子音源')
    const original = song?.pluginResource?.data?.song
    return {
      code,
      md5: crypto.createHash('md5').update(code).digest('hex'),
      type: 'cr',
      pluginId: provider.pluginId,
      pluginName: provider.host.getPluginInfo().name,
      qualities,
      musicInfo: (() => {
        const value = {
          ...(original && typeof original === 'object' ? original : {}),
          ...song,
          source
        }
        return normalizeMusicItem(value)
      })()
    }
  })
  ipcMain.handle('share:descriptor:create', async (_event, source: string, song: any) => {
    song = normalizeMusicItem(song)
    const provider = pluginService.getV2Provider(
      source,
      song.pluginResource?.pluginId,
      'sharing.describe'
    )
    if (!provider) throw new Error('请先安装提供该音源的插件')
    const ref = { ...toPluginTrack(song).ref, pluginId: provider.host.getPluginInfo().id }
    const descriptor = await provider.host.invokeV2Provider(source, 'sharing.describe', [ref, {}])
    return createShareDescriptor(descriptor)
  })
  ipcMain.handle('share:descriptor:read', (_event, id) => readShareDescriptor(id))
  ipcMain.handle(
    'service-share-getPluginCodeAndMd5',
    async (
      _,
      pluginId: string
    ): Promise<{ code: string; md5: string; type: 'cr' | 'lx' } | { error: string }> => {
      try {
        const host = pluginService.getPluginById(pluginId)
        if (!host) return { error: `插件 ${pluginId} 未加载` }
        const code = await host.getShareResolverCode()
        if (!code) return { error: '无法读取插件源码' }
        const md5 = crypto.createHash('md5').update(code).digest('hex')
        // 推断类型：根据现有 selectAndAddPlugin 的判断口径
        return { code, md5, type: 'cr' }
      } catch (err: any) {
        return { error: err?.message || '获取插件源码失败' }
      }
    }
  )
}
