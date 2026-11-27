<script lang="ts" setup>
import { desktopBridge } from '@renderer/services/desktopBridge'
import { seekTo } from '@renderer/utils/audio/globaPlayList'
import { getLyricSongwriters } from '@common/pluginLyrics'
import '@applemusic-like-lyrics/core/style.css'
import { LayoutReason, LayoutReasonStrategyMap } from '@applemusic-like-lyrics/core'
import { LyricPlayer, type LyricPlayerRef } from '@applemusic-like-lyrics/vue'
import type { SongList } from '@renderer/types/audio'
import {
  ref,
  computed,
  onMounted,
  onActivated,
  onDeactivated,
  watch,
  reactive,
  onBeforeUnmount,
  nextTick,
  toRaw
} from 'vue'
import { useBackgroundBeat } from '@renderer/composables/useBackgroundBeat'
import { usePlayerBackground } from '@renderer/composables/usePlayerBackground'
import { useAppBackground } from '@renderer/composables/useAppBackground'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import {
  Fullscreen1Icon,
  FullscreenExit1Icon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  InfoCircleIcon,
  PenBallIcon
} from 'tdesign-icons-vue-next'
import _ from 'lodash'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/store/Settings'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { useDlnaStore } from '@renderer/store/dlna'
import { MessagePlugin } from '@renderer/plugin/notifications'

// 全局播放模式设置
import { usePlaySettingStore } from '@renderer/store'
import PlaySettings from './PlaySettings.vue'
import SkinSimulatorBar from './SkinSimulatorBar.vue'
import { provide } from 'vue'
import { useSkinSimulator, skinSimulatorKey } from '@renderer/plugin/skinSimulator'
import { playbackIdentity, regionTrackIdentity } from '@renderer/plugin/regionTrack'
import { regionClock } from '@renderer/plugin/regionClock'
import PluginRegion from '../PluginRegion.vue'
import { restoreSkin, regionView, regionNotices } from '@renderer/plugin/regions'
import LyricAdapter from './Lyric/LyricAdapter.vue'
import PlayerArtwork from './PlayerArtwork.vue'
import CommentsOverlay from './CommentsOverlay.vue'
import LyricCopyOverlay from './LyricCopyOverlay.vue'
import ListenTogetherOverlay from './ListenTogetherOverlay.vue'
import LtDanmakuLayer from '@renderer/components/ListenTogether/LtDanmakuLayer.vue'
import { useLyricExtrasStore } from '@renderer/store/LyricExtras'

const playSetting = usePlaySettingStore()
onMounted(() => { void restoreSkin().catch(() => {}) })
// 只调整 seek 时的阶梯延迟，仍由 AMLL 对齐逐字高亮和间奏状态。
watch(
  () => playSetting.getIsSeekLyricStagger,
  (enabled) => {
    LayoutReasonStrategyMap[LayoutReason.Seek].disableStagger = !enabled
  },
  { immediate: true }
)

const settingsStore = useSettingsStore()
const dlnaStore = useDlnaStore()
const globalPlayStatus = useGlobalPlayStatusStore()
const { player } = storeToRefs(globalPlayStatus)
const lyricExtrasStore = useLyricExtrasStore()
const showSettings = ref(false)

const lyricFontSize = computed(() => {
  const rate = settingsStore.settings.FullPlayLyricFontRate || 1.0
  return `calc(min(clamp(30px, 2.5vw, 50px), 5vh) * ${rate})`
})
const lyricFontWeight = computed(() => settingsStore.settings.lyricFontWeight || 600)

const lyricFontFamily = computed(
  () => settingsStore.settings.lyricFontFamily || 'PingFangSC-Semibold'
)

const showLeftPanel = computed({
  get: () => playSetting.getShowLeftPanel,
  set: (val) => playSetting.setShowLeftPanel(val)
})

const festivalOverlay = ref<HTMLDivElement | null>(null)
let fwCanvas: HTMLCanvasElement | null = null
let fwCtx: CanvasRenderingContext2D | null = null
let rafId: number | null = null
let loopId: number | null = null
let bursts: any[] = []
let particles: any[] = []
let lastTime = 0
let running = false
const showFestivalEffects = computed(
  () =>
    settingsStore.shouldUseSpringFestivalTheme() && !settingsStore.settings.springFestivalDisabled
)

const rnd = (min: number, max: number) => Math.random() * (max - min) + min
const pick = (arr: any[]) => arr[Math.floor(Math.random() * arr.length)]
const colors = ['#ff3b3b', '#ffd65a', '#ff7a00', '#ff2d55', '#ffe08a', '#fa383e', '#ff9f0a']

const resizeCanvas = () => {
  if (!fwCanvas || !festivalOverlay.value) return
  const rect = festivalOverlay.value.getBoundingClientRect()
  fwCanvas.width = Math.floor(rect.width * window.devicePixelRatio)
  fwCanvas.height = Math.floor(rect.height * window.devicePixelRatio)
}

const addBurst = (x: number, y: number) => {
  const c = pick(colors)
  const count = Math.floor(rnd(40, 80))
  for (let i = 0; i < count; i++) {
    const angle = rnd(0, Math.PI * 2)
    const speed = rnd(2, 6)
    particles.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: rnd(60, 120),
      color: c,
      alpha: 1,
      size: rnd(1, 2.8)
    })
  }
  if (particles.length > 2000) {
    particles.splice(0, particles.length - 2000)
  }
}

const scheduleBursts = (w: number, h: number) => {
  bursts.push({ t: 0, x: rnd(w * 0.15, w * 0.85), y: rnd(h * 0.15, h * 0.5) })
  bursts.push({ t: 400, x: rnd(w * 0.1, w * 0.9), y: rnd(h * 0.2, h * 0.6) })
  bursts.push({ t: 800, x: rnd(w * 0.2, w * 0.8), y: rnd(h * 0.15, h * 0.55) })
  bursts.push({ t: 1200, x: rnd(w * 0.25, w * 0.75), y: rnd(h * 0.1, h * 0.5) })
  bursts.push({ t: 1600, x: rnd(w * 0.2, w * 0.8), y: rnd(h * 0.15, h * 0.6) })
}

const step = (ts: number) => {
  if (!fwCtx || !fwCanvas) return
  const dt = ts - lastTime
  lastTime = ts
  fwCtx.globalCompositeOperation = 'source-over'
  fwCtx.fillStyle = 'rgba(0,0,0,0)'
  fwCtx.clearRect(0, 0, fwCanvas.width, fwCanvas.height)
  const g = 0.05
  const f = 0.985
  fwCtx.globalCompositeOperation = 'lighter'
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]
    p.vx *= f
    p.vy = p.vy * f + g
    p.x += p.vx
    p.y += p.vy
    p.life -= 1
    p.alpha = Math.max(0, p.life / 120)
    fwCtx.beginPath()
    fwCtx.fillStyle = p.color
    fwCtx.globalAlpha = p.alpha
    fwCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2)
    fwCtx.fill()
    if (p.life <= 0) particles.splice(i, 1)
  }
  for (let i = bursts.length - 1; i >= 0; i--) {
    const b = bursts[i]
    b.t -= dt
    if (b.t <= 0) {
      addBurst(b.x, b.y)
      bursts.splice(i, 1)
    }
  }
  if (running) rafId = requestAnimationFrame(step)
}

