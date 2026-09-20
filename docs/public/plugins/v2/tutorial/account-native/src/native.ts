import {
  defineNativeView,
  type JsonValue,
  type PluginContext,
} from '@shiqianjiang/ceru-plugin-sdk'
import type { AccountController } from './account'
import { playlists, tracks } from './data'
import { playTracks, type Catalog } from './provider'

export function registerNative(
  ctx: PluginContext,
  account: AccountController,
  catalog: Catalog,
) {
  const register = (
    id: string,
    handler: Parameters<PluginContext['actions']['register']>[1],
  ) => ctx.effects.add(ctx.actions.register(id, handler))

  register(
    'render.library',
    defineNativeView(async () => {
      const session = account.getSession()
      if (!session) {
        return {
          type: 'page',
          title: '演示音乐',
          description: '连接演示账号后查看原生歌单与歌曲。',
          actions: [{ label: '连接账号', action: 'account.open', primary: true }],
          sections: [],
        }
      }

      return {
        type: 'page',
        title: '我的演示音乐',
        description: `${session.displayName} · 内容由插件提供，界面由澜音渲染`,
        actions: [
          {
            label: '播放推荐',
            action: 'tracks.play',
            input: {
              refs: tracks.slice(0, 2).map((item) => catalog.resource('track', item.id)),
            } as unknown as JsonValue,
            primary: true,
          },
          { label: '刷新', action: 'library.refresh' },
        ],
        sections: [
          {
            id: 'playlists',
            title: '我的歌单',
            layout: 'grid',
            items: playlists.map(catalog.playlistEntity),
            onOpen: 'playlist.open',
            itemActions: [{ label: '导入歌单', action: 'playlist.import' }],
          },
          {
            id: 'tracks',
            title: '今日推荐',
            layout: 'list',
            items: tracks.slice(0, 3).map(catalog.trackEntity),
            onPlay: 'tracks.play',
          },
        ],
      }
    }),
  )

  register('library.refresh', async () => {
    await ctx.ui.setState('library', {
      account: account.publicAccount(),
      changedAt: Date.now(),
    })
    return null
  })

  register('playlist.open', async (input) => {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : undefined
    const ref = catalog.ownedRef(value?.ref, 'playlist')
    await ctx.ui.navigation.open({ page: 'playlist', ref })
    return null
  })

  register('playlist.import', async (input) => {
    const value = input && typeof input === 'object' && !Array.isArray(input) ? input : undefined
    const ref = catalog.ownedRef(value?.ref, 'playlist')
    await ctx.ui.playlistImport.open({
      importerId: 'tutorial-playlist',
      initialValue: ref.id,
      title: `导入 ${playlists.find((item) => item.id === ref.id)?.title ?? '演示歌单'}`,
    })
    return null
  })

  register('tracks.play', (input, operation) =>
    playTracks(ctx, account, catalog, input, operation),
  )
}
