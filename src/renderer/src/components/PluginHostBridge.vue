<template>
  <PluginQrLogin :session="qrLogin" @cancel="cancelQrLogin" />
  <t-dialog :visible="!!oauthLogin" :mode="oauthLogin?.modeless ? 'modeless' : 'modal'" :header="oauthLogin?.title" width="380px" attach="body" :confirm-btn="null" cancel-btn="取消登录" :close-on-overlay-click="false" @close="cancelOAuthLogin" @cancel="cancelOAuthLogin">
    <p role="status">等待浏览器完成授权</p>
    <p class="grant-description" style="overflow-wrap:anywhere">{{ oauthLogin?.origin }}</p>
  </t-dialog>
  <PluginDrawer :session="drawer" @close="closeDrawer" @state="updateDrawerState" />
  <t-dialog
    v-model:visible="visible"
    :mode="(kind === 'account' || kind === 'account-confirm') && data.modeless ? 'modeless' : 'modal'"
    :header="title"
    width="480px"
    attach="body"
    :confirm-btn="kind === 'trusted' ? { content: '同意并安装 / 开启', disabled: !trustedAcknowledged, theme: 'danger' } : confirmLabel"
    cancel-btn="取消"
    :close-on-overlay-click="false"
    @confirm="finish(true)"
    @cancel="finish(false)"
    @close="finish(false)"
  >
    <template v-if="kind === 'trusted'">
      <PluginTrustedDetails :detail="data" />
      <t-checkbox v-model="trustedAcknowledged">我了解风险</t-checkbox>
      <t-button v-if="data.optional" variant="outline" style="margin-left: 16px" @click="finishRestricted">仅安装受限部分</t-button>
    </template>
    <div v-else-if="kind === 'permissions'" class="grant-body">
      <p class="grant-intro">{{ data.pluginName }} 需要以下权限</p>
      <div class="grant-card">
        <span class="grant-symbol"><t-icon name="secured" size="22px" /></span>
        <div>
          <div class="grant-title">{{ data.title }}</div>
          <p class="grant-description">{{ data.description }}</p>
        </div>
      </div>
    </div>
    <div v-else-if="kind === 'importer'" class="grant-body">
      <t-select v-model="selectedPlaylist" placeholder="选择歌单导入器" :options="playlistOptions" />
    </div>
    <div v-else-if="kind === 'playlist'" class="grant-body">
      <t-select v-model="selectedPlaylist" placeholder="选择歌单" :options="playlistOptions" />
      <t-input v-if="selectedPlaylist === 'new'" v-model="inputValue" placeholder="新歌单名称" />
    </div>
    <div v-else-if="kind === 'account'" class="grant-body">
      <label v-for="field in data.fields" :key="field.key">{{ field.label }}
        <t-input v-model="formValues[field.key]" :type="field.type === 'password' ? 'password' : 'text'" :maxlength="4096" />
      </label>
    </div>
    <div v-else-if="kind === 'prompt'" class="grant-body">
      <label>{{ data.label }}</label
      ><t-input v-model="inputValue" :type="data.secret ? 'password' : 'text'" />
    </div>
    <p v-else class="grant-description">{{ data.message }}</p>
  </t-dialog>
</template>