const startFireworks = () => {
  if (running) return
  if (!festivalOverlay.value) return
  fwCanvas = document.createElement('canvas')
  fwCanvas.style.position = 'absolute'
  fwCanvas.style.top = '0'
  fwCanvas.style.left = '0'
  fwCanvas.style.width = '100%'
  fwCanvas.style.height = '100%'
  fwCanvas.style.zIndex = '0'
  fwCanvas.style.pointerEvents = 'none'
  festivalOverlay.value.appendChild(fwCanvas)
  fwCtx = fwCanvas.getContext('2d')
  resizeCanvas()
  particles = []
  bursts = []
  const w = fwCanvas.width
  const h = fwCanvas.height
  scheduleBursts(w, h)
  scheduleBursts(w, h)
  lastTime = performance.now()
  running = true
  rafId = requestAnimationFrame(step)
  loopId = window.setInterval(() => {
    if (!running || !fwCanvas) return
    const cw = fwCanvas.width
    const ch = fwCanvas.height
    scheduleBursts(cw, ch)
  }, 2200)
  window.setTimeout(() => stopFireworks(), 14000)
}

const stopFireworks = () => {
  running = false
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  if (loopId) {
    clearInterval(loopId)
    loopId = null
  }
  particles = []
  bursts = []
  if (fwCanvas && festivalOverlay.value) {
    festivalOverlay.value.removeChild(fwCanvas)
  }
  fwCanvas = null
  fwCtx = null
}

onMounted(() => {
  window.addEventListener('resize', resizeCanvas)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  stopFireworks()
})
interface Props {
  show?: boolean
  showComments?: boolean
  /** 一起听浮层是否可见 —— 与 store.overlayVisible 双向绑定 */
  showListenTogether?: boolean
  coverImage?: string
  songId?: string | null
  songInfo: SongList | { songmid: number | null | string; lrc: string | null }
  mainColor: string
  disableAutoHide?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  showComments: false,
  showListenTogether: false,
  coverImage: '@assets/images/Default.jpg',
  songId: '',
  mainColor: '#rgb(0,0,0)',
  disableAutoHide: false
})
const simulator = useSkinSimulator(computed(() => props.show))
provide(skinSimulatorKey, simulator)
provide(regionTrackIdentity, computed(() => simulator.active.value ? 'simulator:' + simulator.sample.value : playbackIdentity(player.value.songInfo)))
// 定义事件
const emit = defineEmits([
  'toggle-fullscreen',
  'idle-change',
  'update:showComments',
  'update:showListenTogether'
])

// 跟踪全屏状态
const isFullscreen = ref(false)

// 动画状态
const isAnimating = ref(false)
let animatingTimer: any = null

// 自动隐藏相关逻辑
const isIdle = ref(false)
const isHide = ref(false)
let idleTimer: any = null

const resetIdleTimer = () => {
  // 如果当前为隐藏模式，则不自动清除
  if (isHide.value) return

  if (!playSetting.getAutoHideBottom) {
    isIdle.value = false
    emit('idle-change', false)
    return
  }

  // 外部要求禁用自动隐藏（例如更多菜单打开时）
  if (props.disableAutoHide) {
    if (idleTimer) clearTimeout(idleTimer)
    if (isIdle.value) {
      isIdle.value = false
      emit('idle-change', false)
    }
    return
  }

  // 恢复显示时
  if (isIdle.value) {
    isIdle.value = false
    emit('idle-change', false)
  }

  if (idleTimer) clearTimeout(idleTimer)

  if (props.show) {
    idleTimer = setTimeout(() => {
      if (
        props.show &&
        playSetting.getAutoHideBottom &&
        !showSettings.value &&
        !props.disableAutoHide
      ) {
        isIdle.value = true
        emit('idle-change', true)
      }
    }, 3000)
  }
}

watch(
  () => [props.show, showFestivalEffects.value],
  (vals) => {
    const visible = vals[0]
    const seasonal = vals[1]
    if (visible && seasonal && !running) startFireworks()
    if ((!visible || !seasonal) && running) stopFireworks()
  },
  { immediate: true }
)

const handleKeyDown = (e: { key: string; preventDefault: () => void }) => {
  if (e.key === 'F1') {
    e.preventDefault()
    // 切换隐藏状态
    isHide.value = !isHide.value
    // 隐藏界面
    isIdle.value = isHide.value
    emit('idle-change', isHide.value)
  }
}

watch(
  () => props.show,
  (val) => {
    // 触发动画状态
    isAnimating.value = true
    if (animatingTimer) clearTimeout(animatingTimer)
    animatingTimer = setTimeout(() => {
      isAnimating.value = false
    }, 350)

    if (val) {
      resetIdleTimer()
      window.addEventListener('mousemove', resetIdleTimer)
    } else {
      window.removeEventListener('mousemove', resetIdleTimer)
      if (idleTimer) clearTimeout(idleTimer)
      isIdle.value = false
      emit('idle-change', false)
    }
  },
  { immediate: true }
)

watch(
  () => playSetting.getAutoHideBottom,
  (val) => {
    if (!val) {
      if (idleTimer) clearTimeout(idleTimer)
      isIdle.value = false
      emit('idle-change', false)
    } else {
      resetIdleTimer()
    }
  }
)

watch(
  () => showSettings.value,
  (val) => {
    if (val) {
      // 打开设置时，取消自动隐藏
      if (idleTimer) clearTimeout(idleTimer)
      isIdle.value = false
      emit('idle-change', false)
    } else {
      resetIdleTimer()
    }
  }
)

watch(
  () => props.disableAutoHide,
  (val) => {
    if (val) {
      if (idleTimer) clearTimeout(idleTimer)
      if (isIdle.value) {
        isIdle.value = false
        emit('idle-change', false)
      }
    } else {
      resetIdleTimer()
    }
  }
)

// 切换全屏模式
const toggleFullscreen = () => {
  // 状态由主进程的 onFullscreenChanged 事件回写，避免双重 toggle
  desktopBridge.api.toggleFullscreen()
}

// 监听原生全屏状态变化（来自主进程）
let unsubscribeFullscreen: (() => void) | null = null
onMounted(async () => {
  unsubscribeFullscreen = desktopBridge.api.onFullscreenChanged((value: boolean) => {
    isFullscreen.value = value
  })
})

// removed redundant onBeforeUnmount

// 获取音频控制状态
const controlAudio = ControlAudioStore()
const { Audio } = storeToRefs(controlAudio)

// 响应式播放状态
const isAudioPlaying = ref(false)

// 更新播放状态的函数
const updatePlayState = () => {
  if (Audio.value.audio) {
    isAudioPlaying.value = !Audio.value.audio.paused
  } else {
    isAudioPlaying.value = false
  }
}

// 监听音频播放状态变化
watch(
  () => Audio.value.audio,
  (newAudio, oldAudio) => {
    // 移除旧音频的事件监听器
    if (oldAudio) {
      oldAudio.removeEventListener('play', updatePlayState)
      oldAudio.removeEventListener('pause', updatePlayState)
    }

    // 添加新音频的事件监听器
    if (newAudio) {
      newAudio.addEventListener('play', updatePlayState)
      newAudio.addEventListener('pause', updatePlayState)
      // 初始化状态
      updatePlayState()
    }
  },
  { immediate: true }
)

