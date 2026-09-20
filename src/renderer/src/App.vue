<template>
  <Provider v-if="!$route.path.includes('desktop-lyric')">
    <GlobalBackground />
    <PluginHostBridge />

    <router-view v-slot="{ Component }">
      <Transition
        :enter-active-class="`animate__animated animate__fadeIn  pagesApp`"
        :leave-active-class="`animate__animated animate__fadeOut pagesApp`"
      >
        <KeepAlive include="HomeRoot"><component :is="Component" /></KeepAlive>
      </Transition>
    </router-view>

    <!-- 一起听 Toast —— 全屏播放器未展开时新聊天走这里(节流) -->
    <LtChatToast />
  </Provider>
  <router-view v-else />
  <GlobalContextMenu />
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSettingsStore } from '@renderer/store/Settings'
import shareAPI from '@renderer/api/share'
import PluginHostBridge from '@renderer/components/PluginHostBridge.vue'
import { appEntryQueue } from '@renderer/services/entryQueue'
import { showListenTogetherInvite } from '@renderer/services/listenTogetherInvite'
import { showExternalPluginInstall } from '@renderer/services/externalPluginInstall'
import type { QueuedDeepLink } from '@common/types/deepLink'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()

// 播放事件属于应用生命周期；刷新后直接进入主界面也必须初始化。
watch(
  () => route.path,
  (path) => {
    if (!path.startsWith('/home') && path !== '/settings') return
    void import('@renderer/utils/audio/globaPlayList')
      .then(({ initPlayback }) => initPlayback())
      .catch((error) => {
        console.error('初始化播放器失败:', error)
        MessagePlugin.error('播放器初始化失败，请重新打开软件后重试')
      })
  },
  { immediate: true, flush: 'post' }
)

async function openSongShare(id: string) {
  console.log('[share] 处理分享 id:', id)
  MessagePlugin.info(`正在打开分享：${id}`)
  try {
    let detail: any
    if (id.startsWith('v2_')) {
      const descriptor = await window.api.share.readDescriptor(id)
      const registry = await window.api.plugins.contributions()
      const installed = registry.find((item) => item.manifest.id === descriptor.track.pluginId)
      if (!installed) {
        MessagePlugin.warning('请先安装分享歌曲所需的插件：' + descriptor.track.pluginId)
        return
      }
      detail = {
        source: descriptor.track.providerId,
        song: {
          songmid: descriptor.track.id,
          name: descriptor.title,
          singer: descriptor.artists.join('、'),
          source: descriptor.track.providerId,
          pluginResource: descriptor.track,
          albumName: '',
          albumId: '',
          types: [],
          _types: {},
          lrc: null
        }
      }
    } else detail = await shareAPI.getById(id)
    if (!detail || !detail.song) {
      MessagePlugin.error('分享已失效或已过期')
      return
    }
    const song: any = {
      ...detail.song,
      source: (detail.song as any).source || detail.source
    }
    const [{ addToPlaylistAndPlay }, { playSong }, { LocalUserDetailStore }] = await Promise.all([
      import('@renderer/utils/playlist/playlistManager'),
      import('@renderer/utils/audio/globaPlayList'),
      import('@renderer/store/LocalUserDetail')
    ])
    await addToPlaylistAndPlay(song, LocalUserDetailStore(), playSong)
  } catch (e: any) {
    console.error('打开分享失败', e)
    MessagePlugin.error('打开分享失败：' + (e?.response?.data?.message || e?.message || '未知错误'))
  }
}

