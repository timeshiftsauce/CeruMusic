<script lang="ts" setup>
import {
  BackgroundRender,
  LyricPlayer,
  type BackgroundRenderRef,
  type LyricPlayerRef
} from '@applemusic-like-lyrics/vue'
import type { SongList } from '@renderer/types/audio'
import type { LyricLine } from '@applemusic-like-lyrics/core'
import { ref, computed, onMounted, watch, reactive, onBeforeUnmount, toRaw } from 'vue'
import { shouldUseBlackText } from '@renderer/utils/color/contrastColor'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { Fullscreen1Icon, FullscreenExit1Icon, ChevronDownIcon } from 'tdesign-icons-vue-next'
// 直接从包路径导入，避免 WebAssembly 导入问题
import {
  parseYrc,
  parseLrc,
  parseTTML,
  parseQrc
} from '@applemusic-like-lyrics/lyric/pkg/amll_lyric.js'
import _ from 'lodash'
import { storeToRefs } from 'pinia'

// 全局播放模式设置
import { usePlaySettingStore } from '@renderer/store'

const playSetting = usePlaySettingStore()

interface Props {
  show?: boolean
  coverImage?: string
  songId?: string | null
  songInfo: SongList | { songmid: number | null | string }
  mainColor: string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  coverImage: '@assets/images/Default.jpg',
  songId: '',
  mainColor: '#rgb(0,0,0)'
})
// 定义事件
const emit = defineEmits(['toggle-fullscreen'])

// 跟踪全屏状态
const isFullscreen = ref(false)

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

onBeforeUnmount(() => {
  // 移除事件监听器
  document.removeEventListener('fullscreenchange', handleFullscreenChange)
})

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

// 组件内部状态
const state = reactive({
  audioUrl: Audio.value.url,
  albumUrl: props.coverImage,
  albumIsVideo: false,
  currentTime: 0,
  lyricLines: [] as LyricLine[],
  lowFreqVolume: 1.0
})

// 监听歌曲ID变化，获取歌词
watch(
  () => props.songId,
  async (newId) => {
    if (!newId || !props.songInfo) return

    // 工具函数：清洗响应式对象，避免序列化问题
    const getCleanSongInfo = () => JSON.parse(JSON.stringify(toRaw(props.songInfo)))

    // 工具函数：按来源解析逐字歌词
    const parseCrLyricBySource = (source: string, text: string): LyricLine[] => {
      return source === 'tx' ? parseQrc(text) : parseYrc(text)
    }

    // 工具函数：合并翻译到主歌词
    const mergeTranslation = (base: LyricLine[], tlyric?: string): LyricLine[] => {
      if (!tlyric || base.length === 0) return base

      const translated = parseLrc(tlyric)
      if (!translated || translated.length === 0) return base

      // 将译文按 startTime-endTime 建立索引，便于精确匹配
      const keyOf = (s: number, e: number) => `${s}-${e}`
      const joinWords = (line: LyricLine) => (line.words || []).map(w => w.word).join('')

      const tMap = new Map<string, LyricLine>()
      for (const tl of translated) {
        tMap.set(keyOf(tl.startTime, tl.endTime), tl)
      }

      // 容差时间（毫秒），用于无法精确匹配时的最近行匹配
      const TOLERANCE_MS = 1000

      for (const bl of base) {
        // 1) 先尝试精确匹配
        let tLine = tMap.get(keyOf(bl.startTime, bl.endTime))

        // 2) 若无精确匹配，按 startTime 进行容差范围内最近匹配
        if (!tLine) {
          let best: { line: LyricLine; diff: number } | null = null
          for (const tl of translated) {
            const diff = Math.abs(tl.startTime - bl.startTime)
            // 要求结束时间也尽量接近，避免跨行误配
            const endDiff = Math.abs(tl.endTime - bl.endTime)
            const score = diff + endDiff
            if (diff <= TOLERANCE_MS && endDiff <= TOLERANCE_MS) {
              if (!best || score < best.diff) best = { line: tl, diff: score }
            }
          }
          tLine = best?.line
        }

        if (tLine) {
          const text = joinWords(tLine)
          if (text) bl.translatedLyric = text
        }
      }

      return base
    }

    try {
      const source =
        props.songInfo && 'source' in props.songInfo ? (props.songInfo as any).source : 'kg'
      let parsedLyrics: LyricLine[] = []

      if (source === 'wy') {
        // 网易云：优先尝试 TTML
        try {
          const res = await (
            await fetch(`https://amll.bikonoo.com/ncm-lyrics/${newId}.ttml`)
          ).text()
          if (!res || res.length < 100) throw new Error('ttml 无歌词')
          parsedLyrics = parseTTML(res).lines
        } catch {
          // 回退到统一歌词 API
          const lyricData = await window.api.music.requestSdk('getLyric', {
            source: 'wy',
            songInfo: _.cloneDeep(toRaw(props.songInfo)) as any
          })

          if (lyricData?.crlyric) {
            parsedLyrics = parseYrc(lyricData.crlyric)
          } else if (lyricData?.lyric) {
            parsedLyrics = parseLrc(lyricData.lyric)
          }

          parsedLyrics = mergeTranslation(parsedLyrics, lyricData?.tlyric)
        }
      } else {
        // 其他来源：直接统一歌词 API
        const lyricData = await window.api.music.requestSdk('getLyric', {
          source,
          songInfo: getCleanSongInfo()
        })

        if (lyricData?.crlyric) {
          parsedLyrics = parseCrLyricBySource(source, lyricData.crlyric)
        } else if (lyricData?.lyric) {
          parsedLyrics = parseLrc(lyricData.lyric)
        }

        parsedLyrics = mergeTranslation(parsedLyrics, lyricData?.tlyric)
      }
      state.lyricLines = parsedLyrics.length > 0 ? parsedLyrics : []
    } catch (error) {
      console.error('获取歌词失败:', error)
      state.lyricLines = []
    }
  },
  { immediate: true }
)