// removed redundant onBeforeUnmount
// 组件内部状态
const state = reactive({
  audioUrl: Audio.value.url,
  albumUrl: props.coverImage,
  albumIsVideo: false,
  currentTime: Math.round((Number(Audio.value.currentTime) || 0) * 1000),
  lowFreqVolume: 0
})

const lyricPlayerRef = ref<LyricPlayerRef | undefined>(undefined)
const backgroundContainer = ref<HTMLDivElement | null>(null)

/**
 * 当前曲目歌词偏移(ms)。正值=歌词向"前"挪(更早出现);负值=向"后"挪。
 * effectiveLyricTime = state.currentTime + offset
 * (offset 通过 PlayMusic.vue 更多菜单 -> 歌词偏移 调节)
 *
 * 直接读 store.offsetMap (而不是调 store.getOffset(...)) —— Pinia setup-style store
 * 的 ref 字段被 computed 直接访问时,响应式追踪最可靠;函数调用偶尔会因 effect scope
 * 边界丢失订阅,导致切歌或刷新后看不到更新。
 *
 * map 的 value 现在是 `{ value, updatedAt }` 结构(为了 LRU/TTL),
 * 这里兼容旧的裸 number(冷启动从 localStorage 读到的历史数据)。
 */
const currentLyricOffset = computed(() => {
  const mid = (player.value.songInfo as any)?.songmid
  if (mid === null || mid === undefined || mid === '') return 0
  const raw = (lyricExtrasStore.offsetMap as Record<string, any>)[String(mid)]
  if (raw === undefined || raw === null) return 0
  if (typeof raw === 'number') return raw || 0
  return (raw.value as number) || 0
})
const effectiveLyricTime = computed(
  () => (Number(state.currentTime) || 0) + currentLyricOffset.value
)
provide(regionClock, { currentTime: effectiveLyricTime, playing: computed(() => isAudioPlaying.value) })

let lyricSyncFrame: number | undefined
let lyricAutoResumeTimer: ReturnType<typeof setTimeout> | undefined

const cancelLyricSync = () => {
  if (lyricSyncFrame !== undefined) {
    cancelAnimationFrame(lyricSyncFrame)
    lyricSyncFrame = undefined
  }
}

const cancelLyricAutoResume = () => {
  if (lyricAutoResumeTimer !== undefined) {
    clearTimeout(lyricAutoResumeTimer)
    lyricAutoResumeTimer = undefined
  }
}

// PlayMusic is cached by KeepAlive while navigating to settings. Wait until
// FullPlay has been reinserted and laid out before asking either renderer to
// reposition itself, otherwise AMLL can calculate against a zero-sized view.
const syncLyricPosition = (rebuildView = false) => {
  const elementTime = Number(Audio.value.audio?.currentTime)
  const storeTime = Number(Audio.value.currentTime)
  const currentTimeSeconds = Number.isFinite(elementTime)
    ? elementTime
    : Number.isFinite(storeTime)
      ? storeTime
      : 0
  state.currentTime = Math.max(0, Math.round(currentTimeSeconds * 1000))

  void nextTick(() => {
    cancelLyricSync()
    lyricSyncFrame = requestAnimationFrame(() => {
      lyricSyncFrame = undefined
      const ref = lyricPlayerRef.value as any
      const amllPlayer = ref?.lyricPlayer
      if (amllPlayer) {
        if (rebuildView && typeof amllPlayer.rebuildLyricView === 'function') {
          amllPlayer.rebuildLyricView(effectiveLyricTime.value)
        } else {
          amllPlayer.resetScroll?.()
          amllPlayer.setCurrentTime?.(effectiveLyricTime.value, true)
        }
      }
      ref?.refresh?.()
    })
  })
}

const scheduleLyricAutoResume = () => {
  cancelLyricAutoResume()
  // AMLL 自己管理滚动与回正，保留自定义渲染器的回正定时器即可。
  if (playSetting.getUseAmlLyricRenderer) return
  lyricAutoResumeTimer = setTimeout(() => {
    lyricAutoResumeTimer = undefined
    syncLyricPosition()
  }, 3000)
}

onActivated(() => syncLyricPosition(true))
onDeactivated(() => {
  cancelLyricSync()
  cancelLyricAutoResume()
})

watch(
  () => props.show,
  (visible) => {
    if (visible) syncLyricPosition(true)
    else {
      cancelLyricSync()
      cancelLyricAutoResume()
    }
  },
  { immediate: true }
)

// 订阅音频事件，保持数据同步
const unsubscribeTimeUpdate = ref<(() => void) | undefined>(undefined)
const unsubscribePlay = ref<(() => void) | undefined>(undefined)

// 计算实际的封面图片路径
const actualCoverImage = computed(() => {
  return player.value.cover || props.coverImage || '@assets/images/Default.jpg'
})

const jumpTime = (e) => {
  if (dlnaStore.currentDevice) {
    MessagePlugin.warning('投屏模式下不支持拖拽进度')
    return
  }
  if (Audio.value.audio) void seekTo(e.line.getLine().startTime / 1000).catch(console.warn)
}
// 窗口后台（最小化 / 隐藏到托盘 / 页面不可见）时暂停高开销动画与渲染。
// 注意：隐藏到托盘时 document.hidden 不会变化，状态以主进程推送为准。
const { isAppBackground } = useAppBackground()
const isAppActive = computed(() => !isAppBackground.value)
// [诊断] 后台状态变化回声（排查托盘降载用，定位后可移除）
watch(isAppActive, (active) => {
  try {
    ;(desktopBridge as any)?.electron?.ipcRenderer?.send?.('app-window-background-ack', {
      source: 'fullplay',
      isAppActive: active
    })
  } catch {}
})
const { ready: bgInitialized } = usePlayerBackground(backgroundContainer, {
  renderer: () => playSetting.getBackgroundRenderer,
  album: () => actualCoverImage.value,
  active: () => props.show && isAppActive.value,
  lowFreqVolume: () => (playSetting.getIsBackgroundBeat ? state.lowFreqVolume : 0),
  hasLyric: () => player.value.lyrics.lines.length > 0
})

// 在全屏播放显示时阻止系统息屏
const blockerActive = ref(false)
watch(
  () => props.show,
  async (visible) => {
    try {
      if (visible && !blockerActive.value) {
        await (desktopBridge as any)?.api?.powerSaveBlocker?.start?.()
        blockerActive.value = true
      } else if (!visible && blockerActive.value) {
        await (desktopBridge as any)?.api?.powerSaveBlocker?.stop?.()
        blockerActive.value = false
      }
    } catch (e) {
      console.error('powerSaveBlocker 切换失败:', e)
    }
  },
  { immediate: true }
)

