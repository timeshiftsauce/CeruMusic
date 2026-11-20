import { readFile, stat, writeFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { randomUUID } from 'node:crypto'
import { musicRegistry } from './musicRegistry'
import type { ContentEntity, ResourceRef, OperationInputs, OperationTrack } from '@shiqianjiang/ceru-plugin-sdk'
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  nativeTheme,
  Notification,
  shell
} from 'electron'
import { createShareDescriptor, readShareDescriptor } from './sharing'
import { callPluginUI } from './uiBridge'
import { libraryBus, sharingBus, linkBus, notificationBus, windowBus } from './operations/bus'
import { operationTrack } from './operations/track'
import { listOperationTools, operationTool, toolInput } from '@shiqianjiang/ceru-plugin-core/contract'

import type { RpcMethod } from '@shiqianjiang/ceru-plugin-core/contract'
import type { HostServices as RpcServices } from '@shiqianjiang/ceru-plugin-core/dispatch'

type PluginFileEntry = { path: string; kind: 'file' | 'directory'; writable: boolean }
type PluginHotkeyEntry = { accelerator: string; commandId: string }

type CallDesktop = (method: string, data: any, signal?: AbortSignal) => Promise<any>
function desktopBindings<const Key extends RpcMethod>(
  methods: readonly Key[],
  invoke: CallDesktop
) {
  const bindings = {} as Pick<RpcServices, Key>
  for (const method of methods)
    bindings[method] = (data, context) => invoke(method, data, context.signal)
  return bindings
}

export class HostServices {
  private importResults = new Map<string, Promise<any>>()
  private fileHandles = new Map<string, PluginFileEntry>()
  private scheduledTasks = new Map<string, ReturnType<typeof setInterval>>()
  private registeredHotkeys = new Map<string, PluginHotkeyEntry>()

  constructor(
    private readonly owner: () => string,
    private readonly hasAction: (id: string) => boolean,
    private readonly runAction: (id: string, failure: string) => void
  ) {}

  private lastNotification = 0