const bgRef = ref<BackgroundRenderRef | undefined>(undefined)
const lyricPlayerRef = ref<LyricPlayerRef | undefined>(undefined)

// 订阅音频事件，保持数据同步
const unsubscribeTimeUpdate = ref<(() => void) | undefined>(undefined)
const unsubscribePlay = ref<(() => void) | undefined>(undefined)

// 计算实际的封面图片路径
const actualCoverImage = computed(() => {
  // 如果是相对路径，保持原样，否则使用默认图片
  return props.coverImage || '@assets/images/Default.jpg'
})

// 文本颜色状态
const useBlackText = ref(false)

// 更新文本颜色
async function updateTextColor() {
  try {
    useBlackText.value = await shouldUseBlackText(actualCoverImage.value)
  } catch (error) {
    console.error('获取对比色失败:', error)
    useBlackText.value = false // 默认使用白色文本
  }
}

// 监听封面图片变化
watch(() => actualCoverImage.value, updateTextColor, { immediate: true })

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

// 组件挂载时初始化
onMounted(() => {
  updateTextColor()
})

// 组件卸载前清理订阅
onBeforeUnmount(async () => {
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
}

// 计算偏白的主题色
const lightMainColor = computed(() => {
  const color = props.mainColor
  // 解析rgb颜色值
  const rgbMatch = color.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*\d+\)/)
  if (rgbMatch) {
    let r = parseInt(rgbMatch[1])
    let g = parseInt(rgbMatch[2])
    let b = parseInt(rgbMatch[3])

    // 适度向白色偏移，保持主题色特征
    r = Math.min(255, r + (255 - r) * 0.8)
    g = Math.min(255, g + (255 - g) * 0.8)
    b = Math.min(255, b + (255 - b) * 0.8)

    return `rgba(${Math.round(r)}, ${Math.round(g)}, ${Math.round(b)}, 0.9)`
  }
  // 如果解析失败，返回默认的偏白色
  return 'rgba(255, 255, 255, 0.9)'
})
const lyricHeight = computed(() => {
  return playSetting.getisJumpLyric ? '100%' : '200%'
})
const lyricTranslateY = computed(() => {
  return playSetting.getisJumpLyric ? '0' : '-25%'
})
</script>

