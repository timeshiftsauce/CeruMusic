<!-- eslint-disable vue/require-toggle-inside-transition -->
<script lang="ts" setup>
import TitleBarControls from '../TitleBarControls.vue'
import AudioVisualizer from './AudioVisualizer.vue'
// import ShaderBackground from './ShaderBackground.vue'
import {
  BackgroundRender,
  LyricPlayer,
  type BackgroundRenderRef,
  type LyricPlayerRef
} from '@applemusic-like-lyrics/vue'
import type { SongList } from '@renderer/types/audio'
import type { LyricLine } from '@applemusic-like-lyrics/core'
import { ref, computed, onMounted, watch, reactive, onBeforeUnmount, toRaw } from 'vue'
import { shouldUseBlackText } from '@renderer/utils/contrastColor'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { Fullscreen1Icon, FullscreenExit1Icon, ChevronDownIcon } from 'tdesign-icons-vue-next'
// 直接从包路径导入，避免 WebAssembly 导入问题
import { parseYrc, parseLrc, parseTTML } from '@applemusic-like-lyrics/lyric/pkg/amll_lyric.js'
import _ from 'lodash'
import { storeToRefs } from 'pinia'

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
    let lyricText = ''
    let parsedLyrics: LyricLine[] = []
    // 创建一个符合 MusicItem 接口的对象，只包含必要的基本属性

    try {
      // 检查是否为网易云音乐，只有网易云才使用ttml接口
      const isNetease =
        props.songInfo && 'source' in props.songInfo && props.songInfo.source === 'wy'
      const songinfo: any = _.cloneDeep(toRaw(props.songInfo))
      console.log(songinfo)
      if (isNetease) {
        // 网易云音乐优先尝试ttml接口
        try {
          const res = (await (
            await fetch(`https://amll.bikonoo.com/ncm-lyrics/${newId}.ttml`)
          ).text()) as any
          if (!res || res.length < 100) throw new Error('ttml 无歌词')
          parsedLyrics = parseTTML(res).lines
          console.log('搜索到ttml歌词', parsedLyrics)
        } catch {
          // ttml失败后使用新的歌词API
          const lyricData = await window.api.music.requestSdk('getLyric', {
            source: 'wy',
            songInfo: songinfo
          })
          console.log('网易云歌词数据:', lyricData)

          if (lyricData.crlyric) {
            // 使用逐字歌词
            lyricText = lyricData.crlyric
            console.log('网易云逐字歌词', lyricText)
            parsedLyrics = parseYrc(lyricText)
            console.log('使用网易云逐字歌词', parsedLyrics)
          } else if (lyricData.lyric) {
            lyricText = lyricData.lyric
            parsedLyrics = parseLrc(lyricText)
            console.log('使用网易云普通歌词', parsedLyrics)
          }

          if (lyricData.tlyric) {
            const translatedline = parseLrc(lyricData.tlyric)
            console.log('网易云翻译歌词:', translatedline)
            for (let i = 0; i < parsedLyrics.length; i++) {
              if (translatedline[i] && translatedline[i].words[0]) {
                parsedLyrics[i].translatedLyric = translatedline[i].words[0].word
              }
            }
          }
        }
      } else {
        // 其他音乐平台直接使用新的歌词API
        const source = props.songInfo && 'source' in props.songInfo ? props.songInfo.source : 'kg'
        // 创建一个纯净的对象，避免Vue响应式对象序列化问题
        const cleanSongInfo = JSON.parse(JSON.stringify(toRaw(props.songInfo)))
        const lyricData = await window.api.music.requestSdk('getLyric', {
          source: source,
          songInfo: cleanSongInfo
        })
        console.log(`${source}歌词数据:`, lyricData)

        if (lyricData.crlyric) {
          // 使用逐字歌词
          lyricText = lyricData.crlyric
          parsedLyrics = parseYrc(lyricText)
          console.log(`使用${source}逐字歌词`, parsedLyrics)
        } else if (lyricData.lyric) {
          lyricText = lyricData.lyric
          parsedLyrics = parseLrc(lyricText)
          console.log(`使用${source}普通歌词`, parsedLyrics)
        }

        if (lyricData.tlyric) {
          const translatedline = parseLrc(lyricData.tlyric)
          console.log(`${source}翻译歌词:`, translatedline)
          for (let i = 0; i < parsedLyrics.length; i++) {
            if (translatedline[i] && translatedline[i].words[0]) {
              parsedLyrics[i].translatedLyric = translatedline[i].words[0].word
            }
          }
        }
      }

      if (parsedLyrics.length > 0) {
        state.lyricLines = parsedLyrics
        console.log('歌词加载成功', parsedLyrics.length)
      } else {
        state.lyricLines = []
        console.log('未找到歌词或解析失败')
      }
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
    console.log('使用黑色文本:', useBlackText.value)
  } catch (error) {
    console.error('获取对比色失败:', error)
    useBlackText.value = false // 默认使用白色文本
  }
}

// 监听封面图片变化
watch(() => actualCoverImage.value, updateTextColor, { immediate: true })

// 组件挂载时初始化
onMounted(() => {
  updateTextColor()
  console.log('组件挂载完成', bgRef.value, lyricPlayerRef.value)
})

// 组件卸载前清理订阅
onBeforeUnmount(() => {
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
      :has-lyric="state.lyricLines.length > 10"
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
          @line-click="
            (e) => {
              if (Audio.audio) Audio.audio.currentTime = e.line.getLine().startTime / 1000
            }
          "
        >
          <template #bottom-line> Test Bottom Line </template>
        </LyricPlayer>
      </div>
    </div>
    <!-- 音频可视化组件 -->
    <div v-if="props.show && coverImage" class="audio-visualizer-container">
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
  top: 40px;
  left: 40px;
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
  left: 100px;
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
    margin-left: 200px;
    z-index: 1;
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

        height: 200%;
        transform: translateY(-25%);

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