  private accessLifetime = new AbortController()
  private musicTracks = new Map<string, ContentEntity>()
  revokeAccess() {
    this.accessLifetime.abort()
    this.accessLifetime = new AbortController()
    this.musicTracks.clear()
  }
  accessSignal(signal?: AbortSignal) {
    return signal ? AbortSignal.any([signal,this.accessLifetime.signal]) : this.accessLifetime.signal
  }
  private async runFavorite(pluginId: string, input: OperationInputs['track.like'], signal: AbortSignal, originalSong?: unknown) {
    signal.throwIfAborted()
    await libraryBus.run('track.like',input,{kind:'plugin',pluginId,runtime:3},async selected => {
      if (!('liked' in selected)) throw Error('无效的收藏操作')
      signal.throwIfAborted()
      const same = selected.track.ref.providerId === input.track.ref.providerId && selected.track.ref.id === input.track.ref.id
      const original = same ? originalSong : undefined
      if (!original) toolInput('track.like',selected)
      await callPluginUI(this.owner(),'operation.applyFavorite',{...selected,original},signal)
    })
    signal.throwIfAborted()
  }
  async namedFavorites(pluginId: string, refs: ResourceRef[], liked: boolean, signal: AbortSignal) {
    const rows: {track:OperationTrack;song:unknown}[] = await callPluginUI(this.owner(),'operation.favoriteSongs',{refs,liked},signal)
    for (const {track,song} of rows) await this.runFavorite(pluginId,{track,liked},signal,song)
    signal.throwIfAborted()
    return null
  }
  private trackKey(ref: ResourceRef) {
    return JSON.stringify([
      ref.scope === 'provider' ? '' : ref.pluginId,
      ref.providerId,
      ref.connectionId,
      ref.id
    ])
  }
  private playbackItem(input: ResourceRef) {
    const ref = musicRegistry.playbackRef(input, this.owner())
    const known = this.musicTracks.get(this.trackKey(input))
    return {
      ...(known ?? { title: ref.id, metadata: { artists: [] }, capabilities: ['play'] }),
      ref
    }
  }
  bindV3(invoke: CallDesktop, endpoint: import('@shiqianjiang/ceru-plugin-core/services').ServiceEndpoint, playbackHooks: Pick<RpcServices,'server.start' | 'server.stop' | 'events.register' | 'hooks.register' | 'hooks.next' | 'hooks.resolveNext' | 'hooks.accountNext' | 'hooks.searchNext' | 'hooks.libraryNext' | 'hooks.windowNext' | 'hooks.lyricsNext' | 'hooks.downloadsNext' | 'hooks.sharingNext' | 'hooks.linksNext' | 'hooks.notificationsNext'>): RpcServices {
    const music =
      (method: Parameters<typeof musicRegistry.invoke>[0]): RpcServices['music.search'] =>
      async ({ args }, ctx) => {
        const signal = AbortSignal.any([ctx.signal!, this.accessLifetime.signal])
        const result = await musicRegistry.invoke(method, args, this.owner(), {
          id: randomUUID(),
          signal,
          deadlineAt: Math.min(Date.now() + 120000, args.at(-1)?.operation?.deadlineAt ?? Infinity)
        })
        signal.throwIfAborted()
        if (result && 'items' in Object(result))
          for (const item of (result as { items: ContentEntity[] }).items) {
            if (item.ref.kind !== 'track') continue
            const key = this.trackKey(item.ref)
            this.musicTracks.delete(key)
            if (this.musicTracks.size >= 512)
              this.musicTracks.delete(this.musicTracks.keys().next().value!)
            this.musicTracks.set(key, item)
          }
        return result
      }
    return {
      ...playbackHooks,
      'entries.invalidate': async () => { await this.forward('entries.invalidate', {}) },
      'entries.selection': () => this.forward('entries.selection', {}),
      'plugins.list': async () => endpoint.list(),
      'plugins.use': async data => endpoint.use(data.pluginId,data.service),
      'plugins.invoke': (data,ctx) => endpoint.invoke(data.pluginId,data.service,data.method,data.input,AbortSignal.any([ctx.signal!,this.accessLifetime.signal])),
      'plugins.registerService': async data => {endpoint.register(data.id,data.methods);return null},
      'music.sources': music('music.sources'),
      'music.search': music('music.search'),
      'music.suggest': music('music.suggest'),
      'music.hotSearch': music('music.hotSearch'),
      'music.tracks.resolve': music('music.tracks.resolve'),
      'music.tracks.lyrics': music('music.tracks.lyrics'),
      'music.tracks.artwork': music('music.tracks.artwork'),
      'music.playlists.search': music('music.playlists.search'),
      'music.playlists.categories': music('music.playlists.categories'),
      'music.playlists.list': music('music.playlists.list'),
      'music.playlists.get': music('music.playlists.get'),
      'music.charts.list': music('music.charts.list'),
      'music.charts.getTracks': music('music.charts.getTracks'),
      'music.importers.list': music('music.importers.list'),
      'music.importers.parse': music('music.importers.parse'),
      'music.play': async ({ args }) => {
        await this.forward('music.play', { args: [[this.playbackItem(args[0])]] })
      },
      'music.enqueue': async ({ args }) => {
        if (
          !Array.isArray(args[0]) ||
          !args[0].length ||
          args[0].length > 1000 ||
          !['next', 'end'].includes(args[1])
        )
          throw Error('无效的队列操作')
        const items = args[0].map((ref: ResourceRef) => this.playbackItem(ref))
        await this.forward('music.enqueue', { args: [items, args[1]] })
      },
      ...desktopBindings(
        [
          'services.capabilities.list',
          'services.capabilities.get',
          'services.account.getSession',
          'services.account.getProfile',
          'services.account.openLogin',
          'services.app.openSettings',
          'services.app.openExternal',
          'services.player.getState',
          'services.player.play',
          'services.player.pause',
          'services.player.next',
          'services.player.previous',
          'services.player.seek',
          'services.player.setVolume',
          'services.player.setMode',
          'services.queue.get',
          'services.queue.append',
          'services.queue.replace',
          'services.queue.remove',
          'services.queue.reorder',
          'services.favorites.contains',
          'services.favorites.add',
          'services.favorites.remove',
          'services.history.list',
          'services.downloads.list',
          'services.downloads.create',
          'services.downloads.pause',
          'services.downloads.resume',
          'services.downloads.cancel',
          'services.downloads.retry',
          'services.downloads.reveal',
          'services.files.pick',
          'services.files.pickDirectory',
          'services.files.readText',
          'services.files.readBase64',
          'services.files.saveText',
          'services.files.writeText',
          'services.clipboard.readText',
          'services.clipboard.writeText',
          'services.localMusic.list',
          'services.localMusic.scan',
          'services.localMusic.getTags',
          'services.localMusic.writeTags',
          'services.settings.get',
          'services.settings.update',
          'services.window.control',
          'services.hotkeys.register',
          'services.hotkeys.unregister',
          'services.sharing.create',
          'services.sharing.revoke',
          'services.sharing.resolve',
          'services.rooms.getState',
          'services.rooms.join',
          'services.rooms.leave',
          'services.rooms.requestTrack',
          'services.devices.list',
          'services.devices.select',
          'services.ai.generate',
          'services.tasks.schedule',
          'services.tasks.cancel',
          'library.playlists.list',
          'library.playlists.getTracks',
          'library.playlists.import',
          'library.playlists.removeTracks',
          'library.playlists.clearPlaylist',
          'config.get',
          'http.request',
          'permissions.query',
          'permissions.request',
          'permissions.getGranted',
          'permissions.requestGroup',
          'sockets.connect',
          'sockets.send',
          'sockets.disconnect',
          'storage.get',
          'storage.set',
          'storage.delete',
          'guests.list',
          'guests.import',
          'guests.select',
          'guests.remove',
          'guests.invoke',
          'ui.dialogs.confirm',
          'ui.dialogs.prompt',
          'ui.dialogs.pickPlaylist',
          'ui.navigation.open',
          'router.current',
          'router.push',
          'accounts.current',
          'accounts.reportExpired',
          'accounts.form',
          'accounts.qrcode',
          'accounts.oauth',
          'accounts.browser',
          'credentials.get',
          'ui.pages.open',
          'ui.pages.close',
          'ui.views.setState',
          'ui.playlistImport.open',
          'ui.pluginUpdate.request',
          'ui.progress.create',
          'ui.progress.update',
          'ui.progress.close',
          'operations.cancel'
        ],
        invoke
      ),
      'services.app.getInfo': async () => this.appInfo('3.0.0'),
      'services.app.operations.list': async () => listOperationTools(),
      'services.app.call': async ({args},ctx) => {
        const {name} = operationTool(args[0])
        const signal = this.accessSignal(ctx.signal)
        const pluginId = ctx.manifest.id
        const input = toolInput(name,args[1])
        signal.throwIfAborted()
        const source = {kind:'plugin' as const,pluginId,runtime:3 as const}
        if (name.startsWith('playlist.')) {
          const operation = name as Extract<keyof OperationInputs, `playlist.${string}`>
          await libraryBus.run(operation, input as OperationInputs[typeof operation], source, async selected => {
            signal.throwIfAborted()
            // The renderer reuses the normal playlist APIs without entering the hook bus again.
            await callPluginUI(this.owner(),'operation.playlistTool',{name:operation,input:selected},signal)
          })
          signal.throwIfAborted()
          return null
        }
        if (name === 'notification.show') {
          await notificationBus.run(name, input as OperationInputs[typeof name], source, async selected => {
            signal.throwIfAborted()
            await callPluginUI(this.owner(),'ui.toast',{message:selected.title?selected.title+'：'+selected.body:selected.body,level:selected.level},signal)
          })
          signal.throwIfAborted()
          return null
        }
        if (name === 'link.open') {
          await linkBus.run(name,input as OperationInputs[typeof name],source,async selected=>{
            signal.throwIfAborted()
            await callPluginUI(this.owner(),'operation.openLink',selected,signal)
          })
          signal.throwIfAborted()
          return null
        }
        if (name === 'window.close') {
          await windowBus.run(name,input as OperationInputs[typeof name],source,async()=>{
            signal.throwIfAborted()
            await callPluginUI(this.owner(),'operation.closeWindow',{},signal)
          })
          signal.throwIfAborted()
          return null
        }
        if (name === 'share.create') {
          const selected = input as OperationInputs['share.create']
          return this.handleSharingService('services.sharing.create', [{
            version:1, track:{...selected.track.ref,scope:'provider'},
            title:selected.track.title, artists:selected.track.metadata.artists
          }], {kind:'plugin',pluginId,runtime:3}, signal)
        }
        if (name === 'track.like' && 'liked' in input) {
          await this.runFavorite(pluginId,{track:input.track,liked:input.liked},signal)
        } else if (name === 'player.play') {
          const selected = input as OperationInputs['player.play']
          await callPluginUI(pluginId,'music.play',{args:[[{...this.playbackItem({...selected.track.ref,scope:'provider'}),title:selected.track.title,metadata:selected.track.metadata}]]},signal)
        } else if (name === 'queue.add') {
          const selected = input as OperationInputs['queue.add']
          await callPluginUI(pluginId,'music.enqueue',{args:[selected.tracks.map(track=>({...this.playbackItem({...track.ref,scope:'provider'}),title:track.title,metadata:track.metadata})),selected.position]},signal)
        } else if (name === 'queue.remove') {
          const selected = input as OperationInputs['queue.remove']
          await callPluginUI(pluginId,'services.queue.remove',{args:[selected.tracks.map(track=>({...track.ref,scope:'provider'}))]},signal)
        } else if (name === 'queue.clear') {
          await callPluginUI(pluginId,'services.queue.clear',{args:[]},signal)
        } else if (name === 'download.create') {
          const selected = input as OperationInputs['download.create']
          await invoke('services.downloads.create',{args:[{tracks:selected.tracks.map(track=>({...track.ref,pluginId,scope:'provider'})),quality:selected.quality,...(selected.directory?{directory:{kind:'directory',id:selected.directory}}:{})},args[2]]},signal)
        } else {
          const method = name === 'player.resume' ? 'services.player.play' : `services.${name}`
          const params = 'positionMs' in input ? [input.positionMs] : 'volume' in input ? [input.volume] :
            'mode' in input ? [{repeat:input.mode === 'single' ? 'one' : 'all',shuffle:input.mode === 'random'}] : []
          await callPluginUI(pluginId,method,{args:params},signal)
        }
        return null
      },
      'surface.invoke': async () => {
        throw new Error('插件页面操作必须通过已挂载的视图会话')
      },
      'ui.notifications.show': async ({ title, body }, { manifest }) => {
        if (
          typeof title !== 'string' ||
          !title.trim() ||
          title.length > 120 ||
          typeof body !== 'string' ||
          body.length > 1024
        )
          throw new Error('插件通知内容无效')
        if (!Notification.isSupported()) throw new Error('当前环境不支持系统通知')
        if (Date.now() - this.lastNotification < 5000) throw new Error('插件通知过于频繁')
        this.lastNotification = Date.now()
        new Notification({ title: manifest.name + '：' + title, body }).show()
      }
    }
  }

