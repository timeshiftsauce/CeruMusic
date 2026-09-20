import {
  assertResourceRef,
  defineNativeView,
  definePlugin,
  type AccountSummary,
  type ContentEntity,
  type JsonObject,
  type JsonValue,
  type OperationContext,
  type ResourceRef,
} from '@shiqianjiang/ceru-plugin-sdk'

const PROVIDER_ID = 'tutorial-account'
const CONNECTION_ID = 'demo-user'
const SESSION_KEY = 'tutorial.session.v1'
const PAGE_SIZE = 2

type DemoSession = {
  cookie: string
  displayName: string
  avatarUrl: string
  membership: 'FREE' | 'VIP' | 'SVIP'
}

type LoginAttempt = {
  id: string
  approved: boolean
  createdAt: number
}

type TrackRecord = {
  id: string
  title: string
  artist: string
  album: string
  durationMs: number
}

type PlaylistRecord = {
  id: string
  title: string
  description: string
  trackIds: string[]
}

const tracks: TrackRecord[] = [
  {
    id: 'morning',
    title: 'Morning Light',
    artist: 'Ceru Demo',
    album: 'First Steps',
    durationMs: 3200,
  },
  {
    id: 'rain',
    title: 'Soft Rain',
    artist: 'Ceru Demo',
    album: 'First Steps',
    durationMs: 3600,
  },
  {
    id: 'night',
    title: 'Night Walk',
    artist: 'Lan Yin',
    album: 'City Notes',
    durationMs: 4000,
  },
  {
    id: 'stars',
    title: 'Little Stars',
    artist: 'Lan Yin',
    album: 'City Notes',
    durationMs: 3400,
  },
]

const playlists: PlaylistRecord[] = [
  {
    id: 'demo-favorites',
    title: '我喜欢的演示音乐',
    description: '演示账号收藏的四首短音频',
    trackIds: ['morning', 'rain', 'night', 'stars'],
  },
  {
    id: 'demo-evening',
    title: '夜晚播放列表',
    description: '用来练习歌单详情与分页',
    trackIds: ['night', 'stars', 'rain'],
  },
]

