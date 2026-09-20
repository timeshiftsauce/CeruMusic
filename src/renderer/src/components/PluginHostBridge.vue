<template>
  <PluginDrawer :session="drawer" @close="closeDrawer" @state="updateDrawerState" />
  <t-dialog
    v-model:visible="visible"
    :header="title"
    width="480px"
    attach="body"
    :confirm-btn="confirmLabel"
    cancel-btn="取消"
    :close-on-overlay-click="false"
    @confirm="finish(true)"
    @cancel="finish(false)"
    @close="finish(false)"
  >
    <div v-if="kind === 'permissions'" class="grant-body">
      <p class="grant-intro">{{ data.pluginName }} 需要以下权限</p>
      <div class="grant-card">
        <span class="grant-symbol"><t-icon name="secured" size="22px" /></span>
        <div>
          <div class="grant-title">{{ data.title }}</div>
          <p class="grant-description">{{ data.description }}</p>
        </div>
      </div>
    </div>
    <div v-else-if="kind === 'playlist'" class="grant-body">
      <t-select v-model="selectedPlaylist" placeholder="选择歌单" :options="playlistOptions" />
      <t-input v-if="selectedPlaylist === 'new'" v-model="inputValue" placeholder="新歌单名称" />
    </div>
    <div v-else-if="kind === 'prompt'" class="grant-body">
      <label>{{ data.label }}</label
      ><t-input v-model="inputValue" :type="data.secret ? 'password' : 'text'" />
    </div>
    <p v-else class="grant-description">{{ data.message }}</p>
  </t-dialog>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { useRouter } from 'vue-router'