  forward(method: string, data: any) {
    return callPluginUI(this.owner(), method, data)
  }
  async changePlaylistTracks(method:string, data:any, source:{kind:'plugin';pluginId:string;runtime:2|3}, signal:AbortSignal) {
    signal.throwIfAborted()
    const adding = method === 'library.playlists.import'
    const operation = adding ? 'playlist.addTracks' : 'playlist.removeTracks'
    if (!libraryBus.names().includes(operation)) return callPluginUI(this.owner(), method, data, signal)
    const destination = await callPluginUI(this.owner(), 'operation.playlistTarget', {target:data.target, suggestedName:data.suggestedName, adding}, signal)
    signal.throwIfAborted()
    const length = data.items.length
    if (!destination) return {cancelled:true, added:0, skipped:0}
    const {playlist, newName} = destination
    const originals = new Map<string, ContentEntity>()
    const tracks:OperationTrack[] = []
    const keyOf = (track:OperationTrack) => JSON.stringify([track.ref.providerId, track.ref.id])
    for (const item of data.items as ContentEntity[]) {
      const ref = item.ref
      const portable = ref.scope === 'provider' && !ref.connectionId && !['private','local'].includes(ref.providerId) && /^[\w.-]{1,128}$/.test(ref.providerId) && /^[\w.-]{1,256}$/.test(ref.id)
      const projected:OperationTrack = {ref:{kind:'track',providerId:portable ? ref.providerId : 'private',id:portable ? ref.id : randomUUID()},title:(item.title ?? '').slice(0,512),metadata:{artists:(item.metadata?.artists ?? []).slice(0,32).map(artist => artist.slice(0,256))}}
      const key = keyOf(projected)
      if (!originals.has(key)) {originals.set(key,item); tracks.push(projected)}
    }
    const target = {id:playlist.id, location:playlist.location}
    let result:any = adding ? {cancelled:false,...(!newName && {target}),added:0,skipped:length} : {removed:0,notFound:length}
    const outcome = await libraryBus.run(operation, {playlist,tracks}, source, async selected => {
      signal.throwIfAborted()
      if (!('tracks' in selected)) throw Error('无效的歌单歌曲操作')
      if (!selected.tracks.length) return
      const items = selected.tracks.map(track => {
        const item = originals.get(keyOf(track))
        if (!item) throw Error('歌曲不在本次选择中')
        return item
      })
      result = await callPluginUI(this.owner(), 'operation.writePlaylistTracks', {adding,target,newName,items}, signal)
      if (adding) result.skipped += length - items.length
      else result.notFound += length - items.length
    })
    signal.throwIfAborted()
    if (outcome.prevented && adding) result.cancelled = true
    return result
  }
  importPlaylist(key: string, write:()=>Promise<any>) {
    let result = this.importResults.get(key)
    if (!result) {
      result = write().catch((error) => {
        this.importResults.delete(key)
        throw error
      })
      this.importResults.set(key, result)
      if (this.importResults.size > 200)
        this.importResults.delete(this.importResults.keys().next().value!)
    }
    return result
  }
  appInfo(hostApi: '1.0.0' | '3.0.0') {
    return {
      name: app.getName(),
      version: app.getVersion(),
      platform: process.platform,
      locale: app.getLocale(),
      theme: nativeTheme.shouldUseDarkColors ? 'dark' : 'light',
      hostApi
    }
  }
  async openExternal(url: URL) {
    await shell.openExternal(url.href)
    return null
  }
  readClipboard() {
    return clipboard.readText()
  }
  writeClipboard(text: string) {
    clipboard.writeText(text)
    return null
  }
  controlWindow(data: any) {
    const win = BrowserWindow.getAllWindows().find((item) => !item.isDestroyed())
    if (!win) throw new Error('主窗口不可用')
    const action = data.args?.[0]
    if (action === 'show') win.show()
    else if (action === 'minimize') win.minimize()
    else if (action === 'maximize') win.maximize()
    else if (action === 'restore') win.restore()
    else if (action === 'mini-player') return this.forward('services.window.control', data)
    else throw new Error('不支持的窗口操作')
    return null
  }
  private addFileHandle(
    path: string,
    kind: 'file' | 'directory',
    writable: boolean,
    size?: number
  ) {
    const id = randomUUID()
    this.fileHandles.set(id, { path, kind, writable })
    return { kind, id, name: basename(path), ...(kind === 'file' && size != null ? { size } : {}) }
  }