<template>
  <div class="full-play" :class="{ active: props.show, 'use-black-text': useBlackText }">
    <!-- <ShaderBackground :cover-image="actualCoverImage" /> -->
    <BackgroundRender
      ref="bgRef"
      :album="actualCoverImage"
      :album-is-video="false"
      :fps="30"
      :flow-speed="4"
      :has-lyric="state.lyricLines.length > 10 && playSetting.getBgPlaying"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1"
    />
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
      />
    </Transition>
    <div class="playbox">
      <div class="left" :style="state.lyricLines.length <= 0 && 'width:100vw'">
        <img
          class="pointer"
          :class="{ playing: Audio.isPlay }"
          src="@renderer/assets/pointer.png"
          alt="pointer"
        />
        <div
          class="cd-container"
          :class="{ playing: Audio.isPlay }"
          :style="
            !Audio.isPlay
              ? 'animation-play-state: paused;'
              : '' +
                (state.lyricLines.length <= 0
                  ? 'width:70vh;height:70vh; transition: width 0.3s ease, height 0.3s ease; transition-delay: 0.8s;'
                  : '')
          "
        >
          <!-- 黑胶唱片 -->
          <div class="vinyl-record"></div>
          <!-- 唱片标签 -->
          <div class="vinyl-label">
            <t-image :src="coverImage" shape="circle" class="cover" />
            <div class="label-shine"></div>
          </div>
          <!-- 中心孔 -->
          <div class="center-hole"></div>
        </div>
      </div>
      <div v-show="state.lyricLines.length > 0" class="right">
        <LyricPlayer
          ref="lyricPlayerRef"
          :lyric-lines="props.show ? state.lyricLines : []"
          :current-time="state.currentTime"
          class="lyric-player"
          :enable-spring="playSetting.getisJumpLyric"
          :enable-scale="playSetting.getisJumpLyric"
          @line-click="
            (e) => {
              if (Audio.audio) Audio.audio.currentTime = e.line.getLine().startTime / 1000
            }
          "
        >
        </LyricPlayer>
      </div>
    </div>
    <!-- 音频可视化组件 -->
    <div
      v-if="props.show && coverImage && playSetting.getIsAudioVisualizer"
      class="audio-visualizer-container"
    >
      <AudioVisualizer
        :show="props.show && Audio.isPlay"
        :height="70"
        :bar-count="80"
        :color="mainColor"
        @low-freq-update="handleLowFreqUpdate"
      />
    </div>
  </div>
</template>

<style lang="scss" scoped>
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
  z-index: 100;
  position: fixed;
  top: var(--height);
  transition: top 0.4s cubic-bezier(0.8, 0, 0.8, 0.43);
  left: 0;
  width: 100vw;
  height: 100vh;
  color: var(--text-color);

  &.use-black-text {
    --text-color: rgba(255, 255, 255, 0.9);
  }

  &.active {
    top: 0;
  }

  .top {
    position: absolute;
    width: calc(100% - 200px);
    z-index: 1;
    right: 0;
    padding: 30px 30px;
    padding-bottom: 10px;
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
      transition: all 0.3s ease;
    }

    .right {
      width: 60%;
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
        rgb(255, 255, 255) 10%,
        rgb(255, 255, 255) 75%,
        rgba(255, 255, 255, 0.6) 85%,
        rgba(255, 255, 255, 0)
      );

      :deep(.lyric-player) {
        --amll-lyric-view-color: v-bind(lightMainColor);
        font-family: lyricfont;
        --amll-lyric-player-font-size: min(2.6vw, 39px);

        // bottom: max(2vw, 29px);

        height: v-bind(lyricHeight);
        transform: translateY(v-bind(lyricTranslateY));

        * [class^='lyricMainLine'] {
          font-weight: 600 !important;

          * {
            font-weight: 600 !important;
          }
        }

        & > div {
          padding-bottom: 0;
          overflow: hidden;
          transform: translateY(-20px);
        }
      }

      padding: 0 20px;

      margin: 80px 0 calc(var(--play-bottom-height)) 0;
      overflow: hidden;
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
  }
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