// 组件卸载前清理订阅
onBeforeUnmount(async () => {
  cancelLyricSync()
  cancelLyricAutoResume()
  // 移除事件监听器
  unsubscribeFullscreen?.()
  unsubscribeFullscreen = null
  window.removeEventListener('mousemove', resetIdleTimer)
  window.removeEventListener('resize', debouncedCheckOverflow)
  document.removeEventListener('click', handleClickOutside)

  if (idleTimer) clearTimeout(idleTimer)
  if (animatingTimer) clearTimeout(animatingTimer)

  // 组件卸载时确保恢复系统息屏
  if (blockerActive.value) {
    try {
      await (desktopBridge as any)?.api?.powerSaveBlocker?.stop?.()
    } catch {}
    blockerActive.value = false
  }
  // 取消订阅以防止内存泄漏
  if (unsubscribeTimeUpdate.value) {
    unsubscribeTimeUpdate.value()
  }
  if (unsubscribePlay.value) {
    unsubscribePlay.value()
  }
  if (Audio.value.audio) {
    Audio.value.audio.removeEventListener('play', updatePlayState)
    Audio.value.audio.removeEventListener('pause', updatePlayState)
  }
  // 清理歌词播放器资源
  lyricPlayerRef.value?.lyricPlayer?.dispose()
})

// 监听音频URL变化
watch(
  () => Audio.value.url,
  (newUrl) => {
    state.audioUrl = newUrl
  }
)

// 监听当前播放时间变化
watch(
  () => Audio.value.currentTime,
  (newTime) => {
    state.currentTime = Math.round(newTime * 1000)
  },
  { immediate: true }
)

const isTitaniumBackground = computed(() => playSetting.getBackgroundRenderer === 'titanium')

// 流沙背景明暗独立于封面，文字和图标统一使用白色。
const lightMainColor = computed(() => {
  if (isTitaniumBackground.value) return '#fff'
  return player.value.coverDetail.lightMainColor || 'rgba(255, 255, 255, 0.9)'
})

const useBlackText = computed(() => {
  return !isTitaniumBackground.value && player.value.coverDetail.useBlackText
})

// 由封面取色生成的纯色渐变背景，可控且色块干净，避免封面原图杂色
const bgGradient = computed(() => {
  const c = player.value.coverDetail.ColorObject
  if (!c) {
    return 'linear-gradient(135deg, #2a2a2e 0%, #1a1a1d 100%)'
  }
  const main = `rgb(${c.r}, ${c.g}, ${c.b})`
  const dark = `rgb(${Math.round(c.r * 0.35)}, ${Math.round(c.g * 0.35)}, ${Math.round(c.b * 0.35)})`
  const deep = `rgb(${Math.round(c.r * 0.18)}, ${Math.round(c.g * 0.18)}, ${Math.round(c.b * 0.18)})`
  const accent = player.value.coverDetail.lightMainColor || main
  return [
    `radial-gradient(ellipse 60% 50% at 25% 20%, ${accent} 0%, transparent 55%)`,
    `radial-gradient(ellipse 70% 60% at 80% 75%, ${main} 0%, transparent 60%)`,
    `linear-gradient(135deg, ${dark} 0%, ${deep} 100%)`
  ].join(', ')
})

// 双层渐变交替：bgGradient 变化时把"上一帧"放到 prev 层，让 current 层从 0 淡入，
// 实现切歌时背景平滑过渡（background-image 本身不支持 transition）。
const bgLayerA = ref('')
const bgLayerB = ref('')
const activeLayer = ref<'A' | 'B'>('A')
watch(
  bgGradient,
  (next) => {
    if (activeLayer.value === 'A') {
      bgLayerB.value = next
      activeLayer.value = 'B'
    } else {
      bgLayerA.value = next
      activeLayer.value = 'A'
    }
  },
  { immediate: true }
)

// 计算歌词颜色
const lyricViewColor = computed(() => {
  return playSetting.getIsImmersiveLyricColor ? lightMainColor.value : 'rgba(255, 255, 255, 1)'
})

// const lyricHeight = computed(() => {
//   return playSetting.getisJumpLyric ? '100%' : '200%'
// })
// const lyricTranslateY = computed(() => {
//   return playSetting.getisJumpLyric ? '0' : '-25%'
// })

// --- 滚动文字逻辑 Start ---
const titleRef = ref<HTMLElement | null>(null)
const shouldScrollTitle = ref(false)
const titleContentRef = ref<HTMLElement | null>(null)

const songName = computed(() => {
  const info = player.value.songInfo
  if (info && 'name' in info && typeof info.name === 'string') {
    return info.name
  }
  return '未知歌曲'
})

const checkOverflow = async () => {
  await nextTick()

  // 检查标题
  if (titleRef.value && titleContentRef.value) {
    // 比较内容宽度（scrollWidth）和容器宽度（clientWidth）
    // 为了准确测量，暂时移除滚动相关的类可能会更准，但这里我们主要看 content 的自然宽度
    const containerWidth = titleRef.value.clientWidth
    const contentWidth = titleContentRef.value.offsetWidth
    shouldScrollTitle.value = contentWidth > containerWidth
  }
}

// 监听歌曲信息变化和窗口大小变化
watch(() => [props.songInfo, props.show], checkOverflow, { immediate: true })

// 点击外部关闭设置面板
const floatActionRef = ref<HTMLElement | null>(null)
const skinButton = ref<HTMLButtonElement | null>(null)
function closeSettings() {
  showSettings.value = false
  skinButton.value?.focus({ preventScroll: true })
}
const handleClickOutside = (event: MouseEvent) => {
  if (
    showSettings.value &&
    floatActionRef.value &&
    !event.composedPath().includes(floatActionRef.value)
  ) {
    showSettings.value = false
  }
}

// --- 后台暂停动画逻辑 Start ---

useBackgroundBeat(
  () => Audio.value.audio,
  () => playSetting.getIsBackgroundBeat && props.show && Audio.value.isPlay && isAppActive.value,
  (volume) => {
    state.lowFreqVolume = volume
  }
)

// --- 后台暂停动画逻辑 End ---

// 保存 debounce 函数引用以便后续移除
const debouncedCheckOverflow = _.debounce(checkOverflow, 200)

onMounted(() => {
  window.addEventListener('resize', debouncedCheckOverflow)
  document.addEventListener('click', handleClickOutside, true)
  window.addEventListener('keydown', handleKeyDown)
  // 初始检查
  setTimeout(checkOverflow, 500)
})