import PluginDrawer from './PluginDrawer.vue'
import type { PluginDrawerSession } from '@common/pluginDrawer'
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
import { toAppTrack, toPluginTrack } from '@common/pluginMusic'
import {
  pluginImportRequest,
  libraryRevision,
  markPluginUIReady,
  refreshPluginContributions
} from '@renderer/services/pluginState'
const router = useRouter()
const auth = useAuthStore()
const visible = ref(false)
const kind = ref('')
const title = ref('')
const confirmLabel = ref('确定')
const inputValue = ref('')
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
    await window.api.plugins
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
        kind.value = type
        data.value = value
        inputValue.value = value.value ?? value.suggestedName ?? '导入的歌单'
        title.value =
          type === 'permissions'
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
function finish(accepted: boolean) {
  if (!resolveDialog) return
  const resolve = resolveDialog
  resolveDialog = undefined
  visible.value = false
  resolve(
    !accepted
      ? null
      : kind.value === 'prompt'
        ? inputValue.value
        : kind.value === 'playlist'
          ? { id: selectedPlaylist.value, name: inputValue.value }
          : true
  )
}
function unwrap(result: any): any {
  if (!result?.success) throw new Error(result?.error || '歌单操作失败')
  return result.data
}
async function choosePlaylist(suggestedName?: string) {
  const lists = unwrap(await songListAPI.getAll())
  playlistOptions.value = [
    { label: '新建本地歌单', value: 'new' },
    ...lists.map((p: any) => ({ label: p.name, value: p.id }))
  ]
  selectedPlaylist.value = 'new'
  const selected = await showDialog('playlist', { suggestedName })
  if (!selected) return null
  if (selected.id === 'new')
    selected.id = unwrap(await songListAPI.create(selected.name, '', 'local')).id
  return { id: selected.id, location: 'local' }
}
async function handle(request: any, signal?: AbortSignal): Promise<any> {
  const { method, data: payload = {}, pluginId } = request
  if (pluginPlaybackMethods.includes(method)) return handlePluginPlayback(method, payload.args)
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
    return handlePluginHostService(method, payload.args ?? [])
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
    const result = await window.api.plugins.updateFromUrl(pluginId, url.href)
    if (result?.error) throw new Error(result.error)
    await refreshPluginContributions(true)
    await MessagePlugin.success(`插件已更新到 ${result.version || payload.version}`)
    return { accepted: true, updated: true, version: result.version || payload.version }
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
    const target = payload.target ?? (await choosePlaylist(payload.suggestedName))
    if (!target) return { cancelled: true, added: 0, skipped: 0 }
    if (target.location === 'cloud') {
      if (!auth.isAuthenticated) throw new Error('请先登录澜音')
      const existing = await cloudSongListAPI.getSongListDetail(target.id)
      const ids = new Set(existing.list.map((song) => String(song.songmid)))
      const songs = mapSongsToCloud(payload.items.map(toAppTrack)).filter(
        (song) => !ids.has(String(song.songmid))
      )
      if (songs.length) await cloudSongListAPI.addSongsToList(target.id, songs)
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
const uiRequests = new Map<string, AbortController>()
const hostEventCleanups: Array<() => void> = []
let mounted = false

function publishHostEvent(event: string, value: unknown, pluginId?: string) {
  const plainValue = JSON.parse(JSON.stringify(value ?? null))
  void window.api.plugins
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
      () => globalStatus.player.songInfo,
      (song) => recordPluginHistory(song),
      { immediate: true }
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

  const publishDownload = (_event: unknown, task: any) =>
    task?.pluginId
      ? publishHostEvent('downloads.changed', toPluginDownloadTask(task), task.pluginId)
      : undefined
  hostEventCleanups.push(
    window.api.download.onTaskAdded(publishDownload),
    window.api.download.onTaskProgress(publishDownload),
    window.api.download.onTaskStatusChanged(publishDownload),
    window.api.download.onTaskCompleted(publishDownload),
    window.api.download.onTaskError(publishDownload),
    window.api.download.onTasksReset((_event, tasks) => {
      for (const task of tasks) publishDownload(_event, task)
    })
  )
}

onMounted(() => {
  mounted = true
  startHostEventPublishing()
  surfaceClosed = window.api.plugins.onSurfaceState((event) => {
    if (
      event.closed &&
      drawer.value?.pluginId === event.pluginId &&
      drawer.value.sessionId === event.sessionId
    )
      drawer.value = null
  })
  accountChanged = window.api.plugins.onAccountChanged(
    ({ pluginId }) => void refreshPluginAccounts(pluginId)
  )
  stopAccountWatch = watch(pluginAccountItems, () => void refreshPluginAccounts(), {
    immediate: true
  })
  unsubscribe = window.api.plugins.onUI((request) => {
    const controller = new AbortController()
    uiRequests.set(request.id, controller)
    void handle(request, controller.signal)
      .then((value) =>
        window.api.plugins.respondUI({
          id: request.id,
          // Host service results are JSON. Nested Pinia/Vue proxies cannot cross Electron IPC.
          value: JSON.parse(JSON.stringify(value ?? null))
        })
      )
      .catch((error) =>
        window.api.plugins.respondUI({
          id: request.id,
          error: error instanceof Error ? error.message : String(error)
        })
      )
      .catch((error) => console.warn('返回插件界面操作结果失败:', error))
      .finally(() => uiRequests.delete(request.id))
  })
  cancelUI = window.api.plugins.onUICancel(({ id }) => uiRequests.get(id)?.abort())
  changed = window.api.plugins.onChanged((change) => {
    if (
      change?.pluginId === drawer.value?.pluginId &&
      (change.type === 'uninstalled' || change.enabled === false)
    )
      closeDrawer()
    if (router.currentRoute.value.path !== '/' && router.currentRoute.value.name !== 'welcome')
      void refreshPluginContributions(true).catch((error) => console.warn('刷新插件失败:', error))
  })
  void window.api.plugins
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
    })
    .catch((error) => console.warn('插件界面连接失败:', error))
})
onBeforeUnmount(() => {
  mounted = false
  for (const cleanup of hostEventCleanups.splice(0)) cleanup()
  surfaceClosed?.()
  accountChanged?.()
  stopAccountWatch?.()
  closeDrawer()
  void window.api.plugins.uiReady(false)
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
