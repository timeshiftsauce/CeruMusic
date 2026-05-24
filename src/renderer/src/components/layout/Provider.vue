<!--
  - Copyright (c) 2025. 时迁酱 Inc. All rights reserved.
  -
  - This software is the confidential and proprietary information of 时迁酱.
  - Unauthorized copying of this file, via any medium is strictly prohibited.
  -
  - @author 时迁酱，无聊的霜霜
  - @since 2025-9-19
  - @version 1.0
  -->

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

import {
  NConfigProvider,
  darkTheme,
  NGlobalStyle,
  NMessageProvider,
  NDialogProvider
} from 'naive-ui'
import { useSettingsStore } from '@renderer/store/Settings'
import songListAPI from '@renderer/api/songList'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  importPlaylistFromPath,
  validateImportedPlaylist
} from '@renderer/utils/playlist/playlistExportImport'
import {
  installGlobalMusicControls,
  uninstallGlobalMusicControls
} from '@renderer/utils/audio/globalControls'
import {
  installDesktopLyricBridge,
  uninstallDesktopLyricBridge
} from '@renderer/utils/lyrics/desktopLyricBridge'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@renderer/store'
import { settingsSyncService } from '@renderer/services/SettingsSyncService'
import AudioOutputSettings from '@renderer/components/Settings/AudioOutputSettings.vue'
import { useAudioOutputStore } from '@renderer/store/audioOutput'
import { tryShowListenTogetherInvite } from '@renderer/services/listenTogetherInvite'

const userInfo = LocalUserDetailStore()

const settingsStore = useSettingsStore()
const audioOutputStore = useAudioOutputStore()
const { settings } = settingsStore
const processedPaths = new Set<string>()
const authStore = useAuthStore()
const audioSelectorVisible = ref(false)

// 保存事件监听器清理函数
let themeChangeHandler: (() => void) | null = null
let mediaQueryChangeHandler: (() => void) | null = null

import '@renderer/assets/main.css'
import '@renderer/assets/theme/blue.css'
import '@renderer/assets/theme/pink.css'
import '@renderer/assets/theme/orange.css'
import '@renderer/assets/theme/cyan.css'

const importPromptVisible = ref(false)
const importPromptPath = ref('')
const importPromptFileName = ref('')
const dontAskAgain = ref(false)
const appInteractiveReady = ref(false)
const delayedOpenQueue: string[] = []

const sponsorPromptVisible = ref(false)
const usageTotalMs = ref(0)
const sponsorUrl = 'https://ceru.docs.shiqianjiang.cn/#%E8%B5%9E%E5%8A%A9'
const sponsorPromptAfterMs = 2.5 * 60 * 60 * 1000 + Math.round(Math.random() * 60 * 60 * 1000)
const sponsorPromptHiddenKey = 'ceru_sponsor_prompt_hidden_v1'
const usageTotalMsKey = 'ceru_usage_total_ms_v1'

let usageInterval: number | null = null
let usageActive = false
let usageActiveSince = 0
let usageTrackingEnabled = true
const router = useRouter()