onUnmounted(() => {
  window.removeEventListener('resize', debouncedCheckOverflow)
  document.removeEventListener('click', handleClickOutside, true)
  window.removeEventListener('keydown', handleKeyDown)
})
// removed redundant onBeforeUnmount
// --- 滚动文字逻辑 End ---
const skinCover = ref<string | null>(null)
watch(() => {
  if (!props.show || simulator.active.value || !actualCoverImage.value?.startsWith('ceru-cover://')) return null
  return (['player.stage', 'player.artwork', 'player.background', 'player.visualizer', 'player.songInfo'] as const)
    .some(name => regionView(name)) ? actualCoverImage.value : null
}, async (source, _previous, clean) => {
  skinCover.value = null
  if (!source) return
  const image = new Image()
  let active = true
  clean(() => { active = false; image.removeAttribute('src') })
  image.crossOrigin = 'anonymous'
  image.src = source
  try {
    await image.decode()
    if (!active) return
    const scale = Math.min(1, 512 / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) return
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    skinCover.value = canvas.toDataURL('image/webp', 0.85)
  } catch { /* The selected skin can render its normal no-cover state. */ }
}, { immediate: true })
const regionContent = computed(() => {
  if (simulator.active.value) return { track: simulator.track.value, durationMs: simulator.durationMs, artwork: null, layout: playSetting.getLayoutMode, palette: simulator.palette.value }
  const artwork = actualCoverImage.value?.startsWith('ceru-cover://') ? skinCover.value : actualCoverImage.value
  const song = player.value.songInfo
  const durationMs = Number.isFinite(Audio.value.duration) ? Math.round(Audio.value.duration * 1000) : undefined
  return { track: { title:songName.value, artists:[String(song?.singer ?? '')].filter(Boolean), album:String(song?.albumName ?? ''), durationMs }, durationMs,
    artwork: typeof artwork === 'string' && /^data:image\/(png|jpeg|webp);base64,/i.test(artwork) && artwork.length < 2_000_000 ? artwork : null,
    layout:playSetting.getLayoutMode, palette:{ accent: props.mainColor, foreground:useBlackText.value ? '#222' : '#fff', background:useBlackText.value ? '#f4f4f4' : '#242424' } }
})
const stageSelected = computed(() => props.show && !!regionView('player.stage'))
const warnings = computed(() => regionNotices.value.filter(item => item.reason === 'warning'))
const partsVisible = computed(() => props.show && !stageSelected.value)
const lyricSongwriters = computed(() =>
  playSetting.getIsGrepLyricInfo ? [] : getLyricSongwriters(player.value.lyrics.crlyric)
)
const displayedLyricLines = computed(() => {
  const lines = toRaw(player.value.lyrics.lines)
  if (playSetting.getShowLyricRomanization) return lines
  return lines.map((line) => ({
    ...line,
    romanLyric: '',
    words: line.words.map((word) => ({ ...word, romanWord: '' }))
  }))
})
const lyricRegionContent = computed(() => !props.show || (!stageSelected.value && !regionView('player.lyrics')) ? {} : ({
  track:regionContent.value.track, layout: regionContent.value.layout, palette:regionContent.value.palette,
  forward:{alignPosition:playSetting.getLayoutMode === 'cd' && playSetting.getShowLeftPanel ? 0.5 : 0.34,
    enableBlur:playSetting.getIsBlurLyric,enableSpring:playSetting.getisJumpLyric,enableScale:playSetting.getisJumpLyric},
  lines:simulator.active.value ? simulator.fixture.value.lines : displayedLyricLines.value.map(line => ({startTimeMs:line.startTime, endTimeMs:line.endTime, text:line.words.map(word => word.word).join(''),
    translation:line.translatedLyric, romanization:line.romanLyric, isBackground:line.isBG, isDuet:line.isDuet,
    words:line.words.map(word => ({text:word.word, startTimeMs:word.startTime, endTimeMs:word.endTime, romanization:word.romanWord}))}))
}))
const stageContent = computed(() => stageSelected.value ? {...regionContent.value,...lyricRegionContent.value} : {})
</script>