async function openPlaylistShare(id: string) {
  console.log('[playlist-share] 处理歌单分享 id:', id)
  MessagePlugin.info(`正在打开歌单分享：${id}`)
  try {
    const detail = await shareAPI.getPlaylistById(id, 0)
    if (!detail?.playlist) {
      MessagePlugin.error('歌单分享不存在或已失效')
      return
    }
    await router.push({
      name: 'list',
      params: { id },
      query: {
        title: detail.playlist.name,
        author: detail.username || 'share',
        cover: detail.playlist.cover || '',
        total: String(detail.playlist.total || 0),
        source: 'share',
        type: 'playlist_share',
        description: detail.playlist.describe || '',
        cloudId: detail.playlist.id,
        meta: JSON.stringify({
          cloudId: detail.playlist.id,
          playlistShareId: detail.id,
          sourceShare: true,
          canPlay: detail.canPlay,
          playExpiresAt: detail.playExpiresAt,
          openInAppScheme: detail.openInAppScheme
        })
      }
    })
  } catch (e: any) {
    console.error('打开歌单分享失败', e)
    MessagePlugin.error(
      '打开歌单分享失败：' + (e?.response?.data?.message || e?.message || '未知错误')
    )
  }
}

let unsubDeepLinks: (() => void) | undefined
let unsubCloseRequest: (() => void) | null = null
let mounted = false
let inbox: Promise<void> = Promise.resolve()
const received = new Set<number>()
let inboxReady = false
let enteredHome = false
function updateQueueReady() {
  if (route.path.startsWith('/home/')) enteredHome = true
  const interactive = route.path.startsWith('/home/') || route.path.startsWith('/settings')
  appEntryQueue.setReady(mounted && inboxReady && enteredHome && interactive)
}
async function handleDeepLink(item: QueuedDeepLink) {
  try {
    if (item.kind === 'song-share') await openSongShare(item.value)
    else if (item.kind === 'playlist-share') await openPlaylistShare(item.value)
    else if (item.kind === 'listen-together') await showListenTogetherInvite('deeplink', item.value)
    else await showExternalPluginInstall(item.sequence)
  } finally {
    await window.api.deepLinks.acknowledge(item.sequence)
  }
}
function syncDeepLinks() {
  inbox = inbox
    .catch(() => {})
    .then(async () => {
      const links = await window.api.deepLinks.pending()
      if (!mounted) return
      for (const item of links.sort((a, b) => a.sequence - b.sequence)) {
        if (received.has(item.sequence)) continue
        received.add(item.sequence)
        void appEntryQueue.enqueue(`deeplink:${item.sequence}`, () => handleDeepLink(item))
      }
      inboxReady = true
      await nextTick()
      updateQueueReady()
    })
    .catch((error) => console.warn('读取外部链接队列失败:', error))
  return inbox
}
watch(
  () => route.path,
  () => {
    void nextTick().then(updateQueueReady)
  }
)

// 处理 Ctrl+W / Alt+F4 的关闭请求，模拟点击关闭按钮行为
const handleWindowCloseRequest = () => {
  const settings = settingsStore.settings
  if (!settings.hasConfiguredCloseBehavior) {
    // 未配置过关闭行为，通过自定义事件通知 TitleBarControls 显示对话框
    window.dispatchEvent(new CustomEvent('ceru-show-close-dialog'))
    return
  }
  if (settings.closeToTray) {
    window.api?.setMiniMode(true)
  } else {
    window.api?.close()
  }
}

onMounted(async () => {
  mounted = true
  unsubDeepLinks = window.api.deepLinks.onChanged(() => {
    void syncDeepLinks()
  })
  void syncDeepLinks()
  // 启动时把窗口标题置为软件名(若 PlayMusic 后续挂载且有歌,会立刻覆盖为"歌名 - 歌手")
  try {
    ;(window as any).api?.app?.setTitle?.('澜音 Ceru Music')
    ;(window as any).api?.app?.setProgress?.(-1)
  } catch (e) {
    console.warn('[app] init title/progress failed', e)
  }

  // 监听主进程发送的关闭请求（Ctrl+W / Alt+F4）
  if (window.api?.windowClose?.onRequest) {
    unsubCloseRequest = window.api.windowClose.onRequest(() => handleWindowCloseRequest())
  }
})

onBeforeUnmount(() => {
  mounted = false
  unsubDeepLinks?.()
  appEntryQueue.setReady(false)
  unsubCloseRequest?.()
  unsubCloseRequest = null
})
</script>