<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRouter, isNavigationFailure, NavigationFailureType, type RouteLocationNormalizedLoaded, type RouteLocationNormalized } from 'vue-router'
import { projectPluginRoute } from '@shiqianjiang/ceru-plugin-sdk/navigation'
import { activePluginContributions, isPluginPageVisible } from '@renderer/services/pluginState'
import { announcePluginOperation, bindPlaybackOperations, interceptsRoute, performOperationDefault, projectOperationTrack } from '@renderer/plugin/operations'
import { performShareDefault } from '@renderer/plugin/sharing'
import { performSystemDefault } from '@renderer/plugin/systemOperations'
import { closeConfiguredWindow } from '@renderer/plugin/windowClose'
import { searchValue } from '@renderer/store/search'
import { crossfadeManager } from '@renderer/utils/audio/crossfade'
import PluginDrawer from './PluginDrawer.vue'
import PluginTrustedDetails from './PluginTrustedDetails.vue'
import PluginQrLogin from './PluginQrLogin.vue'
import { createListeningEvents } from '@renderer/plugin/listeningEvents'
import type { PluginDrawerSession } from '@common/pluginDrawer'
import type { PluginWebDrawerSession } from '@common/pluginDrawer'
import { pluginAccountItems, refreshPluginAccounts } from '@renderer/services/pluginAccounts'
import {
  handlePluginPlayback,
  markPluginQueueChanged,
  openPluginPlaylist,
  pluginPlaybackMethods
} from '@renderer/services/pluginPlaybackBridge'
import {
  getPluginDevices,
  getPluginPublicSettings,
  getPluginRoomState,
  handlePluginHostService,
  recordPluginHistory,
  toPluginDownloadTask
} from '@renderer/services/pluginHostServices'
import { useAuthStore } from '@renderer/store/Auth'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useSettingsStore } from '@renderer/store/Settings'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { useAudioOutputStore } from '@renderer/store/audioOutput'
import { useDlnaStore } from '@renderer/store/dlna'
import songListAPI from '@renderer/api/songList'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import { mapSongsToCloud } from '@renderer/utils/playlist/cloudList'
import { songKey } from '@common/musicItem'
import { toAppTrack, toPluginTrack } from '@common/pluginMusic'
import { applyTrackFavorite } from '@renderer/services/trackFavorites'
import { prepareFavoriteSongs } from '@renderer/services/pluginHostServices'
import { performPlaylistTool } from '@renderer/services/playlistTools'
import {
  pluginImportRequest,
  playlistImporters,
  libraryRevision,
  markPluginUIReady,
  invalidatePageVisibility,
  watchPageVisibility,
  readPluginSelection,
  watchPluginSelection,
  refreshPluginContributions
} from '@renderer/services/pluginState'
const router = useRouter()
const search = searchValue()
const routeOrigins = new WeakMap<object, { path: string; pluginId?: string }>()
const routeNotices = new WeakMap<object, { original: string; destination: string; handledBy: string[] }>()
async function navigateOnce(path: string, pluginId?: string) {
  const ticket = '/__ceru_navigation/' + crypto.randomUUID()
  const remove = router.addRoute({ path: ticket, redirect: origin => {
    routeOrigins.set(origin, { path, pluginId })
    return path
  } })
  try { return await router.push(ticket) } finally { remove() }
}
const approvedRedirects = new WeakMap<object,string>()
function publicRoute(route: RouteLocationNormalizedLoaded | RouteLocationNormalized, reader?: string, allOwnFields = false) {
  const params = { ...route.params }
  if (route.name === 'plugin-page') {
    const owner = activePluginContributions.value.find(entry=>entry.pluginId === params.pluginId)?.descriptor.id
    if (!owner) return null
    params.pluginId = owner
    if (allOwnFields) reader = owner
  }
  return projectPluginRoute(route.name,params,route.query,reader)
}
const auth = useAuthStore()
const oauthLogin=ref<{pluginId:string;ticket:string;title:string;origin:string;modeless:boolean}|null>(null)
function cancelOAuthLogin() {
  const current=oauthLogin.value
  oauthLogin.value=null
  if (current) void desktopBridge.api.plugins.cancelAccountQr(current.pluginId,current.ticket).catch(console.warn)
}
const qrLogin = ref<{pluginId:string;ticket:string;title:string;icon?:string;view?:PluginWebDrawerSession;image?:string;url?:string;origin?:string;status:string;modeless:boolean} | null>(null)
function cancelQrLogin() {
  const previous = qrLogin.value
  qrLogin.value=null
  if (previous) void desktopBridge.api.plugins.cancelAccountQr(previous.pluginId,previous.ticket).catch(console.warn)
}
const visible = ref(false)
const kind = ref('')
const trustedAcknowledged = ref(false)
const title = ref('')
const confirmLabel = ref('确定')
const inputValue = ref('')
const formValues = ref<Record<string,string>>({})
const data = ref<any>({})
const selectedPlaylist = ref('new')
const playlistOptions = ref<{ label: string; value: string }[]>([])
let resolveDialog: ((value: any) => void) | undefined
let dialogQueue: Promise<unknown> = Promise.resolve()
const progress = new Map<string, any>()
const drawer = ref<PluginDrawerSession | null>(null)
async function closeDrawer() {
  const previous = drawer.value
  drawer.value = null
  if (previous)
    await desktopBridge.api.plugins
      .closeDrawer(previous.pluginId, previous.surfaceId, previous.sessionId)
      .catch(() => {})
}
function updateDrawerState(sessionId: string, state: PluginDrawerSession['state']) {
  if (drawer.value?.sessionId === sessionId) drawer.value = { ...drawer.value, state }
}
function showDialog(type: string, value: any, signal?: AbortSignal): Promise<any> {
  const next = dialogQueue.then(
    () =>
      new Promise((resolve, reject) => {
        if (signal?.aborted) return reject(new Error('插件已停止'))
        formValues.value = type === 'account' ? Object.fromEntries(value.fields.map((field:{key:string})=>[field.key,''])) : {}
        trustedAcknowledged.value = false
        kind.value = type
        data.value = value
        inputValue.value = value.value ?? value.suggestedName ?? '导入的歌单'
        title.value =
          type === 'trusted' ? '⚠ 此插件需要完全信任' : type === 'permissions'
            ? '权限申请'
            : type === 'playlist'
              ? '选择目标歌单'
              : value.title || '插件提示'
        confirmLabel.value = type === 'permissions' ? '允许' : '确定'
        const cancel = () => finish(false)
        signal?.addEventListener('abort', cancel, { once: true })
        resolveDialog = (result) => {
          signal?.removeEventListener('abort', cancel)
          resolve(result)
        }
        visible.value = true
      })
  )
  dialogQueue = next.catch(() => {})
  return next
}
function finishRestricted() {
  if (!resolveDialog || kind.value !== 'trusted' || !data.value.optional) return
  const resolve = resolveDialog
  resolveDialog = undefined
  visible.value = false
  resolve({ choice: 'restricted', acknowledged: false })
}
function finish(accepted: boolean) {
  if (!resolveDialog) return
  if (accepted && kind.value === 'trusted' && !trustedAcknowledged.value) return
  if (accepted && kind.value === 'account' && data.value.fields.some((field:{key:string;optional:boolean})=>!field.optional && !formValues.value[field.key])) {
    void MessagePlugin.warning('请填写必填项'); return
  }
  const resolve = resolveDialog
  resolveDialog = undefined
  visible.value = false
  resolve(
    !accepted
      ? null
      : kind.value === 'trusted' ? { choice: 'grant', acknowledged: true }
      : kind.value === 'account' ? { ...formValues.value }
      : kind.value === 'importer' ? selectedPlaylist.value
      : kind.value === 'prompt'
        ? inputValue.value
        : kind.value === 'playlist'
          ? { id: selectedPlaylist.value, name: inputValue.value }
          : true
  )
  formValues.value = {}
}
function unwrap(result: any): any {
  if (!result?.success) throw new Error(result?.error || '歌单操作失败')
  return result.data
}
async function pickPlaylist(suggestedName?: string, signal?:AbortSignal) {
  const lists = unwrap(await songListAPI.getAll())
  playlistOptions.value = [
    { label: '新建本地歌单', value: 'new' },
    ...lists.map((p: any) => ({ label: p.name, value: p.id }))
  ]
  selectedPlaylist.value = 'new'
  return showDialog('playlist', { suggestedName }, signal)
}
async function choosePlaylist(suggestedName?: string, signal?:AbortSignal) {
  const selected = await pickPlaylist(suggestedName, signal)
  signal?.throwIfAborted()
  if (!selected) return null
  if (selected.id === 'new')
    selected.id = unwrap(await songListAPI.create(selected.name, '', 'local')).id
  return { id: selected.id, location: 'local' }
}
/**
 * 云歌单删除会为每个待匹配项调用 selectSong，未命中的行不会计入 removed。
 * 删除后不再单独记录 updatedAt：libraryRevision 已负责通知界面刷新。
 */
