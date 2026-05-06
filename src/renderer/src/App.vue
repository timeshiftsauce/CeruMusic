<template>
  <Provider v-if="!$route.path.includes('desktop-lyric')">
    <GlobalBackground />

    <router-view v-slot="{ Component }">
      <Transition
        :enter-active-class="`animate__animated animate__fadeIn  pagesApp`"
        :leave-active-class="`animate__animated animate__fadeOut pagesApp`"
      >
        <component :is="Component" />
      </Transition>
    </router-view>
  </Provider>
  <router-view v-else />
  <GlobalContextMenu />
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, computed, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { MessagePlugin } from 'tdesign-vue-next'
import { useSettingsStore } from '@renderer/store/Settings'
import shareAPI from '@renderer/api/share'

const route = useRoute()
const router = useRouter()
const settingsStore = useSettingsStore()
// 启动页路由是 '/'(welcome)；其它路由（/home/*, /settings 等）视为应用就绪
// 排除桌面歌词与识别 worker 这种独立窗口
const isAppReady = computed(() => {
  const p = route.path || ''
  if (p === '/' || p === '') return false
  if (p.startsWith('/desktop-lyric')) return false
  if (p.startsWith('/recognition-worker')) return false
  return true
})

interface DeepLinkQueueOptions {
  label: string
  handler: (id: string) => Promise<void>
}

function createDeepLinkQueue({ label, handler }: DeepLinkQueueOptions) {
  const pending = ref<string[]>([])
  const processed = new Set<string>()

  const handle = async (id: string) => {
    if (!id || processed.has(id)) return
    processed.add(id)
    try {
      await handler(id)
    } finally {
      processed.delete(id)
    }
  }

  const enqueueOrHandle = (id: string) => {
    if (!id) return
    if (isAppReady.value) {
      handle(id)
    } else if (!pending.value.includes(id)) {
      pending.value.push(id)
    }
  }

  const flush = async (parallel = true) => {
    if (!pending.value.length) return
    const ids = pending.value.splice(0)
    console.log(`[${label}] flush:`, ids)
    if (parallel) await Promise.all(ids.map(handle))
    else for (const id of ids) await handle(id)
  }

  return { pending, enqueueOrHandle, flush }
}

const songShareQueue = createDeepLinkQueue({
  label: 'share',
  handler: async (id) => {
    console.log('[share] 处理分享 id:', id)
    MessagePlugin.info(`正在打开分享：${id}`)
    try {
      const detail = await shareAPI.getById(id)
      if (!detail || !detail.song) {
        MessagePlugin.error('分享已失效或已过期')
        return
      }
      const song: any = {
        ...detail.song,
        source: (detail.song as any).source || detail.source
      }
      const emitter = (window as any).musicEmitter
      if (!emitter) {
        MessagePlugin.error('播放器未就绪，请稍候重试')
        return
      }
      emitter.emit('addToPlaylistAndPlay', song)
    } catch (e: any) {
      console.error('打开分享失败', e)
      MessagePlugin.error(
        '打开分享失败：' + (e?.response?.data?.message || e?.message || '未知错误')
      )
    }
  }
})

const playlistShareQueue = createDeepLinkQueue({
  label: 'playlist-share',
  handler: async (id) => {
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
})

watch(isAppReady, (ready) => {
  if (!ready) return
  songShareQueue.flush(true)
  // router.push 互斥，串行处理避免覆盖
  playlistShareQueue.flush(false)
})

let unsubShareOpen: (() => void) | null = null
let unsubPlaylistShareOpen: (() => void) | null = null
let unsubCloseRequest: (() => void) | null = null

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
  if (window?.api?.share?.onShareOpen) {
    unsubShareOpen = window.api.share.onShareOpen(({ id }) => songShareQueue.enqueueOrHandle(id))
  }
  if (window?.api?.share?.onPlaylistShareOpen) {
    unsubPlaylistShareOpen = window.api.share.onPlaylistShareOpen(({ id }) =>
      playlistShareQueue.enqueueOrHandle(id)
    )
  }
  try {
    const ids = (await window?.api?.share?.getPending?.()) || []
    for (const id of ids) songShareQueue.enqueueOrHandle(id)
    const playlistIds = (await window?.api?.share?.getPendingPlaylistShares?.()) || []
    for (const id of playlistIds) playlistShareQueue.enqueueOrHandle(id)
  } catch (e) {
    console.warn('[share] 拉取待处理分享 id 失败', e)
  }

  // 监听主进程发送的关闭请求（Ctrl+W / Alt+F4）
  if (window.api?.windowClose?.onRequest) {
    unsubCloseRequest = window.api.windowClose.onRequest(() => handleWindowCloseRequest())
  }
})

onBeforeUnmount(() => {
  unsubShareOpen?.()
  unsubShareOpen = null
  unsubPlaylistShareOpen?.()
  unsubPlaylistShareOpen = null
  unsubCloseRequest?.()
  unsubCloseRequest = null
})
</script>
