import { PluginCore, readPluginArtifact } from '@shiqianjiang/ceru-plugin-core'
import { NodePluginSandbox } from '@shiqianjiang/ceru-plugin-core/node'
import { SurfaceSession } from '@shiqianjiang/ceru-plugin-core/surface'
import { createWebSurfaceDocument } from '@shiqianjiang/ceru-plugin-core/surface-document'
import { app } from 'electron'
import { mkdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { GuestStore } from '@shiqianjiang/ceru-plugin-core/guests'
import { SocketBroker } from '@shiqianjiang/ceru-plugin-core/sockets'
import { requestNetwork } from '@shiqianjiang/ceru-plugin-core/network'
import { PluginHttpServer } from '@shiqianjiang/ceru-plugin-core/server'
import { TrustedPluginRuntime } from '@shiqianjiang/ceru-plugin-core/trusted'
import { getAppDirPath } from '../../../utils/path'
import { readTrustedConsent, trustedPublisher, registerTrustedRuntimeStopper } from '../trusted/consent'
import { launchTrustedUtilityProcess } from '../trusted/utilityProcess'
import { pluginMedia } from '../media/mediaProtocol'
import { assertNavigationRequest, operationEventPermission, type JsonObject, type UISlotName } from '@shiqianjiang/ceru-plugin-sdk'
import DesktopPluginHost from '../shared/DesktopPluginHost'
import type {
  Activate,
  GuestOptions,
  Logger,
  RuntimeHooks,
  SelectedGuest,
  SurfaceAction
} from '../shared/runtime'
import { readV3Descriptor } from './manifest'
import { changedRegionViews } from './regionPreview'
import { exportShareResolver } from '../shared/shareResolver'
import { createDispatcher } from '@shiqianjiang/ceru-plugin-core/dispatch'
import type { ServiceEndpoint } from '@shiqianjiang/ceru-plugin-core/services'
import { pluginServices } from './serviceRouter'
import { accountBus,operationBus,routeBus,searchBus,libraryBus,resolveBus,windowBus,lyricBus,downloadBus,sharingBus,linkBus,notificationBus } from '../operations/bus'
import { isLibraryOperation, isSearchOperation, isLyricOperation, isDownloadOperation } from '@shiqianjiang/ceru-plugin-core/operations'
import { projectPluginRoute, validatePluginRouteTarget, type PluginRoute } from '@shiqianjiang/ceru-plugin-sdk/navigation'

let componentLibrary: Promise<{ factory: string; styles: string }> | undefined
function desktopComponents() {
  return componentLibrary ??= readFile(join(app.getAppPath(), 'out/main/desktop-components.json'), 'utf8')
    .then(text => JSON.parse(text) as { factory: string; styles: string })
    .catch(error => { componentLibrary = undefined; throw error })
}

export function prepareV3(code: string, hooks: RuntimeHooks) {
  const { artifact } = readPluginArtifact(code)
  let viewArtifact = artifact
  const manifest = artifact.header.manifest
  const descriptor = readV3Descriptor(hooks.pluginId, manifest)
  const share = manifest.entry.share
  const endpoint: ServiceEndpoint = pluginServices.connect(manifest,
    (id, method, input, caller, signal) => worker.invoke('plugin-service',id,method,[input,caller,Date.now()+30000],signal),
    (event,value) => {if (hooks.granted('services.consume')) void worker.send('host-event',{event:'plugins.'+event,value})})
  hooks.signal.addEventListener('abort', () => endpoint.dispose(), {once:true})
  const invokeOperation=async(name:string,token:string,input:unknown,source:unknown,signal:AbortSignal)=>{
    let state:import('@shiqianjiang/ceru-plugin-sdk').OperationState={player:null,route:null,account:null}
    try {state=await hooks.operationState(signal)} catch {signal.throwIfAborted()}
    return worker.invoke('operation-hook',name,'',[token,input,source,state],signal)
  }
  const events = {
    granted: (name: string, done: boolean) => {
      const permission = operationEventPermission(name + (done ? ':done' : ''))
      return !!permission && hooks.granted(permission)
    },
    invoke: (name: string, done: boolean, payload: unknown, signal: AbortSignal) =>
      worker.invoke('operation-event', name + (done ? ':done' : ''), '', [payload], signal),
  }
  const playbackHooks = operationBus.connect(manifest.id, () => hooks.granted('player.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort', () => playbackHooks.dispose(), {once:true})
  const resolveHooks=resolveBus.connect(manifest.id,()=>hooks.granted('player.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>resolveHooks.dispose(),{once:true})
  const accountHooks=accountBus.connect(manifest.id,()=>hooks.granted('account.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>accountHooks.dispose(),{once:true})
  const windowHooks=windowBus.connect(manifest.id,()=>hooks.granted('window.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>windowHooks.dispose(),{once:true})
  const lyricHooks=lyricBus.connect(manifest.id,()=>hooks.granted('lyrics.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>lyricHooks.dispose(),{once:true})
  const downloadHooks=downloadBus.connect(manifest.id,()=>hooks.granted('downloads.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>downloadHooks.dispose(),{once:true})
  const sharingHooks=sharingBus.connect(manifest.id,()=>hooks.granted('sharing.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>sharingHooks.dispose(),{once:true})
  const linkHooks=linkBus.connect(manifest.id,()=>hooks.granted('links.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>linkHooks.dispose(),{once:true})
  const notificationHooks=notificationBus.connect(manifest.id,()=>hooks.granted('notifications.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>notificationHooks.dispose(),{once:true})
  const libraryHooks=libraryBus.connect(manifest.id,()=>hooks.granted('library.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>libraryHooks.dispose(),{once:true})
  const searchHooks=searchBus.connect(manifest.id,()=>hooks.granted('search.intercept'),
    invokeOperation, events)
  hooks.signal.addEventListener('abort',()=>searchHooks.dispose(),{once:true})
  const guard = routeBus.connect(manifest.id,()=>hooks.granted('navigation.intercept'),async (_name,_token,input,_source,signal) => {
    const view = (route: PluginRoute) => projectPluginRoute(route.name,route.params,route.query,manifest.id)
    const reply = await worker.invoke('route-guard','router.navigate','',[view(input.to),input.from ? view(input.from) : null],signal)
    if (reply === null) return {}
    if (reply === false) return {prevented:true}
    return {input:{to:validatePluginRouteTarget(reply,manifest),from:input.from}}
  })
  hooks.signal.addEventListener('abort',()=>guard.dispose(),{once:true})
  let httpServer: PluginHttpServer | undefined
  let httpPort: number | undefined
  let detachServerAbort: (() => void) | undefined
  let serverLan = false
  const stopServer = async () => {
    const previous = httpServer
    httpServer = undefined
    httpPort = undefined
    detachServerAbort?.()
    detachServerAbort = undefined
    await previous?.stop()
  }
  const services = hooks.services.bindV3(hooks.rpc, endpoint, {
    'server.start': async (data) => {
      if (manifest.entry.server?.runtime === 'node') throw Error('此插件使用独立 Node 服务')
      if (httpServer) throw Error('插件服务已经启动')
      if (data.lan) {
        const permission = manifest.uses?.permissions?.find(row => row.name === 'network.serve.lan')
        await hooks.authorize(permission?.key, 'network.serve.lan')
      }
      const lifetime = hooks.services.accessSignal(hooks.signal)
      lifetime.throwIfAborted()
      const server = new PluginHttpServer({
        handler: request => worker.handleHttp(request),
        signal: lifetime,
        onListen: port => pluginMedia.registerService(hooks.pluginId, port)
      })
      httpServer = server
      serverLan = data.lan === true
      const aborted = () => {
        if (httpServer === server) { httpServer = undefined; httpPort = undefined }
        void worker.send('server-stopped', {})
      }
      lifetime.addEventListener('abort', aborted, { once: true })
      detachServerAbort = () => lifetime.removeEventListener('abort', aborted)
      try {
        const address = await server.start({ port: data.port, lan: serverLan })
        httpPort = address.port
        return address
      } catch (error) {
        if (httpServer === server) {
          httpServer = undefined
          httpPort = undefined
          detachServerAbort?.()
          detachServerAbort = undefined
        }
        await server.stop()
        throw error
      }
    },
    'server.stop': async (data) => {
      if (data.port !== undefined && data.port !== httpPort) return null
      await stopServer()
      return null
    },
    'events.register': async ({name, active}) => {
      if (typeof name !== 'string' || typeof active !== 'boolean') throw Error('无效的操作事件')
      const permission = operationEventPermission(name)
      if (!permission || !manifest.uses?.permissions?.some(row => row.name === permission)) throw Error('未声明操作事件权限')
      const done = name.endsWith(':done'), operation = done ? name.slice(0, -5) : name
      const owner = operation === 'player.resolve' ? resolveHooks : operation === 'account.switch' ? accountHooks : operation === 'window.close' ? windowHooks : operation === 'share.create' ? sharingHooks : operation === 'link.open' ? linkHooks : operation === 'notification.show' ? notificationHooks : isLibraryOperation(operation) ? libraryHooks : isSearchOperation(operation) ? searchHooks : isLyricOperation(operation) ? lyricHooks : isDownloadOperation(operation) ? downloadHooks : playbackHooks
      owner.registerEvent(operation as never, done, active)
      return null
    },
    'hooks.register': async ({name,priority}) => {
      if(name==='link.open') {
        if(!manifest.uses?.permissions?.some(row=>row.name==='links.intercept'))throw Error('未声明链接处理权限')
        linkHooks.register(name,priority);return null
      }
      if(name==='notification.show') {
        if(!manifest.uses?.permissions?.some(row=>row.name==='notifications.intercept'))throw Error('未声明提示处理权限')
        notificationHooks.register(name,priority);return null
      }
      if(name==='share.create') {
        if(!manifest.uses?.permissions?.some(row=>row.name==='sharing.intercept'))throw Error('未声明分享处理权限')
        sharingHooks.register(name,priority);return null
      }
      if (isDownloadOperation(name)) {
        if (!manifest.uses?.permissions?.some(row=>row.name==='downloads.intercept')) throw Error('未声明下载处理权限')
        downloadHooks.register(name,priority);return null
      }
      if (isLyricOperation(name)) {
        if (!manifest.uses?.permissions?.some(row=>row.name==='lyrics.intercept')) throw Error('未声明歌词处理权限')
        lyricHooks.register(name,priority);return null
      }
      if (name === 'window.close') {
        if (!manifest.uses?.permissions?.some(row=>row.name==='window.intercept')) throw Error('未声明窗口关闭拦截权限')
        windowHooks.register(name,priority);return null
      }
      if (isLibraryOperation(name)) {
        if (!manifest.uses?.permissions?.some(row=>row.name==='library.intercept')) throw Error('未声明音乐库拦截权限')
        libraryHooks.register(name,priority);return null
      }
      if (isSearchOperation(name)) {
        if (!manifest.uses?.permissions?.some(row=>row.name==='search.intercept')) throw Error('未声明搜索拦截权限')
        searchHooks.register(name,priority);return null
      }
      if (name==='account.switch') {
        if (!manifest.uses?.permissions?.some(row=>row.name==='account.intercept')) throw Error('未声明子账号切换拦截权限')
        accountHooks.register(name,priority);return null
      }
      if (!manifest.uses?.permissions?.some(row=>row.name==='player.intercept')) throw Error('未声明播放拦截权限')
      if (name==='player.resolve') resolveHooks.register(name,priority)
      else playbackHooks.register(name,priority)
      return null
    },
    'hooks.next': async ({token,input}) => playbackHooks.next(token,input),
    'hooks.resolveNext': async ({token,input}) => resolveHooks.next(token,input),
    'hooks.libraryNext': async ({token,input})=>libraryHooks.next(token,input),
    'hooks.searchNext': async ({token,input}) => searchHooks.next(token,input),
    'hooks.accountNext': async ({token,input})=>accountHooks.next(token,input),
    'hooks.windowNext': async ({token,input})=>windowHooks.next(token,input),
    'hooks.lyricsNext': async ({token,input})=>lyricHooks.next(token,input),
    'hooks.downloadsNext': async ({token,input})=>downloadHooks.next(token,input),
    'hooks.sharingNext': async ({token,input})=>sharingHooks.next(token,input),
    'hooks.linksNext': async ({token,input})=>linkHooks.next(token,input),
    'hooks.notificationsNext': async ({token,input})=>notificationHooks.next(token,input)
  })
  const dispatch = createDispatcher(services, {
    manifest,
    authorize: hooks.authorize,
    pluginId: hooks.pluginId,
    log: hooks.log,
    signal: hooks.signal
  })
  const worker: NodePluginSandbox = new NodePluginSandbox((method, data) => {
    if (['guests.import', 'guests.select', 'guests.remove', 'guests.invoke'].includes(method)) {
      const capability = method === 'guests.invoke' ? 'guests.run' : 'guests.manage'
      const permission = descriptor.permissions.find((item) => item.name === capability)
      return dispatch(method, { ...data, permissionKey: permission?.key })
    }
    return dispatch(method, data)
  }, (type,data)=>{
    if (type === 'route-guard') {
      if (!manifest.uses?.permissions?.some(item=>item.name==='navigation.intercept')) return
      guard.register('router.navigate',data?.active === true ? 'normal' : null)
    } else hooks.event(type,data)
  })
  const releaseMedia = pluginMedia.registerRuntime(hooks.pluginId,(id,signal)=>worker.streamTransform(id,signal), async () => {
    const permission = manifest.uses?.permissions?.find(row => row.name === 'streams.transform')
    await hooks.authorize(permission?.key, 'streams.transform')
  })
  hooks.signal.addEventListener('abort',releaseMedia,{once:true})
  const start = async () => {
    const needsTrusted = manifest.entry.server?.runtime === 'node'
    const publisher = trustedPublisher(artifact, hooks.development)
    const allowed = needsTrusted && readTrustedConsent(hooks.pluginId, manifest, publisher)
    if (needsTrusted && !allowed && !descriptor.trusted?.optional)
      throw Error('此插件需要完全信任才能运行，请在插件详情中授权')
    if (!allowed || !publisher) { await worker.start(artifact); return }
    const dataDir = join(getAppDirPath(), 'plugins', 'data', hooks.pluginId)
    const nativeDir = join(getAppDirPath(), 'plugins', 'native', hooks.pluginId, manifest.version)
    await mkdir(dataDir, { recursive: true })
    await mkdir(nativeDir, { recursive: true })
    const lifetime = hooks.services.accessSignal(hooks.signal)
    const revoke = new AbortController()
    const trustedDispatch = createDispatcher(services, {
      manifest, authorize: hooks.authorize, pluginId: hooks.pluginId, log: hooks.log,
      signal: AbortSignal.any([lifetime, revoke.signal])
    })
    const trusted = new TrustedPluginRuntime({
      artifact,
      verification: {
        signatureVerified: artifact.signatureStatus !== 'unsigned', codeDigest: artifact.codeDigest, publisher,
        nodeApiModules: (manifest.entry.native ?? []).map(module => module.name)
      },
      consent: { granted: true, pluginId: manifest.id, publisher, signal: revoke.signal, development: hooks.development === true, fileAccess: 'unrestricted' },
      development: hooks.development === true,
      executable: process.execPath, dataDir, nativeDir,
      launchUtilityProcess: launchTrustedUtilityProcess,
      signal: lifetime,
      rpc: (method, data, signal) => { signal.throwIfAborted(); return trustedDispatch(method, data) },
      authorize: async (key, permission, signal) => {
        signal.throwIfAborted()
        await hooks.authorize(key, permission)
        signal.throwIfAborted()
      },
      onListen: async (address, signal) => {
        signal.throwIfAborted()
        const remove = pluginMedia.registerService(hooks.pluginId, address.port)
        worker.setServerAddress({url:address.url,port:address.port})
        return () => { remove(); worker.setServerAddress(undefined) }
      },
      onLog: entry => hooks.event('log', {level:entry.level,values:[entry.message,entry.data]}),
      onExit: error => { if (error && !lifetime.aborted && !revoke.signal.aborted) hooks.event('closed', {}) }
    })
    const unregister = registerTrustedRuntimeStopper(hooks.pluginId, async () => {
      revoke.abort()
      await trusted.stop()
    })
    lifetime.addEventListener('abort', unregister, {once:true})
    try { await trusted.start(); await worker.start(artifact) }
    catch (error) { unregister(); await trusted.stop(); worker.dispose(); throw error }
  }
  return {
    descriptor,
    activateServices: () => { endpoint.attach(); playbackHooks.attach(); resolveHooks.attach(); accountHooks.attach(); windowHooks.attach(); lyricHooks.attach(); downloadHooks.attach(); sharingHooks.attach(); linkHooks.attach(); notificationHooks.attach(); searchHooks.attach(); libraryHooks.attach(); guard.attach() },
    refreshHooks: () => { operationBus.refresh(); resolveBus.refresh(); accountBus.refresh(); windowBus.refresh(); lyricBus.refresh(); downloadBus.refresh(); sharingBus.refresh(); linkBus.refresh(); notificationBus.refresh(); searchBus.refresh(); libraryBus.refresh(); routeBus.refresh(); if (!hooks.granted('network.serve') || (serverLan && !hooks.granted('network.serve.lan'))) void stopServer() },
    manifest,
    resources: artifact.resources,
    worker,
    share,
    requestNetwork,
    sockets: new SocketBroker(),
    start,
    load: (activate: Activate) =>
      PluginCore.load(code, { host: { activate: (_artifact, context) => activate(context) } }),
    guests: (options: GuestOptions) => new GuestStore({ ...options, artifact }),
    updatePreview: (next: typeof artifact) => {
      const changed = changedRegionViews(viewArtifact, next)
      if (changed !== null) viewArtifact = next
      return changed
    },
    document: async (id: string, sessionId: string, props: JsonObject = {}, slot?: UISlotName, region?: string) => {
      const library = viewArtifact.header.manifest.entry.views?.some(view => view.id === id && view.kind === 'component')
        ? await desktopComponents() : undefined
      return createWebSurfaceDocument(viewArtifact, id, sessionId, props, slot, region, library)
    },
    surface: (id: string, action: SurfaceAction) => {
      const view = manifest.entry.views?.find((item) => item.id === id)
      if (!view) throw new Error('插件未声明此页面')
      return new SurfaceSession(view, manifest, action)
    },
    navigation: (data: unknown) => assertNavigationRequest(data, manifest),
    resolver: (config: Record<string, unknown>, guest?: SelectedGuest) =>
      exportShareResolver(
        {
          name: manifest.name,
          version: manifest.version,
          author: manifest.author,
          providers: descriptor.providers,
          declaration: share,
          factory: share && artifact.modules[share.module]
        },
        config,
        guest
      )
  }
}

export default class V3PluginHost extends DesktopPluginHost {
  constructor(code: string | null = null, logger: Logger = console, developmentPreview = false) {
    super(prepareV3, code, logger, developmentPreview)
  }
}
