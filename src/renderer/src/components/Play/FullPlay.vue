<script lang="ts" setup>
import '@applemusic-like-lyrics/core/style.css'
import {
  BackgroundRender as CoreBackgroundRender,
  PixiRenderer
} from '@applemusic-like-lyrics/core'
import { LyricPlayer, type LyricPlayerRef } from '@applemusic-like-lyrics/vue'
import type { SongList } from '@renderer/types/audio'
import { ref, computed, onMounted, watch, reactive, onBeforeUnmount, nextTick, toRaw } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import {
  Fullscreen1Icon,
  FullscreenExit1Icon,
  ChevronDownIcon,
  PenBallIcon
} from 'tdesign-icons-vue-next'
import _ from 'lodash'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/store/Settings'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'

// 全局播放模式设置
import { usePlaySettingStore } from '@renderer/store'
import PlaySettings from './PlaySettings.vue'
import LyricAdapter from './Lyric/LyricAdapter.vue'

const playSetting = usePlaySettingStore()
const settingsStore = useSettingsStore()
const globalPlayStatus = useGlobalPlayStatusStore()
const { player } = storeToRefs(globalPlayStatus)
const showSettings = ref(false)

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
const showFestivalEffects = computed(() => settingsStore.shouldUseSpringFestivalTheme())

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
  coverImage?: string
  songId?: string | null
  songInfo: SongList | { songmid: number | null | string; lrc: string | null }
  mainColor: string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  coverImage: '@assets/images/Default.jpg',
  songId: '',
  mainColor: '#rgb(0,0,0)'
})
// 定义事件
const emit = defineEmits(['toggle-fullscreen', 'idle-change'])

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

  // 恢复显示时
  if (isIdle.value) {
    isIdle.value = false
    emit('idle-change', false)
  }

  if (idleTimer) clearTimeout(idleTimer)

  if (props.show) {
    idleTimer = setTimeout(() => {
      if (props.show && playSetting.getAutoHideBottom && !showSettings.value) {
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

// 切换全屏模式
const toggleFullscreen = () => {
  // 切换全屏状态
  isFullscreen.value = !isFullscreen.value

  // 调用 Electron API 切换全屏
  window.api.toggleFullscreen()
}

// 监听 ESC 键退出全屏
onMounted(async () => {
  // 添加事件监听器检测全屏状态变化
  document.addEventListener('fullscreenchange', handleFullscreenChange)
})

// removed redundant onBeforeUnmount

// 处理全屏状态变化
const handleFullscreenChange = () => {
  // 检查当前是否处于全屏状态
  const fullscreenElement = document.fullscreenElement

  // 更新状态
  isFullscreen.value = !!fullscreenElement
}

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
  currentTime: 0,
  lowFreqVolume: 1.0
})

const bgRef = ref<CoreBackgroundRender<PixiRenderer> | undefined>(undefined)
const lyricPlayerRef = ref<LyricPlayerRef | undefined>(undefined)
const backgroundContainer = ref<HTMLDivElement | null>(null)

// 订阅音频事件，保持数据同步
const unsubscribeTimeUpdate = ref<(() => void) | undefined>(undefined)
const unsubscribePlay = ref<(() => void) | undefined>(undefined)

// 计算实际的封面图片路径
const actualCoverImage = computed(() => {
  return player.value.cover || props.coverImage || '@assets/images/Default.jpg'
})

const jumpTime = (e) => {
  if (Audio.value.audio) Audio.value.audio.currentTime = e.line.getLine().startTime / 1000
}
// 监听封面图片变化
watch(
  () => actualCoverImage.value,
  async (newImage) => {
    // 更新背景图片
    if (bgRef.value) {
      // 尝试获取旧的纹理引用，以便在过渡后手动销毁以防止内存泄漏
      // 注意：bgRef.value 是 CoreBackgroundRender 实例，需要访问内部属性
      const renderer = bgRef.value as any
      // 获取当前容器中的第一个子元素（Sprite）的纹理
      const oldTexture = renderer.curContainer?.children?.[0]?.texture

      await bgRef.value.setAlbum(newImage, false)

      // 延迟销毁旧纹理，确保过渡动画（约1秒）完成
      // 这里给予2秒的缓冲时间
      if (oldTexture) {
        setTimeout(() => {
          // 检查纹理是否有效且未被销毁
          // destroy(true) 会同时销毁 baseTexture，释放 WebGL 纹理内存
          if (oldTexture.baseTexture && !oldTexture.baseTexture.destroyed) {
            try {
              oldTexture.destroy(true)
            } catch (e) {
              console.warn('Failed to clean up old album texture:', e)
            }
          }
        }, 2000)
      }
    }
  },
  { immediate: true }
)

// 在全屏播放显示时阻止系统息屏
const blockerActive = ref(false)
watch(
  () => props.show,
  async (visible) => {
    try {
      if (visible && !blockerActive.value) {
        await (window as any)?.api?.powerSaveBlocker?.start?.()
        blockerActive.value = true
      } else if (!visible && blockerActive.value) {
        await (window as any)?.api?.powerSaveBlocker?.stop?.()
        blockerActive.value = false
      }
    } catch (e) {
      console.error('powerSaveBlocker 切换失败:', e)
    }
  },
  { immediate: true }
)

// 初始化背景渲染器的函数
const initBackgroundRender = async () => {
  if (backgroundContainer.value) {
    // 清理旧实例
    if (bgRef.value) {
      bgRef.value.dispose()
      // 移除canvas元素
      const canvas = bgRef.value.getElement()
      canvas?.parentNode?.removeChild(canvas)
    }

    // 创建新实例
    bgRef.value = CoreBackgroundRender.new(PixiRenderer)

    // 获取canvas元素并添加到DOM
    const canvas = bgRef.value.getElement()
    canvas.style.position = 'absolute'
    canvas.style.top = '0'
    canvas.style.left = '0'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    canvas.style.zIndex = '-1'

    backgroundContainer.value.appendChild(canvas)

    // 设置参数
    bgRef.value.setRenderScale(0.5)
    bgRef.value.setFlowSpeed(1)
    bgRef.value.setFPS(60)
    bgRef.value.setHasLyric(player.value.lyrics.lines.length > 10)

    // 设置专辑图片
    await bgRef.value.setAlbum(actualCoverImage.value, false)

    // 恢复动画
    bgRef.value.resume()
  }
}

// 组件挂载时初始化
onMounted(async () => {
  await initBackgroundRender()
})

// 组件卸载前清理订阅
onBeforeUnmount(async () => {
  // 移除事件监听器
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
  window.removeEventListener('mousemove', resetIdleTimer)
  window.removeEventListener('resize', debouncedCheckOverflow)
  document.removeEventListener('click', handleClickOutside)

  if (idleTimer) clearTimeout(idleTimer)
  if (animatingTimer) clearTimeout(animatingTimer)

  // 组件卸载时确保恢复系统息屏
  if (blockerActive.value) {
    try {
      await (window as any)?.api?.powerSaveBlocker?.stop?.()
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
  // 清理背景渲染器资源
  if (bgRef.value) {
    const canvas = bgRef.value.getElement()
    canvas?.parentNode?.removeChild(canvas)
    bgRef.value.dispose()
    bgRef.value = undefined
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
  }
)

// 处理低频音量更新
const handleLowFreqUpdate = (volume: number) => {
  state.lowFreqVolume = volume
  // console.log('lowFreqVolume', volume)
}

// 计算偏白的主题色
const lightMainColor = computed(() => {
  return player.value.coverDetail.lightMainColor || 'rgba(255, 255, 255, 0.9)'
})

const useBlackText = computed(() => {
  return player.value.coverDetail.useBlackText
})

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
const handleClickOutside = (event: MouseEvent) => {
  if (
    showSettings.value &&
    floatActionRef.value &&
    !floatActionRef.value.contains(event.target as Node)
  ) {
    showSettings.value = false
  }
}

// 保存 debounce 函数引用以便后续移除
const debouncedCheckOverflow = _.debounce(checkOverflow, 200)

onMounted(() => {
  window.addEventListener('resize', debouncedCheckOverflow)
  document.addEventListener('click', handleClickOutside)
  window.addEventListener('keydown', handleKeyDown)
  // 初始检查
  setTimeout(checkOverflow, 500)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown)
})
// removed redundant onBeforeUnmount
// --- 滚动文字逻辑 End ---
</script>

<template>
  <div
    class="full-play"
    :class="{
      active: props.show,
      'use-black-text': useBlackText,
      idle: isIdle,
      animating: isAnimating
    }"
  >
    <!-- <ShaderBackground :cover-image="actualCoverImage" /> -->
    <div
      ref="backgroundContainer"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1"
    ></div>
    <div v-if="showFestivalEffects" ref="festivalOverlay" class="festival-overlay"></div>
    <!-- 全屏按钮 -->
    <button
      class="fullscreen-btn"
      :class="{ 'black-text': useBlackText }"
      @click="toggleFullscreen"
    >
      <Fullscreen1Icon v-if="!isFullscreen" class="icon" />
      <FullscreenExit1Icon v-else class="icon" />
    </button>
    <button
      class="putawayscreen-btn"
      :class="{ 'black-text': useBlackText }"
      @click="emit('toggle-fullscreen')"
    >
      <ChevronDownIcon class="icon" />
    </button>
    <Transition name="fade-nav">
      <TitleBarControls
        v-if="props.show"
        class="top"
        style="-webkit-app-region: drag"
        :color="useBlackText ? 'black' : 'white'"
        :show-account="false"
      />
    </Transition>
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
      <div
        class="left"
        :style="player.lyrics.lines.length <= 0 && showLeftPanel ? 'width:100vw' : ''"
      >
        <template v-if="playSetting.getLayoutMode === 'cd'">
          <img
            class="pointer"
            :class="{ playing: isAudioPlaying }"
            src="@renderer/assets/pointer.png"
            alt="pointer"
          />
          <div
            class="cd-container"
            :class="{ playing: isAudioPlaying }"
            :style="
              !isAudioPlaying
                ? 'animation-play-state: paused;'
                : '' +
                  (player.lyrics.lines.length <= 0
                    ? 'width:70vh;height:70vh; transition: width 0.3s ease, height 0.3s ease; transition-delay: 0.8s;'
                    : '')
            "
          >
            <!-- 黑胶唱片 -->
            <div class="vinyl-record"></div>
            <!-- 唱片标签 -->
            <div class="vinyl-label">
              <s-image :src="coverImage" shape="circle" class="cover" />
              <div class="label-shine"></div>
            </div>
            <!-- 中心孔 -->
            <div class="center-hole"></div>
          </div>
        </template>

        <template v-else-if="playSetting.getLayoutMode === 'cover'">
          <div class="cover-layout-container">
            <div class="cover-wrapper-square" :class="{ playing: controlAudio.Audio.isPlay }">
              <s-image :src="actualCoverImage" class="cover-img-square" shape="round" fit="cover" />
            </div>
            <div class="song-info-area">
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
            </div>
          </div>
        </template>
      </div>
      <div v-if="player.lyrics.lines.length > 0" class="right">
        <component
          :is="playSetting.getUseAmlLyricRenderer ? LyricPlayer : LyricAdapter"
          ref="lyricPlayerRef"
          :lyric-lines="toRaw(player.lyrics.lines) || []"
          :current-time="state.currentTime"
          :word-fade-width="0.5"
          :playing="isAudioPlaying"
          class="lyric-player"
          :align-position="
            playSetting.getLayoutMode === 'cd' && playSetting.getShowLeftPanel ? 0.5 : 0.34
          "
          :enable-blur="playSetting.getIsBlurLyric"
          :enable-spring="playSetting.getisJumpLyric"
          :enable-scale="playSetting.getisJumpLyric"
          :text-align="!playSetting.getShowLeftPanel ? 'center' : 'left'"
          :style="playSetting.getShowLeftPanel ? '' : 'text-align: center;'"
          @line-click="jumpTime"
        />
      </div>
    </div>
    <!-- 音频可视化组件 -->
    <div
      v-if="props.show && coverImage && playSetting.getIsAudioVisualizer"
      class="audio-visualizer-container"
      :class="{ idle: isIdle }"
    >
      <AudioVisualizer
        :show="Audio.isPlay"
        :height="70"
        :bar-count="80"
        :color="mainColor"
        @low-freq-update="handleLowFreqUpdate"
      />
    </div>

    <div ref="floatActionRef" class="float-action" :class="{ idle: isIdle }">
      <t-Tooltip content="播放器主题" placement="bottom">
        <button class="skin-btn" @click="showSettings = !showSettings">
          <pen-ball-icon
            :fill-color="'transparent'"
            :stroke-color="'currentColor'"
            :stroke-width="2"
            :style="{ fontSize: '20px' }"
          />
        </button>
      </t-Tooltip>
      <Transition name="fade-up">
        <div v-if="showSettings" class="settings-panel">
          <PlaySettings />
        </div>
      </Transition>
    </div>
  </div>
</template>

<style lang="scss" scoped>
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

.full-play {
  --height: calc(100vh - var(--play-bottom-height));
  --text-color: rgba(255, 255, 255, 0.9);
  z-index: 120;
  position: fixed;
  // transition: top 0.28s cubic-bezier(0.8, 0, 0.8, 0.43);
  top: var(--height);
  left: 0;
  width: 100vw;
  height: 100vh;
  color: var(--text-color);

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
    overflow: hidden;
    display: flex;
    position: relative;
    --cd-width-auto: max(200px, min(30vw, 700px, calc(100vh - var(--play-bottom-height) - 250px)));

    .left {
      width: 40%;
      transition: all 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
      opacity: 1;
      transform: translateX(0);
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

      .pointer {
        user-select: none;
        -webkit-user-drag: none;
        position: absolute;
        width: calc(var(--cd-width-auto) / 3.5);
        left: calc(50% - 1.8vh);
        top: calc(50% - var(--cd-width-auto) / 2 - calc(var(--cd-width-auto) / 3.5) - 1vh);
        transform: rotate(-20deg);
        transform-origin: 1.8vh 1.8vh;
        z-index: 2;
        transition: transform 0.3s;

        &.playing {
          transform: rotate(0deg);
        }
      }

      .cd-container {
        width: var(--cd-width-auto);
        height: var(--cd-width-auto);
        position: relative;
        display: flex;
        align-items: center;
        justify-content: center;
        animation: rotateRecord 33s linear infinite;
        transition: filter 0.3s ease;
        filter: drop-shadow(0 15px 35px rgba(0, 0, 0, 0.6));

        &:hover {
          filter: drop-shadow(0 20px 45px rgba(0, 0, 0, 0.7));
        }

        /* 黑胶唱片主体 */
        .vinyl-record {
          aspect-ratio: 1/1;

          // margin-top: calc(var(--play-bottom-height) / 2);
          width: 100%;
          height: 100%;
          position: relative;
          border-radius: 50%;
          background: radial-gradient(circle at 50% 50%, #1a1a1a 0%, #0d0d0d 100%);
          display: flex;
          align-items: center;
          justify-content: center;
          overflow: hidden;

          /* 唱片纹理轨道 */
          &::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            border-radius: 50%;
            background:
              repeating-conic-gradient(
                from 0deg,
                transparent 0deg,
                rgba(255, 255, 255, 0.02) 0.5deg,
                transparent 1deg,
                rgba(255, 255, 255, 0.01) 1.5deg,
                transparent 2deg
              ),
              repeating-radial-gradient(
                circle at 50% 50%,
                transparent 0px,
                rgba(255, 255, 255, 0.03) 1px,
                transparent 2px,
                transparent 8px
              );
            z-index: 1;
          }

          /* 唱片光泽效果 */
          &::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(
              ellipse at 30% 30%,
              rgba(255, 255, 255, 0.08) 0%,
              rgba(255, 255, 255, 0.04) 25%,
              rgba(255, 255, 255, 0.02) 50%,
              rgba(255, 255, 255, 0.01) 75%,
              transparent 100%
            );
            border-radius: 50%;
            z-index: 2;
            animation: vinylShine 6s ease-in-out infinite;
          }
        }

        /* 唱片标签区域 */
        .vinyl-label {
          position: absolute;
          width: 60%;
          height: 60%;
          background: radial-gradient(
            circle at 50% 50%,
            rgba(40, 40, 40, 0.95) 0%,
            rgba(25, 25, 25, 0.98) 70%,
            rgba(15, 15, 15, 1) 100%
          );
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 3;
          box-shadow:
            inset 0 0 20px rgba(0, 0, 0, 0.8),
            inset 0 0 0 1px rgba(255, 255, 255, 0.05),
            0 0 10px rgba(0, 0, 0, 0.5);

          :deep(.cover) {
            position: relative;
            z-index: 4;
            border-radius: 50%;
            overflow: hidden;
            box-shadow:
              0 0 20px rgba(0, 0, 0, 0.4),
              inset 0 0 0 2px rgba(255, 255, 255, 0.1);
            width: 95% !important;
            height: 95% !important;
            aspect-ratio: 1 / 1;

            img {
              user-select: none;
              -webkit-user-drag: none;
              border-radius: 50%;
              filter: brightness(0.85) contrast(1.15) saturate(1.1);
              width: 100% !important;
              height: 100% !important;
              object-fit: cover;
            }
          }

          /* 标签光泽 */
          .label-shine {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: radial-gradient(
              ellipse at 25% 25%,
              rgba(255, 255, 255, 0.1) 0%,
              transparent 50%
            );
            border-radius: 50%;
            z-index: 5;
            pointer-events: none;
            animation: labelShine 8s ease-in-out infinite;
          }
        }

        /* 中心孔 */
        .center-hole {
          position: absolute;
          width: 8%;
          height: 8%;
          background: radial-gradient(circle, #000 0%, #111 30%, #222 70%, #333 100%);
          border-radius: 50%;
          z-index: 10;
          box-shadow:
            inset 0 0 8px rgba(0, 0, 0, 0.9),
            0 0 3px rgba(0, 0, 0, 0.8);
        }
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
        transition: color 0.2s;
        font-family: v-bind(lyricFontFamily);
        --amll-lyric-player-font-size: min(clamp(30px, 2.5vw, 50px), 5vh);
        --amll-lp-font-size: min(clamp(30px, 2.5vw, 50px), 5vh);

        // bottom: max(2vw, 29px);

        * [class^='_lyricMainLine'] {
          font-weight: 600 !important;
          // text-align: center;
          margin: -0.8em -1 -0.8em -1;
          padding: min(1.05em, 38px) 1em min(1.05em, 38px) 1em;
          * {
            font-weight: 600 !important;
          }
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
      display: flex;
      flex-direction: column;
      gap: 40px;
      margin-top: calc(var(--play-bottom-height) / 2);
      max-height: calc(100vh - 200px);

      .cover-wrapper-square {
        width: 100%;
        max-width: min(480px, 45vh);
        aspect-ratio: 1/1;
        border-radius: 24px;
        overflow: hidden;
        box-shadow:
          0 25px 50px -12px rgba(0, 0, 0, 0.5),
          0 0 0 1px rgba(255, 255, 255, 0.1);
        transition: transform 0.44s cubic-bezier(0.44, 2, 0.64, 1);
        margin: 0 auto;
        transform: scale(0.8);

        &.playing {
          transform: scale(1);

          &:hover {
            transition: transform 0.2s;
            transform: scale(1.02);
          }
        }

        &:hover {
          transform: scale(0.82);
        }

        :deep(.cover-img-square) {
          width: 100%;
          height: 100%;
          object-fit: cover;
          user-select: none;
          img {
            -webkit-user-drag: none;

            user-select: none;
          }
        }
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
  position: absolute;
  z-index: 5;
  transition:
    opacity 0.5s ease,
    transform 0.5s ease;
  &.idle {
    opacity: 0;
    transform: translateY(20px);
    pointer-events: none;
  }
  --bottom-height: 60px;
  right: 20px;
  bottom: calc(var(--bottom-height) + var(--play-bottom-height));
  .skin-btn {
    backdrop-filter: blur(20px);
    background: rgba(255, 255, 255, 0.15);
    // box-shadow:
    //   0 8px 32px 0 rgba(0, 0, 0, 0.1),
    //   0 0 20px v-bind(lightMainColor),
    //   inset 0 0 0 1px rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.628);
    // border: none;
    height: 50px;
    width: 50px;
    border-radius: 50%;
    cursor: pointer;

    /* 弹性过渡效果 */
    transition: all 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);

    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255, 255, 255, 0.9);
    font-size: 14px;
    font-weight: 500;
    letter-spacing: 1px;

    &:hover {
      // transform: translateY(-2px);
      background-color: rgba(255, 255, 255, 0.25);
      box-shadow:
        0 12px 40px 0 rgba(0, 0, 0, 0.15),
        0 0 30px v-bind(lightMainColor),
        inset 0 0 0 1px rgba(255, 255, 255, 0.4);
    }

    &:active {
      transform: translateY(1px) scale(0.92);
      box-shadow:
        0 4px 10px 0 rgba(0, 0, 0, 0.1),
        0 0 10px v-bind(lightMainColor),
        inset 0 0 0 1px rgba(255, 255, 255, 0.1);
      transition: all 0.1s ease;
    }
  }

  .settings-panel {
    max-height: calc(
      100vh - 40px - 2.25rem - 70px - calc(var(--bottom-height) + var(--play-bottom-height))
    );
    display: flex;
    flex-direction: column;
    position: absolute;
    bottom: 70px;
    right: 0;
    width: 340px;
    background: rgb(30 30 30 / 29%);
    backdrop-filter: blur(6px);
    -webkit-backdrop-filter: blur(6px);
    border-radius: 24px;
    padding: 20px;
    box-shadow:
      0 20px 50px rgba(0, 0, 0, 0.4),
      0 0 0 1px rgba(255, 255, 255, 0.1);
    transform-origin: bottom right;
    z-index: 100;
  }
}

.fade-up-enter-active,
.fade-up-leave-active {
  transition: all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
}

.fade-up-enter-from,
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(20px) scale(0.95);
}

@keyframes rotateRecord {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

@keyframes vinylShine {
  0% {
    opacity: 0.1;
    transform: rotate(0deg) scale(1);
  }

  50% {
    opacity: 0.2;
    transform: rotate(180deg) scale(1.1);
  }

  100% {
    opacity: 0.1;
    transform: rotate(360deg) scale(1);
  }
}

@keyframes labelShine {
  0% {
    opacity: 0.05;
    transform: rotate(0deg);
  }

  25% {
    opacity: 0.15;
  }

  50% {
    opacity: 0.1;
    transform: rotate(180deg);
  }

  75% {
    opacity: 0.15;
  }

  100% {
    opacity: 0.05;
    transform: rotate(360deg);
  }
}
</style>
