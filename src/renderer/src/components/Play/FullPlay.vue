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
  songInfo: SongList | { songmid: number | null },
  mainColor:string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  coverImage: '@assets/images/Default.jpg',
  songId: '',
  mainColor: '#fff'
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
</script>

<template>
  <div class="full-play" :class="{ active: props.show, 'use-black-text': useBlackText }">
    <!-- <ShaderBackground :cover-image="actualCoverImage" /> -->
    <BackgroundRender ref="bgRef" :album="actualCoverImage" :album-is-video="false" :fps="30" :flow-speed="4"
     :has-lyric="state.lyricLines.length > 10"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1" />
    <!-- 全屏按钮 -->
    <button class="fullscreen-btn" :class="{ 'black-text': useBlackText }" @click="toggleFullscreen">
      <Fullscreen1Icon v-if="!isFullscreen" class="icon" />
      <FullscreenExit1Icon v-else class="icon" />
    </button>
    <button class="putawayscreen-btn" :class="{ 'black-text': useBlackText }" @click="emit('toggle-fullscreen')">
      <ChevronDownIcon class="icon" />
    </button>
    <Transition name="fade-nav">
      <TitleBarControls v-if="props.show" class="top" style="-webkit-app-region: drag"
        :color="useBlackText ? 'black' : 'white'" />
    </Transition>
    <div class="playbox">
      <div class="left" :style="state.lyricLines.length <= 0 && 'width:100vw'">
        <div class="box" :style="!Audio.isPlay
            ? 'animation-play-state: paused;'
            : '' +
            (state.lyricLines.length <= 0
              ? 'width:70vh;height:70vh; transition: width 0.3s ease, height 0.3s ease; transition-delay: 0.8s;'
              : '')
          ">
          <t-image :src="coverImage" :style="state.lyricLines.length > 0
              ? 'width: min(20vw, 380px); height: min(20vw, 380px)'
              : 'width: 45vh; height: 45vh;transition: width 0.3s ease, height 0.3s ease; transition-delay: 1s;'
            " shape="circle" class="cover" />
        </div>
      </div>
      <div v-show="state.lyricLines.length > 0" class="right">
        <LyricPlayer ref="lyricPlayerRef" :lyric-lines="props.show ? state.lyricLines : []"
          :current-time="state.currentTime"  class="lyric-player" @line-click="
            (e) => {
              if (Audio.audio) Audio.audio.currentTime = e.line.getLine().startTime / 1000
            }
          ">
          <template #bottom-line> Test Bottom Line </template>
        </LyricPlayer>
      </div>
    </div>
    <!-- 音频可视化组件 -->
    <div class="audio-visualizer-container" v-if="props.show&&coverImage">
      <AudioVisualizer 
        :show="props.show && Audio.isPlay" 
        :height="60" 
        :bar-count="80"
        :color='mainColor'
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
    drop-filter: blur(10px);
    -webkit-drop-filter: blur(10px);
    overflow: hidden;
    display: flex;
    position: relative;



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
      :deep(.lyric-player) {
        font-family: lyricfont;
        --amll-lyric-player-font-size: max(2vw, 29px);

        // bottom: max(2vw, 29px);

        height: 100%;
        &>div{
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
    bottom: var(--play-bottom-height);
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
  to {
    transform: rotate(360deg);
  }
}
</style>