async function removeCloudTracks(cloudId: string, songs: any[], signal?:AbortSignal): Promise<number> {
  if (!songs.length) return 0
  const result = await cloudSongListAPI.removeSongsFromList(
    cloudId,
    songs.map((song) => songKey(song)), signal
  )
  return result.removed
}
async function handle(request: any, signal?: AbortSignal): Promise<any> {
  const { method, data: payload = {}, pluginId } = request
  if(method==='operation.state') {
    const owner=activePluginContributions.value.find(row=>row.pluginId===pluginId)?.descriptor.id
    const player:any=payload.player?await handlePluginPlayback('services.player.getState',[]):null
    if(player) {
      const song=useGlobalPlayStatusStore().player.songInfo
      player.track=song?.songmid!=null?projectOperationTrack(song as any):null
    }
    return {
      player,
      route:payload.route?publicRoute(router.currentRoute.value,owner):null,
      account:payload.account?await handle({method:'services.account.getSession',pluginId},signal):null
    }
  }
  if (method === 'entries.selection') return readPluginSelection()
  if (method === 'operation.playlistTool') return performPlaylistTool(payload.name, payload.input, signal, async () => {
    playlistOptions.value = playlistImporters.value.map(item => ({label:item.title,value:item.publicId}))
    if (!playlistOptions.value.length) throw Error('请先启用提供歌单导入功能的插件')
    selectedPlaylist.value = playlistOptions.value[0].value
    return showDialog('importer', {title:'选择歌单导入器'}, signal)
  })
  if (method === 'entries.invalidate') {
    invalidatePageVisibility(pluginId)
    return null
  }
  if (method === 'operation.default' && pluginId === '') return performOperationDefault(payload.id,payload.name,payload.input)
  if (method === 'operation.shareDefault' && pluginId === '') return performShareDefault(payload.id,payload.input)
  if (method === 'operation.systemDefault' && pluginId === '') return performSystemDefault(payload.id,payload.input)
  if (method === 'operation.openLink') {
    await desktopBridge.api.plugins.dispatchLink(payload.url)
    return null
  }
  if (method === 'operation.closeWindow') {
    closeConfiguredWindow()
    return null
  }
  if (method === 'operation.downloadNotice' && pluginId === '') {
    const names=payload.owners.map((id:string)=>activePluginContributions.value.find(row=>row.descriptor.id===id)?.descriptor.name??id)
    await announcePluginOperation(names,()=>desktopBridge.api.plugins.replayDownload(payload.token))
    return null
  }
  if (method === 'operation.playlistTarget') {
    let target = payload.target
    if (!target && payload.adding) {
      const picked = await pickPlaylist(payload.suggestedName, signal)
      signal?.throwIfAborted()
      if (!picked) return null
      if (picked.id === 'new') return {playlist:{id:crypto.randomUUID(), name:picked.name, location:'local'}, newName:picked.name}
      target = {id:picked.id,location:'local'}
    }
    if (!target?.id || !['cloud','local'].includes(target.location)) throw Error('无效的歌单目标')
    const current = target.location === 'local' ? unwrap(await songListAPI.getById(target.id)) : (await cloudSongListAPI.getUserSongLists()).find(item => item.id === target.id)
    if (!current) throw Error('目标歌单不存在')
    return {playlist:{id:target.id, name:String(current.name || '歌单').slice(0,512), location:target.location}}
  }
  if (method === 'operation.writePlaylistTracks') {
    signal?.throwIfAborted()
    const target = payload.newName ? {location:'local',id:unwrap(await songListAPI.create(payload.newName, '', 'local')).id} : payload.target
    signal?.throwIfAborted()
    return handle({pluginId, method:payload.adding ? 'library.playlists.import' : 'library.playlists.removeTracks', data:{target, items:payload.items}}, signal)
  }
  if (method === 'operation.favoriteSongs') return prepareFavoriteSongs(payload.refs,payload.liked)
  if (method === 'operation.applyFavorite') {
    const {track,liked,original} = payload
    if (!pluginId || !track?.ref || (!original && ['private','local'].includes(track.ref.providerId)) || typeof liked !== 'boolean') throw Error('无效的收藏操作')
    const song = original ?? LocalUserDetailStore().list.find(item => {
      const ref = item.pluginResource
      return (!ref || (ref.scope === 'provider' && !ref.connectionId)) &&
        (ref?.providerId ?? item.source) === track.ref.providerId && String(ref?.id ?? item.songmid) === track.ref.id
    }) ?? toAppTrack({...track,ref:{...track.ref,scope:'provider'}})
    await applyTrackFavorite(song,liked,signal)
    return null
  }
  if (pluginPlaybackMethods.includes(method)) return handlePluginPlayback(method, payload.args,pluginId)
  if (
    [
      'services.favorites.',
      'services.downloads.',
      'services.localMusic.',
      'services.settings.',
      'services.rooms.',
      'services.devices.',
      'services.ai.'
    ].some((prefix) => method.startsWith(prefix)) ||
    method === 'services.window.control'
  )
    return handlePluginHostService(method, payload.args ?? [],pluginId)
  if (method === 'ui.drawer.open') {
    await closeDrawer()
    drawer.value = { ...payload, pluginId }
    return null
  }
  if (method === 'ui.drawer.state') {
    if (drawer.value?.pluginId === pluginId) updateDrawerState(payload.sessionId, payload.state)
    return null
  }
  if (method === 'ui.drawer.close') {
    if (
      drawer.value &&
      drawer.value.pluginId === pluginId &&
      (!payload.sessionId || drawer.value.sessionId === payload.sessionId)
    )
      closeDrawer()
    return null
  }
  if (method === 'accounts.browserConfirm') return !!await showDialog('account-confirm',{title:payload.title,modeless:payload.modeless,message:'打开 '+payload.origin+' 的独立登录窗口，并保存该站点的 '+payload.cookie+' 登录凭据？'},signal)
  if (method === 'accounts.oauthDisplay') {
    if (payload.phase==='confirm') return !oauthLogin.value && !!await showDialog('account-confirm',{title:payload.title,modeless:payload.modeless,message:'在系统浏览器中授权此平台：'+payload.origin},signal)
    if (payload.phase==='open') {
      if (oauthLogin.value || qrLogin.value) return false
      oauthLogin.value={pluginId,ticket:payload.ticket,title:payload.title,origin:payload.origin,modeless:payload.modeless}
      return true
    }
    if (payload.phase==='close' && oauthLogin.value?.ticket===payload.ticket && oauthLogin.value?.pluginId===pluginId) oauthLogin.value=null
    return true
  }
  if (method === 'accounts.qrDisplay') {
    if (payload.phase==='open') {
      if (qrLogin.value || oauthLogin.value) return false
      const owner=activePluginContributions.value.find(plugin=>plugin.pluginId===pluginId)
      const account=owner?.descriptor.accounts.find(account=>account.id===payload.accountId)
      const icon=account?.providers?.map(provider=>owner?.providerIconUrls?.[provider]).find(Boolean)
      qrLogin.value={pluginId,ticket:payload.ticket,title:payload.title,icon,view:payload.view,image:payload.image,url:payload.url,origin:payload.origin,status:'waiting',modeless:payload.modeless}
      return true
    }
    if (!qrLogin.value || qrLogin.value.ticket !== payload.ticket || qrLogin.value.pluginId !== pluginId) return false
    if (payload.phase==='close') qrLogin.value=null
    else if (payload.phase==='status') qrLogin.value.status=payload.status
    return true
  }
  if (method === 'accounts.form') return showDialog('account',payload,signal)
  if (method === 'host.trustedConsent') return showDialog('trusted', payload, signal)
  if (method === 'ui.permissions.request')
    return !!(await showDialog('permissions', payload, signal))
  if (method === 'ui.dialogs.confirm') return !!(await showDialog('confirm', payload))
  if (method === 'ui.dialogs.prompt') return showDialog('prompt', payload)
  if (method === 'ui.dialogs.pickPlaylist') return choosePlaylist(payload.suggestedName)
  if (method === 'ui.toast') {
    const level = ['info', 'success', 'warning', 'error'].includes(payload.level)
      ? payload.level
      : 'info'
    await MessagePlugin[level](String(payload.message))
    return null
  }
  if (method === 'ui.playlistImport.open') {
    pluginImportRequest.value = { ...payload, pluginId }
    await router.push('/home/songlist')
    return null
  }
  if (method === 'ui.pluginUpdate.request') {
    const url = new URL(String(payload.url || ''))
    if (url.protocol !== 'https:') throw new Error('插件更新地址必须使用 HTTPS')
    const accepted = await showDialog('update', {
      title: `更新到 ${payload.version}`,
      message: payload.notes || `插件请求更新到 ${payload.version}。更新将保留现有配置和授权。`
    })
    if (!accepted) return { accepted: false, updated: false }
    const result = await desktopBridge.api.plugins.updateFromUrl(pluginId, url.href)
    if (result?.error) throw new Error(result.error)
    await refreshPluginContributions(true)
    await MessagePlugin.success(`插件已更新到 ${result.version || payload.version}`)
    return { accepted: true, updated: true, version: result.version || payload.version }
  }
  if (method === 'router.current') {
    const owner = activePluginContributions.value.find(entry=>entry.pluginId===pluginId)?.descriptor.id
    return publicRoute(router.currentRoute.value,owner)
  }
  if (method === 'router.push') {
    const params = {...payload.params}
    if (payload.name === 'plugin-page') {
      const plugin = activePluginContributions.value.find(entry=>entry.pluginId===pluginId)
      if (!plugin || params.pluginId !== plugin.descriptor.id || !plugin.descriptor.pages.some((page:{id:string;when?:{loggedIn?:boolean}})=>page.id===params.pageId && isPluginPageVisible(page))) throw Error('插件页面不可用')
      params.pluginId = pluginId
    }
    const target = {name:payload.name,params,query:payload.query}, path = router.resolve(target).fullPath
    return !(await navigateOnce(path, pluginId))
  }
  if (method === 'ui.navigation.open') {
    if (payload.page === 'playlist' && payload.ref) {
      await openPluginPlaylist(router, payload.ref)
      return null
    }
    const paths = {
      search: '/home/search',
      playlist: '/home/songlist',
      charts: '/home/find',
      downloads: '/home/download',
      account: '/home/user',
      settings: '/settings'
    }
    const path = paths[payload.page]
    if (!path) throw new Error('不支持的页面')
    await router.push({
      path,
      query: payload.sectionId
        ? { pluginId, sectionId: payload.sectionId }
        : payload.query
          ? { keyword: payload.query }
          : {}
    })
    return null
  }
  if (method === 'services.account.openLogin') {
    await auth.login()
    return null
  }
  if (method === 'services.app.openSettings') {
    await router.push('/settings')
    return null
  }
  if (method === 'services.account.getSession' || method === 'services.account.getProfile') {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(pluginId + ':' + (auth.user?.sub ?? ''))
    )
    const profile = auth.isAuthenticated
      ? {
          id: Array.from(new Uint8Array(digest))
            .map((x) => x.toString(16).padStart(2, '0'))
            .join(''),
          displayName: auth.user?.name ?? '',
          identityScope: 'plugin'
        }
      : null
    return method.endsWith('getProfile') ? profile : { loggedIn: auth.isAuthenticated, profile }
  }
  if (method === 'library.changed') {
    libraryRevision.value++
    return null
  }
  if (method === 'library.playlists.list') {
    if (payload.location === 'cloud') {
      if (!auth.isAuthenticated) throw new Error('请先登录澜音')
      return {
        items: (await cloudSongListAPI.getUserSongLists()).map((p) => ({
          ref: { id: p.id, location: 'cloud' },
          name: p.name,
          writable: true
        }))
      }
    }
    return {
      items: unwrap(await songListAPI.getAll()).map((p: any) => ({
        ref: { id: p.id, location: 'local' },
        name: p.name,
        writable: true
      }))
    }
  }
  if (method === 'library.playlists.getTracks') {
    const target = payload.target
    if (target.location === 'cloud') {
      const result = await cloudSongListAPI.getSongListDetail(
        target.id,
        'asc',
        100,
        Number(payload.cursor) || 0
      )
      return {
        items: result.list.map((song) => toPluginTrack(song)),
        totalEstimate: result.total,
        nextCursor:
          result.list.length === 100 ? String((Number(payload.cursor) || 0) + 100) : undefined
      }
    }
    return {
      items: unwrap(await songListAPI.getSongs(target.id)).map((song: any) => toPluginTrack(song))
    }
  }
  if (method === 'library.playlists.import') {
    const target = payload.target ?? (await choosePlaylist(payload.suggestedName, signal))
    signal?.throwIfAborted()
    if (!target) return { cancelled: true, added: 0, skipped: 0 }
    if (target.location === 'cloud') {
      if (!auth.isAuthenticated) throw new Error('请先登录澜音')
      const existing = await cloudSongListAPI.getSongListDetail(target.id)
      const ids = new Set(existing.list.map(songKey))
      const songs = mapSongsToCloud(payload.items.map(toAppTrack)).filter(song => {
        const key = songKey(song)
        if (ids.has(key)) return false
        ids.add(key)
        return true
      })
      signal?.throwIfAborted()
      if (songs.length) await cloudSongListAPI.addSongsToList(target.id, songs, signal)
      libraryRevision.value++
      return {
        cancelled: false,
        target,
        added: songs.length,
        skipped: payload.items.length - songs.length
      }
    }
    const added = unwrap(await songListAPI.addSongs(target.id, payload.items.map(toAppTrack)))
    libraryRevision.value++
    return {
      cancelled: false,
      target,
      added: typeof added === 'number' ? added : (added?.added ?? 0),
      skipped: added?.skipped ?? 0
    }
  }
  if (method === 'library.playlists.removeTracks') {
    signal?.throwIfAborted()
    const target = payload.target
    const items = (payload.items ?? []) as any[]
    if (target.location === 'cloud') {
      if (!auth.isAuthenticated) throw new Error('请先登录澜音')
      // 云歌单的删除接口按 songKey 选择行，这里复用插件轨道的同一套映射。
      const songs = mapSongsToCloud(items.map(toAppTrack))
      const removed = await removeCloudTracks(target.id, songs, signal)
      if (removed > 0) libraryRevision.value++
      return { removed, notFound: items.length - removed }
    }
    const songs = items.map(toAppTrack)
    const songmids = songs.map((song: any) => songKey(song))
    const result = unwrap(await songListAPI.removeSongs(target.id, songmids)) as
      | { removed?: number }
      | number
      | undefined
    const removed =
      typeof result === 'number'
        ? Math.max(0, Math.min(result, items.length))
        : typeof result?.removed === 'number'
          ? Math.max(0, Math.min(result.removed, items.length))
          : 0
    libraryRevision.value++
    return { removed, notFound: items.length - removed }
  }
  if (method === 'library.playlists.clearPlaylist') {
    const target = payload.target
    if (target.location === 'cloud') {
      if (!auth.isAuthenticated) throw new Error('请先登录澜音')
      const existing = await cloudSongListAPI.getSongListDetail(target.id)
      if (existing.list.length) {
        const removed = await removeCloudTracks(target.id, existing.list)
        if (removed > 0) libraryRevision.value++
      }
      return null
    }
    unwrap(await songListAPI.clearSongs(target.id))
    libraryRevision.value++
    return null
  }
  if (method === 'ui.progress.create') {
    const id = crypto.randomUUID()
    progress.set(id, await MessagePlugin.loading(payload.args?.[0]?.title || '处理中', 0))
    return { id }
  }
  if (method === 'ui.progress.close') {
    progress.get(payload.args?.[0])?.close()
    progress.delete(payload.args?.[0])
    return null
  }
  if (method === 'ui.progress.update') return null
  throw new Error('尚未接入的界面能力: ' + method)
}
let unsubscribe: (() => void) | undefined
let changed: (() => void) | undefined
let stopRouteWatch: (() => void) | undefined
let cancelUI: (() => void) | undefined
let accountChanged: (() => void) | undefined
let surfaceClosed: (() => void) | undefined
let stopAccountWatch: (() => void) | undefined
let stopVisibilityWatch: (() => void) | undefined
const uiRequests = new Map<string, AbortController>()
const hostEventCleanups: Array<() => void> = []
let mounted = false