// 全局教程引导
import type { GuideStep } from 'tdesign-vue-next'
const guideSteps = ref<GuideStep[]>([])
const guideCurrent = ref(-1)
let guidePrevIndex = -1
let guideInitialized = false
const isPlaylistStep = (s: any) => !!s && /播放器|播放列表/.test(String(s.title))
function onGuideChange(e: number) {
  const cur: any = guideSteps.value[e]
  const prev: any = guidePrevIndex >= 0 ? guideSteps.value[guidePrevIndex] : undefined
  if (isPlaylistStep(cur)) {
    try {
      window.dispatchEvent(new Event('open-playlist'))
    } catch {}
  } else if (isPlaylistStep(prev)) {
    try {
      window.dispatchEvent(new Event('close-playlist'))
    } catch {}
  }
  const title = String(cur?.title || '')
  const map: Record<string, Record<string, string>> = {
    设置页面: {},
    外观与主题: { category: 'appearance', section: 'appearance-theme' },
    快捷键: { category: 'hotkeys', section: 'hotkey-settings' },
    全局缓存: { category: 'storage', section: 'storage-directory' },
    插件管理: { category: 'plugins', section: 'plugin-settings' },
    音源选择: { category: 'music', section: 'music-source' },
    关于与支持: { category: 'about', section: 'about-version' }
  }
  if (map[title] !== undefined) {
    const q = map[title]
    router.push({ path: '/settings', query: q }).catch(() => {})
  } else if (prev && map[String(prev.title)] !== undefined) {
    // 离开设置相关介绍，切回主页
    router.push({ path: '/home/find' }).catch(() => {})
  }
  guidePrevIndex = e
}
function handleGuideInit(ev: CustomEvent) {
  const detail: any = (ev as any).detail || {}
  if (Array.isArray(detail.steps)) {
    if (guideInitialized) return
    guideInitialized = true
    try {
      ;(window as any).__guide_initialized = true
    } catch {}
    guideSteps.value = detail.steps
    guideCurrent.value = 0
    guidePrevIndex = -1
  }
}

const markGuideDone = () => {
  try {
    const store = LocalUserDetailStore()
    if (!store.userInfo.hasGuide) {
      store.userInfo.hasGuide = true
    }
    try {
      const raw = localStorage.getItem('userInfo')
      const obj = raw ? JSON.parse(raw) : {}
      obj.hasGuide = true
      localStorage.setItem('userInfo', JSON.stringify(obj))
    } catch {}
  } catch {}
}

watch(guideCurrent, (val) => {
  if (val < 0) {
    markGuideDone()
  }
})

const isWelcomeRoute = computed(() => {
  const r = router.currentRoute.value
  return r?.name === 'welcome' || r?.path === '/'
})

const sponsorUsageText = computed(() => {
  const totalMinutes = Math.floor(usageTotalMs.value / 60000)
  if (totalMinutes < 60) return `${totalMinutes} 分钟`
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60
  return minutes ? `${hours} 小时 ${minutes} 分钟` : `${hours} 小时`
})

