import { readFile } from 'fs/promises'
import { join, basename } from 'path'
import { dialog } from 'electron'
import { randomUUID } from 'crypto'
import { PluginCore, readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { NodePluginSandbox } from '@shiqianjiang/ceru-plugin-core/node'
import { requestNetwork } from '@shiqianjiang/ceru-plugin-core/network'
import { SocketBroker } from '@shiqianjiang/ceru-plugin-core/sockets'
import { GuestStore } from '@shiqianjiang/ceru-plugin-core/guests'
import { getAppDirPath } from '../../../utils/path'
import { pluginChanged } from '../uiBridge'
import { sendPluginNotice } from '../../../events/pluginNotice'
import {
  PERMISSION_GROUPS,
  permissionGroup,
  assertContentPage,
  assertResourceRef,
  retargetTrackRef,
  assertNativeView,
  assertNavigationRequest
} from '@shiqianjiang/ceru-plugin-sdk'
import {
  getPluginConfig,
  savePluginConfig,
  getPluginPermissions,
  savePluginPermissions
} from '../pluginConfig'
import { callPluginUI } from '../uiBridge'
import { exportShareResolver } from '../shareResolver'
import {
  readDrawerSchema,
  drawerAction,
  drawerState,
  type PluginDrawerSchema
} from '@common/pluginDrawer'
import { PluginStorage } from '../storage'
import { protectPluginFrames } from '../webDrawer'
import { SurfaceSession } from '@shiqianjiang/ceru-plugin-core/surface'
import { createWebSurfaceDocument } from '@shiqianjiang/ceru-plugin-core/surface-document'
import { publishPluginSurface, publishPluginAccountChanged } from '../uiBridge'
import type { PluginWebDrawerSession, PluginVisibleSession } from '@common/pluginDrawer'
import { registerPlaybackRequest } from '../playbackRequests'

type Logger = Pick<Console, 'log' | 'info' | 'warn' | 'error' | 'debug'>
type Permission = { key: string; name: any; reason: string; scope?: any }
const canonical = (value: any): string =>
  value && typeof value === 'object'
    ? Array.isArray(value)
      ? '[' + value.map(canonical).join(',') + ']'
      : '{' +
        Object.keys(value)
          .sort()
          .map((key) => JSON.stringify(key) + ':' + canonical(value[key]))
          .join(',') +
        '}'
    : JSON.stringify(value)
const fingerprint = (p: Permission) => p.key + ':' + p.name + ':' + canonical(p.scope ?? {})

/** Electron application services around the reusable pure-Node Core runtime. */
export default class PluginHost {
  pluginId?: string
  resolveStorageOwner: (manifestId: string) => string | undefined = () => undefined
  onThrottle: ((pluginId: string, reason: string, duration?: number) => void) | null = null
  onDisabled: ((pluginId: string, reason: string) => void) | null = null
  private core?: PluginCore
  private sandbox?: NodePluginSandbox
  private drawerSessions = new Map<
    string,
    { sessionId: string; schema?: PluginDrawerSchema; web?: PluginWebDrawerSession }
  >()
  private webSessions = new Map<string, { web: PluginVisibleSession; lifecycle: SurfaceSession }>()
  private surfaceStates = new Map<string, any>()
  private initialView?: Promise<void>
  private artifact?: ReturnType<typeof readPluginArtifact>['artifact']
  private records = new Set<string>()
  private requests = new Map<string, Set<AbortController>>()
  private prompts = new Map<string, Promise<any>>()
  private promptedGroups = new Set<string>()
  private permissionNotices = new Map<string, number>()
  private importResults = new Map<string, Promise<any>>()
  private providerMethods = new Map<string, Set<string>>()
  private actionIds = new Set<string>()
  private disposed = false
  private storage?: PluginStorage
  private effectiveConfig: Readonly<Record<string, any>> = {}
  private guestStore?: GuestStore
  private promptQueue: Promise<unknown> = Promise.resolve()
  private sockets = new SocketBroker()
  private socketTimer?: ReturnType<typeof setInterval>

  constructor(
    private pluginCode: string | null = null,
    private logger: Logger = console
  ) {}
  async loadPlugin(path: string, logger: Logger = console): Promise<this> {
    this.logger = logger
    this.pluginCode = await readFile(path, 'utf8')
    await this.ensureReady()
    return this
  }
  async ensureReady(): Promise<void> {
    if (this.core) return
    if (!this.pluginCode) throw new Error('Missing plugin artifact')
    this.artifact = readPluginArtifact(this.pluginCode).artifact
    if (this.artifact.header.manifest.contributes?.guestAdapters?.length) {
      this.guestStore = new GuestStore({
        root: join(getAppDirPath(), 'plugins', 'guests', this.pluginId!),
        artifact: this.artifact,
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
        request: requestNetwork,
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
    this.records = new Set(getPluginPermissions(this.pluginId || this.artifact.header.manifest.id))
    // Preserve grants from the earlier key-only development format only for its
    // known, unchanged broad capabilities; never infer a grant for a new scope.
    const previousNames: Record<string, string> = {
      network: 'network.request',
      'network.private': 'network.private',
      'fallback.hold': 'playback.fallback.hold',
      'library.read': 'library.read',
      'library.write': 'library.write'
    }
    let migrated = false
    for (const permission of this.artifact.header.manifest.permissions ?? []) {
      if (
        this.records.has(permission.key) &&
        previousNames[permission.key] === permission.name &&
        !Object.keys(permission.scope ?? {}).length
      ) {
        this.records.delete(permission.key)
        this.records.add(fingerprint(permission))
        migrated = true
      }
    }
    if (migrated)
      savePluginPermissions(this.pluginId || this.artifact.header.manifest.id, [...this.records])
    this.storage = new PluginStorage(
      this.pluginId || this.artifact.header.manifest.id,
      this.artifact.header.manifest.id,
      (id) => this.resolveStorageOwner(id)
    )
    this.core = await PluginCore.load(this.pluginCode, {
      host: {
        activate: async (artifact, context) => {
          this.effectiveConfig = await context.config.get()
          const registrations = new Map<string, () => unknown>()
          this.sandbox = new NodePluginSandbox(
            (method, data) => this.rpc(method, data),
            (type, data) => {
              if (type === 'register') {
                const key = data.kind + ':' + data.id
                registrations.get(key)?.()
                if (data.kind === 'provider') {
                  this.providerMethods.set(data.id, new Set(data.methods ?? []))
                  const implementation: any = {}
                  for (const path of data.methods ?? []) {
                    if (!/^(tracks|playlists|charts|sharing)\.[a-zA-Z]+$/.test(path)) continue
                    const [group, name] = path.split('.')
                    implementation[group] ??= {}
                    implementation[group][name] = (...args: any[]) => {
                      const operation = args.pop()
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
                  registrations.set(key, context.providers.register(data.id, implementation))
                } else if (data.kind === 'action') {
                  this.actionIds.add(data.id)
                  registrations.set(
                    key,
                    context.actions.register(data.id, (input, operation) =>
                      this.sandbox!.invoke(
                        'action',
                        data.id,
                        '',
                        [input],
                        operation.signal,
                        operation.id
                      )
                    )
                  )
                } else if (data.kind === 'playlist-importer')
                  registrations.set(
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
                  registrations.set(
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
              } else if (type === 'unregister') {
                registrations.get(data.kind + ':' + data.id)?.()
                registrations.delete(data.kind + ':' + data.id)
                if (data.kind === 'provider') this.providerMethods.delete(data.id)
                if (data.kind === 'action') this.actionIds.delete(data.id)
              } else this.event(type, data)
            }
          )
          await this.sandbox.start(artifact)
          this.socketTimer = setInterval(() => {
            for (const event of this.sockets.drain()) void this.sandbox?.send('socket-event', event)
          }, 100)
          return () => this.sandbox?.dispose()
        }
      }
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
    const m = this.artifact!.header.manifest
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
    if (!this.artifact || this.disposed) throw new Error('请先使用音源插件')
    const share = this.artifact.header.manifest.modules.share
    if (!share) throw new Error('此插件未提供服务器分享解析模块')
    const guest = share.guestAdapterId
      ? await this.guestStore?.exportSelected(share.guestAdapterId)
      : undefined
    return exportShareResolver(
      this.artifact,
      { ...this.effectiveConfig, ...getPluginConfig(this.pluginId!) },
      guest
    )
  }
  getManifest(): any {
    const { config: _config, ...manifest } = this.artifact!.header.manifest
    const selected = this.guestStore?.list().find((item) => item.selected)
    if (selected && manifest.contributes?.providers) {
      const copy = structuredClone(manifest)
      for (const provider of copy.contributes!.providers!)
        provider.qualities =
          selected.providers.find((item) => item.id === provider.id)?.qualities ?? []
      return copy
    }
    return manifest
  }
  getSupportedSources(): any {
    return Object.fromEntries(
      (this.getManifest().contributes?.providers ?? []).map((p: any) => [
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
  getProviderIconUrls(): Record<string, string> {
    const icons: Record<string, string> = {}
    for (const provider of this.artifact?.header.manifest.contributes?.providers ?? []) {
      if (provider.icon?.kind !== 'asset') continue
      const resource = this.artifact?.resources[provider.icon.resource]
      if (!resource || (resource.type !== 'text' && resource.type !== 'base64')) continue
      const mime = 'mime' in resource ? resource.mime : undefined
      if (
        !mime ||
        !['image/svg+xml', 'image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)
      )
        continue
      if (typeof resource.value !== 'string' || resource.value.length > 128 * 1024) continue
      icons[provider.id] =
        `data:${mime};base64,${resource.type === 'base64' ? resource.value : Buffer.from(resource.value, 'utf8').toString('base64')}`
    }
    return icons
  }
  getPluginType(): 'music-source' | 'service' {
    return 'music-source'
  }
  getConfigSchema(): any[] {
    return []
  }
  isV2() {
    return true
  }
  isDisabled() {
    return this.disposed
  }
  supportsV2Provider(id: string, method?: string) {
    if (this.disposed || !this.core?.snapshot().providers.includes(id)) return false
    return !method || this.providerMethods.get(id)?.has(method) === true
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
    return Object.fromEntries(Object.entries(snapshot ?? {}).filter(([key, value]) =>
      key !== 'manifest' && key !== 'config' &&
      Array.isArray(value) && value.every(item => typeof item === 'string')
    )) as Record<string, string[]>
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
    run: (operation: ReturnType<PluginHost['operation']>) => Promise<any>
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
      id: String(original?.id ?? song.hash ?? song.songmid ?? song.id),
      data: { song }
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
    registerPlaybackRequest(result.url, result.requestHeaders, result.expiresAt)
    return result.url
  }
  async getPic(source: string, song: any) {
    return this.invokeV2Action('artwork.get', { source, song })
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
    const converter = this.getManifest().contributes?.lyricConverters?.find(
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
  private declarations(): Permission[] {
    return this.artifact?.header.manifest.permissions ?? []
  }
  private status(key: string) {
    const p = this.declarations().find((item) => item.key === key)
    return !p
      ? 'undeclared'
      : this.records.has(fingerprint(p))
        ? 'granted'
        : this.records.has('deny:' + fingerprint(p))
          ? 'denied'
          : 'prompt'
  }
  getGrantedPermissions() {
    return this.declarations()
      .filter((p) => this.status(p.key) === 'granted')
      .map((p) => p.key)
  }
  setGrantedPermissions(keys: string[]) {
    if (!Array.isArray(keys) || keys.some((key) => !this.declarations().some((p) => p.key === key)))
      throw new Error('无效的权限项')
    this.records = new Set(
      this.declarations().flatMap((p) => (keys.includes(p.key) ? [fingerprint(p)] : []))
    )
    this.promptedGroups.clear()
    this.sockets.closeAll()
    savePluginPermissions(this.pluginId!, [...this.records])
    for (const controllers of this.requests.values())
      for (const controller of controllers) controller.abort()
    void this.sandbox
      ?.send('host-event', { event: 'permissions.changed', value: { keys } })
      .catch(() => {})
  }
  private async requestPermission(key: string): Promise<any> {
    if (!['prompt', 'denied'].includes(this.status(key))) return { status: this.status(key) }
    const p = this.declarations().find((item) => item.key === key)!
    const group = permissionGroup(p.name)
    const groupId = group ?? key
    let prompt = this.prompts.get(groupId)
    if (!prompt && this.promptedGroups.has(groupId)) {
      this.notifyPermissionDenied(p.name)
      return { status: this.status(key) }
    }
    if (!prompt) {
      prompt = this.promptQueue
        .then(async () => {
          if (this.disposed) return
          const declarations = this.declarations().filter(
            (item) =>
              (group ? permissionGroup(item.name) === group : item.key === key) &&
              ['prompt', 'denied'].includes(this.status(item.key))
          )
          if (!declarations.length) return
          this.promptedGroups.add(groupId)
          let allowed: boolean
          try {
            allowed = !!(await callPluginUI(this.pluginId!, 'ui.permissions.request', {
              pluginName: this.getPluginInfo().name,
              title: group ? PERMISSION_GROUPS[group].title : '使用插件功能',
              description: declarations.map((item) => item.reason).join('；')
            }))
          } catch (error) {
            // A missing/not-yet-mounted UI is not a user denial. Allow the next
            // operation to ask again instead of leaving the plugin stuck.
            this.promptedGroups.delete(groupId)
            throw error
          }
          if (this.disposed) return
          for (const item of declarations) {
            this.records.delete('deny:' + fingerprint(item))
            this.records.add((allowed ? '' : 'deny:') + fingerprint(item))
          }
          savePluginPermissions(this.pluginId!, [...this.records])
          await this.sandbox?.send('host-event', {
            event: 'permissions.changed',
            value: { keys: declarations.map((item) => item.key) }
          })
        })
        .finally(() => this.prompts.delete(groupId))
      this.promptQueue = prompt.catch(() => undefined)
      this.prompts.set(groupId, prompt)
    }
    await prompt
    if (this.status(key) !== 'granted') this.notifyPermissionDenied(p.name)
    return { status: this.status(key) }
  }
  private notifyPermissionDenied(name: string) {
    const group = permissionGroup(name as Permission['name'])
    const id = group ?? name
    const now = Date.now()
    if (now - (this.permissionNotices.get(id) ?? 0) < 5000 || this.disposed) return
    this.permissionNotices.set(id, now)
    const label = group ? PERMISSION_GROUPS[group].title : this.permissionLabel(name)
    void callPluginUI(this.pluginId!, 'ui.toast', {
      level: 'warning',
      message: `${this.getPluginInfo().name}未获得“${label}”权限，请到设置 → 插件 → 权限中允许后重试`
    }).catch(() => {})
  }
  private async authorize(key: string, name: string): Promise<void> {
    if (!this.declarations().some((p) => p.key === key && p.name === name))
      throw new Error('插件未声明权限: ' + name)
    if ((await this.requestPermission(key)).status !== 'granted') {
      this.notifyPermissionDenied(name)
      throw new Error('此功能尚未获得授权，可在插件的“权限”中允许后重试')
    }
  }
  private permissionLabel(name: string): string {
    return (
      (
        {
          'network.request': '网络访问',
          'network.private': '局域网访问',
          'network.socket': '网络连接',
          'library.read': '歌单读取',
          'library.write': '歌单修改',
          'account.profile': '账号资料',
          'guests.manage': '子插件管理',
          'guests.run': '子插件运行'
        } as Record<string, string>
      )[name] || '相关功能'
    )
  }
  private async rpc(method: string, data: any = {}): Promise<any> {
    if (this.disposed) throw new Error('Plugin stopped')
    if (method.startsWith('guests.')) {
      if (!this.guestStore) throw new Error('此插件不是兼容环境')
      if (method === 'guests.list') return this.guestStore.list()
      const permission = method === 'guests.invoke' ? 'guests.run' : 'guests.manage'
      const declaration = this.declarations().find((item) => item.name === permission)
      if (!declaration) throw new Error('兼容环境未声明子插件权限')
      await this.authorize(declaration.key, permission)
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
    if (method === 'permissions.query') return { status: this.status(data.key) }
    if (method === 'permissions.request') return this.requestPermission(data.key)
    if (method === 'permissions.getGranted')
      return this.declarations()
        .filter((p) => this.status(p.key) === 'granted')
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
      for (const p of entries) await this.requestPermission(p.key)
      return {
        group: data.group,
        status:
          entries.length && entries.every((p) => this.status(p.key) === 'granted')
            ? 'granted'
            : 'denied',
        grants: await this.rpc('permissions.getGranted')
      }
    }
    if (method === 'config.get')
      return { ...this.effectiveConfig, ...getPluginConfig(this.pluginId!) }
    if (method === 'sockets.connect') {
      await this.authorize(data.permissionKey, 'network.socket')
      const result = await this.sockets.connect(
        data,
        this.declarations().some(
          (p) => p.name === 'network.private' && this.status(p.key) === 'granted'
        ),
        []
      )
      if (this.status(data.permissionKey) !== 'granted' || this.disposed) {
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
      await this.authorize(data.permissionKey, 'network.request')
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
        const response = await requestNetwork(
          data,
          () =>
            this.declarations().some(
              (p) => p.name === 'network.private' && this.status(p.key) === 'granted'
            ),
          controller.signal
        )
        const level = response.status >= 500 ? 'error' : response.status >= 400 ? 'warn' : 'debug'
        this.logger[level](`[request:${id}] HTTP ${label} 返回`, {
          status: response.status,
          elapsedMs: Date.now() - start,
          code: response.body?.code ?? null
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
      await this.authorize(
        data.permissionKey,
        method.endsWith('.import') ? 'library.write' : 'library.read'
      )
      if (method.endsWith('.import')) {
        assertContentPage({ items: data.items })
        if (data.items.some((item: any) => item.ref.kind !== 'track'))
          throw new Error('歌单只接收标准歌曲')
      }
      if (!method.endsWith('.import')) return callPluginUI(this.pluginId!, method, data)
      if (typeof data.requestId !== 'string' || !data.requestId || data.requestId.length > 256)
        throw new Error('导入请求缺少有效 requestId')
      const key = data.requestId + ':' + canonical(data.target ?? null)
      let result = this.importResults.get(key)
      if (!result) {
        result = callPluginUI(this.pluginId!, method, data).catch((error) => {
          this.importResults.delete(key)
          throw error
        })
        this.importResults.set(key, result)
        if (this.importResults.size > 200)
          this.importResults.delete(this.importResults.keys().next().value!)
      }
      return result
    }
    if (method.startsWith('services.capabilities.')) {
      const entries = ['account', 'library', 'player', 'queue'].map((service) => ({
        service,
        version: '1.0.0',
        available: true,
        permissionGroups: [
          service === 'account' ? 'account' : service === 'library' ? 'libraryRead' : 'playback'
        ],
        ...(service === 'player'
          ? { methods: ['play'] }
          : service === 'queue'
            ? { methods: ['replace'] }
            : {})
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
    if (method === 'services.account.getSession' || method === 'services.account.getProfile') {
      await this.authorize(data.args?.[0]?.permissionKey, 'account.profile')
      return callPluginUI(this.pluginId!, method, data)
    }
    const ownedRef = (ref: unknown, kind: 'track' | 'playlist') => {
      assertResourceRef(ref)
      const manifest = this.getManifest()
      if (
        ref.kind !== kind ||
        ref.pluginId !== manifest.id ||
        !manifest.contributes?.providers?.some((provider) => provider.id === ref.providerId)
      )
        throw new Error('插件只能操作自己声明的资源')
    }
    if (method === 'services.queue.replace' || method === 'services.player.play') {
      await this.authorize(data.args?.[1]?.permissionKey, 'player.control')
      if (method === 'services.queue.replace') {
        assertContentPage({ items: data.args?.[0] })
        for (const item of data.args[0]) ownedRef(item.ref, 'track')
      } else if (data.args?.[0] != null) ownedRef(data.args[0], 'track')
      return callPluginUI(this.pluginId!, method, data)
    }
    if (method === 'ui.navigation.open') {
      assertNavigationRequest(data, this.getManifest())
      if (data.page === 'playlist' && data.ref) ownedRef(data.ref, 'playlist')
    }
    if (method === 'ui.playlistImport.open') {
      const importers = this.getManifest().contributes?.playlistImporters ?? []
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
      return callPluginUI(this.pluginId!, method, {
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
      return callPluginUI(this.pluginId!, method, data)
    throw new Error('当前澜音 Host 尚未接入能力: ' + method)
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
      const secrets = Object.entries(this.artifact?.header.manifest.config ?? {})
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
      this.logger[level]('[plugin]', JSON.parse(values))
      return
    }
    if (type === 'notify') {
      void callPluginUI(this.pluginId!, 'ui.toast', data).catch(() => {})
      return
    }
    if (type === 'state') {
      const surface = this.artifact?.header.manifest.modules.surfaces?.find(
        (surface) => surface.id === data.surfaceId
      )
      if (surface?.kind === 'schema' || surface?.kind === 'web' || surface?.kind === 'native') {
        if (
          !data.state ||
          typeof data.state !== 'object' ||
          Array.isArray(data.state) ||
          JSON.stringify(data.state).length > 256 * 1024
        )
          return
        this.surfaceStates.set(data.surfaceId, data.state)
        if (
          this.artifact?.header.manifest.contributes?.accountItems?.some(
            (item) => item.view === data.surfaceId
          )
        )
          publishPluginAccountChanged(this.pluginId!)
        for (const { web } of this.webSessions.values()) {
          if (web.surfaceId === data.surfaceId)
            publishPluginSurface(this.pluginId!, web.sessionId, data.state)
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
  async openSurface(id: string) {
    if (this.disposed) throw new Error('插件已停止')
    const surface = this.artifact?.header.manifest.modules.surfaces?.find((item) => item.id === id)
    if (!surface) throw new Error('插件未声明此页面')
    if (surface.kind === 'web' || surface.kind === 'native') {
      const web = await this.mountSurface(id)
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
    const manifest = this.artifact!.header.manifest
    const surface = manifest.modules.surfaces?.find(
      (item) => item.id === id && item.kind === 'schema'
    )
    const resource = surface && this.artifact!.resources[surface.entry]
    if (!resource || resource.type !== 'json') throw new Error('插件抽屉页面不存在')
    return readDrawerSchema(
      resource.value,
      (manifest.contributes?.commands ?? []).map((item) => item.action)
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
  async mountSurface(surfaceId: string): Promise<PluginVisibleSession> {
    if (this.disposed || !this.artifact) throw new Error('插件已停止')
    if (this.webSessions.size >= 16) throw new Error('插件页面数量超过限制')
    const sessionId = randomUUID()
    const native = this.artifact.header.manifest.modules.surfaces?.find(
      (item) => item.id === surfaceId && item.kind === 'native'
    )
    if (native) {
      const web: PluginVisibleSession = {
        kind: 'native',
        sessionId,
        pluginId: this.pluginId!,
        surfaceId,
        title: native.title ?? this.artifact.header.manifest.name,
        presentation: { kind: 'drawer', placement: 'right', size: 760, ...native.presentation },
        state: this.surfaceStates.get(surfaceId) ?? {},
        renderAction: native.entry
      }
      this.webSessions.set(sessionId, {
        web,
        lifecycle: new SurfaceSession(
          native,
          this.artifact.header.manifest,
          (action, input, signal) => this.invokeV2Action(action, input, signal)
        )
      })
      return web
    }
    const document = await createWebSurfaceDocument(this.artifact, surfaceId, sessionId)
    if (this.disposed) throw new Error('插件已停止')
    const surface = this.artifact.header.manifest.modules.surfaces!.find(
      (item) => item.id === surfaceId
    )!
    protectPluginFrames()
    const web: PluginWebDrawerSession = {
      ...document,
      kind: 'web',
      sessionId,
      pluginId: this.pluginId!,
      surfaceId,
      state: this.surfaceStates.get(surfaceId) ?? {}
    }
    this.webSessions.set(sessionId, {
      web,
      lifecycle: new SurfaceSession(
        surface,
        this.artifact.header.manifest,
        (action, input, signal) => this.invokeV2Action(action, input, signal)
      )
    })
    return web
  }
  async readySurface(surfaceId: string, sessionId: string) {
    const session = this.webSessions.get(sessionId)
    if (this.disposed || session?.web.surfaceId !== surfaceId) throw new Error('插件页面已关闭')
    await session.lifecycle.open()
    return this.surfaceStates.get(surfaceId) ?? {}
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
    const result = await session.lifecycle.invoke(action, input ?? {})
    if (session.web.kind === 'native' && action === session.web.renderAction)
      assertNativeView(result, this.actionIds)
    return result
  }
  async closeDrawer(surfaceId: string, sessionId: string) {
    const web = this.webSessions.get(sessionId)
    if (web?.web.surfaceId === surfaceId) {
      this.webSessions.delete(sessionId)
      publishPluginSurface(this.pluginId!, sessionId, undefined)
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
      for (const surface of this.getManifest().modules.surfaces ?? []) {
        if (surface.kind !== 'schema') continue
        const resource = this.artifact!.resources[surface.entry]
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
    await Promise.allSettled(
      [...this.webSessions.values()].map(({ web }) =>
        this.closeDrawer(web.surfaceId, web.sessionId)
      )
    )
    this.disposed = true
    this.guestStore?.dispose()
    clearInterval(this.socketTimer)
    this.sockets.closeAll()
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
    const response = await requestNetwork({ url, timeoutMs: 30000 }, () =>
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
      !this.artifact?.header.manifest.contributes?.guestAdapters?.some(
        (item) => item.id === adapterId
      )
    )
      throw new Error('请先安装对应的兼容环境插件')
    let script: string, name: string
    if (url) {
      const address = new URL(url)
      if (!['http:', 'https:'].includes(address.protocol))
        throw new Error('只支持 HTTP/HTTPS 下载地址')
      const response = await requestNetwork({ url, timeoutMs: 30000 }, () => true)
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