function publishHostEvent(event: string, value: unknown, pluginId?: string) {
  const plainValue = JSON.parse(JSON.stringify(value ?? null))
  void desktopBridge.api.plugins
    .publishHostEvent(event, plainValue, pluginId)
    .catch((error) => console.warn(`发布插件宿主事件 ${event} 失败:`, error))
}

function startHostEventPublishing() {
  const globalStatus = useGlobalPlayStatusStore()
  const audio = ControlAudioStore().Audio
  const queue = LocalUserDetailStore()
  const settings = useSettingsStore()
  const room = useListenTogetherStore()
  const audioOutput = useAudioOutputStore()
  const dlna = useDlnaStore()
  if (!queue.initialization) queue.init()

  const listening = createListeningEvents(publishHostEvent)
  hostEventCleanups.push(
    watch(
      () => {
        const song = globalStatus.player.songInfo
        return [audio.audio, song?.songmid != null ? songKey(song) : null] as const
      },
      ([element, key], previous, onCleanup) => {
        if (key !== previous?.[1]) listening.finish()
        if (!element || !key) return
        const song = globalStatus.player.songInfo
        if (!song) return
        const label = { title: String(song.name ?? ''), artist: String(song.singer ?? ''), source: String(song.source ?? '') }
        listening.select(key, label)
        const sample = () => listening.sample(element.currentTime * 1000, element.duration * 1000, element.playbackRate)
        const tick = () => { if (!element.paused && !element.seeking && !element.ended) sample() }
        const resume = () => { listening.interrupt(); tick() }
        const pause = () => { if (!element.seeking) sample(); listening.interrupt() }
        const end = () => { pause(); listening.finish() }
        const play = () => {
          listening.select(key, label)
          resume()
        }
        const handlers: Record<string, () => void> = { playing: play, timeupdate: tick, seeking: listening.interrupt,
          seeked: resume, ratechange: resume, pause, ended: end, waiting: pause, emptied: listening.interrupt }
        for (const [name, handler] of Object.entries(handlers)) element.addEventListener(name, handler, true)
        tick()
        onCleanup(() => {
          for (const [name, handler] of Object.entries(handlers)) element.removeEventListener(name, handler, true)
          listening.interrupt()
        })
      },
      { immediate: true }
    ),
    router.beforeEach(async (to, from) => {
      if (!interceptsRoute()) return
      if (to.redirectedFrom && approvedRedirects.get(to.redirectedFrom)===to.fullPath) {
        approvedRedirects.delete(to.redirectedFrom); return
      }
      const origin = to.redirectedFrom && routeOrigins.get(to.redirectedFrom)
      const requested = origin?.path === to.fullPath ? origin : undefined
      if (requested && !requested.pluginId) return
      const target = publicRoute(to,undefined,true)
      if (!target) return
      try {
        const result = await desktopBridge.api.plugins.guardRoute(target,publicRoute(from,undefined,true),requested?.pluginId)
        const record = (destination: string) => {
          if (!requested?.pluginId && result.handledBy.length) routeNotices.set(to.redirectedFrom ?? to, {
            original: to.fullPath, destination, handledBy: result.handledBy
          })
        }
        if (result.prevented) { record(to.fullPath); return false }
        if (!result.redirect) return
        const next = result.redirect, params = {...next.params}
        if (next.name === 'plugin-page') {
          const plugin = activePluginContributions.value.find(item=>item.descriptor.id===params.pluginId)
          if (!plugin?.descriptor.pages.some((page:{id:string;when?:{loggedIn?:boolean}})=>page.id===params.pageId && isPluginPageVisible(page))) return
          params.pluginId = plugin.pluginId
        }
        const location = {name:next.name, params, query:next.query}
        const path = router.resolve(location).fullPath
        if (path===to.fullPath) return
        record(path)
        approvedRedirects.set(to.redirectedFrom ?? to,path)
        return location
      } catch (error) { console.warn('插件路由守卫不可用',error); return undefined }
    }),
    router.afterEach((to, from, failure) => {
      const origin = to.redirectedFrom ?? to
      const notice = routeNotices.get(origin)
      routeNotices.delete(origin)
      if (notice?.destination === to.fullPath && (!failure || isNavigationFailure(failure, NavigationFailureType.aborted))) {
        const names = notice.handledBy.map(id => activePluginContributions.value.find(item => item.descriptor.id === id)?.descriptor.name ?? id)
        void announcePluginOperation(names, () => navigateOnce(notice.original))
      }
      if (!failure && to.name === 'search' && typeof to.query.keyword === 'string' && to.query.keyword.length <= 1024) {
        search.setFocus(false)
        search.submit(to.query.keyword)
      }
      if (!failure) {
        const completed = publicRoute(to,undefined,true)
        if (completed) void desktopBridge.api.plugins.routeCompleted(completed,publicRoute(from,undefined,true)).catch(console.warn)
      }
      if (!failure && to.path !== from.path) publishHostEvent('route.changed', {
        from: typeof from.name === 'string' ? from.name : null,
        to: typeof to.name === 'string' ? to.name : null
      })
    }),
    listening.finish
  )

  const publishPlayer = () =>
    void handlePluginPlayback('services.player.getState', []).then((state) =>
      publishHostEvent('player.changed', state)
    )
  const publishQueue = () => {
    markPluginQueueChanged()
    void handlePluginPlayback('services.queue.get', []).then((state) =>
      publishHostEvent('queue.changed', state)
    )
  }

  hostEventCleanups.push(
    watch(
      () =>
        JSON.stringify([
          globalStatus.player.songInfo?.source,
          globalStatus.player.songInfo?.songmid,
          audio.isPlay,
          audio.duration,
          audio.volume,
          audio.audio?.muted
        ]),
      () => publishPlayer(),
      { immediate: true }
    ),
    watch(
      () =>
        JSON.stringify(
          queue.list.map((song) => song.pluginResource ?? [song.source, String(song.songmid)])
        ),
      () => publishQueue(),
      { immediate: true }
    ),
    watch(
      () => [audio.isPlay, globalStatus.player.songInfo] as const,
      ([playing, song]) => {
        if (playing) recordPluginHistory(song)
      }
    ),
    watch(
      () => JSON.stringify(globalStatus.player.lyrics.crlyric ?? null),
      (lyrics) => publishHostEvent('lyrics.changed', JSON.parse(lyrics)),
      { immediate: true }
    ),
    watch(
      () => JSON.stringify(getPluginPublicSettings()),
      (next, previous) => {
        const current = JSON.parse(next) as Record<string, unknown>
        const old = previous ? (JSON.parse(previous) as Record<string, unknown>) : {}
        const keys = Object.keys(current).filter(
          (key) => JSON.stringify(current[key]) !== JSON.stringify(old[key])
        )
        if (keys.length) publishHostEvent('settings.changed', { keys })
      },
      { immediate: true }
    ),
    watch(
      () => !!settings.settings.isDarkMode,
      (dark) => publishHostEvent('theme.changed', { theme: dark ? 'dark' : 'light' }),
      { immediate: true }
    ),
    watch(
      () => JSON.stringify([room.meta, room.myRole, room.members.length, room.connectionStatus]),
      () => publishHostEvent('rooms.changed', getPluginRoomState()),
      { immediate: true }
    ),
    watch(
      () =>
        JSON.stringify([
          audioOutput.devices,
          audioOutput.currentDeviceId,
          dlna.devices,
          dlna.currentDevice
        ]),
      () => publishHostEvent('devices.changed', getPluginDevices()),
      { immediate: true }
    ),
    watch(
      () => [auth.isAuthenticated, auth.user?.sub, auth.user?.name] as const,
      ([loggedIn, subject, displayName]) =>
        publishHostEvent('account.changed', { loggedIn, subject, displayName }),
      { immediate: true }
    ),
    watch(libraryRevision, () =>
      publishHostEvent('library.changed', {
        target: { id: 'library', location: 'local' },
        reason: 'updated'
      })
    )
  )

  const playerTimer = window.setInterval(() => {
    if (globalStatus.player.songInfo?.songmid != null) publishPlayer()
  }, 5000)
  hostEventCleanups.push(() => window.clearInterval(playerTimer))

  // 下载任务只有「由插件发起」的才对插件可见。
  // 反例：应用自动更新任务（songInfo.source === 'update'，pluginId 是宿主内部
  // 标记 'autoUpdate'）——它不是歌曲，没有 songmid 等合法身份，交给
  // toPluginTrack 必然抛「歌曲缺少有效来源或 ID」。这类任务直接跳过，不广播。
  const isPluginDownloadTask = (task: any): boolean => {
    if (!task?.pluginId) return false
    // 应用更新等宿主内部任务：songInfo.source 为 'update'，不属于任何插件。
    if (task.songInfo?.source === 'update') return false
    // 必须能构成合法歌曲身份（有 source 且有 songmid），否则不广播给插件。
    return (
      typeof task.songInfo?.source === 'string' &&
      task.songInfo.source.trim() !== '' &&
      task.songInfo.songmid != null &&
      String(task.songInfo.songmid).trim() !== ''
    )
  }

  const publishDownload = (_event: unknown, task: any) => {
    if (!isPluginDownloadTask(task)) return
    try {
      publishHostEvent('downloads.changed', toPluginDownloadTask(task), task.pluginId)
    } catch (error) {
      // 兜底：即使个别任务结构异常，也只跳过它，不影响其它下载事件与宿主自身。
      console.warn('[下载] 跳过无法转为插件任务的下载事件:', error)
    }
  }
  hostEventCleanups.push(
    desktopBridge.api.download.onTaskAdded(publishDownload),
    desktopBridge.api.download.onTaskProgress(publishDownload),
    desktopBridge.api.download.onTaskStatusChanged(publishDownload),
    desktopBridge.api.download.onTaskCompleted(publishDownload),
    desktopBridge.api.download.onTaskError(publishDownload),
    desktopBridge.api.download.onTasksReset((_event, tasks) => {
      for (const task of tasks) publishDownload(_event, task)
    })
  )
}

