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
import { ref, computed, onMounted, watch } from 'vue'
import { shouldUseBlackText } from '@renderer/utils/contrastColor'

interface Props {
  show?: boolean
  coverImage?: string
}

const props = withDefaults(defineProps<Props>(), {
  show: false,
  coverImage: '@assets/images/Default.jpg'
})

const bgRef = ref<BackgroundRenderRef | undefined>(undefined)
// const lyricPlayerRef = ref<LyricPlayerRef | undefined>(undefined)

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
  console.log('组件挂载完成', bgRef.value)
})
</script>

<template>
  <div class="full-play" :class="{ active: props.show, 'use-black-text': useBlackText }">
    <!-- <ShaderBackground :cover-image="actualCoverImage" /> -->
    <BackgroundRender
      ref="bgRef"
      :album="actualCoverImage"
      :album-is-video="false"
      :fps="60"
      :flow-speed="13"
      style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: -1"
    />
    <Transition name="fade-nav">
      <TitleBarControls
        v-if="props.show"
        class="top"
        style="-webkit-app-region: drag"
        :color="useBlackText ? 'black' : 'white'"
      />
    </Transition>
    <div class="playbox">
      <!-- 播放控件内容 -->
      <div v-if="props.show" class="song-info">
        <h1>当前播放</h1>
        <p>这里将显示歌曲信息</p>
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
    width: 100%;

    z-index: 1;
    padding: 30px 30px;
    padding-bottom: 10px;
  }
  .playbox {
    width: 100%;
    height: 100%;
    // background-color: rgba(0, 0, 0, 0.256);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;

    .song-info {
      color: var(--text-color);
      text-align: center;

      h1 {
        font-size: 2.5rem;
        margin-bottom: 1rem;
        text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
      }

      p {
        font-size: 1.2rem;
        opacity: 0.8;
      }
    }
  }
}
</style>