const parseStoredNumber = (value: string | null): number => {
  if (!value) return 0
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

const persistUsage = () => {
  try {
    localStorage.setItem(usageTotalMsKey, String(usageTotalMs.value))
  } catch {}
}

const maybeShowSponsorPrompt = () => {
  if (sponsorPromptVisible.value) return
  if (!appInteractiveReady.value) return
  if (isWelcomeRoute.value) return
  if (localStorage.getItem(sponsorPromptHiddenKey) === '1') return
  if (usageTotalMs.value < sponsorPromptAfterMs) return
  sponsorPromptVisible.value = true
  stopUsageTracking()
}

const flushUsage = () => {
  if (!usageActive) return
  const now = Date.now()
  const delta = now - usageActiveSince
  if (delta > 0) {
    usageTotalMs.value += delta
    usageActiveSince = now
    persistUsage()
    maybeShowSponsorPrompt()
  }
}

const setUsageActive = (active: boolean) => {
  if (!usageTrackingEnabled) return
  if (active === usageActive) return
  if (!active) {
    flushUsage()
    usageActive = false
    return
  }
  usageActive = true
  usageActiveSince = Date.now()
}

const updateUsageActiveState = () => {
  if (!usageTrackingEnabled) return
  const active =
    !document.hidden && (typeof document.hasFocus === 'function' ? document.hasFocus() : true)
  setUsageActive(active)
}

const stopUsageTracking = () => {
  if (!usageTrackingEnabled) return
  usageTrackingEnabled = false
  flushUsage()
  usageActive = false
  if (usageInterval) {
    window.clearInterval(usageInterval)
    usageInterval = null
  }
  document.removeEventListener('visibilitychange', updateUsageActiveState)
  window.removeEventListener('focus', updateUsageActiveState)
  window.removeEventListener('blur', updateUsageActiveState)
  window.removeEventListener('beforeunload', flushUsage)
}

const closeSponsorPrompt = () => {
  sponsorPromptVisible.value = false
  localStorage.setItem(sponsorPromptHiddenKey, '1')
}

const openSponsor = () => {
  try {
    window.open(sponsorUrl)
  } catch {
  } finally {
    closeSponsorPrompt()
  }
}

const parseSonglistNameFromRaw = (rawName: string): string => {
  let parsedName: string | null = null
  const mSonglist = rawName.match(/^cerumusic-songlist-(.+?)-\d{4}-\d{2}-\d{2}$/i)
  if (mSonglist) parsedName = mSonglist[1]
  else {
    const mSimple = rawName.match(/^cerumusic-(.+)$/i)
    if (mSimple) parsedName = mSimple[1]
  }
  return parsedName || rawName
}

const confirmImportPrompt = async () => {
  try {
    const imported = await importPlaylistFromPath(importPromptPath.value)
    if (!validateImportedPlaylist(imported)) {
      MessagePlugin.error('导入的歌单格式不正确')
      importPromptVisible.value = false
      return
    }
    const rawName = importPromptFileName.value.replace(/\.(cmpl|cpl)$/i, '')
    const finalName = parseSonglistNameFromRaw(rawName)
    const createRes = await songListAPI.create(finalName, '从本地歌单文件导入', 'local')
    if (!createRes.success || !createRes.data) {
      MessagePlugin.error(createRes.error || '创建歌单失败')
      importPromptVisible.value = false
      return
    }
    const addRes = await songListAPI.addSongs(createRes.data.id, imported)
    console.log('addRes', addRes)
    if (addRes.success) {
      const added = (addRes.data && (addRes.data as any).added) ?? imported.length
      MessagePlugin.success(
        `成功导入 ${added} 首歌曲到歌单“${finalName}”` +
          (imported.length > added ? `，${imported.length - added}首可能已存在已去除` : '')
      )
    } else {
      MessagePlugin.error(addRes.error || '添加歌曲到歌单失败')
    }
  } catch (err) {
    MessagePlugin.error(`导入失败: ${(err as Error).message}`)
  } finally {
    importPromptVisible.value = false
    if (dontAskAgain.value) {
      settingsStore.updateSettings({
        autoCacheMusic: settings.autoCacheMusic,
        showFloatBall: settings.showFloatBall,
        tagWriteOptions: settings.tagWriteOptions,
        // 新增偏好
        autoImportPlaylistOnOpen: true,
        suppressImportPrompt: true
      })
    }
  }
}

const cancelImportPrompt = () => {
  importPromptVisible.value = false
}

const isDesktopLyricContext = () => {
  const r = router.currentRoute.value
  if (location.hash && location.hash.includes('desktop-lyric')) return true
  if (location.pathname && location.pathname.includes('desktop-lyric')) return true
  if (r?.name === 'desktop-lyric') return true
  if (r?.path && r.path.includes('desktop-lyric')) return true
  return false
}

onMounted(() => {
  if (isDesktopLyricContext()) return
  userInfo.init()
  settingsSyncService.init()
  setupSystemThemeListener()
  loadSavedTheme()
  syncNaiveTheme()

  usageTotalMs.value = parseStoredNumber(localStorage.getItem(usageTotalMsKey))
  if (localStorage.getItem(sponsorPromptHiddenKey) === '1') {
    usageTrackingEnabled = false
  } else {
    updateUsageActiveState()
    document.addEventListener('visibilitychange', updateUsageActiveState)
    window.addEventListener('focus', updateUsageActiveState)
    window.addEventListener('blur', updateUsageActiveState)
    window.addEventListener('beforeunload', flushUsage)
    usageInterval = window.setInterval(flushUsage, 15000)
  }

  // 添加 theme-changed 事件监听器并保存清理函数
  const handleThemeChange = () => syncNaiveTheme()
  window.addEventListener('theme-changed', handleThemeChange)
  themeChangeHandler = () => window.removeEventListener('theme-changed', handleThemeChange)

  // 监听 Store 变化，响应云同步
  watch(
    () => [
      settingsStore.settings.theme,
      settingsStore.settings.isDarkMode,
      settingsStore.settings.followSystemTheme
    ],
    ([newTheme, newMode, newFollow]) => {
      // 只有当 Store 中的值与当前应用的值不同时才应用，避免死循环
      // applyTheme 会更新 localStorage 并触发 theme-changed
      const currentTheme = localStorage.getItem('selected-theme') || 'default'
      const currentMode = localStorage.getItem('dark-mode') === 'true'

      const targetTheme = (newTheme as string) || 'default'
      // 跟随系统时使用系统偏好作为目标暗色状态
      const targetMode = newFollow ? detectSystemTheme() : ((newMode as boolean) ?? false)

      if (targetTheme !== currentTheme || targetMode !== currentMode) {
        applyTheme(targetTheme, targetMode)
      }
    }
  )

  // 监听 Logto 回调
  window.electron?.ipcRenderer?.on?.('logto-callback', (_: any, url: string) => {
    authStore.handleCallback(url)
  })

  // 全局键盘/托盘播放控制安装（解耦出组件）
  installGlobalMusicControls()
  installDesktopLyricBridge()
  // 全局监听来自主进程的播放控制事件，确保路由切换也可响应
  const forward = (name: string, val?: any) => {
    console.log('forward', name, val)
    window.dispatchEvent(new CustomEvent('global-music-control', { detail: { name, val } }))
  }
  window.electron?.ipcRenderer?.on?.('play', () => forward('play'))
  window.electron?.ipcRenderer?.on?.('pause', () => forward('pause'))
  window.electron?.ipcRenderer?.on?.('toggle', () => forward('toggle'))
  window.electron?.ipcRenderer?.on?.('playPrev', () => forward('playPrev'))
  window.electron?.ipcRenderer?.on?.('playNext', () => forward('playNext'))
  window.electron?.ipcRenderer?.on?.('volumeDelta', (_: any, val: number) =>
    forward('volumeDelta', val)
  )
  window.electron?.ipcRenderer?.on?.('seekDelta', (_: any, val: number) =>
    forward('seekDelta', val)
  )
  window.electron?.ipcRenderer?.on?.('setPlayMode', (_: any, val: string) =>
    forward('setPlayMode', val)
  )

  // Audio Output Selector Shortcut
  // Remove existing listeners to prevent duplicates/HMR issues
  window.electron?.ipcRenderer?.removeAllListeners?.('hotkeys:toggle-audio-output-selector')
  window.electron?.ipcRenderer?.on?.('hotkeys:toggle-audio-output-selector', () => {
    // If device B is set and different from A, we prioritize toggling directly
    // This allows "Quick Comparison" as requested.
    if (
      audioOutputStore.secondaryDeviceId &&
      audioOutputStore.primaryDeviceId &&
      audioOutputStore.secondaryDeviceId !== audioOutputStore.primaryDeviceId
    ) {
      audioOutputStore.toggleAB()
    } else {
      // Otherwise, open the selector modal so user can choose
      audioSelectorVisible.value = !audioSelectorVisible.value
    }
  })

  // 全局监听打开歌单文件
  window.electron?.ipcRenderer?.on?.('open-playlist-file', (_: any, filePath: string) => {
    const fileName = filePath.replace(/^.*[\\/]/, '')
    if (processedPaths.has(filePath)) return
    processedPaths.add(filePath)
    if (!appInteractiveReady.value) {
      delayedOpenQueue.push(filePath)
      return
    }
    const silent = !!(settings as any).autoImportPlaylistOnOpen
    confirmImportPromptPath(filePath, fileName, silent)
  })
  // 首次挂载时主动拉取待处理文件队列，防止事件在挂载前发送导致丢失
  window.electron?.ipcRenderer
    ?.invoke?.('get-pending-open-playlist-files')
    .then((paths: string[]) => {
      paths?.forEach((p) => {
        if (processedPaths.has(p)) return
        processedPaths.add(p)
        if (!appInteractiveReady.value) {
          delayedOpenQueue.push(p)
          return
        }
        const fileName = p.replace(/^.*[\\/]/, '')
        const silent = !!(settings as any).autoImportPlaylistOnOpen
        confirmImportPromptPath(p, fileName, silent)
      })
    })
    .catch(() => {})
  // 等待路由就绪与首屏渲染后再处理导入队列，避免加载页面未过就提示
  router.isReady().then(() => {
    setTimeout(() => {
      appInteractiveReady.value = true
      while (delayedOpenQueue.length) {
        const p = delayedOpenQueue.shift()!
        const fileName = p.replace(/^.*[\\/]/, '')
        const silent = !!(settings as any).autoImportPlaylistOnOpen
        confirmImportPromptPath(p, fileName, silent)
      }
      authStore.init()

      /* 一起听邀请:启动后(authStore.init() 已触发)再检查冷启动累积的 deeplink code
       * + 剪贴板里可能有的 #CODE#。具体是否真的弹由 maybeTriggerLtInvite 内的 welcome
       * 守卫决定 —— 用户没过完欢迎页前先攒着,等 isWelcomeRoute 变 false 时再发。 */
      window.electron?.ipcRenderer
        ?.invoke?.('get-pending-lt-codes')
        .then((codes: string[]) => {
          if (codes?.length) console.log('[lt] 取回冷启动 pending codes:', codes)
          for (const code of codes || []) queueLtDeeplinkCode(code)
        })
        .catch((e: any) => console.warn('[lt] getPendingCodes failed', e))
      requestLtClipboardCheck()
    }, 500)
  })
  // 教程初始化监听
  window.addEventListener('guide:init', handleGuideInit as any)

  /* 监听主进程 cerumusic://lt/<code> 推过来的 code(运行时 deeplink) ——
   * 用 electron.ipcRenderer 直连,而不是 window.api.listenTogether.onShareOpen,
   * 避免 preload bundle 未重编时拿不到包装层。 */
  window.electron?.ipcRenderer?.on?.('lt-share-open', (_: any, payload: { code: string }) => {
    console.log('[lt] 收到 deeplink IPC:', payload)
    if (payload?.code) queueLtDeeplinkCode(payload.code)
  })

  /* 窗口重新聚焦时检查剪贴板 —— 覆盖"用户在外面复制完文案再切回客户端"的场景。
   * 用 'focus' 而不是 'visibilitychange' 因为后者在 macOS 下表现不一致。 */
  window.addEventListener('focus', onWindowFocusForLt)
})

watch([appInteractiveReady, isWelcomeRoute], () => {
  maybeShowSponsorPrompt()
})

const confirmImportPromptPath = (path: string, fileName: string, silent: boolean) => {
  importPromptPath.value = path
  importPromptFileName.value = fileName
  dontAskAgain.value = false
  if (silent) {
    void confirmImportPrompt()
  } else {
    importPromptVisible.value = true
  }
}

/* ==========================================================================
 * 一起听邀请触发 —— 用户没过完欢迎页之前先攒着,过完才弹
 *
 * 触发点(deeplink IPC / 启动剪贴板 / 窗口聚焦 / find onActivated)都走
 * `queueLtDeeplinkCode` / `requestLtClipboardCheck`,内部检查 isWelcomeRoute
 * 决定立即调还是排队。watch isWelcomeRoute / appInteractiveReady 在条件
 * 满足时一次性 drain 排队的所有请求。
 * ========================================================================== */
const pendingLtDeeplinkCodes: string[] = []
let pendingLtClipboardCheck = false
let ltFocusThrottle = 0

const ltInviteReady = computed(() => appInteractiveReady.value && !isWelcomeRoute.value)

function queueLtDeeplinkCode(code: string): void {
  if (ltInviteReady.value) {
    void tryShowListenTogetherInvite('deeplink', code)
  } else {
    if (!pendingLtDeeplinkCodes.includes(code)) pendingLtDeeplinkCodes.push(code)
  }
}

function requestLtClipboardCheck(): void {
  if (ltInviteReady.value) {
    void tryShowListenTogetherInvite('clipboard')
  } else {
    pendingLtClipboardCheck = true
  }
}

/* 一起听:聚焦回客户端时再扫一次剪贴板 —— 节流防止 mac 频繁触发 focus */
function onWindowFocusForLt(): void {
  const now = Date.now()
  if (now - ltFocusThrottle < 1500) return
  ltFocusThrottle = now
  requestLtClipboardCheck()
}

watch(ltInviteReady, (ready) => {
  if (!ready) return
  // 排队的 deeplink 全部消化
  while (pendingLtDeeplinkCodes.length) {
    const code = pendingLtDeeplinkCodes.shift()!
    void tryShowListenTogetherInvite('deeplink', code)
  }
  if (pendingLtClipboardCheck) {
    pendingLtClipboardCheck = false
    void tryShowListenTogetherInvite('clipboard')
  }
})

// 基于现有主题文件的配置
const themes = [
  { name: 'default', label: '默认', color: '#2ba55b' },
  { name: 'pink', label: '粉色', color: '#fc5e7e' },
  { name: 'blue', label: '蓝色', color: '#57b4ff' },
  { name: 'cyan', label: '青色', color: '#3ac2b8' },
  { name: 'orange', label: '橙色', color: '#fb9458' }
]

const naiveTheme = ref<any>(null)
const themeOverrides = ref<any>({})

function syncNaiveTheme() {
  const docEl = document.documentElement
  const savedDarkMode = localStorage.getItem('dark-mode')
  const isDark = savedDarkMode === 'true'
  naiveTheme.value = isDark ? darkTheme : null

  const computed = getComputedStyle(docEl)
  const primary = (computed.getPropertyValue('--td-brand-color') || '').trim()

  const savedThemeName = localStorage.getItem('selected-theme') || 'default'
  const fallback = themes.find((t) => t.name === savedThemeName)?.color || '#2ba55b'
  const mainColor = primary || fallback

  themeOverrides.value = {
    common: {
      primaryColor: mainColor,
      primaryColorHover: mainColor,
      primaryColorPressed: mainColor,
      borderRadius: '8px'
    }
  }
}

const loadSavedTheme = () => {
  // 优先尝试从 Store 读取（支持云同步）
  if (settingsStore.settings.theme || typeof settingsStore.settings.isDarkMode !== 'undefined') {
    const themeName = settingsStore.settings.theme || 'default'
    // 若开启「跟随系统」则用系统偏好覆盖手动暗色选择
    const isDarkMode = settingsStore.settings.followSystemTheme
      ? detectSystemTheme()
      : (settingsStore.settings.isDarkMode ?? false)
    applyTheme(themeName, isDarkMode)
    return
  }

  const savedTheme = localStorage.getItem('selected-theme')
  const savedDarkMode = localStorage.getItem('dark-mode')

  let themeName = 'default'
  let isDarkMode = false

  if (savedTheme && themes.some((t) => t.name === savedTheme)) {
    themeName = savedTheme
  }

  if (savedDarkMode !== null) {
    isDarkMode = savedDarkMode === 'true'
  } else {
    // 如果没有保存的设置，检测系统偏好
    isDarkMode = detectSystemTheme()
  }

  applyTheme(themeName, isDarkMode)
}

const applyTheme = (themeName, darkMode = false) => {
  const documentElement = document.documentElement

  // 移除之前的主题属性
  documentElement.removeAttribute('theme-mode')
  documentElement.removeAttribute('data-theme')

  // 应用主题色彩
  if (themeName !== 'default') {
    documentElement.setAttribute('theme-mode', themeName)
  }

  // 应用明暗模式
  if (darkMode) {
    documentElement.setAttribute('data-theme', 'dark')
  } else {
    documentElement.setAttribute('data-theme', 'light')
  }

  // 保存到本地存储
  localStorage.setItem('selected-theme', themeName)
  localStorage.setItem('dark-mode', darkMode.toString())

  // 同步 Naive UI 主题
  syncNaiveTheme()
}

// 检测系统主题偏好
const detectSystemTheme = () => {
  if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return true
  }
  return false
}