onMounted(() => {
  mounted = true
  surfaceClosed = desktopBridge.api.plugins.onSurfaceState((event) => {
    if (event.closed && qrLogin.value?.pluginId===event.pluginId && qrLogin.value.view?.sessionId===event.sessionId)
      qrLogin.value=null
    if (
      event.closed &&
      drawer.value?.pluginId === event.pluginId &&
      drawer.value.sessionId === event.sessionId
    )
      drawer.value = null
  })
  accountChanged = desktopBridge.api.plugins.onAccountChanged(
    ({ pluginId }) => { invalidatePageVisibility(pluginId); void refreshPluginAccounts(pluginId) }
  )
  unsubscribe = desktopBridge.api.plugins.onUI((request) => {
    const controller = new AbortController()
    uiRequests.set(request.id, controller)
    void handle(request, controller.signal)
      .then((value) =>
        desktopBridge.api.plugins.respondUI({
          id: request.id,
          // Host service results are JSON. Nested Pinia/Vue proxies cannot cross Electron IPC.
          value: JSON.parse(JSON.stringify(value ?? null))
        })
      )
      .catch((error) =>
        desktopBridge.api.plugins.respondUI({
          id: request.id,
          error: error instanceof Error ? error.message : String(error)
        })
      )
      .catch((error) => console.warn('返回插件界面操作结果失败:', error))
      .finally(() => uiRequests.delete(request.id))
  })
  cancelUI = desktopBridge.api.plugins.onUICancel(({ id }) => uiRequests.get(id)?.abort())
  changed = desktopBridge.api.plugins.onChanged((change) => {
    if (change?.type === 'views-updated') return
    if (
      change?.pluginId === drawer.value?.pluginId &&
      (change?.type === 'uninstalled' || change?.enabled === false)
    )
      closeDrawer()
    if (router.currentRoute.value.path !== '/' && router.currentRoute.value.name !== 'welcome')
      void refreshPluginContributions(true).catch((error) => console.warn('刷新插件失败:', error))
  })
  void desktopBridge.api.plugins
    .uiReady(true)
    .then((accepted) => {
      if (!accepted || !mounted) return
      markPluginUIReady()
      stopRouteWatch = watch(
        () => router.currentRoute.value.path,
        (path) => {
          if (path !== '/' && router.currentRoute.value.name !== 'welcome')
            void refreshPluginContributions().catch((error) => console.warn('恢复插件失败:', error))
        },
        { immediate: true }
      )
      // Immediate watchers can notify plugins that survived a renderer reload.
      // Their callbacks can already invoke the UI, so publish only after the handshake.
      stopVisibilityWatch = watchPageVisibility()
      hostEventCleanups.push(watchPluginSelection(value => publishHostEvent('entries.selectionChanged',value)))
      hostEventCleanups.push(bindPlaybackOperations(() => {
        if (!crossfadeManager.isFinalizingCurrentAdvance()) crossfadeManager.cancel()
      }))
      stopAccountWatch = watch(pluginAccountItems, () => void refreshPluginAccounts(), {
        immediate: true
      })
      startHostEventPublishing()
    })
    .catch((error) => console.warn('插件界面连接失败:', error))
})
onBeforeUnmount(() => {
  mounted = false
  for (const cleanup of hostEventCleanups.splice(0)) cleanup()
  surfaceClosed?.()
  cancelQrLogin()
  cancelOAuthLogin()
  accountChanged?.()
  stopAccountWatch?.()
  stopVisibilityWatch?.()
  closeDrawer()
  void desktopBridge.api.plugins.uiReady(false)
  for (const controller of uiRequests.values()) controller.abort()
  uiRequests.clear()
  cancelUI?.()
  unsubscribe?.()
  changed?.()
  stopRouteWatch?.()
  finish(false)
  for (const item of progress.values()) item.close()
})
</script>

<style scoped>
.grant-body {
  display: grid;
  gap: 16px;
  padding: 4px 0 16px;
}
.grant-intro {
  margin: 0;
  color: var(--td-text-color-secondary);
  line-height: 1.6;
}
.grant-card {
  display: flex;
  align-items: flex-start;
  gap: 14px;
  padding: 18px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
}
.grant-symbol {
  color: var(--td-brand-color);
  padding-top: 2px;
}
.grant-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}
.grant-description {
  margin: 6px 0 0;
  line-height: 1.7;
  color: var(--td-text-color-secondary);
  font-size: 13px;
}
</style>