  fileEntry(handle: any, kind: 'file' | 'directory' = 'file') {
    if (!handle || handle.kind !== kind || typeof handle.id !== 'string')
      throw new Error('文件句柄无效')
    const entry = this.fileHandles.get(handle.id)
    if (!entry || entry.kind !== kind) throw new Error('文件句柄已失效或不属于此插件')
    return entry
  }

  resolveDirectories(handles: any[]): string[] {
    if (!Array.isArray(handles)) throw new Error('目录列表无效')
    return handles.map((handle) => this.fileEntry(handle, 'directory').path)
  }

  async handleFileService(method: string, args: any[]) {
    const name = method.slice('services.files.'.length)
    if (name === 'pick') {
      const request = args[0] ?? {}
      const extensions = Array.isArray(request.extensions)
        ? request.extensions.map((item: any) => String(item).replace(/^\./, '')).filter(Boolean)
        : []
      const result = await dialog.showOpenDialog({
        title: typeof request.title === 'string' ? request.title : undefined,
        properties: request.multiple ? ['openFile', 'multiSelections'] : ['openFile'],
        filters: extensions.length ? [{ name: '支持的文件', extensions }] : undefined
      })
      if (result.canceled) return []
      return Promise.all(
        result.filePaths.map(async (path) =>
          this.addFileHandle(path, 'file', true, (await stat(path)).size)
        )
      )
    }
    if (name === 'pickDirectory') {
      const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
      })
      return result.canceled ? null : this.addFileHandle(result.filePaths[0], 'directory', true)
    }
    if (name === 'saveText') {
      const request = args[0] ?? {}
      const text = String(request.text ?? '')
      if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('写入内容超过 16 MiB 限制')
      const result = await dialog.showSaveDialog({
        defaultPath: basename(String(request.suggestedName || 'untitled.txt'))
      })
      if (result.canceled || !result.filePath) return null
      await writeFile(result.filePath, text, 'utf8')
      return this.addFileHandle(result.filePath, 'file', true, (await stat(result.filePath)).size)
    }
    const entry = this.fileEntry(args[0])
    if (name === 'readText' || name === 'readBase64') {
      const buffer = await readFile(entry.path)
      if (buffer.byteLength > 16 * 1024 * 1024) throw new Error('文件超过 16 MiB 限制')
      return name === 'readText' ? buffer.toString('utf8') : buffer.toString('base64')
    }
    if (name === 'writeText') {
      if (!entry.writable) throw new Error('文件句柄不可写')
      const text = String(args[1] ?? '')
      if (Buffer.byteLength(text) > 16 * 1024 * 1024) throw new Error('写入内容超过 16 MiB 限制')
      await writeFile(entry.path, text, 'utf8')
      return null
    }
    throw new Error('不支持的文件操作')
  }

  async registerPluginHotkey(args: any[]) {
    const request = args[0] ?? {}
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(request.id) || !this.hasAction(request.commandId))
      throw new Error('快捷键声明无效')
    const accelerator = String(request.accelerator || '')
    const previous = this.registeredHotkeys.get(request.id)
    if (previous) globalShortcut.unregister(previous.accelerator)
    const register = (entry: PluginHotkeyEntry) =>
      globalShortcut.register(entry.accelerator, () => {
        this.runAction(entry.commandId, '插件快捷键执行失败:')
      })
    const tryRegister = (entry: PluginHotkeyEntry) => {
      try {
        return register(entry)
      } catch {
        return false
      }
    }
    const next = { accelerator, commandId: request.commandId }
    const registered = tryRegister(next)
    if (!registered) {
      if (!previous || !tryRegister(previous)) this.registeredHotkeys.delete(request.id)
      throw new Error('快捷键已被占用或格式无效')
    }
    this.registeredHotkeys.set(request.id, next)
    return request.id
  }

  unregisterPluginHotkey(id: unknown) {
    const entry = this.registeredHotkeys.get(String(id))
    if (!entry) return null
    globalShortcut.unregister(entry.accelerator)
    this.registeredHotkeys.delete(String(id))
    return null
  }

  async handleSharingService(method: string, args: any[], source?:import('@shiqianjiang/ceru-plugin-sdk').OperationSource, signal=this.accessSignal()) {
    const name = method.slice('services.sharing.'.length)
    if (name === 'resolve') {
      const url = new URL(String(args[0] ?? ''))
      if (
        url.protocol !== 'cerumusic:' ||
        url.hostname !== 'share' ||
        !url.pathname.startsWith('/')
      )
        throw new Error('不是澜音分享链接')
      return readShareDescriptor(url.pathname.slice(1))
    }
    if (name === 'create') {
      signal.throwIfAborted()
      const descriptor=args[0], ref=descriptor.track
      const track=operationTrack({pluginResource:ref,source:ref.providerId,songmid:ref.id,name:descriptor.title,singer:descriptor.artists?.join('、')})
      const create=(selected=track)=>{
        signal.throwIfAborted()
        const same=selected.ref.providerId===track.ref.providerId&&selected.ref.id===track.ref.id
        return createShareDescriptor(same?descriptor:{track:{...selected.ref,scope:'provider'},title:selected.title,artists:selected.metadata.artists})
      }
      const result=sharingBus.names().includes('share.create')
        ? (await sharingBus.run('share.create',{track},source??{kind:'system'},async input=>create(input.track))).result
        : create()
      signal.throwIfAborted()
      if(!result)throw Error('分享已由插件取消')
      return { id: result.id, url: result.url }
    }
    if (name === 'revoke') return null
    throw new Error('不支持的分享操作')
  }

  async handleTaskService(method: string, args: any[]) {
    const name = method.slice('services.tasks.'.length)
    const request = name === 'schedule' ? args[0] : { id: args[0] }
    if (!/^[a-zA-Z0-9._-]{1,80}$/.test(request.id)) throw new Error('任务 ID 无效')
    if (name === 'cancel') {
      const timer = this.scheduledTasks.get(request.id)
      if (timer) clearInterval(timer)
      this.scheduledTasks.delete(request.id)
      return null
    }
    if (!this.hasAction(request.commandId)) throw new Error('后台任务引用了未注册操作')
    const intervalMs = Number(request.intervalMs)
    if (!Number.isSafeInteger(intervalMs) || intervalMs < 60_000 || intervalMs > 86_400_000)
      throw new Error('后台任务间隔必须在 1 分钟到 24 小时之间')
    const previous = this.scheduledTasks.get(request.id)
    if (previous) clearInterval(previous)
    const timer = setInterval(() => {
      this.runAction(request.commandId, '插件后台任务执行失败:')
    }, intervalMs)
    this.scheduledTasks.set(request.id, timer)
    return { id: request.id }
  }

  dispose() {
    this.revokeAccess()
    this.importResults.clear()
    for (const timer of this.scheduledTasks.values()) clearInterval(timer)
    this.scheduledTasks.clear()
    for (const { accelerator } of this.registeredHotkeys.values())
      globalShortcut.unregister(accelerator)
    this.registeredHotkeys.clear()
    this.fileHandles.clear()
  }
}