export default definePlugin(async (ctx) => {
  let session = readSession(await ctx.storage.get(SESSION_KEY))
  let login: LoginAttempt | null = null

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
      author: session?.displayName ?? '演示账号',
      trackCount: playlist.trackIds.length,
    },
  })

  const publicAccount = (): JsonObject => ({
    signedIn: !!session,
    displayName: session?.displayName ?? '演示音乐账号',
    ...(session?.avatarUrl ? { avatarUrl: session.avatarUrl } : {}),
    ...(session?.membership && session.membership !== 'FREE' ? { badge: session.membership } : {}),
  })

  const accountSummary = (): AccountSummary => {
    const state = publicAccount()
    return {
      signedIn: state.signedIn as boolean,
      displayName: state.displayName as string,
      ...(typeof state.avatarUrl === 'string' ? { avatarUrl: state.avatarUrl } : {}),
      ...(typeof state.badge === 'string' ? { badge: state.badge } : {}),
    }
  }

  const publishAccount = async () => {
    const account = publicAccount()
    await Promise.all([
      ctx.ui.setState('account', { account }),
      ctx.ui.setState('library', { account, changedAt: Date.now() }),
    ])
  }

  const requireAccount = () => {
    if (!session) throw fault('请先连接演示账号', 'AUTH_REQUIRED')
  }

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

  const register = (
    id: string,
    handler: (
      input: JsonValue,
      operation: OperationContext,
    ) => JsonValue | void | Promise<JsonValue | void>,
  ) => ctx.effects.add(ctx.actions.register(id, handler))

  register('account.open', () => ctx.ui.openView('account'))
  register('account.summary', () => accountSummary())
  register('account.session', () => publicAccount())

  register('account.start', (input) => {
    const requestedId = object(input)?.attemptId
    const id = typeof requestedId === 'string' ? requestedId : `attempt-${Date.now()}`
    login = { id, approved: false, createdAt: Date.now() }
    return { status: 'waiting', attemptId: id, qrText: `CERU-DEMO:${id}` }
  })

  register('account.approve', (input) => {
    const id = object(input)?.attemptId
    if (!login || id !== login.id) throw fault('本次二维码已失效', 'CANCELLED')
    login.approved = true
    return { status: 'scanned' }
  })

  register('account.poll', async (input) => {
    const id = object(input)?.attemptId
    if (!login || id !== login.id || Date.now() - login.createdAt > 180_000) {
      login = null
      return { status: 'expired' } as JsonObject
    }
    if (!login.approved) return { status: 'waiting' } as JsonObject

    // 真实插件在这里验证平台响应并保存 Cookie/令牌。凭据只写私有 Storage。
    session = {
      cookie: `demo_session_${Date.now()}`,
      displayName: '澜音体验用户',
      avatarUrl: 'https://api.dicebear.com/9.x/initials/svg?seed=LanYin',
      membership: 'SVIP',
    }
    await ctx.storage.set(SESSION_KEY, session as unknown as JsonValue)
    login = null
    await publishAccount()
    return { status: 'success', account: publicAccount() } as JsonObject
  })

  register('account.cancel', (input) => {
    const id = object(input)?.attemptId
    if (!id || id === login?.id) login = null
    return null
  })

  register('account.logout', async () => {
    login = null
    session = null
    await ctx.storage.delete(SESSION_KEY)
    await publishAccount()
    await ctx.ui.closeView('account')
    return publicAccount()
  })

  register(
    'render.library',
    defineNativeView(async () => {
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
              refs: tracks.slice(0, 2).map((item) => resource('track', item.id)),
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
            items: playlists.map(playlistEntity),
            onOpen: 'playlist.open',
            itemActions: [{ label: '导入歌单', action: 'playlist.import' }],
          },
          {
            id: 'tracks',
            title: '今日推荐',
            layout: 'list',
            items: tracks.slice(0, 3).map(trackEntity),
            onPlay: 'tracks.play',
          },
        ],
      }
    }),
  )

  register('library.refresh', async () => {
    await ctx.ui.setState('library', { account: publicAccount(), changedAt: Date.now() })
    return null
  })

  register('library.openSection', async () => {
    await ctx.ui.navigation.open({ page: 'playlist', sectionId: 'tutorial-library' })
    return null
  })

  register('playlist.open', async (input) => {
    const ref = ownedRef(object(input)?.ref, 'playlist')
    await ctx.ui.navigation.open({ page: 'playlist', ref })
    return null
  })

  register('playlist.import', async (input) => {
    const ref = ownedRef(object(input)?.ref, 'playlist')
    await ctx.ui.playlistImport.open({
      importerId: 'tutorial-playlist',
      initialValue: ref.id,
      title: `导入 ${playlists.find((item) => item.id === ref.id)?.title ?? '演示歌单'}`,
    })
    return null
  })

  register('tracks.play', async (input, operation) => {
    requireAccount()
    const value = object(input)
    const values = Array.isArray(value?.refs) ? value.refs : value?.ref ? [value.ref] : []
    const refs = values.map((item) => ownedRef(item, 'track'))
    if (!refs.length) throw fault('没有可播放的歌曲', 'NOT_FOUND')

    let grant = await ctx.permissions.query({ key: 'playback' })
    if (grant.status !== 'granted') {
      grant = await ctx.permissions.request({ key: 'playback', intent: operation.userIntent })
    }
    if (grant.status !== 'granted') throw fault('请允许插件控制播放', 'PERMISSION_DENIED')

    const items = refs
      .map((ref) => tracks.find((item) => item.id === ref.id))
      .filter((item): item is TrackRecord => !!item)
      .map(trackEntity)
    if (!items.length) throw fault('歌曲不存在', 'NOT_FOUND')

    const call = { permissionKey: 'playback', operation }
    await ctx.queue.replace(items, call)
    await ctx.player.play(refs[0], call)
    return null
  })

  ctx.effects.add(
    ctx.providers.register(PROVIDER_ID, {
      tracks: {
        async search(request, operation) {
          operation.signal.throwIfAborted()
          requireAccount()
          const query = request.query.trim().toLocaleLowerCase()
          const items = tracks
            .filter((item) => `${item.title} ${item.artist}`.toLocaleLowerCase().includes(query))
            .slice(0, Math.max(1, Math.min(request.limit, 20)))
            .map(trackEntity)
          return { items, totalEstimate: items.length }
        },
        async resolve(ref, _quality, operation) {
          operation.signal.throwIfAborted()
          requireAccount()
          const track = tracks.find((item) => item.id === ownedRef(ref, 'track').id)
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
          requireAccount()
          const offset = cursorOffset(cursor)
          const items = playlists.slice(offset, offset + PAGE_SIZE).map(playlistEntity)
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
          requireAccount()
          const playlist = playlists.find((item) => item.id === ownedRef(ref, 'playlist').id)
          if (!playlist) throw fault('歌单不存在', 'NOT_FOUND')
          const offset = cursorOffset(cursor)
          const pageIds = playlist.trackIds.slice(offset, offset + PAGE_SIZE)
          const items = pageIds
            .map((id) => tracks.find((item) => item.id === id))
            .filter((item): item is TrackRecord => !!item)
            .map(trackEntity)
          return {
            name: playlist.title,
            playlist: playlistEntity(playlist).playlist,
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
        const playlist = playlists.find((item) => item.id === request.value.trim())
        if (!playlist) throw fault('请输入 demo-favorites 或 demo-evening', 'NOT_FOUND')
        const offset = cursorOffset(request.cursor)
        const size = Math.max(1, Math.min(request.limit, 100))
        const ids = playlist.trackIds.slice(offset, offset + size)
        const items = ids
          .map((id) => tracks.find((item) => item.id === id))
          .filter((item): item is TrackRecord => !!item)
          .map(trackEntity)
        operation.signal.throwIfAborted()
        return {
          name: playlist.title,
          playlist: playlistEntity(playlist).playlist,
          items,
          totalEstimate: playlist.trackIds.length,
          ...(offset + items.length < playlist.trackIds.length
            ? { nextCursor: String(offset + items.length) }
            : {}),
        }
      },
    }),
  )

  await publishAccount()
})

function object(value: JsonValue | undefined): JsonObject | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : undefined
}

function readSession(value: JsonValue | null): DemoSession | null {
  const data = object(value ?? undefined)
  if (
    typeof data?.cookie !== 'string' ||
    typeof data.displayName !== 'string' ||
    typeof data.avatarUrl !== 'string' ||
    !['FREE', 'VIP', 'SVIP'].includes(String(data.membership))
  ) {
    return null
  }
  return data as unknown as DemoSession
}

function cursorOffset(cursor: string | undefined) {
  const value = cursor === undefined ? 0 : Number(cursor)
  if (!Number.isSafeInteger(value) || value < 0) throw fault('分页游标无效', 'NOT_FOUND')
  return value
}

function fault(message: string, code: string) {
  return Object.assign(new Error(message), { code })
}
