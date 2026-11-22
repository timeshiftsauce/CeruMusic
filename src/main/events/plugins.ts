import { app, dialog, ipcMain } from 'electron'
import {join} from 'node:path'
import { DeveloperEntries } from '../services/plugin/devMode'
import { loadSkinPreferences, saveSkinChoice, saveRegionChoice, saveSkinSetting, type SkinChoice } from '../services/plugin/skinChoice'
import { parsePlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'
import type { RegionEdit, SkinSettingEdit } from '@common/pluginSkin'
import {getAppDirPath} from '../utils/path'
import {configManager} from '../services/ConfigManager'
import {developerEntriesChanged, desktopLyricRequester, notifyDesktopLyricSelection} from '../services/plugin/uiBridge'
import pluginService from '../services/plugin'
import { createEnvironmentReporter } from '../services/plugin/lifecycle'
import { callPluginUI } from '../services/plugin/uiBridge'
import { getHookControls, hookSnapshot, operationBus, routeBus, searchBus, setupHookPolicy, updateHookControls } from '../services/plugin/operations/bus'
import { isPlaybackOperation } from '@shiqianjiang/ceru-plugin-core/operations'
import { libraryBus, windowBus, sharingBus, linkBus, notificationBus } from '../services/plugin/operations/bus'
import { deepLinkRouter } from '../router'
import { BrowserWindow } from 'electron'
import { publicLink } from '@shiqianjiang/ceru-plugin-sdk'
import { replayDownload } from '../services/plugin/operations/downloads'
import type { OperationSource } from '@shiqianjiang/ceru-plugin-sdk'
import ManageSongList from '../services/songList/ManageSongList'
import { pluginLog } from '../logger'
import { assertMainWindowRequest, assertPluginUIRequest } from '../services/plugin/uiBridge'
import { assertAccountSummary } from '@shiqianjiang/ceru-plugin-sdk'
import { playlistSectionProps, type PlaylistSectionContext } from '@common/pluginPlaylistContext'
import {
  prepareExternalPlugin,
  commitExternalPlugin,
  discardExternalPlugin,
  queueExternalPluginFile
} from '../services/plugin/externalInstall'

let isPluginsInitialized = false

const DEFAULT_HOST_EVENT_MAX_BYTES = 1024 * 1024
const LARGE_HOST_EVENT_MAX_BYTES = 8 * 1024 * 1024
const LARGE_HOST_EVENTS = new Set(['queue.changed', 'lyrics.changed','search.results','playlist.addTracks','playlist.removeTracks'])

function assertHostEventPayloadSize(name: string, value: unknown): void {
  let serialized: string
  try {
    serialized = JSON.stringify(value ?? null)
  } catch {
    throw new Error(`插件宿主事件 ${name} 数据无法序列化`)
  }

  const bytes = Buffer.byteLength(serialized, 'utf8')
  const limit = LARGE_HOST_EVENTS.has(name)
    ? LARGE_HOST_EVENT_MAX_BYTES
    : DEFAULT_HOST_EVENT_MAX_BYTES
  if (bytes <= limit) return

  const actualMiB = (bytes / 1024 / 1024).toFixed(2)
  const limitMiB = limit / 1024 / 1024
  throw new Error(`插件宿主事件 ${name} 数据过大（${actualMiB} MiB，限制 ${limitMiB} MiB）`)
}

export default function InitPluginService() {
  ipcMain.handle('plugin:link-dispatch', (event,url) => {
    assertMainWindowRequest(event,'只有主界面可以处理链接')
    if(!publicLink(url))throw Error('无效的公开链接')
    return deepLinkRouter.dispatch(BrowserWindow.fromWebContents(event.sender),url)
  })
  ipcMain.handle('plugin:system-operation', async(event,id,name,input) => {
    assertMainWindowRequest(event,'只有主界面可以发起系统操作')
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('无效的系统操作请求')
    assertHostEventPayloadSize(name,input)
    const execute=(value:unknown)=>callPluginUI('','operation.systemDefault',{id,input:value})
    if(name==='link.open')return linkBus.run(name,input,{kind:'ui',location:'link-entry'},execute)
    if(name==='notification.show')return notificationBus.run(name,input,{kind:'system',location:'in-app'},execute)
    throw Error('不支持的系统操作')
  })
  ipcMain.handle('plugin:window-close', async (event,id,location) => {
    assertMainWindowRequest(event, '只有主界面可以发起窗口关闭')
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || !['titlebar','shortcut'].includes(location)) throw Error('无效的窗口关闭请求')
    return windowBus.run('window.close',{}, {kind:'ui',location}, async input => {
      await callPluginUI('', 'operation.default', {id,name:'window.close',input})
    })
  })
  let pendingSelection: {id:string; cancel:AbortController} | undefined
  ipcMain.handle('plugin:cancel-provider-selection', (event, id) => {
    assertMainWindowRequest(event, '只有主界面可以取消音源选择')
    if (pendingSelection?.id === id) pendingSelection?.cancel.abort()
  })
  ipcMain.handle('plugin:guard-provider-selection', async (event, id, pluginId, providerId, source, provider) => {
    assertMainWindowRequest(event, '只有主界面可以发起音源选择')
    if (![id,pluginId,providerId].every(value => typeof value === 'string' && value.length > 0 && value.length <= 256) ||
        ![source,provider].every(value => value === null || (typeof value === 'string' && value.length <= 256))) return false
    pendingSelection?.cancel.abort()
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) return false
    const cancel = new AbortController()
    pendingSelection = {id,cancel}
    const abort = () => cancel.abort()
    event.sender.once('destroyed', abort)
    event.sender.once('render-process-gone', abort)
    try {
      return await host.allowProviderSelection(providerId, {selectedSource:source,selectedProvider:provider}, cancel.signal) && !cancel.signal.aborted
    } catch { return false }
    finally {
      event.sender.off('destroyed', abort)
      event.sender.off('render-process-gone', abort)
      if (pendingSelection?.cancel === cancel) pendingSelection = undefined
    }
  })
  ipcMain.handle('plugin:evaluate-page-visibility', async (event,pluginId,entryId,selectedSource,selectedProvider,kind = 'page') => {
    assertMainWindowRequest(event,'只有主界面可以判断插件入口')
    if (!['page','provider'].includes(kind) || ![pluginId,entryId].every(value => typeof value === 'string' && value.length <= 256) ||
        ![selectedSource,selectedProvider].every(value => value === null || (typeof value === 'string' && value.length <= 256))) return null
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled() || host.getDescriptor().runtime !== 3) return null
    const entries = kind === 'provider' ? host.getDescriptor().providers : host.getDescriptor().pages
    const page = entries.find(item => item.id === entryId)
    const predicate = (page?.when as { predicate?: string } | undefined)?.predicate
    if (!predicate || !host.supportsAction(predicate)) return null
    const result = await host.invokeV2Action(predicate,{[kind === 'provider' ? 'providerId' : 'pageId']:entryId,selectedSource,selectedProvider},AbortSignal.timeout(3000))
    if (kind === 'provider' && result?.state === 'disabled') {
      if (result.reason === undefined) return {state:'disabled'}
      if (typeof result.reason === 'string' && result.reason.length <= 160) return {state:'disabled',reason:result.reason.trim()}
    }
    return typeof result === 'boolean' || result === 'force-show' || result === 'force-hide' ? result : null
  })
  const reportEnvironment = createEnvironmentReporter((name, ...args) => { void pluginService.publishLifecycle(name, ...args) })
  ipcMain.handle('plugin:guard-route', async (event,to,from,owner) => {
    assertMainWindowRequest(event,'只有主界面可以执行路由守卫')
    assertHostEventPayloadSize('router.navigate',[to,from])
    const host = owner && pluginService.getPluginById(owner)
    const source: OperationSource = host ? {kind:'plugin',pluginId:host.getDescriptor().id,runtime:3} : {kind:'ui',location:'router'}
    let redirect = null as typeof to | null
    const result = await routeBus.run('router.navigate',{to,from},source,async value=>{
      if (JSON.stringify(to)!==JSON.stringify(value.to)) redirect=value.to
    })
    return {prevented:result.prevented, handledBy:result.handledBy, redirect}
  })
  ipcMain.handle('plugin:route-completed', (event,to,from) => {
    assertMainWindowRequest(event, '只有主界面可以上报路由')
    assertHostEventPayloadSize('router.afterEach',[to,from])
    return pluginService.routeCompleted(to,from)
  })
  ipcMain.handle('plugin:report-environment', (event, online, locale) => {
    assertMainWindowRequest(event, '只有主界面可以上报环境状态')
    reportEnvironment(online, locale)
  })
  setupHookPolicy(join(getAppDirPath(),'plugins','hooks-paused.json'),process.argv.includes('--safe-mode'))
  const skinsPath = join(getAppDirPath(), 'plugins', 'skins.json')
  ipcMain.handle('plugin:skin-choice', (event, choice?: SkinChoice | null) => {
    if (choice === undefined && desktopLyricRequester(event)) return loadSkinPreferences(skinsPath)
    assertPluginUIRequest(event)
    if (choice === undefined) return loadSkinPreferences(skinsPath)
    if (choice !== null) {
      const host = pluginService.getPluginById(choice.pluginId)
      if (!host || host.isDisabled() || !host.getDescriptor().skins.some(skin => skin.id === choice.skinId)) throw Error('播放器皮肤不可用')
    }
    saveSkinChoice(skinsPath, choice)
    notifyDesktopLyricSelection()
    return loadSkinPreferences(skinsPath)
  })
  ipcMain.handle('plugin:skin-setting', (event, edit:SkinSettingEdit) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(edit?.pluginId)
    const descriptor = host?.getDescriptor()
    const skin = descriptor?.skins.find(item => item.id === edit.skinId)
    if (!host || host.isDisabled() || descriptor?.runtime !== 3 || !skin) throw Error('播放器皮肤不可用')
    const saved = saveSkinSetting(skinsPath,edit,skin.settings)
    notifyDesktopLyricSelection()
    return saved
  })
  ipcMain.handle('plugin:region-choice', (event, edit: RegionEdit) => {
    assertPluginUIRequest(event)
    const choice = edit?.choice
    if (choice && choice !== 'inherit') {
      const host = pluginService.getPluginById(choice.pluginId)
      const descriptor = host?.getDescriptor()
      if (!host || host.isDisabled() || descriptor?.runtime !== 3 || !descriptor.regions.some(item => {
        const contract = parsePlayerRegion(item.region)
        return item.view === choice.view && contract?.name === edit.name && contract.version === 1
      })) throw Error('该插件没有可用的区域视图')
    }
    const saved = saveRegionChoice(skinsPath, edit)
    notifyDesktopLyricSelection()
    return saved
  })
  ipcMain.handle('plugin:hook-controls',(event,update)=>{assertPluginUIRequest(event);return update===undefined?getHookControls():updateHookControls(update)})
  const developers=new DeveloperEntries(()=>join(getAppDirPath(),'plugins'),{load:(file,code)=>pluginService.loadDevelopmentFile(file,code),stop:id=>pluginService.removeDevelopmentFile(id),changed:developerEntriesChanged})
  ipcMain.handle('plugin:hook-snapshot', event => {assertPluginUIRequest(event);return hookSnapshot()})
  ipcMain.handle('plugin:search-query', async (event, input) => {
    assertPluginUIRequest(event)
    assertHostEventPayloadSize('search.query',input)
    let query: string | null = null
    await searchBus.run('search.query',input,{kind:'ui',location:'search'},async value => {query=value.query})
    return query
  })
  ipcMain.handle('plugin:search-suggest', async (event, input) => {
    assertPluginUIRequest(event)
    assertHostEventPayloadSize('search.suggest',input)
    let items:string[] = []
    await searchBus.run('search.suggest',input,{kind:'ui',location:'search'},async value => {
      if ('items' in value) items=value.items
    })
    return items
  })
  ipcMain.handle('plugin:search-results', async (event, input) => {
    assertPluginUIRequest(event)
    assertHostEventPayloadSize('search.results',input)
    let items:import('@shiqianjiang/ceru-plugin-sdk').SearchResultItem[] = []
    await searchBus.run('search.results',input,{kind:'ui',location:'search'},async value=>{
      if ('page' in value) items=value.page.items
    })
    return items
  })
  ipcMain.handle('plugin:run-playback-operation', async (event, id, name, input, from, system) => {
    assertPluginUIRequest(event)
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || !isPlaybackOperation(name)) throw Error('无效的播放操作')
    const internalPlayback = name === 'player.error' || name === 'queue.shuffle' || name === 'player.queueEnded'
    if (internalPlayback && (system !== true || from !== undefined)) throw Error('此操作只能由播放器发起')
    if (name === 'player.queueEnded' && (!input || Object.keys(input).length !== 0)) throw Error('队尾通知不能携带续播歌曲')
    assertHostEventPayloadSize(name,input)
    let source: OperationSource = system === true ? {kind:'system',location:internalPlayback ? 'playback' : 'media-control'} : {kind:'ui',location:name.startsWith('player.') ? 'player' : 'queue'}
    if (from) {
      const host = pluginService.getPluginById(from)
      if (!host || host.isDisabled()) throw Error('发起播放操作的插件已停止')
      const descriptor = host.getDescriptor()
      source = {kind:'plugin', pluginId:descriptor.id, runtime:descriptor.runtime}
    }
    return operationBus.run(name,input,source,async value => {
      await callPluginUI('', 'operation.default', {id, name, input:value})
    })
  })
  ipcMain.handle('plugin:track-like', async (event,id,input,location) => {
    assertPluginUIRequest(event)
    if(typeof id!=='string' || !/^[a-f0-9-]{36}$/.test(id) || !['player','song-list','shortcut'].includes(location)) throw Error('无效的收藏操作')
    assertHostEventPayloadSize('track.like',input)
    return libraryBus.run('track.like',input,{kind:location==='shortcut'?'system':'ui',location},async value=>{
      await callPluginUI('','operation.default',{id,name:'track.like',input:value})
    })
  })
  ipcMain.handle('plugin:playlist-create', async (event,id,input) => {
    assertPluginUIRequest(event)
    if (typeof id!=='string' || !/^[a-f0-9-]{36}$/.test(id) || input?.location!=='local') throw Error('无效的歌单创建请求')
    assertHostEventPayloadSize('playlist.create',input)
    return libraryBus.run('playlist.create',input,{kind:'ui',location:'playlists'},async value=>{
      await callPluginUI('','operation.default',{id,name:'playlist.create',input:value})
    })
  })
  ipcMain.handle('plugin:playlist-delete', async (event,id,input) => {
    assertPluginUIRequest(event)
    if (typeof id!=='string' || !/^[a-f0-9-]{36}$/.test(id)) throw Error('无效的歌单删除请求')
    assertHostEventPayloadSize('playlist.delete',input)
    return libraryBus.run('playlist.delete',input,{kind:'ui',location:'playlists'},async value=>{
      await callPluginUI('','operation.default',{id,name:'playlist.delete',input:value})
    })
  })
  ipcMain.handle('plugin:playlist-export', async (event,id,input) => {
    assertPluginUIRequest(event)
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || input?.playlist?.location !== 'local' || input?.format !== 'cmpl') throw Error('无效的歌单导出请求')
    assertHostEventPayloadSize('playlist.export',input)
    return libraryBus.run('playlist.export',input,{kind:'ui',location:'playlists'},async value=>{
      await callPluginUI('', 'operation.default',{id,name:'playlist.export',input:value})
    })
  })
  ipcMain.handle('plugin:download-replay',async(event,token)=>{
    assertMainWindowRequest(event,'只有主界面可以撤销本次下载处理')
    return replayDownload(token)
  })
  ipcMain.handle('plugin:share-create',async(event,id,input)=>{
    assertMainWindowRequest(event,'只有主界面可以创建歌曲分享')
    if(typeof id!=='string'||!/^[a-f0-9-]{36}$/.test(id))throw Error('无效的分享请求')
    assertHostEventPayloadSize('share.create',input)
    return sharingBus.run('share.create',input,{kind:'ui',location:'song-share'},value=>callPluginUI('','operation.shareDefault',{id,input:value}))
  })
  ipcMain.handle('plugin:playlist-import', async (event,id,input) => {
    assertPluginUIRequest(event)
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id)) throw Error('无效的歌单导入请求')
    assertHostEventPayloadSize('playlist.import',input)
    return libraryBus.run('playlist.import',input,{kind:'ui',location:'playlist-import'},async value=>{
      await callPluginUI('', 'operation.default',{id,name:'playlist.import',input:value})
    })
  })
  ipcMain.handle('plugin:playlist-tracks', async (event, id, name, input) => {
    assertPluginUIRequest(event)
    if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/.test(id) || (name !== 'playlist.addTracks' && name !== 'playlist.removeTracks')) throw Error('无效的歌单歌曲请求')
    assertHostEventPayloadSize(name, input)
    return libraryBus.run(name, input, {kind:'ui', location:name === 'playlist.addTracks' ? 'song-list' : 'playlist-detail'}, async value => {
      await callPluginUI('', 'operation.default', {id, name, input:value})
    })
  })
  ipcMain.handle('plugin:strict-mode', (event, enabled?: boolean) => {
    // Secondary lyric views must read the same rendering policy as the main
    // window; changing that policy remains a main-window operation.
    if (enabled !== undefined || !desktopLyricRequester(event)) assertPluginUIRequest(event)
    if (enabled !== undefined) {
      if (typeof enabled !== 'boolean') throw Error('无效的模式')
      configManager.set('settings.pluginStrictMode',enabled)
    }
    return configManager.get('settings.pluginStrictMode',false)
  })
  let restored:Promise<unknown>|undefined
  const restoreDev=()=>restored ??= developers.restore(configManager.get('settings.pluginDeveloperMode',false)).catch(error=>{restored=undefined;throw error})
  app.once('will-quit',()=>{void developers.dispose()})
  ipcMain.handle('plugin:dev-state',async event=>{assertPluginUIRequest(event);await restoreDev();return developers.snapshot()})
  ipcMain.handle('plugin:dev-mode',async (event,enabled)=>{assertPluginUIRequest(event);if(typeof enabled!=='boolean')throw Error('无效的模式');await restoreDev();const state=await developers.restore(enabled);configManager.set('settings.pluginDeveloperMode',enabled);developerEntriesChanged();return state})
  ipcMain.handle('plugin:dev-add',async event=>{assertPluginUIRequest(event);await restoreDev();if(!developers.snapshot().enabled)throw Error('开发者模式未启用');const file=await dialog.showOpenDialog({title:'选择要监听的本地插件产物',filters:[{name:'CeruMusic 插件',extensions:['js']}],properties:['openFile']});return file.canceled ? developers.snapshot() : developers.add(file.filePaths[0])})
  ipcMain.handle('plugin:dev-remove',async (event,file)=>{assertPluginUIRequest(event);await restoreDev();return developers.remove(file)})
  ipcMain.handle('plugin:external:prepare', (_event, sequence: number) =>
    prepareExternalPlugin(sequence)
  )
  ipcMain.handle('plugin:external:commit', (_event, sequence: number, format?: string) =>
    commitExternalPlugin(sequence, format)
  )
  ipcMain.handle('plugin:external:discard', (_event, sequence: number) =>
    discardExternalPlugin(sequence)
  )
  // Dragging a plugin file onto the window is one more local entry; it feeds the
  // same pending queue as deep links and command-line arguments.
  ipcMain.handle('plugin:external:queue-file', async (event, filePath: unknown) => {
    assertMainWindowRequest(event, '只有澜音主界面可以添加插件')
    const sequence = await queueExternalPluginFile(filePath)
    event.sender.send('deeplink:changed')
    return { sequence }
  })
  ipcMain.handle(
    'plugin:playlist-import-menu',
    async (_event, pluginId: string, menuId: string) => {
      const host = pluginService.getPluginById(pluginId)
      if (!host || host.isDisabled()) throw new Error('请先使用提供此导入方式的插件')
      const descriptor = host.getDescriptor()
      const menu = descriptor.menus.find(
        (item: any) => item.id === menuId && item.slot === 'playlist.import'
      )
      const command = descriptor.actions.find(
        (item: any) => item.id === menu?.commandId
      )
      if (!command || !host.supportsAction(command.id)) throw new Error('插件未注册此导入操作')
      return host.invokeV2Action(command.id, {})
    }
  )
  ipcMain.handle('plugin:restore-enabled', async event => {
    assertPluginUIRequest(event)
    await pluginService.restoreEnabledPlugins()
    await restoreDev()
    pluginService.markAppReady('plugins')
  })
  ipcMain.handle(
    'plugin:publish-host-event',
    async (event, name: string, value: unknown, pluginId?: string) => {
      assertMainWindowRequest(event, '只有主界面可以发布插件宿主事件')
      assertHostEventPayloadSize(name, value)
      await pluginService.publishHostEvent(name, value, pluginId)
      return null
    }
  )
  ipcMain.handle('plugin:account-connections', async (event, pluginId:string, itemId:string, validate?:boolean) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw Error('插件未运行')
    return host.accountConnections(itemId,validate === true)
  })
  ipcMain.handle('plugin:account-collection',(event,pluginId:string,itemId:string,capability:import('@shiqianjiang/ceru-plugin-sdk').AccountListCapability,connection:string,cursor?:string)=>{
    assertPluginUIRequest(event)
    const host=pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw Error('插件未运行')
    return host.accountCollection(itemId,capability,connection,cursor)
  })
  ipcMain.handle('plugin:account-qr-cancel',(event,pluginId:string,ticket:string)=>{
    assertPluginUIRequest(event)
    pluginService.getPluginById(pluginId)?.cancelAccountQr(ticket)
  })
  ipcMain.handle('plugin:account-likes',(event,pluginId:string,itemId:string,connection:string,enabled:boolean,ref?:import('@shiqianjiang/ceru-plugin-sdk').ResourceRef)=>{
    assertPluginUIRequest(event)
    const host=pluginService.getPluginById(pluginId)
    if(!host || host.isDisabled())throw Error('插件未运行')
    return host.accountLikes(itemId,connection,enabled,ref)
  })
  ipcMain.handle('plugin:account-change', async (event, pluginId:string, itemId:string, action:'login'|'switch'|'logout', connection?:string, method?:'form'|'qrcode'|'oauth'|'browser') => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled() || !['login','switch','logout'].includes(action)) throw Error('账号操作不可用')
    return host.changeAccount(itemId,action,connection,method)
  })
  ipcMain.handle('plugin:account-summary', async (event, pluginId: string, itemId: string) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    const item = host.getDescriptor().accounts.find(item => item.id === itemId)?.legacy
    if (!item && host.getDescriptor().runtime === 3) {
      const state = await host.accountConnections(itemId)
      return state.rows.find(row=>row.id===state.active)?.summary ?? {signedIn:false,displayName:'未登录'}
    }
    if (!item || !host.supportsAction(item.action)) throw new Error('插件未声明此账号展示')
    const summary = await host.invokeV2Action(item.action, {})
    assertAccountSummary(summary)
    return {
      signedIn: summary.signedIn,
      displayName: summary.displayName,
      ...(summary.avatarUrl ? { avatarUrl: summary.avatarUrl } : {}),
      ...(summary.badge ? { badge: summary.badge } : {})
    }
  })
  ipcMain.handle('plugin:account-logout', async (event, pluginId: string, itemId: string) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    const item = host.getDescriptor().accounts.find(item => item.id === itemId)?.legacy
    if (!item?.logoutAction || !host.supportsAction(item.logoutAction))
      throw new Error('插件未声明退出账号操作')
    await host.invokeV2Action(item.logoutAction, {})
    return null
  })
  const guestHost = (pluginId: string) => {
    const host = pluginService.getPluginById(pluginId)
    if (!host) throw new Error('兼容环境未安装或已卸载')
    return host
  }
  ipcMain.handle('plugin:guest-import', (_event, pluginId, adapterId, url) =>
    guestHost(pluginId).importGuest(adapterId, url)
  )
  ipcMain.handle('plugin:guest-list', (_event, pluginId) => pluginService.listGuests(pluginId))
  ipcMain.handle('plugin:guest-select', (_event, pluginId, guestId) =>
    pluginService.selectGuest(pluginId, guestId)
  )
  ipcMain.handle('plugin:guest-remove', (_event, pluginId, guestId) =>
    pluginService.removeGuest(pluginId, guestId)
  )
  ipcMain.handle('plugin:guest-permissions', (_event, pluginId, guestId) =>
    pluginService.getGuestPermissions(pluginId, guestId)
  )
  ipcMain.handle('plugin:guest-set-permissions', (_event, pluginId, guestId, keys) =>
    pluginService.setGuestPermissions(pluginId, guestId, keys)
  )
  ipcMain.handle('plugin:music-sources', () => pluginService.getMusicSources())
  ipcMain.handle('plugin:contributions', async () =>
    (await pluginService.getPluginsList()).filter(p => p.descriptor).map((p) => ({
      pluginId: p.pluginId,
      descriptor: p.descriptor,
      enabled: p.enabled,
      requestedEnabled: p.requestedEnabled,
      order: p.order,
      providerMethods: p.providerMethods,
      providerIconUrls: p.providerIconUrls,
      sidebarIconUrls: p.sidebarIconUrls,
      skinPreviewUrls: p.skinPreviewUrls,
      actionIds: p.actionIds,
      loadError: p.loadError
    }))
  )
  ipcMain.handle('plugin:guest-update', (_event, pluginId, guestId, url) =>
    guestHost(pluginId).updateGuest(guestId, url)
  )
  ipcMain.handle('plugin:set-active', async (_event, pluginId: string | null) => {
    try {
      await pluginService.setActivePlugin(pluginId)
      let viewError: string | undefined
      if (pluginId) {
        try {
          await pluginService.getPluginById(pluginId)?.openInitialView()
        } catch (error: any) {
          viewError = error.message
        }
      }
      return { success: true, viewError }
    } catch (error: any) {
      return { error: error?.message || '设置默认插件失败' }
    }
  })
  ipcMain.handle('plugin:set-provider-owner', (_event, source: string, pluginId: string | null) => {
    pluginService.setProviderOwner(source, pluginId)
    return true
  })
  ipcMain.handle(
    'plugin:set-capability-owner',
    (_event, source: string, capability: string, pluginId: string | null) => {
      pluginService.setCapabilityOwner(source, capability, pluginId)
      return true
    }
  )
  ipcMain.handle('plugin:set-enabled', async (_event, pluginId: string, enabled: boolean) => {
    try {
      const result = await pluginService.setPluginEnabled(pluginId, enabled)
      if (enabled) {
        try {
          await pluginService.getPluginById(pluginId)?.openInitialView()
        } catch (error: any) {
          return { ...result, viewError: error.message }
        }
      }
      return result
    } catch (error: any) {
      return { error: error?.message || '切换插件状态失败' }
    }
  })
  ipcMain.handle('plugin:open-surface', async (event, pluginId, surfaceId) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host) throw new Error('插件未安装')
    await host.openSurface(surfaceId)
  })
  ipcMain.handle('plugin:drawer-action', (event, pluginId, surfaceId, sessionId, index, values) => {
    assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件已停止')
    return host.invokeDrawer(surfaceId, sessionId, index, values)
  })
  ipcMain.handle('plugin:mount-surface', (event, pluginId, surfaceId, slot?: string, section?: PlaylistSectionContext, region?: string) => {
    const lyric = desktopLyricRequester(event)
    if (!lyric) assertPluginUIRequest(event)
    else if (region !== 'desktopLyric' || section !== undefined || slot !== undefined) throw Error('桌面歌词窗口不能挂载其他区域')
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    if ((slot !== undefined || region !== undefined) && configManager.get('settings.pluginStrictMode',false)) throw Error('插件槽位或区域未启用')
    if ([section, slot, region].filter(value => value !== undefined).length > 1) throw Error('无效的插件挂载位置')
    const props = section === undefined ? {} : playlistSectionProps(host.getDescriptor(), surfaceId, section)
    const mount = () => host.mountSurface(surfaceId, props, false, slot, region)
    return lyric ? lyric.mount(mount) : mount()
  })
  ipcMain.handle('plugin:surface-ready', (event, pluginId, surfaceId, sessionId) => {
    if (!desktopLyricRequester(event)?.owns(pluginId,surfaceId,sessionId)) assertPluginUIRequest(event)
    const host = pluginService.getPluginById(pluginId)
    if (!host || host.isDisabled()) throw new Error('插件未运行')
    return host.readySurface(surfaceId, sessionId)
  })
  ipcMain.handle(
    'plugin:surface-action',
    async (event, pluginId, surfaceId, sessionId, action, input) => {
      if (!desktopLyricRequester(event)?.owns(pluginId,surfaceId,sessionId)) assertPluginUIRequest(event)
      const host = pluginService.getPluginById(pluginId)
      if (!host || host.isDisabled()) throw new Error('插件未运行')
      try {
        return { value: await host.invokeSurfaceAction(surfaceId, sessionId, action, input) }
      } catch (error) {
        // Expected cancellation is transported as data so Electron does not log an IPC failure.
        if (error instanceof DOMException && error.name === 'AbortError') return { cancelled: true }
        throw error
      }
    }
  )
  ipcMain.handle('plugin:drawer-close', (event, pluginId, surfaceId, sessionId) => {
    const lyric = desktopLyricRequester(event)
    if (lyric?.owns(pluginId,surfaceId,sessionId)) return lyric.dispose()
    assertPluginUIRequest(event)
    return pluginService.getPluginById(pluginId)?.closeDrawer(surfaceId, sessionId)
  })
  ipcMain.handle('plugin:importer-tracks', (_event, pluginId, importerId, input) =>
    pluginService.invokeV2Importer(pluginId, importerId, input)
  )
  ipcMain.handle('service-plugin-selectAndAddPlugin', async (_, type): Promise<any> => {
    try {
      return await pluginService.selectAndAddPlugin(type)
    } catch (error: any) {
      console.error('Error selecting and adding plugin:', error)
      return { error: error.message }
    }
  })
  ipcMain.handle('plugin:update-local', async (_event, pluginId: string) => {
    try {
      return await pluginService.selectAndUpdatePlugin(pluginId)
    } catch (error: any) {
      return { error: error.message }
    }
  })
  ipcMain.handle('plugin:update-url', async (_event, pluginId: string, url: string) => {
    return pluginService.downloadAndAddPlugin(url, 'cr', pluginId)
  })

  ipcMain.handle(
    'service-plugin-downloadAndAddPlugin',
    async (_, url, type, targetPluginId): Promise<any> => {
      try {
        return await pluginService.downloadAndAddPlugin(url, type, targetPluginId)
      } catch (error: any) {
        console.error('Error downloading and adding plugin:', error)
        return { error: error.message }
      }
    }
  )

  ipcMain.handle(
    'service-plugin-addPlugin',
    async (_, pluginCode, pluginName, targetPluginId): Promise<any> => {
      try {
        return await pluginService.addPlugin(pluginCode, pluginName, targetPluginId)
      } catch (error: any) {
        console.error('Error adding plugin:', error)
        return { error: error.message }
      }
    }
  )

  ipcMain.handle('service-plugin-getPluginById', async (_, id): Promise<any> => {
    try {
      const host = pluginService.getPluginById(id)
      return host
        ? {
            pluginId: id,
            pluginInfo: host.getPluginInfo(),
            supportedSources: host.getSupportedSources(),
            descriptor: host.getDescriptor()
          }
        : null
    } catch (error: any) {
      console.error('Error getting plugin by id:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-loadAllPlugins', async (): Promise<any> => {
    try {
      // 使用新的 getPluginsList 方法，但保持 API 兼容性
      return await pluginService.getPluginsList()
    } catch (error: any) {
      console.error('Error loading all plugins:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getPluginLog', async (_, pluginId): Promise<any> => {
    try {
      return await pluginService.getPluginLog(pluginId)
    } catch (error: any) {
      console.error('Error getting plugin log:', error)
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-uninstallPlugin', async (_, pluginId): Promise<any> => {
    try {
      return await pluginService.uninstallPlugin(pluginId)
    } catch (error: any) {
      console.error('Error uninstalling plugin:', error)
      return { error: error.message }
    }
  })

  // ==================== 服务插件 IPC ====================

  ipcMain.handle('service-plugin-getPluginType', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getPluginType(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getConfigSchema', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getConfigSchema(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getConfig', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getConfig(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('plugin:trusted-detail', async (event, pluginId) => {
    assertMainWindowRequest(event, '只有主界面可以查看完全信任授权')
    if (typeof pluginId !== 'string') throw Error('无效的插件 ID')
    return pluginService.getTrustedConsentDetail(pluginId)
  })
  ipcMain.handle('plugin:trusted-set-consent', async (event, pluginId, allowed) => {
    assertMainWindowRequest(event, '只有主界面可以修改完全信任授权')
    if (typeof pluginId !== 'string' || typeof allowed !== 'boolean') throw Error('无效的授权请求')
    return pluginService.setTrustedConsent(pluginId, allowed)
  })
  ipcMain.handle('plugin:trusted-revoke', async (event, pluginId) => {
    assertMainWindowRequest(event, '只有主界面可以撤销完全信任授权')
    if (typeof pluginId !== 'string') throw Error('无效的插件 ID')
    return pluginService.setTrustedConsent(pluginId, false)
  })

  ipcMain.handle('service-plugin-getPermissions', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getPermissions(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-getDescriptor', async (_, pluginId): Promise<any> => {
    try {
      return { data: pluginService.getDescriptor(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle(
    'service-plugin-savePermissions',
    async (event, pluginId, permissions): Promise<any> => {
      assertMainWindowRequest(event, '只有主界面可以修改插件权限')
      try {
        return { data: pluginService.savePermissions(pluginId, permissions) }
      } catch (error: any) {
        return { error: error.message }
      }
    }
  )

  ipcMain.handle('service-plugin-saveConfig', async (_, pluginId, config): Promise<any> => {
    try {
      pluginService.saveConfig(pluginId, config)
      return { success: true }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle('service-plugin-testConnection', async (_, pluginId): Promise<any> => {
    try {
      return await pluginService.testConnection(pluginId)
    } catch (error: any) {
      return { success: false, message: error.message }
    }
  })

  ipcMain.handle('service-plugin-getPlaylists', async (_, pluginId): Promise<any> => {
    try {
      return { data: await pluginService.getPlaylists(pluginId) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  ipcMain.handle(
    'service-plugin-getPlaylistSongs',
    async (_, pluginId, playlistId): Promise<any> => {
      try {
        return { data: await pluginService.getPlaylistSongs(pluginId, playlistId) }
      } catch (error: any) {
        return { error: error.message }
      }
    }
  )

  ipcMain.handle(
    'service-plugin-importToLocal',
    async (_, pluginId, playlistId, playlistName): Promise<any> => {
      try {
        // 1. 获取远程歌单歌曲
        const result = await pluginService.getPlaylistSongs(pluginId, playlistId)
        if (!result || !result.songs || result.songs.length === 0) {
          return { error: '歌单为空或获取失败' }
        }

        // 2. 创建本地歌单
        const pluginType = pluginService.getPluginType(pluginId)
        const source = pluginType === 'service' ? 'local' : 'local'
        const createResult = ManageSongList.createPlaylist(
          playlistName || `导入的歌单`,
          `从服务插件导入`,
          source as any,
          { importedFrom: pluginId, remotePlaylistId: playlistId }
        )

        // 3. 注入 _servicePluginId 以便播放时异步获取歌词
        const songs = result.songs.map((song: any) => ({
          ...song,
          _servicePluginId: pluginId
        }))

        // 4. 添加歌曲到歌单
        const instance = new ManageSongList(createResult.id)
        const added = instance.addSongs(songs as any)

        return {
          success: true,
          data: {
            songListId: createResult.id,
            added,
            total: result.songs.length
          }
        }
      } catch (error: any) {
        return { error: error.message }
      }
    }
  )

  ipcMain.handle('service-plugin-getServiceLyric', async (_, pluginId, songInfo): Promise<any> => {
    try {
      return { data: await pluginService.getServiceLyric(pluginId, songInfo) }
    } catch (error: any) {
      return { error: error.message }
    }
  })

  // 保持初始化兼容性
  ipcMain.handle('service-plugin-initialize-system', async () => {
    if (isPluginsInitialized) return true
    try {
      await pluginService.initializePlugins()
      pluginLog.info('插件系统初始化完成')
      isPluginsInitialized = true
      return true
    } catch (error) {
      pluginLog.error('插件系统初始化失败:', error)
      throw error
    }
  })
}
