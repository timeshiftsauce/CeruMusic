import { musicRegistry } from '../musicRegistry'
import {
  projectPluginRoute,
  validatePluginRouteTarget,
  type PluginRoute
} from '@shiqianjiang/ceru-plugin-sdk/navigation'
import { hostIconDataUrl } from '@shiqianjiang/ceru-plugin-core/node'
import { readFile } from 'fs/promises'
import { join, basename } from 'path'
import { dialog, powerMonitor } from 'electron'
import { IdleMonitor } from '../idle'
import { AccountController } from '../accounts/controller'
import { readAccounts } from '../accounts/connections'
import { createHash, randomUUID } from 'crypto'
import type { prepareV2 } from '../v2/V2PluginHost'
import type { prepareV3 } from '../v3/V3PluginHost'
import type { Logger } from './runtime'
import { PluginPermissions, canonical } from './permissions'
import { getAppDirPath } from '../../../utils/path'
import { pluginChanged } from '../uiBridge'
import { sendPluginNotice } from '../../../events/pluginNotice'
import {
  permissionGroup,
  assertContentPage,
  assertResourceRef,
  assertRemovableTracks,
  retargetTrackRef,
  assertNativeView,
  type JsonObject
} from '@shiqianjiang/ceru-plugin-sdk'
import { getPluginConfig, savePluginConfig } from '../pluginConfig'
import { callPluginUI } from '../uiBridge'
import {
  readDrawerSchema,
  drawerAction,
  drawerState,
  type PluginDrawerSchema
} from '@common/pluginDrawer'
import { PluginStorage } from '../storage'
import { protectPluginFrames } from '../webDrawer'
import { publishPluginSurface, publishPluginAccountChanged } from '../uiBridge'
import type { PluginWebDrawerSession, PluginVisibleSession } from '@common/pluginDrawer'
import { registerPlaybackRequest } from '../playbackRequests'
import { pluginMedia } from '../media/mediaProtocol'
import { HostServices } from '../hostServices'
import { notificationBus } from '../operations/bus'
import { SurfaceCapacity } from './surfaceCapacity'

type Prepare = typeof prepareV2 | typeof prepareV3
type Runtime = ReturnType<Prepare>
type Core = Awaited<ReturnType<Runtime['load']>>

const SERVICE_CAPABILITIES = {
  account: { methods: ['getSession', 'getProfile', 'openLogin'], permissionGroups: ['account'] },
  app: { methods: ['getInfo', 'openSettings', 'openExternal'], permissionGroups: ['external'] },
  library: {
    methods: [
      'playlists.list',
      'playlists.getTracks',
      'playlists.import',
      'playlists.removeTracks',
      'playlists.clearPlaylist'
    ],
    permissionGroups: ['libraryRead', 'libraryManage', 'libraryDelete']
  },
  player: {
    methods: ['getState', 'play', 'pause', 'next', 'previous', 'seek', 'setVolume', 'setMode'],
    permissionGroups: ['playbackRead', 'playbackControl']
  },
  queue: {
    methods: ['get', 'append', 'replace', 'remove', 'reorder'],
    permissionGroups: ['playbackRead', 'playbackControl']
  },
  favorites: {
    methods: ['contains', 'add', 'remove'],
    permissionGroups: ['libraryRead', 'libraryManage']
  },
  history: { methods: ['list'], permissionGroups: ['playbackRead'] },
  downloads: {
    methods: ['list', 'create', 'pause', 'resume', 'cancel', 'retry', 'reveal'],
    permissionGroups: ['downloads']
  },
  files: {
    methods: ['pick', 'pickDirectory', 'readText', 'readBase64', 'saveText', 'writeText'],
    permissionGroups: ['files']
  },
  clipboard: {
    methods: ['readText', 'writeText'],
    permissionGroups: ['clipboardRead', 'clipboardWrite']
  },
  localMusic: {
    methods: ['list', 'scan', 'getTags', 'writeTags'],
    permissionGroups: ['localMusic']
  },
  settings: {
    methods: ['get', 'update'],
    permissionGroups: ['settingsRead', 'settingsWrite']
  },
  window: { methods: ['control'], permissionGroups: ['window'] },
  hotkeys: { methods: ['register'], permissionGroups: ['hotkeys'] },
  sharing: { methods: ['create', 'revoke', 'resolve'], permissionGroups: ['sharing'] },
  rooms: {
    methods: ['getState', 'join', 'leave', 'requestTrack'],
    permissionGroups: ['roomsRead', 'roomsControl']
  },
  devices: { methods: ['list', 'select'], permissionGroups: ['devices'] },
  ai: { methods: ['generate'], permissionGroups: ['ai'] },
  tasks: { methods: ['schedule', 'cancel'], permissionGroups: ['background'] }
} as const

const V3_STATE_PERMISSIONS = new Map([
  ['player.progress', 'player.read'],
  ['track.started', 'player.read'],
  ['track.finished', 'player.read'],
  ['route.changed', 'route.read']
])

const HOST_EVENTS = new Set([
  'entries.selectionChanged',
  ...V3_STATE_PERMISSIONS.keys(),
  'account.changed',
  'library.changed',
  'player.changed',
  'queue.changed',
  'lyrics.changed',
  'downloads.changed',
  'settings.changed',
  'theme.changed',
  'rooms.changed',
  'devices.changed',
  'permissions.changed'
])

/** Electron application services around the reusable pure-Node Core runtime. */
export default class DesktopPluginHost {
  pluginId?: string
  resolveStorageOwner: (manifestId: string) => string | undefined = () => undefined
  onThrottle: ((pluginId: string, reason: string, duration?: number) => void) | null = null
  onDisabled: ((pluginId: string, reason: string) => void) | null = null
  private core?: Core
  private runtime?: Runtime
  private get sandbox() {
    return this.runtime?.worker
  }
  private get sockets() {
    return this.runtime!.sockets
  }
  private readonly stopped = new AbortController()
  private selectionGrants = new AbortController()
  private drawerSessions = new Map<
    string,
    { sessionId: string; schema?: PluginDrawerSchema; web?: PluginWebDrawerSession }
  >()
  private readonly surfaceCapacity = new SurfaceCapacity()
  private webSessions = new Map<
    string,
    {
      web: PluginVisibleSession
      props: JsonObject
      overlay: boolean
      release: () => void
      mounted?: boolean
      lifecycle: ReturnType<Runtime['surface']>
      accountQr?: { state: JsonObject; cancel: () => void }
    }
  >()
  private surfaceStates = new Map<string, any>()
  private initialView?: Promise<void>
  private requests = new Map<string, Set<AbortController>>()
  private providerMethods = new Map<string, Set<string>>()
  private actionIds = new Set<string>()
  private disposed = false
  private storage?: PluginStorage
  private effectiveConfig: Readonly<Record<string, any>> = {}
  private guestStore?: ReturnType<Runtime['guests']>
  private socketTimer?: ReturnType<typeof setInterval>
  private readonly services = new HostServices(
    () => this.pluginId!,
    (id) => this.actionIds.has(id),
    (id, failure) => {
      const operation = this.operation()
      void this.sandbox
        ?.invoke('action', id, '', [], operation.signal, operation.id)
        .catch((error) => this.logger.warn(failure, error))
    }
  )

  private readonly permissions = new PluginPermissions(
    () => this.pluginId!,
    () => this.getPluginInfo().name,
    () => this.declarations(),
    () => this.disposed,
    async (keys, revoke, changedKeys) => {
      if (this.runtime && 'refreshHooks' in this.runtime) this.runtime.refreshHooks()
      if (revoke) {
        this.services.revokeAccess()
        pluginMedia.revoke(this.pluginId!)
        this.sockets.closeAll()
        for (const controllers of this.requests.values())
          for (const controller of controllers) controller.abort()
      }
      await this.sandbox?.send('host-event', { event: 'permissions.changed', value: { keys } })
      if (changedKeys.length) await this.publishLifecycle('onPermissionChange', changedKeys)
    }
  )

