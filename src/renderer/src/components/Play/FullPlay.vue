<!-- eslint-disable vue/require-toggle-inside-transition -->
<script lang="ts" setup>
import TitleBarControls from '../TitleBarControls.vue'
// import ShaderBackground from './ShaderBackground.vue'
import {
  BackgroundRender,
  LyricPlayer,
  type BackgroundRenderRef,
  type LyricPlayerRef
} from '@applemusic-like-lyrics/vue'
import type { LyricLine } from '@applemusic-like-lyrics/core'
import { ref, computed, onMounted, watch, reactive, onBeforeUnmount } from 'vue'
import { shouldUseBlackText } from '@renderer/utils/contrastColor'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { Fullscreen1Icon, FullscreenExit1Icon, ChevronDownIcon } from 'tdesign-icons-vue-next'
// 导入歌词请求函数
import musicService from '@renderer/services/music'
// 直接从包路径导入，避免 WebAssembly 导入问题
import { parseYrc, parseLrc, parseTTML } from '@applemusic-like-lyrics/lyric/pkg/amll_lyric.js'

import { storeToRefs } from 'pinia'

interface Props {
  show?: boolean
  coverImage?: string
  songId?: string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  coverImage: '@assets/images/Default.jpg',
  songId: ''
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
onMounted(() => {
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
  lyricLines: [] as LyricLine[]
})

// 监听歌曲ID变化，获取歌词
watch(
  () => props.songId,
  async (newId) => {
    if (!newId) return
    let lyricText = ''
    let parsedLyrics: LyricLine[] = []
    try {
      // 请求歌词数据，设置yv=true获取逐字歌词
      const res = await (await fetch(`https://amll.bikonoo.com/ncm-lyrics/${newId}.ttml`)).text()
      if (res) {
        console.log('搜索到ttml歌词')
        parsedLyrics = parseTTML(res).lines
      } else {
        const lyricData = await musicService.request('getLyric', {
          id: newId,
          yv: true,
          lv: true,
          tv: true
        })
        console.log(lyricData)
        // 优先使用逐字歌词(yrc)，如果没有则回退到普通歌词(lrc)

        if (lyricData.yrc?.lyric) {
          console.log('使用逐字歌词')
          lyricText = lyricData.yrc.lyric
          parsedLyrics = parseYrc(lyricText)
        } else if (lyricData.lrc?.lyric) {
          console.log('使用普通歌词')
          lyricText = lyricData.lrc.lyric
          parsedLyrics = parseLrc(lyricText)
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
</script>

<template>
  <div class="full-play" :class="{ active: props.show, 'use-black-text': useBlackText }">
    <!-- <ShaderBackground :cover-image="actualCoverImage" /> -->
    <BackgroundRender
      ref="bgRef"
      :album="actualCoverImage"
      :album-is-video="false"
      :fps="60"
      :flow-speed="4"
      :has-lyric="true"
      :low-freq-volume="1"
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
      <!-- 播放控件内容
      <div v-if="props.show" class="song-info">
        <h1>当前播放</h1>
        <p>这里将显示歌曲信息</p>
      </div> -->
      <div class="left">
        <div class="box" :style="!Audio.isPlay && 'animation-play-state: paused;'">
          <t-image
            :src="coverImage"
            :style="{ width: 'min(20vw,380px)', height: 'min(20vw,380px)' }"
            shape="circle"
            class="cover"
          />
        </div>
      </div>
      <div class="right">
        <LyricPlayer
          ref="lyricPlayerRef"
          :lyric-lines="state.lyricLines"
          :current-time="state.currentTime"
          :align-position="0.38"
          style="mix-blend-mode: plus-lighter"
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
    // background-color: rgba(0, 0, 0, 0.256);
    display: flex;
    position: relative;
    :deep(.lyric-player) {
      --amll-lyric-player-font-size: max(2.2vw, 38px);
      box-sizing: border-box;
      width: 100%;
      height: 100%;
    }
    .left,
    .right {
      width: 50%;
    }
    .left {
      display: flex;
      justify-content: center;
      align-items: center;
      margin: 0 0 var(--play-bottom-height) 0;
      .box {
        width: min(30vw, 700px);
        height: min(30vw, 700px);
        background-color: #000000;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 1000%;
        animation: rotateRecord 10s linear infinite;
        :deep(.cover) img {
          user-select: none;
          -webkit-user-drag: none;
        }
      }
    }
    .right {
      padding: 0 20px;
      padding-top: 90px;
    }
  }
}
@keyframes rotateRecord {
  to {
    transform: rotate(360deg);
  }
}
</style>