<template>
  <div
    class="full-play"
    :class="{
      active: props.show,
      'use-black-text': useBlackText,
      idle: isIdle && !stageSelected,
      animating: isAnimating
    }"
  >
    <PluginRegion name="player.stage" :visible="props.show" :content="stageContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" :audio="Audio.audio" surface-class="plugin-stage">
    <!-- 兜底渐变背景：双层交替淡入，由封面取色生成；切歌时颜色平滑过渡 -->
    <PluginRegion name="player.background" :visible="partsVisible" :content="regionContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" :audio="Audio.audio" surface-class="plugin-background">
    <div
      class="bg-fallback bg-fallback-a"
      :class="{ active: activeLayer === 'A' }"
      :style="{ backgroundImage: bgLayerA }"
    ></div>
    <div
      class="bg-fallback bg-fallback-b"
      :class="{ active: activeLayer === 'B' }"
      :style="{ backgroundImage: bgLayerB }"
    ></div>
    <!-- 动态背景层：未进入全屏时不创建实例；隐藏时 pause -->
    <div
      ref="backgroundContainer"
      class="bg-render"
      :class="{
        'bg-render-active': props.show && bgInitialized,
        'bg-render-mesh': playSetting.getBackgroundRenderer === 'mesh'
      }"
    ></div>
    <div v-if="showFestivalEffects" ref="festivalOverlay" class="festival-overlay"></div>
    </PluginRegion>
    <div
      class="playbox"
      :style="{
        padding:
          playSetting.getLayoutMode === 'cover' || !playSetting.getShowLeftPanel
            ? '0 min(4.5vw, 100px)'
            : '0 10vw'
      }"
      :class="{
        'mode-cover': playSetting.getLayoutMode === 'cover',
        'single-column': !showLeftPanel
      }"
    >
      <div class="left" :class="{ 'no-lyric': player.lyrics.lines.length <= 0 && !regionView('player.lyrics') }">
        <template v-if="playSetting.getLayoutMode === 'cd'">
          <PluginRegion name="player.artwork" :visible="partsVisible" :content="regionContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" surface-class="plugin-artwork">
          <PlayerArtwork mode="vinyl" :artwork="coverImage" :alt="songName" :playing="isAudioPlaying" :class="{ 'no-lyric': player.lyrics.lines.length <= 0 }" />
          </PluginRegion>
          <PluginRegion v-if="regionView('player.songInfo')" name="player.songInfo" :visible="partsVisible" :content="regionContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" surface-class="plugin-song-info" />
        </template>

        <template v-else-if="playSetting.getLayoutMode === 'cover'">
          <div class="cover-layout-container">
            <div class="cover-wrapper-square">
              <PluginRegion name="player.artwork" :visible="partsVisible" :content="regionContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" surface-class="plugin-artwork">
              <PlayerArtwork mode="square" :artwork="actualCoverImage" :alt="songName" :playing="controlAudio.Audio.isPlay" />
              </PluginRegion>
            </div>
            <div class="song-info-area">
              <PluginRegion name="player.songInfo" :visible="partsVisible" :content="regionContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" surface-class="plugin-song-info">
              <div ref="titleRef" class="song-title-large text-scroll-container">
                <div class="text-scroll-wrapper" :class="{ 'animate-scroll': shouldScrollTitle }">
                  <div ref="titleContentRef" class="text-scroll-item">
                    {{ songName }}
                  </div>
                  <div v-if="shouldScrollTitle" class="text-scroll-item">
                    {{ songName }}
                  </div>
                </div>
              </div>
              <div class="song-meta-large">
                <span class="artist">{{ (player.songInfo as any)?.singer }}</span>
                <span
                  v-if="(player.songInfo as any)?.singer && (player.songInfo as any)?.albumName"
                  class="divider"
                >
                  /
                </span>
                <span class="album">{{ (player.songInfo as any)?.albumName }}</span>
              </div>
              </PluginRegion>
            </div>
          </div>
        </template>
      </div>
      <div
        v-if="player.lyrics.lines.length > 0 || regionView('player.lyrics')"
        class="right"
        @contextmenu.prevent="lyricExtrasStore.openCopy()"
      >
        <PluginRegion name="player.lyrics" :visible="partsVisible" :content="lyricRegionContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" surface-class="plugin-lyrics">
        <component
          :is="playSetting.getUseAmlLyricRenderer ? LyricPlayer : LyricAdapter"
          ref="lyricPlayerRef"
          :lyric-lines="displayedLyricLines"
          :current-time="effectiveLyricTime"
          :word-fade-width="0.5"
          :playing="isAudioPlaying"
          :disabled="!props.show || !isAppActive"
          class="lyric-player"
          :align-position="
            playSetting.getLayoutMode === 'cd' && playSetting.getShowLeftPanel ? 0.5 : 0.34
          "
          :enable-blur="playSetting.getIsBlurLyric"
          :enable-spring="playSetting.getisJumpLyric"
          :enable-scale="playSetting.getisJumpLyric"
          :text-align="!playSetting.getShowLeftPanel ? 'center' : 'left'"
          :style="playSetting.getShowLeftPanel ? '' : 'text-align: center;'"
          @wheel="scheduleLyricAutoResume"
          @touchend="scheduleLyricAutoResume"
          @line-click="jumpTime"
        >
          <template v-if="lyricSongwriters.length" #bottom-line>
            <div class="lyric-songwriters">{{ '词曲署名：' + lyricSongwriters.join('、') }}</div>
          </template>
        </component>
        </PluginRegion>
      </div>
    </div>
    <!-- 音频可视化组件 -->
    <div
      v-if="partsVisible && playSetting.getIsAudioVisualizer && (coverImage || regionView('player.visualizer'))"
      class="audio-visualizer-container"
      :class="{ idle: isIdle }"
    >
      <PluginRegion name="player.visualizer" :visible="partsVisible" :content="regionContent" :position-ms="effectiveLyricTime" :playing="isAudioPlaying" :audio="Audio.audio" surface-class="plugin-visualizer">
      <AudioVisualizer v-if="coverImage"
        :show="Audio.isPlay && isAppActive"
        :height="70"
        :bar-count="80"
        :color="mainColor"
        continuous
      />
      </PluginRegion>
    </div>
    </PluginRegion>

    <SkinSimulatorBar />
    <button class="fullscreen-btn" :class="{ 'black-text': useBlackText }" aria-label="切换全屏" @click="toggleFullscreen">
      <Fullscreen1Icon v-if="!isFullscreen" class="icon" /><FullscreenExit1Icon v-else class="icon" />
    </button>
    <button class="putawayscreen-btn" :class="{ 'black-text': useBlackText }" aria-label="收起播放器" @click="emit('toggle-fullscreen')">
      <ChevronDownIcon class="icon" />
    </button>
    <Transition name="fade-nav">
      <TitleBarControls v-if="props.show" class="top" style="-webkit-app-region: drag" :color="useBlackText ? 'black' : 'white'" :show-account="false" />
    </Transition>

    <div ref="floatActionRef" class="float-action" :class="{ 'with-float-ball': settingsStore.settings.showFloatBall, idle: isIdle && !showSettings }" @keydown.esc.stop="closeSettings">
      <div v-if="!showSettings && warnings.length" class="health-summary">
        <InfoCircleIcon aria-hidden="true" />
        <span role="status">{{ warnings.length === 1 ? '皮肤显示不够流畅' : `${warnings.length} 个区域显示不够流畅` }}</span>
        <button type="button" @click="showSettings = true; skinButton?.focus()">查看<ChevronRightIcon aria-hidden="true" /></button>
      </div>
      <t-Tooltip content="播放器个性化" placement="left" :disabled="showSettings">
        <button ref="skinButton" type="button" class="skin-btn" aria-label="播放器个性化" :aria-expanded="showSettings" :aria-controls="showSettings ? 'player-personalization' : undefined" @click="showSettings = !showSettings">
          <pen-ball-icon
            :fill-color="'transparent'"
            :stroke-color="'currentColor'"
            :stroke-width="2"
            :style="{ fontSize: '20px' }"
          />
        </button>
      </t-Tooltip>
      <Transition name="personalization-pop">
        <div v-if="showSettings" id="player-personalization" class="settings-panel" role="region" aria-label="播放器个性化">
          <div class="settings-heading"><strong>播放器个性化</strong><button type="button" aria-label="关闭个性化面板" @click="closeSettings"><CloseIcon aria-hidden="true" /></button></div>
          <PlaySettings />
        </div>
      </Transition>
    </div>
    <CommentsOverlay
      :show="props.showComments"
      :main-color="lightMainColor"
      @close="emit('update:showComments', false)"
    />
    <!-- 歌词复制浮层 —— 右键歌词区域 / 更多菜单触发,样式与评论/一起听保持一致 -->
    <LyricCopyOverlay
      :show="lyricExtrasStore.copyOverlayVisible"
      :lyric-lines="(player.lyrics.lines as any) || []"
      :song-title="player.songInfo?.name || ''"
      :artist="player.songInfo?.singer || ''"
      :main-color="lightMainColor"
      @close="lyricExtrasStore.closeCopy()"
    />
    <!-- 一起听浮层 —— 与 CommentsOverlay 平行的浮层，由 store.overlayVisible 控制 -->
    <ListenTogetherOverlay
      :show="props.showListenTogether"
      :main-color="lightMainColor"
      @close="emit('update:showListenTogether', false)"
    />
    <!-- 一起听弹幕层 —— 房间内自动激活,房外什么都不渲染 -->
    <LtDanmakuLayer />
  </div>
</template>

<style lang="scss" scoped>
.full-play :deep(.plugin-stage) { position: absolute; inset: 0 0 var(--play-bottom-height); height: auto; z-index: 0; }
.full-play :deep(.plugin-song-info) { width: 100%; height: 5.5rem; min-width: 0; }
.full-play :deep(.plugin-visualizer) { width: 100%; height: 70px; }
.full-play :deep(.plugin-background) { position: absolute; inset: 0; z-index: -1; pointer-events: none }
.full-play :deep(.plugin-artwork) { width: 100%; aspect-ratio: 1; height: auto }
.full-play :deep(.plugin-lyrics) { width: 100%; height: calc(100vh - var(--play-bottom-height)); min-height: 220px }
.festival-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 0;
  pointer-events: none;
}
.fade-nav-enter-active,
.fade-nav-leave-active {
  transition: all 0.6s cubic-bezier(0.8, 0, 0.8, 0.43);
}

.fade-nav-enter-from,
.fade-nav-leave-to {
  opacity: 0;
}

.fullscreen-btn,
.putawayscreen-btn {
  position: absolute;

  -webkit-app-region: no-drag;
  top: 25px;
  left: 30px;
  padding: 10px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  // border: 1px solid rgba(255, 255, 255, 0.3);
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  color: white;
  font-size: 18px;
  transition: all 0.3s ease;
  // box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);

  &:hover {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(1.05);
  }

  &:active {
    transform: scale(0.95);
  }

  .icon {
    color: rgba(255, 255, 255, 0.6);
    width: 25px;
    height: 25px;
  }

  &.black-text {
    background: rgba(0, 0, 0, 0.1);

    .icon {
      color: rgba(0, 0, 0, 0.6);
    }

    &:hover {
      background: rgba(0, 0, 0, 0.2);
    }
  }
}

.putawayscreen-btn {
  left: 90px;
}