// 监听系统主题变化
const setupSystemThemeListener = () => {
  if (window.matchMedia) {
    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    const handleMediaQueryChange = (e: MediaQueryListEvent) => {
      // 已开启「跟随系统」时直接随系统切换；
      // 否则保持向后兼容：若用户从未手动设置过暗色（无 dark-mode 持久化），也跟随系统
      const followSystem = settingsStore.settings.followSystemTheme === true
      const savedDarkMode = localStorage.getItem('dark-mode')
      if (followSystem || savedDarkMode === null) {
        const savedTheme = localStorage.getItem('selected-theme') || 'default'
        applyTheme(savedTheme, e.matches)
      }
    }
    mediaQuery.addEventListener('change', handleMediaQueryChange)
    // 保存清理函数
    mediaQueryChangeHandler = () => mediaQuery.removeEventListener('change', handleMediaQueryChange)
  }
}

// 清理事件监听器
onUnmounted(() => {
  stopUsageTracking()

  uninstallGlobalMusicControls()
  uninstallDesktopLyricBridge()

  if (themeChangeHandler) {
    themeChangeHandler()
    themeChangeHandler = null
  }
  if (mediaQueryChangeHandler) {
    mediaQueryChangeHandler()
    mediaQueryChangeHandler = null
  }
  try {
    window.removeEventListener('guide:init', handleGuideInit as any)
  } catch {}
  try {
    window.removeEventListener('focus', onWindowFocusForLt)
  } catch {}
})
</script>