  constructor(
    private readonly prepare: Prepare,
    private pluginCode: string | null = null,
    private logger: Logger = console,
    private readonly developmentPreview = false
  ) {}
  updateRegionPreview(
    code: string,
    artifact: Parameters<ReturnType<typeof prepareV3>['updatePreview']>[0]
  ) {
    if (
      !this.developmentPreview ||
      this.disposed ||
      !this.runtime ||
      !('updatePreview' in this.runtime) ||
      this.drawerSessions.size ||
      [...this.webSessions.values()].some((session) => session.overlay)
    )
      return null
    const changed = this.runtime.updatePreview(artifact)
    if (changed !== null) this.pluginCode = code
    return changed
  }
  async loadPlugin(path: string, logger: Logger = console): Promise<this> {
    this.logger = logger
    this.pluginCode = await readFile(path, 'utf8')
    await this.ensureReady()
    return this
  }
  private static readonly idle = new IdleMonitor(() => powerMonitor.getSystemIdleTime())
  private idleSubscriptions = new Map<number, (() => void) | undefined>()
  private attachIdle(milliseconds: number) {
    if (!this.musicAttached || this.disposed || this.idleSubscriptions.get(milliseconds)) return
    this.idleSubscriptions.set(
      milliseconds,
      DesktopPluginHost.idle.subscribe(milliseconds, () => {
        void this.sandbox?.send('idle', { milliseconds }).catch(console.warn)
      })
    )
  }
  private musicAttached = false
  private musicDisposers = new Map<string, () => unknown>()
  private importerIds = new Set<string>()
  attachMusic() {
    if (this.musicAttached || this.disposed) return
    this.musicAttached = true
    for (const milliseconds of this.idleSubscriptions.keys()) this.attachIdle(milliseconds)
    if (this.runtime && 'activateServices' in this.runtime) this.runtime.activateServices()
    for (const id of this.providerMethods.keys()) this.registerMusic('provider', id)
    for (const id of this.importerIds) this.registerMusic('playlist-importer', id)
    if (this.getDescriptor().runtime === 3)
      this.musicDisposers.set(
        'events',
        musicRegistry.on('sources.changed', (sources) => {
          if (
            !this.disposed &&
            this.declarations().some(
              (item) =>
                item.name === 'music.read' && this.permissions.status(item.key) === 'granted'
            )
          )
            void this.sandbox
              ?.send('host-event', { event: 'music.sources.changed', value: sources })
              .catch(() => {})
        })
      )
  }
  private registerMusic(kind: string, id: string) {
    if (!this.musicAttached || this.disposed) return
    const descriptor = this.getDescriptor(),
      pluginId = this.pluginId!,
      ownerId = descriptor.id,
      runtime = descriptor.runtime
    const key = kind + ':' + id
    if (kind === 'provider' && id !== 'local') {
      const declaration = descriptor.providers.find((source) => source.id === id)
      if (declaration)
        this.musicDisposers.set(
          key,
          musicRegistry.register(
            {
              pluginId,
              ownerId,
              runtime,
              providerId: id,
              declaration,
              methods: [...(this.providerMethods.get(id) ?? [])],
              icon: this.getProviderIconUrls()[id]
            },
            (method, args, operation) => this.core!.invokeProvider(id, method, args, operation)
          )
        )
    } else if (kind === 'playlist-importer') {
      const declaration = descriptor.importers.find((importer) => importer.id === id)
      if (declaration)
        this.musicDisposers.set(
          key,
          musicRegistry.registerImporter(
            { pluginId, ownerId, runtime, declaration },
            (_method, [input], operation) =>
              this.core!.importPlaylist(id, input.value, input.cursor, input.limit, operation)
          )
        )
    }
  }
  private registrations = new Map<string, () => unknown>()
  private onWorkerEvent = (type: string, data: any) => this.event(type, data)
  async ensureReady(): Promise<void> {
    if (this.core) return
    if (!this.pluginCode) throw new Error('Missing plugin artifact')
    const runtime = this.prepare(this.pluginCode, {
      services: this.services,
      pluginId: this.pluginId!,
      log: this.logger,
      signal: this.stopped.signal,
      development: this.developmentPreview,
      granted: (name) =>
        this.declarations().some(
          (item) => item.name === name && this.permissions.status(item.key) === 'granted'
        ),
      authorize: (key, name) => this.permissions.authorize(key ?? '', name),
      rpc: (method, data, signal) => this.rpc(method, data, signal),
      event: (type, data) => this.onWorkerEvent(type, data),
      operationState: async (signal) => {
        const can = (name: string) =>
          this.declarations().some(
            (item) => item.name === name && this.permissions.status(item.key) === 'granted'
          )
        const access = this.services.accessSignal(signal)
        const selected = {
          player: can('player.read'),
          route: can('route.read'),
          account: can('account.profile')
        }
        if (!Object.values(selected).some(Boolean))
          return { player: null, route: null, account: null }
        const state = await callPluginUI(this.pluginId!, 'operation.state', selected, access)
        access.throwIfAborted()
        return {
          player: can('player.read') ? state.player : null,
          route: can('route.read') ? state.route : null,
          account: can('account.profile') ? state.account : null
        }
      }
    })
    this.runtime = runtime
    if (runtime.descriptor.guestAdapters.length) {
      this.guestStore = runtime.guests({
        root: join(getAppDirPath(), 'plugins', 'guests', this.pluginId!),
        approve: (info) =>
          callPluginUI(this.pluginId!, 'ui.dialogs.confirm', {
            title: '安装子插件',
            message: `${info.name} ${info.version}${info.author ? ' · ' + info.author : ''}\n将安装到${this.getPluginInfo().name}，首次网络请求会单独申请授权。`,
            confirmText: '安装'
          }),
        authorize: (guest, permission) =>
          callPluginUI(this.pluginId!, 'ui.permissions.request', {
            pluginName: guest.name + '（子插件）',
            title: permission === 'network' ? '访问公网服务' : '访问局域网与本机服务',
            description: '此授权仅属于该子插件，不与兼容环境或其他音源共享。'
          }),
        request: runtime.requestNetwork,
        changed: () => {
          pluginChanged()
          for (const { web } of this.webSessions.values())
            publishPluginSurface(this.pluginId!, web.sessionId, {
              ...(this.surfaceStates.get(web.surfaceId) ?? {}),
              guestsChanged: true
            })
        },
        event: (guest, type, data) => {
          if (type === 'log')
            this.logger.info(`[guest:${guest.id}] ${guest.name}`, this.redactGuestLog(data.values))
          if (type === 'notify' && data.level === 'warning') {
            void callPluginUI(this.pluginId!, 'ui.toast', {
              message: `${guest.name}：${data.message}`,
              level: 'warning'
            }).catch(() => {})
          } else if (type === 'notify')
            sendPluginNotice({
              type: data.updateUrl ? 'update' : 'info',
              pluginId: this.pluginId,
              guestId: guest.id,
              pluginName: guest.name,
              currentVersion: guest.version,
              data: { url: data.updateUrl, content: String(data.message) }
            })
        }
      })
      await this.guestStore.initialize()
    }
    this.permissions.initialize()
    this.storage = new PluginStorage(
      this.pluginId || runtime.descriptor.id,
      runtime.descriptor.id,
      (id) => this.resolveStorageOwner(id)
    )
    this.core = await runtime.load(async (context) => {
      this.effectiveConfig = await context.config.get()
      this.onWorkerEvent = (type, data) => {
        if (type === 'route-observer' && runtime.descriptor.runtime === 3) {
          this.observesRoutes = data?.active === true
          return
        }
        if (type === 'idle-listener' && runtime.descriptor.runtime === 3 && !this.disposed) {
          const ms = data?.milliseconds
          if (!Number.isSafeInteger(ms) || ms < 60000 || typeof data.active !== 'boolean') return
          if (data.active && !this.idleSubscriptions.has(ms) && this.idleSubscriptions.size < 64) {
            this.idleSubscriptions.set(ms, undefined)
            this.attachIdle(ms)
          } else if (!data.active) {
            this.idleSubscriptions.get(ms)?.()
            this.idleSubscriptions.delete(ms)
          }
          return
        }
        if (type === 'quit-listener' && runtime.descriptor.runtime === 3) {
          this.quitListener = data?.active === true
          return
        }
        if (type === 'register') {
          const key = data.kind + ':' + data.id
          this.registrations.get(key)?.()
          if (data.kind === 'provider') {
            this.providerMethods.set(data.id, new Set(data.methods ?? []))
            const implementation: any = {}
            for (const path of data.methods ?? []) {
              if (!/^(tracks|playlists|charts|sharing)\.[a-zA-Z]+$/.test(path)) continue
              const [group, name] = path.split('.')
              implementation[group] ??= {}
              implementation[group][name] = async (...args: any[]) => {
                const operation = args.pop()
                if (runtime.manifest.manifestVersion === 3) {
                  const item = runtime.descriptor.accounts.find((entry) =>
                    entry.providers?.includes(data.id)
                  )
                  if (item) {
                    const requested =
                      args[0]?.kind && typeof args[0].connectionId === 'string'
                        ? args[0].connectionId
                        : undefined
                    const connection = await this.accountRuntime().providerConnection(
                      item,
                      requested
                    )
                    return runtime.worker.invoke(
                      'provider',
                      data.id,
                      path,
                      args,
                      operation.signal,
                      operation.id,
                      connection
                    )
                  }
                }
                return this.sandbox!.invoke(
                  'provider',
                  data.id,
                  path,
                  args,
                  operation.signal,
                  operation.id
                )
              }
            }
            this.registrations.set(key, context.providers.register(data.id, implementation))
          } else if (data.kind === 'action') {
            this.actionIds.add(data.id)
            this.registrations.set(
              key,
              context.actions.register(data.id, (input, operation) =>
                this.sandbox!.invoke('action', data.id, '', [input], operation.signal, operation.id)
              )
            )
          } else if (data.kind === 'playlist-importer')
            this.registrations.set(
              key,
              context.playlistImporters.register(data.id, {
                getTracks: (input, operation) =>
                  this.sandbox!.invoke(
                    'playlist-importer',
                    data.id,
                    'getTracks',
                    [input],
                    operation.signal,
                    operation.id
                  )
              })
            )
          else if (data.kind === 'lyric-converter')
            this.registrations.set(
              key,
              context.lyricConverters.register(data.id, {
                parse: (input, operation) =>
                  this.sandbox!.invoke(
                    'lyric-converter',
                    data.id,
                    'parse',
                    [input],
                    operation.signal
                  ),
                export: (input, operation) =>
                  this.sandbox!.invoke(
                    'lyric-converter',
                    data.id,
                    'export',
                    [input],
                    operation.signal
                  )
              })
            )
          if (data.kind === 'playlist-importer') this.importerIds.add(data.id)
          this.registerMusic(data.kind, data.id)
        } else if (type === 'unregister') {
          this.musicDisposers.get(data.kind + ':' + data.id)?.()
          this.musicDisposers.delete(data.kind + ':' + data.id)
          if (data.kind === 'playlist-importer') this.importerIds.delete(data.id)
          this.registrations.get(data.kind + ':' + data.id)?.()
          this.registrations.delete(data.kind + ':' + data.id)
          if (data.kind === 'provider') this.providerMethods.delete(data.id)
          if (data.kind === 'action') this.actionIds.delete(data.id)
        } else this.event(type, data)
      }
      await runtime.start()
      this.socketTimer = setInterval(() => {
        for (const event of this.sockets.drain()) void this.sandbox?.send('socket-event', event)
      }, 100)
      return () => this.sandbox?.dispose()
    })
    for (const guest of this.guestStore?.list() ?? []) {
      if (guest.selected)
        void this.guestStore!.select(guest.id).catch((error) =>
          this.logger.warn(
            '子插件启动失败:',
            error instanceof Error ? error.message : String(error)
          )
        )
    }
  }
  getPluginInfo(): any {
    const m = this.runtime!.manifest
    return {
      id: m.id,
      name: m.name,
      version: m.version,
      author: m.author || m.publisher || '',
      description: m.description
    }
  }
  getPluginCode() {
    return this.pluginCode
  }
  async getShareResolverCode(): Promise<string> {
    if (!this.runtime || this.disposed) throw new Error('请先使用音源插件')
    const share = this.runtime.share
    if (!share) throw new Error('此插件未提供服务器分享解析模块')
    const guest = share.guestAdapterId
      ? await this.guestStore?.exportSelected(share.guestAdapterId)
      : undefined
    return this.runtime.resolver(
      { ...this.effectiveConfig, ...getPluginConfig(this.pluginId!) },
      guest
    )
  }
  getManifest(): any {
    const { config: _config, ...manifest } = this.runtime!.manifest
    return manifest
  }
  getDescriptor() {
    const descriptor = this.runtime!.descriptor
    const selected = this.guestStore?.list().find((item) => item.selected)
    if (!selected) return descriptor
    return {
      ...descriptor,
      providers: descriptor.providers.map((provider) => ({
        ...provider,
        qualities: selected.providers.find((item) => item.id === provider.id)?.qualities ?? []
      }))
    }
  }
  getSupportedSources(): any {
    return Object.fromEntries(
      this.getDescriptor().providers.map((p: any) => [
        p.id,
        {
          name: p.name,
          qualitys: p.qualities ?? [],
          qualities: p.qualities ?? [],
          icon: p.icon,
          protocols: p.protocols
        }
      ])
    )
  }
  private assetIconUrl(id: string): string | undefined {
    const resource = this.runtime?.resources[id]
    if (!resource || (resource.type !== 'text' && resource.type !== 'base64')) return
    const mime = 'mime' in resource ? resource.mime : undefined
    if (
      !mime ||
      !['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)
    )
      return
    if (typeof resource.value !== 'string' || resource.value.length > 128 * 1024) return
    return (
      'data:' +
      mime +
      ';base64,' +
      (resource.type === 'base64'
        ? resource.value
        : Buffer.from(resource.value, 'utf8').toString('base64'))
    )
  }
  getProviderIconUrls(): Record<string, string> {
    const icons: Record<string, string> = Object.create(null)
    for (const provider of this.runtime?.descriptor.providers ?? []) {
      if (!provider.icon) continue
      const url = provider.icon.kind === 'host'
        ? hostIconDataUrl(provider.icon.name)
        : this.assetIconUrl(provider.icon.resource)
      if (url) icons[provider.id] = url
    }
    return icons
  }
  getSidebarIconUrls(): Record<string, string> {
    const icons: Record<string, string> = Object.create(null)
    for (const page of this.runtime?.descriptor.pages ?? []) {
      if (page.mount !== 'sidebar' || !page.icon) continue
      const url =
        page.icon.kind === 'host'
          ? hostIconDataUrl(page.icon.name)
          : this.assetIconUrl(page.icon.resource)
      if (url) icons[page.id] = url
    }
    return icons
  }
  getSkinPreviewUrls(): Record<string, string> {
    const previews: Record<string, string> = Object.create(null)
    for (const skin of this.runtime?.descriptor.skins ?? []) {
      if (!skin.preview) continue
      const url =
        skin.preview.kind === 'host'
          ? hostIconDataUrl(skin.preview.name)
          : this.assetIconUrl(skin.preview.resource)
      if (url) previews[skin.id] = url
    }
    return previews
  }
  getPluginType(): 'music-source' | 'service' {
    return 'music-source'
  }
  getConfigSchema(): any[] {
    return []
  }
  isV2() {
    return this.runtime?.descriptor.runtime === 2
  }
  isDisabled() {
    return this.disposed
  }
  supportsV2Provider(id: string, method?: string) {
    if (this.disposed || !this.core?.snapshot().providers.includes(id)) return false
    return !method || this.providerMethods.get(id)?.has(method) === true
  }
  supportsShareResolver() {
    return !this.disposed && Boolean(this.runtime?.share)
  }
  supportsAction(id: string) {
    return !this.disposed && this.actionIds.has(id)
  }
  getProviderMethods() {
    return Object.fromEntries(
      [...this.providerMethods].map(([providerId, methods]) => [providerId, [...methods]])
    )
  }
  getActionIds() {
    return [...this.actionIds]
  }
  getRegistrationInfo() {
    const snapshot = this.core?.snapshot()
    // Expose registration identities only. Never forward the private config/manifest snapshot.
    // Future registry collections remain discoverable without adding another UI whitelist.
    return Object.fromEntries(
      Object.entries(snapshot ?? {}).filter(
        ([key, value]) =>
          key !== 'manifest' &&
          key !== 'config' &&
          Array.isArray(value) &&
          value.every((item) => typeof item === 'string')
      )
    ) as Record<string, string[]>
  }
  private operation() {
    return {
      id: randomUUID(),
      deadlineAt: Date.now() + 120000,
      signal: new AbortController().signal
    }
  }
  private async traced(
    label: string,
    run: (operation: ReturnType<DesktopPluginHost['operation']>) => Promise<any>
  ) {
    if (!this.core) throw new Error('插件尚未激活')
    const operation = this.operation()
    const start = Date.now()
    this.logger.info(`[request:${operation.id}] ${label} 开始`)
    try {
      const result = await run(operation)
      const status = result?.ok === false ? '失败：' + result.error?.message : '完成'
      const level =
        result?.ok !== false
          ? 'info'
          : ['RATE_LIMITED', 'AUTH_REQUIRED', 'ENTITLEMENT_EXPIRED', 'CANCELLED'].includes(
                result.error?.code
              )
            ? 'warn'
            : 'error'
      this.logger[level](`[request:${operation.id}] ${label} ${status}`, {
        elapsedMs: Date.now() - start,
        ...(result?.ok === false
          ? {
              code: result.error?.code,
              retryAfterMs: result.error?.retryAfterMs,
              recovery: result.error?.recovery?.mode
            }
          : {}),
        ...(Array.isArray(result?.items)
          ? { items: result.items.length, nextCursor: result.nextCursor ?? null }
          : {})
      })
      return result
    } catch (error) {
      this.logger.error(`[request:${operation.id}] ${label} 失败`, {
        elapsedMs: Date.now() - start,
        message: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }
  async invokeV2Provider(id: string, method: string, args: any[] = []): Promise<any> {
    return this.traced(`${id}.${method}`, (operation) =>
      this.core!.invokeProvider(id, method, args, operation)
    )
  }
  async invokeV2Action(id: string, input: any = {}, signal?: AbortSignal): Promise<any> {
    return this.traced(id, (operation) =>
      this.core!.invokeAction(id, input, { ...operation, signal: signal ?? operation.signal })
    )
  }
  async invokeV2Importer(id: string, input: any): Promise<any> {
    return this.traced(id, (operation) =>
      this.core!.importPlaylist(id, input.value, input.cursor, input.limit ?? 100, operation)
    )
  }
  private resource(source: string, song: any) {
    const original = song.pluginResource
    if (original) return retargetTrackRef(original, this.getPluginInfo().id)
    return {
      pluginId: this.getPluginInfo().id,
      providerId: source,
      kind: 'track',
      id: String(song.songmid ?? song.hash ?? song.id),
      scope: 'provider' as const
    }
  }
  async getMusicUrl(source: string, song: any, quality: string): Promise<string> {
    const result = await this.invokeV2Provider(source, 'tracks.resolve', [
      this.resource(source, song),
      quality
    ])
    if (!result.ok) {
      if (['await-user', 'stop-current', 'retry-later'].includes(result.error.recovery?.mode))
        this.onThrottle?.(this.pluginId!, result.error.message, result.error.retryAfterMs)
      throw new Error(result.error.message)
    }
    if (this.getDescriptor().runtime === 3) {
      const prepared = await pluginMedia.prepare(this.pluginId!, result, this.services.accessSignal())
      if (result.stream) return prepared.url
    }
    registerPlaybackRequest(result.url, result.requestHeaders, result.expiresAt)
    return result.url
  }
  async getPic(source: string, song: any) {
    return this.invokeV2Action('artwork.get', { source, song })
  }
  /**
   * 高清封面协议（可选）。
   *
   * 走 provider 方法 `tracks.artworkHires`（不是 action）——它天然与 provider 绑定，
   * 宿主只在插件确实实现了它时才调用（`supportsV2Provider(source, 'tracks.artworkHires')`）。
   * 插件未实现时本方法返回 undefined，调用方回落原封面。
   *
   * 请求体带上**完整 songInfo**：插件通常直接用它已有的 `img` 做尺寸转换即可
   * （无需新请求）；需要时也能据此自行发起请求。
   */
  async getHiresPic(source: string, song: any, artworkUrl: string, targetSize?: number) {
    if (!this.supportsV2Provider(source, 'tracks.artworkHires')) {
      console.log(
        `[SMTC-高清] [${this.getPluginInfo().id}] 插件未实现 tracks.artworkHires（source=${source}）→ 不支持`
      )
      return undefined
    }
    console.log(
      `[SMTC-高清] [${this.getPluginInfo().id}] 调用 tracks.artworkHires source=${source} ` +
        `targetSize=${targetSize ?? '默认'} artworkUrl=${artworkUrl ? artworkUrl.slice(0, 140) : '（空）'}`
    )
    const result = await this.invokeV2Provider(source, 'tracks.artworkHires', [
      this.resource(source, song),
      { song, artworkUrl, targetSize }
    ])
    console.log(
      `[SMTC-高清] [${this.getPluginInfo().id}] 插件返回: ${typeof result === 'string' ? result.slice(0, 140) : String(result)}`
    )
    return typeof result === 'string' && result ? result : undefined
  }
  async getLyric(source: string, song: any) {
    const document = await this.invokeV2Provider(source, 'tracks.lyrics', [
      this.resource(source, song)
    ])
    return (await this.convertLyrics('export', { document, format: 'lrc' })).text
  }
  async convertLyrics(
    method: 'parse' | 'export',
    request: any,
    converterId?: string,
    timeoutMs?: number
  ) {
    const converter = this.getDescriptor().lyricConverters.find(
      (item: any) =>
        (!converterId || item.id === converterId) &&
        (method === 'export' ||
          item.formats.includes(request.format) ||
          item.formats.includes('auto'))
    )
    if (!converter || !this.core) throw new Error('插件未提供此歌词格式转换能力')
    const operation = this.operation()
    if (timeoutMs) {
      operation.deadlineAt = Date.now() + timeoutMs
      operation.signal = AbortSignal.timeout(timeoutMs)
    }
    return this.core.convertLyrics(converter.id, method, request, operation)
  }
  async getServiceLyric(_config: any, song: any) {
    return { lyric: await this.getLyric(song.source, song) }
  }
  async testConnection(_config?: any) {
    await this.invokeV2Action('source.status')
    return { success: true, message: '连接成功' }
  }
  async getPlaylists(_config?: any): Promise<any> {
    throw new Error('请使用插件提供的歌单 Provider')
  }
  async getPlaylistSongs(_config: any, _id: string): Promise<any> {
    throw new Error('请使用插件提供的歌单导入入口')
  }
  private declarations() {
    return this.runtime?.descriptor.permissions ?? []
  }
  getGrantedPermissions() {
    return this.permissions.getGrantedPermissions()
  }
  getAccessSignal() {
    return this.services.accessSignal()
  }
  setGrantedPermissions(keys: string[]) {
    const previous = this.getGrantedPermissions()
    this.permissions.setGrantedPermissions(keys)
    if (previous.some((key) => !this.getGrantedPermissions().includes(key))) {
      this.selectionGrants.abort()
      this.selectionGrants = new AbortController()
    }
  }

  private async rpc(method: string, data: any = {}, signal?: AbortSignal): Promise<any> {
    if (this.disposed) throw new Error('Plugin stopped')
    if (
      method === 'ui.pages.open' ||
      method === 'ui.pages.close' ||
      method === 'ui.views.setState'
    ) {
      const descriptor = this.getDescriptor()
      if (descriptor.runtime !== 3) throw Error('此接口仅支持 v3')
      const [id, value] = data.args
      if (method === 'ui.views.setState') {
        this.event('state', { surfaceId: id, state: value })
      } else {
        const viewId = descriptor.pages.find((page) => page.id === id)?.view ?? id
        if (method === 'ui.pages.open') await this.openSurface(viewId, value)
        else
          for (const { web, overlay } of [...this.webSessions.values()]) {
            if (overlay && web.surfaceId === viewId) await this.closeDrawer(viewId, web.sessionId)
          }
      }
      return null
    }
    if (method.startsWith('guests.')) {
      if (!this.guestStore) throw new Error('此插件不是兼容环境')
      if (method === 'guests.list') return this.guestStore.list()
      const permission = method === 'guests.invoke' ? 'guests.run' : 'guests.manage'
      const declaration = this.declarations().find((item) => item.name === permission)
      if (!declaration) throw new Error('兼容环境未声明子插件权限')
      await this.permissions.authorize(declaration.key, permission)
      if (method === 'guests.import') return this.importGuest(data.adapterId)
      if (method === 'guests.select') {
        await this.guestStore.select(data.guestId)
        return null
      }
      if (method === 'guests.remove') {
        await this.guestStore.remove(data.guestId)
        return null
      }
      if (method === 'guests.invoke')
        return this.guestStore.invoke(data.guestId, data.method, data.input)
      throw new Error('未知子插件操作')
    }
    if (method === 'permissions.query') return { status: this.permissions.status(data.key) }
    if (method === 'permissions.request') return this.permissions.requestPermission(data.key)
    if (method === 'permissions.getGranted')
      return this.declarations()
        .filter((p) => this.permissions.status(p.key) === 'granted')
        .map((p) => ({
          ...p,
          scope: p.scope ?? {},
          status: 'granted',
          group: permissionGroup(p.name)
        }))
    if (method === 'permissions.requestGroup') {
      const entries = this.declarations().filter(
        (p) => permissionGroup(p.name) === data.group && (!data.keys || data.keys.includes(p.key))
      )
      for (const p of entries) await this.permissions.requestPermission(p.key)
      return {
        group: data.group,
        status:
          entries.length && entries.every((p) => this.permissions.status(p.key) === 'granted')
            ? 'granted'
            : 'denied',
        grants: await this.rpc('permissions.getGranted')
      }
    }
    if (method === 'config.get')
      return { ...this.effectiveConfig, ...getPluginConfig(this.pluginId!) }
    if (method === 'sockets.connect') {
      await this.permissions.authorize(data.permissionKey, 'network.socket')
      const result = await this.sockets.connect(
        data,
        this.declarations().some(
          (p) => p.name === 'network.private' && this.permissions.status(p.key) === 'granted'
        ),
        []
      )
      if (this.permissions.status(data.permissionKey) !== 'granted' || this.disposed) {
        this.sockets.disconnect(result.id)
        throw new Error('网络授权已撤销')
      }
      return result
    }
    if (method === 'sockets.send') {
      this.sockets.send(data.id, data.event, data.data)
      return null
    }
    if (method === 'sockets.disconnect') {
      this.sockets.disconnect(data.id)
      return null
    }
    if (method === 'http.request') {
      await this.permissions.authorize(data.permissionKey, 'network.request')
      const controller = new AbortController()
      const id = String(data.operation?.id ?? randomUUID())
      const controllers = this.requests.get(id) ?? new Set<AbortController>()
      controllers.add(controller)
      this.requests.set(id, controllers)
      const url = new URL(data.url)
      const label = url.origin + url.pathname
      const start = Date.now()
      this.logger.debug(`[request:${id}] HTTP ${data.method || 'GET'} ${label} 开始`)
      try {
        const request =
          this.runtime!.descriptor.runtime === 3 && data.credential != null
            ? await this.accountRuntime().authorizeRequest(
                this.getDescriptor().accounts,
                data,
                (origin) =>
                  this.declarations().some(
                    (permission) =>
                      permission.name === 'credentials.use' &&
                      this.permissions.status(permission.key) === 'granted' &&
                      Array.isArray(permission.scope?.origins) &&
                      permission.scope.origins.includes(origin)
                  )
              )
            : data
        const response = await this.runtime!.requestNetwork(
          request,
          () =>
            this.declarations().some(
              (p) => p.name === 'network.private' && this.permissions.status(p.key) === 'granted'
            ),
          signal ? AbortSignal.any([signal, controller.signal]) : controller.signal
        )
        const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'debug'
        this.logger[level](`[request:${id}] HTTP ${label} 返回`, {
          status: response.status,
          elapsedMs: Date.now() - start,
          code: data.credential ? null : (response.body?.code ?? null)
        })
        return response
      } catch (error) {
        this.logger.error(`[request:${id}] HTTP ${label} 失败`, {
          elapsedMs: Date.now() - start,
          message: error instanceof Error ? error.message : String(error)
        })
        throw error
      } finally {
        controllers.delete(controller)
        if (!controllers.size) this.requests.delete(id)
      }
    }
    if (method === 'operations.cancel') {
      for (const controller of this.requests.get(data.id) ?? []) controller.abort()
      return null
    }
    if (method === 'storage.get' || method === 'storage.set' || method === 'storage.delete')
      return this.storage!.invoke(method.slice(8) as 'get' | 'set' | 'delete', data.key, data.value)
    if (method.startsWith('library.playlists.')) {
      const lifetime = this.services.accessSignal(signal)
      const libraryCapability = method.endsWith('.import')
        ? 'library.write'
        : method.endsWith('.removeTracks') || method.endsWith('.clearPlaylist')
          ? 'library.delete'
          : 'library.read'
      await this.permissions.authorize(data.permissionKey, libraryCapability)
      if (method.endsWith('.import')) {
        assertContentPage({ items: data.items })
        if (data.items.some((item: any) => item.ref.kind !== 'track'))
          throw new Error('歌单只接收标准歌曲')
      }
      if (method.endsWith('.removeTracks')) {
        // 批量校验，避免未校验的引用被转发到渲染层。
        assertRemovableTracks(data.items)
      }
      const { id: pluginId, runtime } = this.getDescriptor()
      const write = () =>
        this.services.changePlaylistTracks(
          method,
          data,
          { kind: 'plugin', pluginId, runtime },
          lifetime
        )
      if (method.endsWith('.removeTracks')) return write()
      if (!method.endsWith('.import')) return this.services.forward(method, data)
      if (typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 256)
        throw new Error('导入请求缺少有效 requestId')
      const key = data.requestId + ':' + canonical(data.target ?? null)
      return this.services.importPlaylist(key, write)
    }
    if (method.startsWith('services.capabilities.')) {
      const entries = Object.entries(SERVICE_CAPABILITIES).map(([service, capability]) => ({
        service,
        version: '1.0.0',
        available: true,
        methods: [...capability.methods],
        permissionGroups: [...capability.permissionGroups]
      }))
      if (method.endsWith('.list')) return entries
      return (
        entries.find((e) => e.service === data.args?.[0]) ?? {
          service: data.args?.[0],
          version: '1.0.0',
          available: false,
          reason: 'unsupported',
          permissionGroups: []
        }
      )
    }
    if (method === 'services.app.getInfo') {
      return this.services.appInfo('1.0.0')
    }
    if (method === 'services.app.openExternal') {
      await this.permissions.authorize(data.args?.[1]?.permissionKey, 'external.open')
      const url = new URL(String(data.args?.[0] ?? ''))
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password)
        throw new Error('只能打开 HTTP 或 HTTPS 地址')
      return this.services.openExternal(url)
    }
    if (method === 'services.account.getSession' || method === 'services.account.getProfile') {
      await this.permissions.authorize(data.args?.[0]?.permissionKey, 'account.profile')
      return this.services.forward(method, data)
    }
    const ownedRef = (ref: unknown, kind: 'track' | 'playlist') => {
      assertResourceRef(ref)
      const manifest = this.getDescriptor()
      if (
        manifest.runtime === 3 &&
        kind === 'track' &&
        ref.kind === kind &&
        (method.startsWith('services.player.') || method.startsWith('services.queue.')) &&
        !ref.connectionId &&
        this.declarations().some(
          (item) => item.name === 'music.control' && this.permissions.status(item.key) === 'granted'
        )
      ) {
        const safe = musicRegistry.playbackRef(ref, this.pluginId!)
        for (const key of Object.keys(ref)) delete (ref as any)[key]
        Object.assign(ref, safe)
        return
      }
      if (
        ref.kind !== kind ||
        ref.pluginId !== manifest.id ||
        !manifest.providers.some((provider) => provider.id === ref.providerId)
      )
        throw new Error('插件只能操作自己声明的资源')
    }
    if (method.startsWith('services.player.') || method.startsWith('services.queue.')) {
      const read = method === 'services.player.getState' || method === 'services.queue.get'
      const callIndex =
        method === 'services.player.play'
          ? 1
          : method === 'services.queue.reorder'
            ? 2
            : ['getState', 'pause', 'next', 'previous', 'get'].some((name) =>
                  method.endsWith('.' + name)
                )
              ? 0
              : 1
      await this.permissions.authorize(
        data.args?.[callIndex]?.permissionKey,
        read ? 'player.read' : 'player.control'
      )
      if (method === 'services.queue.replace' || method === 'services.queue.append') {
        assertContentPage({ items: data.args?.[0] })
        for (const item of data.args[0]) ownedRef(item.ref, 'track')
      } else if (method === 'services.player.play' && data.args?.[0] != null)
        ownedRef(data.args[0], 'track')
      else if (method === 'services.queue.remove' || method === 'services.queue.reorder')
        for (const ref of data.args?.[0] ?? []) ownedRef(ref, 'track')
      return this.services.forward(method, data)
    }
    if (method.startsWith('services.favorites.')) {
      const write = !method.endsWith('.contains')
      const lifetime = this.services.accessSignal(signal)
      await this.permissions.authorize(
        data.args?.[1]?.permissionKey,
        write ? 'library.write' : 'library.read'
      )
      for (const ref of data.args?.[0] ?? []) ownedRef(ref, 'track')
      if (write && this.getDescriptor().runtime === 3) {
        if (!Array.isArray(data.args?.[0])) throw Error('无效的收藏歌曲列表')
        return this.services.namedFavorites(
          this.getDescriptor().id,
          data.args[0],
          method.endsWith('.add'),
          lifetime
        )
      }
      return this.services.forward(method, data)
    }
    if (method === 'services.history.list') {
      await this.permissions.authorize(data.args?.[1]?.permissionKey, 'player.read')
      return this.services.forward(method, data)
    }
    if (method.startsWith('services.downloads.')) {
      const name = method.slice('services.downloads.'.length)
      const callIndex = name === 'list' ? 0 : 1
      await this.permissions.authorize(
        data.args?.[callIndex]?.permissionKey,
        name === 'create' ? 'downloads.create' : 'downloads.manage'
      )
      if (name === 'create') {
        const request = data.args?.[0] ?? {}
        if (
          !Array.isArray(request.tracks) ||
          request.tracks.length < 1 ||
          request.tracks.length > 100
        )
          throw new Error('一次只能创建 1 到 100 个下载任务')
        for (const ref of request.tracks) ownedRef(ref, 'track')
        data.args[0] = {
          tracks: request.tracks,
          ...(typeof request.quality === 'string' ? { quality: request.quality } : {}),
          ...(request.directory
            ? {
                internalDirectoryPath: this.services.fileEntry(request.directory, 'directory').path
              }
            : {})
        }
      }
      return this.services.forward(method, data)
    }
    if (method.startsWith('services.files.')) {
      if (method === 'services.files.readText' || method === 'services.files.readBase64')
        await this.permissions.authorize(data.args?.[1]?.permissionKey, 'files.read')
      if (method === 'services.files.writeText')
        await this.permissions.authorize(data.args?.[2]?.permissionKey, 'files.write')
      return this.services.handleFileService(method, data.args ?? [])
    }
    if (method === 'services.clipboard.readText') {
      await this.permissions.authorize(data.args?.[0]?.permissionKey, 'clipboard.read')
      return this.services.readClipboard()
    }
    if (method === 'services.clipboard.writeText') {
      await this.permissions.authorize(data.args?.[1]?.permissionKey, 'clipboard.write')
      return this.services.writeClipboard(String(data.args?.[0] ?? ''))
    }
    if (method.startsWith('services.localMusic.')) {
      const name = method.slice('services.localMusic.'.length)
      const callIndex = name === 'writeTags' ? 2 : name === 'scan' ? 1 : 1
      await this.permissions.authorize(
        data.args?.[callIndex]?.permissionKey,
        name === 'writeTags' ? 'localMusic.write' : 'localMusic.read'
      )
      if (name === 'scan')
        data = { ...data, args: [this.services.resolveDirectories(data.args?.[0]), data.args?.[1]] }
      return this.services.forward(method, data)
    }
    if (method.startsWith('services.settings.')) {
      const write = method.endsWith('.update')
      await this.permissions.authorize(
        data.args?.[1]?.permissionKey,
        write ? 'settings.write' : 'settings.read'
      )
      return this.services.forward(method, data)
    }
    if (method === 'services.window.control') {
      await this.permissions.authorize(data.args?.[1]?.permissionKey, 'window.control')
      return this.services.controlWindow(data)
    }
    if (method === 'services.hotkeys.register') {
      await this.permissions.authorize(data.args?.[1]?.permissionKey, 'hotkeys.register')
      return this.services.registerPluginHotkey(data.args ?? [])
    }
    if (method === 'services.hotkeys.unregister')
      return this.services.unregisterPluginHotkey(data.args?.[0])
    if (method.startsWith('services.sharing.')) {
      if (method !== 'services.sharing.resolve')
        await this.permissions.authorize(
          data.args?.[1]?.permissionKey,
          method === 'services.sharing.revoke' ? 'sharing.revoke' : 'sharing.publish'
        )
      if (method === 'services.sharing.create') ownedRef(data.args?.[0]?.track, 'track')
      return this.services.handleSharingService(
        method,
        data.args ?? [],
        {
          kind: 'plugin',
          pluginId: this.getDescriptor().id,
          runtime: this.getDescriptor().runtime
        },
        this.services.accessSignal(signal)
      )
    }
    if (method.startsWith('services.rooms.')) {
      const name = method.slice('services.rooms.'.length)
      await this.permissions.authorize(
        data.args?.[name === 'getState' || name === 'leave' ? 0 : 1]?.permissionKey,
        name === 'getState' ? 'rooms.read' : 'rooms.control'
      )
      if (name === 'requestTrack') ownedRef(data.args?.[0], 'track')
      return this.services.forward(method, data)
    }
    if (method.startsWith('services.devices.')) {
      const name = method.slice('services.devices.'.length)
      await this.permissions.authorize(
        data.args?.[name === 'list' ? 0 : 1]?.permissionKey,
        'devices.control'
      )
      return this.services.forward(method, data)
    }
    if (method === 'services.ai.generate') {
      await this.permissions.authorize(data.args?.[1]?.permissionKey, 'ai.use')
      return this.services.forward(method, data)
    }
    if (method.startsWith('services.tasks.')) {
      await this.permissions.authorize(data.args?.[1]?.permissionKey, 'background.run')
      return this.services.handleTaskService(method, data.args ?? [])
    }
    if (method === 'accounts.current') {
      if (!this.pluginId || this.runtime?.descriptor.runtime !== 3) throw Error('插件账号不可用')
      const accountId = this.accountDeclaration(data.accountId).id
      const state = await readAccounts({ pluginId: this.pluginId, accountId })
      const current = state.rows.find((row) => row.id === state.active)
      return current ? { connectionId: current.id, expired: current.expired === true } : null
    }
    if (method === 'accounts.reportExpired')
      return this.accountRuntime().reportExpired(
        this.accountDeclaration(data.accountId),
        data.connectionId,
        data.credential
      )
    if (method === 'credentials.get')
      return this.accountRuntime().credential(this.getDescriptor().accounts, data.connectionId)
    if (method === 'accounts.form') return this.accountRuntime().form(data.ticket, data.form)
    if (method === 'accounts.qrcode')
      return this.accountRuntime().qrCode(data.ticket, data.image, data.expiresInMs, data.url, data.view)
    if (method === 'accounts.browser')
      return this.accountRuntime().browser(data.ticket, data.options, () => {
        const granted = this.declarations().filter(
          (permission) => this.permissions.status(permission.key) === 'granted'
        )
        if (!granted.some((permission) => permission.name === 'network.request'))
          throw Error('请先授权网络请求')
        const scopes = (name: string, key: string) =>
          granted
            .filter((permission) => permission.name === name)
            .flatMap((permission) => {
              const values = permission.scope?.[key]
              return Array.isArray(values)
                ? values.filter((value): value is string => typeof value === 'string')
                : []
            })
        return {
          domains: scopes('credentials.capture', 'domains'),
          origins: scopes('credentials.use', 'origins'),
          privateAllowed: granted.some((permission) => permission.name === 'network.private')
        }
      })
    if (method === 'accounts.oauth') {
      const allowed = (origin: string) => {
        const granted = this.declarations().filter(
          (permission) => this.permissions.status(permission.key) === 'granted'
        )
        if (
          !granted.some((permission) => permission.name === 'network.request') ||
          !granted.some(
            (permission) =>
              permission.name === 'credentials.use' &&
              Array.isArray(permission.scope?.origins) &&
              permission.scope.origins.includes(origin)
          )
        )
          throw Error('请先授权网络和此平台的账号凭据使用权限')
      }
      return this.accountRuntime().oauth(
        data.ticket,
        data.options,
        allowed,
        async (url) => {
          await this.services.openExternal(new URL(url))
        },
        (url, body, signal) =>
          this.runtime!.requestNetwork(
            {
              url,
              method: 'POST',
              body,
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              rejectRedirects: true
            },
            () =>
              this.declarations().some(
                (permission) =>
                  permission.name === 'network.private' &&
                  this.permissions.status(permission.key) === 'granted'
              ),
            signal
          )
      )
    }
    if (method === 'router.current' || method === 'router.push') {
      const manifest = this.runtime?.manifest
      if (manifest?.manifestVersion !== 3) throw Error('路由接口仅支持 v3')
      const target = method === 'router.push' ? validatePluginRouteTarget(data, manifest) : {}
      return callPluginUI(this.pluginId!, method, target)
    }
    if (method === 'ui.navigation.open') {
      this.runtime!.navigation(data)
      if (data.page === 'playlist' && data.ref) ownedRef(data.ref, 'playlist')
    }
    if (method === 'ui.playlistImport.open') {
      const importers = this.getDescriptor().importers
      if (
        !importers.length ||
        (data.importerId !== undefined &&
          !importers.some((item: any) => item.id === data.importerId))
      )
        throw new Error('插件未声明此歌单导入能力')
      if (
        (data.title !== undefined && (typeof data.title !== 'string' || data.title.length > 100)) ||
        (data.initialValue !== undefined &&
          (typeof data.initialValue !== 'string' || data.initialValue.length > 8192))
      )
        throw new Error('歌单导入弹窗参数无效')
      return this.services.forward(method, {
        importerId: data.importerId,
        title: data.title,
        initialValue: data.initialValue
      })
    }
    if (method === 'ui.pluginUpdate.request') {
      const url = new URL(String(data.url || ''))
      if (url.protocol !== 'https:') throw new Error('插件更新地址必须使用 HTTPS')
      const info = this.getPluginInfo()
      sendPluginNotice({
        type: 'update',
        pluginId: this.pluginId,
        pluginName: info.name,
        currentVersion: info.version,
        data: {
          url: url.href,
          version: String(data.version || ''),
          content: String(data.notes || '')
        }
      })
      return { accepted: false, updated: false, queued: true }
    }
    if (
      [
        'ui.dialogs.confirm',
        'ui.dialogs.prompt',
        'ui.dialogs.pickPlaylist',
        'ui.navigation.open',
        'ui.progress.create',
        'ui.progress.update',
        'ui.progress.close',
        'services.account.openLogin',
        'services.app.openSettings'
      ].includes(method)
    )
      return this.services.forward(method, data)
    throw new Error('当前澜音 Host 尚未接入能力: ' + method)
  }

  async invokePluginLifecycle<Name extends 'onEnable' | 'onDisable' | 'onUpdate'>(
    name: Name,
    ...args: import('@shiqianjiang/ceru-plugin-sdk').LifecycleArgs<Name>
  ) {
    if (
      this.disposed ||
      this.runtime?.manifest.manifestVersion !== 3 ||
      !this.runtime.manifest.entry.logic
    )
      return
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    try {
      await this.sandbox?.invoke(
        'lifecycle',
        name,
        '',
        args,
        AbortSignal.any([this.stopped.signal, controller.signal])
      )
    } catch (error) {
      this.logger.warn('插件生命周期回调未完成:', name, error)
    } finally {
      clearTimeout(timer)
    }
  }
  private accountController?: AccountController
  private accountRuntime() {
    if (
      this.disposed ||
      !this.musicAttached ||
      !this.sandbox ||
      this.runtime?.descriptor.runtime !== 3 ||
      !this.pluginId
    )
      throw Error('插件账号不可用')
    return (this.accountController ??= new AccountController(
      this.pluginId,
      this.getDescriptor().id,
      (id, method, input, signal) => this.sandbox!.invoke('account', id, method, [input], signal),
      this.stopped.signal,
      (event, value) => this.sandbox!.send('host-event', { event, value }),
      async (viewId, login, cancel) => {
        const view=this.getDescriptor().views.find(view=>view.id===viewId)
        if (!view || !['component','web'].includes(view.kind)) throw Error('扫码登录需要本插件声明的 component 或 web 视图')
        const session=await this.mountSurface(viewId,{login})
        if (session.kind!=='web') {await this.closeDrawer(viewId,session.sessionId);throw Error('自定义扫码视图无效')}
        const entry=this.webSessions.get(session.sessionId)!
        entry.accountQr={state:login,cancel}
        session.state=this.visibleSurfaceState(entry)
        return {
          session,
          update:state=>{
            if (this.webSessions.get(session.sessionId)!==entry || !entry.accountQr) return
            entry.accountQr.state=state
            publishPluginSurface(this.pluginId!,session.sessionId,this.visibleSurfaceState(entry))
          },
          close:async()=>{
            entry.accountQr=undefined
            await this.closeDrawer(viewId,session.sessionId)
          }
        }
      }
    ))
  }
  private accountDeclaration(id: string) {
    const item = this.getDescriptor().accounts.find((entry) => entry.id === id)
    if (!item) throw Error('插件未声明此账号')
    return item
  }
  async allowProviderSelection(
    providerId: string,
    selection: import('@shiqianjiang/ceru-plugin-sdk').SourceSelection,
    request: AbortSignal
  ) {
    const descriptor = this.getDescriptor()
    const provider = descriptor.providers.find((item) => item.id === providerId)
    if (!provider || !this.supportsV2Provider(providerId)) return false
    if (descriptor.runtime !== 3 || !provider.beforeSelect) return true
    if (!this.supportsAction(provider.beforeSelect)) return false
    const signal = AbortSignal.any([
      request,
      this.stopped.signal,
      this.selectionGrants.signal,
      AbortSignal.timeout(300000)
    ])
    const decide = async () => {
      signal.throwIfAborted()
      const result = await this.invokeV2Action(
        provider.beforeSelect!,
        { providerId, ...selection },
        AbortSignal.any([signal, AbortSignal.timeout(3000)])
      )
      signal.throwIfAborted()
      return result
    }
    const decision = await decide()
    if (typeof decision === 'boolean') return decision
    const login = decision?.login
    const account = descriptor.accounts.find(
      (item) => item.id === login?.accountId && item.providers?.includes(providerId)
    )
    if (
      !account ||
      (login.method !== undefined && !account.loginMethods.includes(login.method)) ||
      (login.connectionId !== undefined &&
        (typeof login.connectionId !== 'string' ||
          !login.connectionId ||
          login.connectionId.length > 128))
    )
      return false
    if (
      !(await this.accountRuntime().change(
        account,
        'login',
        login.connectionId,
        login.method,
        signal
      ))
    )
      return false
    return (await decide()) === true
  }
  async accountConnections(id: string, validate = false) {
    const accounts = this.accountRuntime(),
      item = this.accountDeclaration(id)
    if (validate) await accounts.validate(item).catch(() => {})
    return accounts.list(item)
  }
  changeAccount(
    id: string,
    action: 'login' | 'switch' | 'logout',
    connection?: string,
    method?: 'form' | 'qrcode' | 'oauth' | 'browser'
  ) {
    return this.accountRuntime().change(this.accountDeclaration(id), action, connection, method)
  }
  cancelAccountQr(ticket: string) {
    this.accountController?.cancelQr(ticket)
  }
  accountLikes(
    id: string,
    connection: string,
    enabled: boolean,
    ref?: import('@shiqianjiang/ceru-plugin-sdk').ResourceRef
  ) {
    return this.accountRuntime().likes(this.accountDeclaration(id), connection, enabled, ref)
  }
  accountCollection(
    id: string,
    capability: import('@shiqianjiang/ceru-plugin-sdk').AccountListCapability,
    connection: string,
    cursor?: string
  ) {
    return this.accountRuntime().collection(
      this.accountDeclaration(id),
      capability,
      connection,
      cursor
    )
  }
  private observesRoutes = false
  async publishRoute(to: PluginRoute, from: PluginRoute | null) {
    if (
      !this.observesRoutes ||
      this.disposed ||
      !this.musicAttached ||
      this.runtime?.descriptor.runtime !== 3
    )
      return
    const owner = this.runtime.descriptor.id
    const project = (route: PluginRoute) =>
      projectPluginRoute(route.name, route.params, route.query, owner)
    await this.sandbox?.send('router-after', { to: project(to), from: from ? project(from) : null })
  }
  private quitListener = false
  beforeQuit(signal: AbortSignal): Promise<unknown> | undefined {
    if (
      this.quitListener &&
      this.musicAttached &&
      !this.disposed &&
      this.runtime?.descriptor.runtime === 3
    )
      return this.sandbox?.invoke('lifecycle', 'onBeforeQuit', '', [], signal)
    return undefined
  }
  private deliveredAppReady = false
  async publishLifecycle<Name extends import('@shiqianjiang/ceru-plugin-sdk').LifecycleName>(
    name: Name,
    ...args: import('@shiqianjiang/ceru-plugin-sdk').LifecycleArgs<Name>
  ) {
    if (
      !this.sandbox ||
      this.disposed ||
      !this.musicAttached ||
      this.runtime?.descriptor.runtime !== 3
    )
      return
    if (name === 'onAppReady') {
      if (this.deliveredAppReady) return
      this.deliveredAppReady = true
    }
    await this.sandbox.send('lifecycle', { name, args })
  }
  async publishHostEvent(event: string, value: unknown): Promise<void> {
    if (!HOST_EVENTS.has(event)) throw new Error('不支持的插件宿主事件')
    if (!this.sandbox || this.disposed) return
    if (event === 'entries.selectionChanged' && this.runtime?.descriptor.runtime !== 3) return
    const permission = V3_STATE_PERMISSIONS.get(event)
    if (
      permission &&
      (this.runtime?.descriptor.runtime !== 3 ||
        !this.declarations().some(
          (entry) => entry.name === permission && this.permissions.status(entry.key) === 'granted'
        ))
    )
      return
    let eventValue = value
    if (event === 'account.changed') {
      const account = value as {
        loggedIn?: boolean
        subject?: string
        displayName?: string
      }
      const loggedIn = !!account?.loggedIn
      eventValue = {
        loggedIn,
        profile:
          loggedIn && account.subject
            ? {
                id: createHash('sha256')
                  .update(`${this.pluginId}:${account.subject}`)
                  .digest('hex'),
                displayName: String(account.displayName || ''),
                identityScope: 'plugin'
              }
            : null
      }
    }
    await this.sandbox.send('host-event', { event, value: eventValue })
  }

  private event(type: string, data: any) {
    if (type === 'closed' && !this.disposed) {
      this.onDisabled?.(this.pluginId!, '插件运行环境已停止')
      void this.destroy()
      return
    }
    if (type === 'log') {
      const level = ['debug', 'info', 'warn', 'error', 'log'].includes(data.level)
        ? data.level
        : 'log'
      const secrets = Object.entries(this.runtime?.manifest.config ?? {})
        .filter(
          ([key, value]) =>
            /key|token|password|secret/i.test(key) && typeof value === 'string' && value.length > 3
        )
        .map(([, value]) => String(value))
      const values = JSON.stringify((data?.values ?? []).slice(0, 8), (key, value) =>
        /key|token|password|authorization|credential/i.test(key)
          ? '[redacted]'
          : typeof value === 'string'
            ? secrets
                .reduce((text, secret) => text.replaceAll(secret, '[redacted]'), value)
                .replace(/https?:\/\/[^\s]+\?[^\s]+/g, '[url query redacted]')
            : value
      )
      const parsedValues = JSON.parse(values) as unknown[]
      // Keep plugin logs as normal logger arguments. Passing the entire array
      // as one argument makes the logger render `["message", {...}]` and
      // escapes every nested quote, which is hard to read and search.
      const compact = (value: unknown): unknown => {
        if (typeof value !== 'string') {
          try {
            const text = JSON.stringify(value)
            if (text && text.length > 2200) {
              const edge = 1000
              return `${text.slice(0, edge)}…[truncated ${text.length - edge * 2} chars]…${text.slice(-edge)}`
            }
          } catch {
            return String(value)
          }
        }
        return value
      }
      const [message, ...rawDetails] = parsedValues
      // Older runtimes forwarded an omitted second argument as `null`. Drop
      // only that trailing compatibility artifact; an explicit null in a new
      // single-string log has already been formatted before reaching Host.
      const details = rawDetails.length === 1 && rawDetails[0] === null ? [] : rawDetails
      this.logger[level](`[plugin] ${String(message ?? '')}`, ...details.map(compact))
      return
    }
    if (type === 'notify') {
      const input = {
        title: '',
        body: String(data?.message ?? '').slice(0, 8192),
        level: (['info', 'success', 'warning', 'error'].includes(data?.level)
          ? data.level
          : 'info') as 'info' | 'success' | 'warning' | 'error'
      }
      const show = async (value: typeof input) => {
        await callPluginUI(this.pluginId!, 'ui.toast', {
          message: value.title ? value.title + '：' + value.body : value.body,
          level: value.level
        })
      }
      const result = notificationBus.names().includes('notification.show')
        ? notificationBus.run(
            'notification.show',
            input,
            {
              kind: 'plugin',
              pluginId: this.runtime!.manifest.id,
              runtime: this.runtime!.manifest.manifestVersion === 3 ? 3 : 2
            },
            show
          )
        : show(input)
      void result.catch(() => {})
      return
    }
    if (type === 'state') {
      const surface = this.runtime?.descriptor.views.find(
        (surface) => surface.id === data.surfaceId
      )
      if (surface && ['schema', 'web', 'native', 'component'].includes(surface.kind)) {
        if (
          !data.state ||
          typeof data.state !== 'object' ||
          Array.isArray(data.state) ||
          JSON.stringify(data.state).length > 256 * 1024
        )
          return
        this.surfaceStates.set(data.surfaceId, data.state)
        if (
          this.runtime?.descriptor.accounts.some(
            (item) => (item.view ?? item.legacy?.view) === data.surfaceId
          )
        )
          publishPluginAccountChanged(this.pluginId!)
        for (const session of this.webSessions.values()) {
          const { web } = session
          if (web.surfaceId === data.surfaceId)
            publishPluginSurface(this.pluginId!, web.sessionId, this.visibleSurfaceState(session))
        }
        const drawer = this.drawerSessions.get(data.surfaceId)
        if (drawer)
          void callPluginUI(this.pluginId!, 'ui.drawer.state', {
            sessionId: drawer.sessionId,
            state: drawer.schema ? drawerState(drawer.schema, data.state) : data.state
          }).catch(() => {})
      }
      return
    }
    if (type === 'open-view')
      void this.openSurface(data.surfaceId).catch((error) => this.logger.error(error.message))
    if (type === 'close-view') {
      for (const { web } of this.webSessions.values()) {
        if (web.surfaceId === data.surfaceId)
          void this.closeDrawer(web.surfaceId, web.sessionId).catch((error) =>
            this.logger.warn(error.message)
          )
      }
      const drawer = this.drawerSessions.get(data.surfaceId)
      if (drawer) {
        void this.closeDrawer(data.surfaceId, drawer.sessionId).catch((error) =>
          this.logger.warn(error.message)
        )
        void callPluginUI(this.pluginId!, 'ui.drawer.close', { sessionId: drawer.sessionId }).catch(
          () => {}
        )
      }
    }
  }
  async openSurface(id: string, props: JsonObject = {}) {
    if (this.disposed) throw new Error('插件已停止')
    const surface = this.runtime?.descriptor.views.find((item) => item.id === id)
    if (!surface) throw new Error('插件未声明此页面')
    if (surface.kind === 'component' || surface.kind === 'web' || surface.kind === 'native') {
      const web = await this.mountSurface(id, props, true)
      try {
        await callPluginUI(this.pluginId!, 'ui.drawer.open', web)
      } catch (error) {
        await this.closeDrawer(id, web.sessionId)
        throw error
      }
      return
    }
    if (surface.kind === 'schema') {
      const schema = this.drawerSchema(id)
      const sessionId = randomUUID()
      this.drawerSessions.set(id, { sessionId, schema })
      try {
        await callPluginUI(this.pluginId!, 'ui.drawer.open', {
          sessionId,
          surfaceId: id,
          schema,
          state: drawerState(schema, this.surfaceStates.get(id) ?? {})
        })
        if (schema.presentation.openAction && this.drawerSessions.get(id)?.sessionId === sessionId)
          void this.invokeV2Action(schema.presentation.openAction).catch((error) => {
            this.logger.warn('初始化插件面板失败:', error.message)
          })
      } catch (error) {
        if (this.drawerSessions.get(id)?.sessionId === sessionId) this.drawerSessions.delete(id)
        throw error
      }
      return
    }
  }
  private drawerSchema(id: string): PluginDrawerSchema {
    const manifest = this.getDescriptor()
    const surface = manifest.views.find((item) => item.id === id && item.kind === 'schema')
    const resource = surface && this.runtime!.resources[surface.module]
    if (!resource || resource.type !== 'json') throw new Error('插件抽屉页面不存在')
    return readDrawerSchema(
      resource.value,
      manifest.actions.map((item) => item.id)
    )
  }
  async invokeDrawer(surfaceId: string, sessionId: string, index: number, values: unknown) {
    const session = this.drawerSessions.get(surfaceId)
    if (this.disposed || !session?.schema || session.sessionId !== sessionId)
      throw new Error('插件抽屉已关闭')
    const { action, input } = drawerAction(session.schema, index, values)
    await this.invokeV2Action(action, input)
    if (this.disposed || this.drawerSessions.get(surfaceId)?.sessionId !== sessionId)
      throw new Error('插件抽屉已关闭')
    return drawerState(session.schema, this.surfaceStates.get(surfaceId) ?? {})
  }
  async mountSurface(
    surfaceId: string,
    props: JsonObject = {},
    overlay = false,
    slotName?: string,
    region?: string
  ): Promise<PluginVisibleSession> {
    const runtime = this.runtime
    if (this.disposed || !runtime) throw Error('插件已停止')
    const view = runtime.descriptor.views.find((item) => item.id === surfaceId)
    if (!view) throw Error('插件未声明此页面')
    if (
      region !== undefined &&
      (runtime.descriptor.runtime !== 3 ||
        view.kind !== 'component' ||
        overlay ||
        slotName !== undefined)
    )
      throw Error('无效的播放器区域')
    const slot =
      slotName === undefined
        ? undefined
        : runtime.descriptor.slots.find((item) => item.slot === slotName && item.view === surfaceId)
            ?.slot
    if (
      slotName !== undefined &&
      (runtime.descriptor.runtime !== 3 || view.kind !== 'component' || !slot || overlay)
    )
      throw Error('插件槽位未启用')
    const mountProps = slot ? { slot } : props
    const release = this.surfaceCapacity.reserve(slot)
    try {
      const sessionId = randomUUID()
      const common = {
        sessionId,
        pluginId: this.pluginId!,
        surfaceId,
        state: this.surfaceStates.get(surfaceId) ?? {}
      }
      let web: PluginVisibleSession
      if (view.kind === 'native') {
        web = {
          ...common,
          kind: 'native',
          title: view.title ?? runtime.descriptor.name,
          presentation: { kind: 'drawer', placement: 'right', size: 760, ...view.presentation },
          renderAction: view.module
        }
      } else {
        const document = await runtime.document(surfaceId, sessionId, mountProps, slot, region)
        if (
          this.developmentPreview &&
          runtime.descriptor.runtime === 3 &&
          view.kind === 'component'
        )
          document.init.inspectComponent = true
        if (this.surfaceCapacity.stopped) throw Error('插件已停止')
        protectPluginFrames()
        web = { ...common, ...document, kind: 'web' }
      }
      const lifecycle = runtime.surface(surfaceId, (action, input, signal) =>
        this.invokeV2Action(action, input, signal)
      )
      this.webSessions.set(sessionId, { web, props: mountProps, overlay, release, lifecycle })
      return web
    } catch (error) {
      release()
      throw error
    }
  }
  async readySurface(surfaceId: string, sessionId: string) {
    const session = this.webSessions.get(sessionId)
    if (this.disposed || session?.web.surfaceId !== surfaceId) throw new Error('插件页面已关闭')
    await session.lifecycle.open()
    if (this.webSessions.get(sessionId) !== session) throw Error('插件页面已关闭')
    if (!session.mounted && this.runtime?.descriptor.runtime === 3) {
      session.mounted = true
      await this.sandbox?.send('host-event', {
        event: 'ui.views.mounted',
        value: { viewId: surfaceId, instanceId: sessionId, props: session.props }
      })
    }
    return this.visibleSurfaceState(session)
  }
  private visibleSurfaceState(session: {web:PluginVisibleSession;accountQr?:{state:JsonObject}}):JsonObject {
    return {
      ...(this.surfaceStates.get(session.web.surfaceId) ?? {}),
      ...(session.accountQr ? {login:session.accountQr.state} : {})
    }
  }
  async invokeSurfaceAction(surfaceId: string, sessionId: string, action: string, input: any) {
    const session = this.webSessions.get(sessionId)
    if (this.disposed || session?.web.surfaceId !== surfaceId) throw new Error('插件页面已关闭')
    if (
      typeof action !== 'string' ||
      !this.actionIds.has(action) ||
      JSON.stringify(input ?? {}).length > 128 * 1024
    )
      throw new Error('插件页面请求无效')
    try {
      const result = await session.lifecycle.invoke(action, input ?? {})
      if (session.web.kind === 'native' && action === session.web.renderAction)
        assertNativeView(result, this.actionIds)
      return result
    } catch (error) {
      // Closing a view aborts its pending calls. Keep this separate from plugin failures.
      if (this.webSessions.get(sessionId) !== session)
        throw new DOMException('插件页面已关闭', 'AbortError')
      throw error
    }
  }
  async closeDrawer(surfaceId: string, sessionId: string) {
    const web = this.webSessions.get(sessionId)
    if (web?.web.surfaceId === surfaceId) {
      this.webSessions.delete(sessionId)
      web.accountQr?.cancel()
      web.release()
      publishPluginSurface(this.pluginId!, sessionId, undefined)
      if (web.mounted)
        await this.sandbox
          ?.send('host-event', {
            event: 'ui.views.unmounted',
            value: { viewId: surfaceId, instanceId: sessionId, props: web.props }
          })
          .catch(() => {})
      await web.lifecycle
        .close()
        .catch((error) => this.logger.warn('关闭插件页面失败:', error.message))
      return
    }
    const session = this.drawerSessions.get(surfaceId)
    if (session?.sessionId !== sessionId) return
    this.drawerSessions.delete(surfaceId)
    const action = session.schema?.presentation.closeAction ?? session.web?.presentation.closeAction
    if (action && !this.disposed)
      void this.invokeV2Action(action).catch((error) =>
        this.logger.warn('关闭插件面板失败:', error.message)
      )
  }
  /** Only explicit use/enable calls this; automatic restoration never opens onboarding UI. */
  async openInitialView(): Promise<void> {
    if (this.initialView) return this.initialView
    this.initialView = (async () => {
      const preferenceKey = this.pluginId! + '.ui'
      const preferences = getPluginConfig(preferenceKey)
      for (const surface of this.getDescriptor().views) {
        if (surface.kind !== 'schema') continue
        const resource = this.runtime!.resources[surface.module]
        if (resource?.type !== 'json' || !(resource.value as any)?.presentation?.openOnFirstUse)
          continue
        if (preferences.openedSurfaces?.includes(surface.id)) continue
        await this.openSurface(surface.id)
        preferences.openedSurfaces = [...(preferences.openedSurfaces ?? []), surface.id]
        savePluginConfig(preferenceKey, preferences)
        break
      }
    })().finally(() => {
      this.initialView = undefined
    })
    return this.initialView
  }
  async destroy() {
    this.surfaceCapacity.stop()
    await Promise.allSettled(
      [...this.webSessions.values()].map(({ web }) =>
        this.closeDrawer(web.surfaceId, web.sessionId)
      )
    )
    this.disposed = true
    for (const unsubscribe of this.idleSubscriptions.values()) unsubscribe?.()
    this.idleSubscriptions.clear()
    this.stopped.abort()
    pluginMedia.revoke(this.pluginId!)
    for (const dispose of this.musicDisposers.values()) dispose()
    this.musicDisposers.clear()
    this.guestStore?.dispose()
    this.services.dispose()
    clearInterval(this.socketTimer)
    this.runtime?.sockets.closeAll()
    for (const controllers of this.requests.values())
      for (const controller of controllers) controller.abort()
    if (this.drawerSessions.size)
      void callPluginUI(this.pluginId!, 'ui.drawer.close', {}).catch(() => {})
    this.drawerSessions.clear()
    this.webSessions.clear()
    this.surfaceStates.clear()
    this.sandbox?.dispose()
    await this.core?.dispose()
    this.core = undefined
  }

  private redactGuestLog(value: unknown): string {
    return JSON.stringify(value ?? null, (key, item) => {
      if (/key|token|password|authorization|cookie|secret/i.test(key)) return '[redacted]'
      return typeof item === 'string'
        ? item.replace(/(https?:\/\/[^\s?]+)\?[^\s]+/g, '$1?[redacted]').slice(0, 4000)
        : item
    }).slice(0, 16000)
  }
  listGuests() {
    return this.guestStore?.list() ?? []
  }
  getGuestPermissions(guestId: string) {
    if (!this.guestStore) throw new Error('兼容环境未加载')
    return this.guestStore.permissions(guestId)
  }
  async setGuestPermissions(guestId: string, keys: string[]) {
    if (!this.guestStore) throw new Error('兼容环境未加载')
    await this.guestStore.setPermissions(guestId, keys)
  }
  async selectGuest(guestId: string | null) {
    if (!this.guestStore) throw new Error('兼容环境未加载')
    await this.guestStore.select(guestId)
  }
  async updateGuest(guestId: string, url: string) {
    if (!this.guestStore) throw new Error('兼容环境未运行')
    const response = await this.runtime!.requestNetwork({ url, timeoutMs: 30000 }, () =>
      this.guestStore!.permissions(guestId).includes('network.private')
    )
    if (response.status !== 200 || typeof response.body !== 'string')
      throw new Error('下载结果不是有效 JS 脚本')
    return (this.guestStore as any).replace(guestId, response.body)
  }
  async removeGuest(guestId: string) {
    if (!this.guestStore) throw new Error('兼容环境未加载')
    await this.guestStore.remove(guestId)
  }
  async importGuest(adapterId: string, url?: string) {
    if (
      !this.guestStore ||
      !this.runtime?.descriptor.guestAdapters.some((item) => item.id === adapterId)
    )
      throw new Error('请先安装对应的兼容环境插件')
    let script: string, name: string
    if (url) {
      const address = new URL(url)
      if (!['http:', 'https:'].includes(address.protocol))
        throw new Error('只支持 HTTP/HTTPS 下载地址')
      const response = await this.runtime!.requestNetwork({ url, timeoutMs: 30000 }, () => true)
      if (response.status !== 200 || typeof response.body !== 'string')
        throw new Error('下载结果不是有效 JS 脚本')
      script = response.body
      name = basename(address.pathname)
    } else {
      const choice = await dialog.showOpenDialog({
        title: '导入子插件',
        filters: [{ name: 'JavaScript 插件', extensions: ['js'] }],
        properties: ['openFile']
      })
      if (choice.canceled || !choice.filePaths.length) return null
      const file = choice.filePaths[0]
      script = await readFile(file, 'utf8')
      name = basename(file)
    }
    return this.guestStore.install(adapterId, script, name)
  }
  async importGuestScript(adapterId: string, script: string, name: string) {
    if (!this.guestStore) throw new Error('请先使用兼容环境')
    return this.guestStore.install(adapterId, script, name)
  }
}