/* 兜底渐变背景：基于封面取色，纯渐变干净可控；双层交替实现切歌平滑过渡 */
.bg-fallback {
  position: absolute;
  inset: 0;
  z-index: -2;
  background-size: cover;
  background-position: center;
  background-repeat: no-repeat;
  opacity: 0;
  transition: opacity 0.8s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  contain: layout style;
  transform: scale(1.08);
  overflow: hidden;
}
.bg-fallback.active {
  opacity: 1;
}
/* 旋转的柔光斑：用主色淡淡转一圈，不可控感被限制在固定范围 */
.bg-fallback.active::after {
  content: '';
  position: absolute;
  inset: -20%;
  background:
    radial-gradient(circle at 30% 30%, rgba(255, 255, 255, 0.18), transparent 35%),
    radial-gradient(circle at 70% 70%, rgba(255, 255, 255, 0.12), transparent 40%);
  mix-blend-mode: overlay;
}

/* FullPlay 显示时才让兜底背景进入 GPU 合成层并跑动画
 * 否则 will-change + 永动 animation 会让独显在背景持续上传/合成,
 * 阻塞同时间发生的封面图 GPU 上传与列表滚动重绘。 */
.full-play.active .bg-fallback {
  will-change: opacity, transform;
}
.full-play.active .bg-fallback.active {
  animation: bg-breath 22s ease-in-out infinite alternate;
}
.full-play.active .bg-fallback.active::after {
  animation: bg-spin 36s linear infinite;
  will-change: transform;
}

@keyframes bg-breath {
  0% {
    transform: scale(1.06) translate3d(-1%, -1%, 0);
  }
  50% {
    transform: scale(1.12) translate3d(2%, 1%, 0);
  }
  100% {
    transform: scale(1.08) translate3d(-1%, 2%, 0);
  }
}
@keyframes bg-spin {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

.lyric-songwriters {
  padding: 0.6em 0;
  font-size: 0.9rem;
  opacity: 0.7;
  overflow-wrap: anywhere;
}

/* 动态背景层：仅全屏激活后淡入显示 */
.bg-render {
  position: absolute;
  inset: 0;
  z-index: -1;
  opacity: 0;
  transition: opacity 0.45s cubic-bezier(0.4, 0, 0.2, 1);
  pointer-events: none;
  contain: strict;
  will-change: opacity;
}
// Mesh 额外柔化封面色块；其他渲染器保持原有的画面效果。
.bg-render-mesh {
  --background-blur: clamp(24px, 3vw, 48px);
  inset: calc(var(--background-blur) * -3);
  filter: blur(var(--background-blur));
}
.bg-render-active {
  opacity: 1;
}

.full-play {
  --height: calc(100vh - var(--play-bottom-height));
  --text-color: rgba(255, 255, 255, 0.9);
  z-index: 120;
  position: fixed;
  // transition: top 0.28s cubic-bezier(0.8, 0, 0.8, 0.43);
  top: var(--height);
  left: 0;
  right: -1px;
  width: auto;
  height: calc(100% + 1px);
  color: var(--text-color);
  overflow: clip;
  container-type: size;

  &.animating {
    transition: top 0.28s cubic-bezier(0.8, 0, 0.8, 0.43);
  }

  &.use-black-text {
    --text-color: rgba(255, 255, 255, 0.9);
  }

  &.active {
    top: 0;
  }

  &.idle {
    .playbox {
      cursor: none;
      .left,
      .right {
        margin-bottom: 0;
      }
      .right {
        :deep(.lyric-player) {
          height: 100vh;
        }
      }
    }

    .fullscreen-btn,
    .putawayscreen-btn,
    .top {
      opacity: 0;
      pointer-events: none;
      transform: translateY(-100%);
    }
  }

  .top {
    position: absolute;
    top: 0;
    width: calc(100% - 200px);
    z-index: 1;
    right: 0;
    padding: 30px 30px;
    padding-bottom: 10px;
    transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .playbox {
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.256);
    -webkit-drop-filter: blur(80px);
    padding: 0 10vw;
    -webkit-drop-filter: blur(80px);
    display: flex;
    position: relative;
    --cd-size: var(--cd-width-auto);
    --cd-width-auto: max(200px, min(30vw, 700px, calc(100vh - var(--play-bottom-height) - 250px)));

    .left {
      width: 40%;
      // max-width: 600px;
      transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      opacity: 1;
      transform: translateX(0);

      // 无歌词时右侧不渲染，左侧占满整行
      &.no-lyric {
        width: 100%;
      }
    }

    .right {
      width: 60%;
      transition: width 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    }

    .left {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 0 var(--play-bottom-height) 0;
      perspective: 1000px;

      .vinyl-artwork { --record-margin: 0; }
      .vinyl-artwork.no-lyric { --cd-size: 50vh; }
      .vinyl-artwork :deep(.pointer) {
        width: calc(var(--cd-width-auto) / 3.5);
        left: calc(50% - 1.8vh);
        top: calc(50% - var(--cd-width-auto) / 2 - var(--cd-width-auto) / 3.5 - 1vh);
        bottom: auto;
        transform-origin: 1.8vh 1.8vh;
      }
    }

    .right {
      mask: linear-gradient(
        rgba(255, 255, 255, 0) 0px,
        rgba(255, 255, 255, 0.6) 5%,
        rgb(255, 255, 255) 15%,
        rgb(255, 255, 255) 75%,
        rgba(255, 255, 255, 0.6) 85%,
        rgba(255, 255, 255, 0)
      );

      :deep(.lyric-player) {
        height: calc(100vh - var(--play-bottom-height));
        transform: translateY(-80px);
        --amll-lyric-view-color: v-bind(lyricViewColor);
        --amll-lp-color: v-bind(lyricViewColor);
        --amll-lyric-player-font-size: v-bind(lyricFontSize);
        --amll-lp-font-size: v-bind(lyricFontSize);
        --amll-lyric-player-font-weight: v-bind(lyricFontWeight);
        --amll-lp-bg-line-scale: 0.7;
        font-family: v-bind(lyricFontFamily);

        [class*='romanWord'] {
          font-size: calc(var(--amll-lp-font-size) * 0.5);
          font-family: v-bind(lyricFontFamily) !important;
          opacity: 0.8;
        }

        [class*='lyricSubLine'] {
          font-weight: v-bind(lyricFontWeight) !important;
        }

        [class^='_interludeDots'] {
          // left: 1.2em;
          padding: auto;
          height: calc(var(--amll-lyric-player-font-size) + 1em);
          justify-content: center;
          align-items: center;
        }
        // & > div {
        //   padding-bottom: 0;
        //   overflow: hidden;
        //   transform: translateY(-20px);
        // }
      }

      padding: 0 20px;

      margin: 80px 0 calc(var(--play-bottom-height)) 0;
      overflow: hidden;
    }

    &.mode-cover {
      .left {
        width: 35%;
        padding: 0 3vw;
        display: flex;
        flex-direction: column;
        justify-content: center;
        align-items: flex-start;

        // 无歌词时右侧不渲染，左侧占满整行并居中
        &.no-lyric {
          width: 100%;
          align-items: center;
        }
      }
      .right {
        padding-left: 3vw;
        width: 65%;
      }
    }

    &.single-column {
      .left {
        width: 0 !important;
        padding: 0 !important;
        margin: 0 !important;
        opacity: 0;
        transform: translateX(-100px);
        pointer-events: none;
      }

      .right {
        width: 100%;
        padding: 0 10vw;
        display: flex;
        justify-content: center;

        :deep(.lyric-player) {
          width: 100%;
          max-width: 1000px;
          margin: 0 auto;
        }
      }
    }

    .cover-layout-container {
      width: 100%;
      height: calc(100vh - var(--play-bottom-height) - 40px);
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 40px;
      margin-top: calc(var(--play-bottom-height) / 2);

      .cover-wrapper-square {
        width: 100%;
        // 由可用宽度与「扣除歌名区后的可用高度」共同约束，居中放大但不溢出
        max-width: min(100%, calc(100vh - var(--play-bottom-height) - 200px));
        max-height: 100%;
        aspect-ratio: 1/1;
        flex-shrink: 1;
        min-height: 0;
        margin: 0 auto;
      }

      .song-info-area {
        width: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;

        .song-title-large {
          font-size: min(3vw, 42px);
          font-weight: 800;
          color: rgba(255, 255, 255, 0.95);
          line-height: 1.2;
          letter-spacing: -0.5px;
          /* display: -webkit-box; */
          /* -webkit-line-clamp: 2; */
          /* -webkit-box-orient: vertical; */
          /* overflow: hidden; */
          text-shadow: 0 2px 10px rgba(0, 0, 0, 0.3);

          &.text-scroll-container {
            overflow: hidden;
            white-space: nowrap;
            position: relative;
            width: 100%;
          }

          .text-scroll-wrapper {
            display: inline-flex;
            &.animate-scroll {
              animation: scroll 15s linear infinite;
            }
          }

          .text-scroll-item {
            font-weight: 800;
            flex-shrink: 0;
            padding-right: 2rem;
            display: inline-block;
          }
        }

        .song-meta-large {
          font-size: min(1.5vw, 20px);
          color: rgba(255, 255, 255, 0.6);
          font-weight: 600;
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
          opacity: 0.55;
          .artist {
            color: v-bind(lightMainColor);
            filter: brightness(1.2);
          }

          .divider {
            opacity: 0.4;
          }
        }

        .song-extra-info {
          margin-top: 8px;
        }
      }
    }
  }

  @keyframes scroll {
    0% {
      transform: translateX(0);
    }
    25% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(-50%);
    }
  }

  .audio-visualizer-container {
    position: absolute;
    bottom: calc(var(--play-bottom-height) - 10px);
    z-index: 9999;
    left: 0;
    right: 0;
    height: 60px;
    // background: linear-gradient(to top, rgba(0, 0, 0, 0.3), transparent);
    filter: blur(6px);
    // max-width: 1000px;
    // -webkit-backdrop-filter: blur(10px);
    // border-top: 1px solid rgba(255, 255, 255, 0.1);
    z-index: 5;
    // padding: 0 20px;
    display: flex;
    align-items: center;
    transition: bottom 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
    &.idle {
      bottom: 0 !important;
    }
  }
}