<template>
  <NConfigProvider :theme="naiveTheme" :theme-overrides="themeOverrides">
    <NMessageProvider>
      <NDialogProvider>
        <NGlobalStyle />
        <div class="page">
          <slot></slot>
          <t-dialog v-model:visible="importPromptVisible" header="是否导入此歌单" :footer="false">
            <div>
              <p>已打开歌单文件：{{ importPromptFileName }}</p>
              <p>是否导入为本地歌单？</p>
              <t-checkbox v-model="dontAskAgain">以后不再提醒，自动导入</t-checkbox>
              <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: flex-end">
                <t-button theme="default" variant="outline" @click="cancelImportPrompt"
                  >取消</t-button
                >
                <t-button theme="primary" @click="confirmImportPrompt">导入</t-button>
              </div>
            </div>
          </t-dialog>
          <t-dialog
            v-model:visible="sponsorPromptVisible"
            header="感谢使用澜音"
            :close-btn="true"
            :close-on-overlay-click="true"
            :destroy-on-close="true"
            :footer="false"
            placement="center"
            @close="closeSponsorPrompt"
          >
            <div style="max-width: 420px">
              <p style="margin: 0 0 8px 0">
                hi！ 大大澜音已经陪伴您
                {{
                  sponsorUsageText
                }}。如果您喜欢澜音可以给我们一点小小的支持吗，我相信我们会越做越好哒。
              </p>
              <div style="display: flex; gap: 8px; justify-content: flex-end">
                <t-button theme="default" variant="outline" @click="closeSponsorPrompt"
                  >不再提示</t-button
                >
                <t-button theme="primary" @click="openSponsor">支持！必须加鸡腿</t-button>
              </div>
            </div>
          </t-dialog>

          <!-- Audio Output Selector Modal -->
          <t-dialog
            v-model:visible="audioSelectorVisible"
            header="音频输出选择"
            :footer="false"
            width="80vw"
            placement="center"
          >
            <AudioOutputSettings :embedded="true" />
          </t-dialog>
          <GlobalAudio />
          <FloatBall />
          <PluginNoticeDialog />
          <UpdateProgress />
          <t-guide v-model="guideCurrent" :steps="guideSteps" @change="onGuideChange" />
        </div>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>
<style>
.pagesApp {
  width: 100vw;
  position: fixed;
}
</style>