.float-action {
  --tool-inset: 20px;
  --tool-bottom: calc(var(--play-bottom-height) + 60px);
  --skin-tint: v-bind(lightMainColor);
  position: absolute;
  z-index: 6;
  right: var(--tool-inset);
  bottom: var(--tool-bottom);
  width: 50px;
  height: 50px;
  color: #f7f8fa;
  transition: opacity 180ms ease;

  &.idle:not(:has(:focus-visible)) { opacity: 0; pointer-events: none; }
  &.with-float-ball { --tool-inset: 60px; }
  button:focus-visible { outline: 2px solid #c4e8dc; outline-offset: 3px; }
}
.skin-btn {
  width: 100%; height: 100%; padding: 0; display: grid; place-items: center;
  border-radius: 50%; border: 1px solid rgb(255 255 255 / 63%);
  color: rgb(255 255 255 / 90%); background: rgb(255 255 255 / 15%); cursor: pointer;
  backdrop-filter: blur(20px);
  transition: background-color 220ms ease, box-shadow 280ms ease, transform 240ms ease;
  &:hover, &[aria-expanded='true'] {
    background: rgb(255 255 255 / 25%);
    box-shadow: 0 8px 28px rgb(0 0 0 / 15%), 0 0 20px color-mix(in srgb, var(--skin-tint) 36%, transparent);
  }
  &:active { transform: scale(.92); }
}
.settings-panel, .health-summary {
  position: absolute;
  right: 0; bottom: calc(100% + 20px);
  box-sizing: border-box; color: #fff; background: rgb(30 30 30 / 36%);
  backdrop-filter: blur(6px);
  box-shadow: 0 20px 50px rgb(0 0 0 / 40%), 0 0 0 1px rgb(255 255 255 / 10%);
  transform-origin: bottom right;
}
.settings-panel {
  display: flex; flex-direction: column;
  width: min(380px, calc(100cqw - var(--tool-inset) - 16px));
  max-height: calc(100cqh - var(--tool-bottom) - 104px);
  border-radius: 24px; overflow: hidden; color-scheme: dark;
}
.settings-heading {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 2px;
  strong { font-size: 18px; font-weight: 600; }
  button { display: grid; place-items: center; width: 30px; height: 30px; border: 0; border-radius: 6px; background: transparent; color: inherit; cursor: pointer; }
  button:hover { background: rgb(255 255 255 / 10%); }
}
.health-summary {
  display: flex; align-items: center; gap: 8px;
  width: max-content; max-width: calc(100vw - var(--tool-inset) - 16px);
  border-radius: 8px; padding: 4px 6px 4px 10px; font-size: 12px; line-height: 1.5;
  > .t-icon { color: #f2c77e; flex: none; }
  button { display: inline-flex; align-items: center; gap: 2px; flex: none; min-height: 28px; padding-inline: 5px; border: 0; border-radius: 4px; color: #bcdfd3; background: transparent; font: inherit; cursor: pointer; }
  button:hover { background: rgb(255 255 255 / 8%); }
}
.personalization-pop-enter-active { transition: transform 340ms cubic-bezier(.34, 1.56, .64, 1), opacity 230ms ease-out; }
.personalization-pop-leave-active { transition: transform 220ms ease-in, opacity 200ms ease-in; pointer-events: none; }
.personalization-pop-enter-from, .personalization-pop-leave-to { opacity: 0; transform: translateY(20px) scale(.95); }
@media (prefers-reduced-motion: reduce) {
  .float-action, .skin-btn, .personalization-pop-enter-active, .personalization-pop-leave-active { transition: none; }
  .skin-btn:active { transform: none; }
}

</style>

<style lang="scss">
.full-play {
  /* 强制注入变量到歌词界面 */
  --user-lyric-fw: v-bind(lyricFontWeight) !important;

  .lyric-player {
    /* 暴力覆盖所有包含 Line 字样的类及其下的所有层级 */
    [class*='Line' i] {
      &,
      & *,
      span,
      div {
        font-weight: var(--user-lyric-fw) !important;
      }
    }

    /* 针对 romanWord 存在时可能产生的强调标签 */
    [class*='emphasize' i] {
      font-weight: var(--user-lyric-fw) !important;
    }

    /* 针对注音文字的大小和行高进行微调，防止字重增加后挤在一起 */
    [class*='romanWord' i] {
      font-size: 0.5em !important;
      font-weight: var(--user-lyric-fw) !important;
      line-height: 1 !important;
    }
  }
}
</style>
