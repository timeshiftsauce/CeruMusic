<template>
  <div class="lyric" @mouseleave="lrcAllLeave">
    <div class="lyric-content">
      <div
        ref="lyricScrollContainer"
        class="lyric-scroll-container"
        tabindex="-1"
        @wheel="handleUserScroll"
      >
        <div id="lrc-placeholder" class="placeholder" />
        <div
          v-for="(line, index) in lyricLines"
          :id="`lrc-${index}`"
          :key="index"
          :class="getLyricLineClass(line, index)"
          :style="getLyricLineStyle(index)"
          @click="emitLineClick(line)"
        >
          <template v-if="isYrcLine(line)">
            <div class="content">
              <div
                v-for="(text, tIndex) in line.words"
                :key="tIndex"
                :class="{
                  'content-text': true,
                  'end-with-space': text.word.endsWith(' ') || text.startTime === 0
                }"
                :style="getYrcVars(text, index)"
              >
                <span class="yrc-word">
                  {{ text.word }}
                </span>
              </div>
            </div>
          </template>
          <template v-else>
            <span class="content">
              {{ line.words?.[0]?.word }}
            </span>
          </template>
          <span v-if="line.translatedLyric" class="tran">{{ line.translatedLyric }}</span>
          <span v-if="line.romanLyric" class="roma">{{ line.romanLyric }}</span>
        </div>
        <div class="placeholder" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onBeforeUnmount, watch } from 'vue'
import type { PropType } from 'vue'
import type { LyricLine, LyricWord } from '@applemusic-like-lyrics/core/dist/interfaces'

const props = defineProps({
  lyricLines: {
    type: Array as PropType<LyricLine[]>,
    default: () => []
  },
  currentTime: {
    type: Number,
    default: 0
  },
  playing: {
    type: Boolean,
    default: false
  },
  alignPosition: {
    type: Number,
    default: 0.5
  },
  enableBlur: {
    type: Boolean,
    default: false
  },
  enableSpring: {
    type: Boolean,
    default: false
  },
  enableScale: {
    type: Boolean,
    default: false
  },
  textAlign: {
    type: String,
    default: 'left' // 'left' | 'center' | 'right'
  }
})

const emit = defineEmits(['line-click'])

const lyricScrollContainer = ref<HTMLElement | null>(null)

const isYrcLine = (line: LyricLine) => {
  return Array.isArray(line.words) && line.words.length > 1
}

const activeLineIndices = computed<number[]>(() => {
  const lyrics = props.lyricLines
  const currentSeek = props.currentTime
  const hasYrc = lyrics.some((l) => Array.isArray(l.words) && l.words.length > 1)
  if (hasYrc) {
    const indices: number[] = []
    for (let i = 0; i < lyrics.length; i++) {
      const start = lyrics[i].startTime || 0
      const end = lyrics[i].endTime ?? Infinity
      if (currentSeek >= start && currentSeek < end) {
        indices.push(i)
      }
    }
    if (indices.length === 0 && currentSeek > 0) {
      const next = lyrics.findIndex((v) => (v.startTime || 0) > currentSeek)
      if (next === -1) return [lyrics.length - 1]
      if (next > 0) return [next - 1]
    }
    return indices.length > 3 ? indices.slice(-3) : indices
  } else {
    const playSeek = currentSeek + 300
    const idx = lyrics.findIndex((v) => (v.startTime || 0) > playSeek)
    if (idx === -1) return [lyrics.length - 1]
    if (idx > 0) return [idx - 1]
    return []
  }
})

const scrollTargetIndex = computed<number>(() => {
  const lyrics = props.lyricLines
  const currentSeek = props.currentTime
  const hasYrc = lyrics.some((l) => Array.isArray(l.words) && l.words.length > 1)
  if (hasYrc) {
    for (let i = 0; i < lyrics.length; i++) {
      const start = lyrics[i].startTime || 0
      const end = lyrics[i].endTime ?? Infinity
      if (currentSeek >= start && currentSeek < end) {
        return i
      }
    }
    if (currentSeek > 0) {
      const next = lyrics.findIndex((v) => (v.startTime || 0) > currentSeek)
      if (next === -1) return lyrics.length - 1
      if (next > 0) return next - 1
    }
    return -1
  } else {
    const playSeek = currentSeek + 300
    const idx = lyrics.findIndex((v) => (v.startTime || 0) > playSeek)
    if (idx === -1) return lyrics.length - 1
    if (idx > 0) return idx - 1
    return -1
  }
})

const firstActiveIndex = computed(() => activeLineIndices.value[0] ?? -1)

let scrollAnimationId: number | null = null
const userScrolling = ref(false)
let userScrollTimeoutId: ReturnType<typeof setTimeout> | null = null
const USER_SCROLL_TIMEOUT = 3000

const handleUserScroll = () => {
  userScrolling.value = true
  if (userScrollTimeoutId !== null) clearTimeout(userScrollTimeoutId)
  userScrollTimeoutId = setTimeout(() => {
    userScrolling.value = false
    userScrollTimeoutId = null
    lyricsScroll(scrollTargetIndex.value)
  }, USER_SCROLL_TIMEOUT)
}

const smoothScrollTo = (container: HTMLElement, targetY: number, duration = 300) => {
  if (scrollAnimationId !== null) {
    cancelAnimationFrame(scrollAnimationId)
    scrollAnimationId = null
  }
  const startY = container.scrollTop
  const diff = targetY - startY
  if (Math.abs(diff) < 0.5) {
    container.scrollTop = targetY
    return
  }
  const startTime = performance.now()
  const step = (currentTime: number) => {
    const elapsed = currentTime - startTime
    const progress = Math.min(elapsed / duration, 1)
    const easedProgress =
      progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2
    container.scrollTop = startY + diff * easedProgress
    if (progress < 1) {
      scrollAnimationId = requestAnimationFrame(step)
    } else {
      scrollAnimationId = null
    }
  }
  scrollAnimationId = requestAnimationFrame(step)
}

const lyricsScroll = (index: number) => {
  const container = lyricScrollContainer.value
  if (!container) return
  if (userScrolling.value) return
  const lrcItemDom = document.getElementById(index >= 0 ? `lrc-${index}` : 'lrc-placeholder')
  if (!lrcItemDom) return
  const containerHeight = container.clientHeight
  const elementTop = lrcItemDom.offsetTop
  const elementHeight = lrcItemDom.offsetHeight
  let targetY = elementTop - (containerHeight - elementHeight) * props.alignPosition
  targetY = Math.max(0, Math.min(targetY, container.scrollHeight - container.clientHeight))
  smoothScrollTo(container, targetY, 500)
}

const lrcAllLeave = () => {
  userScrolling.value = false
  if (userScrollTimeoutId !== null) {
    clearTimeout(userScrollTimeoutId)
    userScrollTimeoutId = null
  }
  lyricsScroll(scrollTargetIndex.value)
}

const YRC_DIM_ALPHA = 0.3
const YRC_LINE_FADE_MS = 250
const yrcFadingLineIndex = ref<number | null>(null)
const yrcFadingUntilAt = ref<number>(0)

const isLineActive = (index: number): boolean => activeLineIndices.value.includes(index)

const getYrcFadeFactor = (index: number): number => {
  if (yrcFadingLineIndex.value !== index) return 1
  const now = Date.now()
  if (now >= yrcFadingUntilAt.value) return 1
  const remain = yrcFadingUntilAt.value - now
  return Math.min(Math.max(remain / YRC_LINE_FADE_MS, 0), 1)
}

type CssVars = Record<`--${string}`, string>

const getYrcVars = (wordData: LyricWord, lyricIndex: number): CssVars => {
  const currentSeek = props.currentTime
  const fadeFactor = getYrcFadeFactor(lyricIndex)
  const duration = wordData.endTime - wordData.startTime
  const safeDuration = Math.max(duration, 1)
  const rawProgress = (currentSeek - wordData.startTime) / safeDuration
  const progress = Math.min(Math.max(rawProgress, 0), 1)
  const maskX = `${(1 - progress) * 100}%`
  const hasStarted = currentSeek >= wordData.startTime
  const brightAlpha = hasStarted ? YRC_DIM_ALPHA + (1 - YRC_DIM_ALPHA) * fadeFactor : YRC_DIM_ALPHA
  const darkAlpha = YRC_DIM_ALPHA

  // 逐字上升效果：
  // 字的时长越长：放大倍数越大，弹跳距离越远，动画时长越慢
  // 目标：分离起跳与回落阶段
  let translateY = '0.16em' // 默认初始状态
  let scale = '1'
  let transitionDuration = '0.4s'
  let timingFunction = 'cubic-bezier(0.25, 0.46, 0.45, 0.94)' // 默认缓动

  if (hasStarted && fadeFactor >= 1) {
    const duration = wordData.endTime - wordData.startTime
    // 动态计算幅度参数
    const clampedDuration = Math.max(100, Math.min(duration, 800))
    const factor = (clampedDuration - 100) / 700 // 0 ~ 1

    // 最大上浮高度：减小幅度，基于字体大小 0.1 ~ 0.15em
    // 假设字体大小约 30px，则为 3px ~ 4.5px，这比之前的小
    // 之前是 2 + factor * 3 (2~5px)
    // 现在调整为 0.1em + factor * 0.05em
    const maxTranslateEm = factor * 0.01
    const maxTranslate = `${maxTranslateEm}em`
    // 最大缩放：减小幅度，1.02 ~ 1.15
    const maxScale = 1.02 + factor * 0.13

    if (progress < 1) {
      // 正在唱：进入起跳状态
      // 目标位置：最高点
      translateY = `-${maxTranslate}`
      scale = `${maxScale}`
      // 动画时长：占字长的 80%
      const riseDuration = Math.max(duration * 0.8, 1100) / 1000
      transitionDuration = `${riseDuration}s`
      // 起跳使用 ease-out 让动作有初速度感
      timingFunction = 'ease-out'
    } else {
      // 唱完：进入回落状态
      // 目标位置：初始点
      translateY = '0px'
      scale = '1'
      // 回落时长：固定值，优雅回弹
      transitionDuration = '2s'
      // 物理回弹曲线
      timingFunction = 'cubic-bezier(0.34, 1.3, 0.64, 1)'
    }
  }

  return {
    '--yrc-mask-x': maskX,
    '--yrc-opacity': '1',
    '--yrc-bright-alpha': `${brightAlpha}`,
    '--yrc-dark-alpha': `${darkAlpha}`,
    '--yrc-translate-y': translateY,
    '--yrc-scale': scale,
    '--yrc-anim-duration': transitionDuration,
    '--yrc-anim-ease': timingFunction
  }
}

const getLyricLineClass = (line: LyricLine, index: number) => {
  const isOn = isLineActive(index)
  return [
    'lrc-line',
    isYrcLine(line) ? 'is-yrc' : 'is-lrc',
    {
      on: isOn,
      'is-bg': !!line.isBG,
      'is-duet': !!line.isDuet
    }
  ]
}

const getLyricLineStyle = (index: number) => {
  if (!props.enableBlur || userScrolling.value) return { filter: 'blur(0)' }
  const activeIdx = firstActiveIndex.value
  const isOn = isLineActive(index)
  // Apple Music 风格模糊计算：非线性模糊
  const dist = Math.abs(activeIdx - index)
  const blurPx = dist === 0 ? 0 : Math.min(1.2 + Math.pow(dist, 0.7) * 1.5, 8)
  return {
    filter: isOn ? 'blur(0)' : `blur(${blurPx}px)`
  }
}

const emitLineClick = (line: LyricLine) => {
  const payload = {
    line: {
      getLine: () => line
    }
  }
  emit('line-click', payload as any)
}

watch(scrollTargetIndex, (val, oldVal) => {
  lyricsScroll(val)
  if (typeof oldVal === 'number' && oldVal >= 0 && oldVal !== val) {
    yrcFadingLineIndex.value = oldVal
    yrcFadingUntilAt.value = Date.now() + YRC_LINE_FADE_MS
  }
})

// 监听对齐方式变化，重新滚动以确保位置正确
watch(
  () => props.textAlign,
  () => {
    nextTick(() => setTimeout(() => lyricsScroll(scrollTargetIndex.value), 600))
    nextTick(() => setTimeout(() => lyricsScroll(scrollTargetIndex.value), 800))
  }
)

onMounted(() => {
  nextTick().then(() => lyricsScroll(scrollTargetIndex.value))
})

onBeforeUnmount(() => {
  if (scrollAnimationId !== null) {
    cancelAnimationFrame(scrollAnimationId)
    scrollAnimationId = null
  }
  if (userScrollTimeoutId !== null) {
    clearTimeout(userScrollTimeoutId)
    userScrollTimeoutId = null
  }
})
</script>

<style lang="scss" scoped>
.lyric {
  position: relative;
  width: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: flex-start;
  height: 100%;
  overflow: hidden;
  .lyric-scroll-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    overflow-x: hidden;
    padding-left: 10px;
    padding-right: v-bind("props.textAlign === 'center' ? '10px' : '80px'");
    box-sizing: border-box;
    scrollbar-width: none;
    -ms-overflow-style: none;
    &::-webkit-scrollbar {
      display: none;
    }
    @media (max-width: 990px) {
      padding-right: 20px;
    }
  }
  .placeholder {
    width: 100%;
    &:first-child {
      height: 300px;
      display: flex;
      align-items: flex-end;
    }
    &:last-child {
      height: 0;
      padding-top: 100%;
    }
  }
  .lyric-content {
    width: 100%;
    height: 100%;
  }

  .lrc-line {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: v-bind("props.textAlign === 'center' ? 'center' : 'flex-start'");
    margin: clamp(4px, 1.2vh, 12px) 0;
    padding: clamp(8px, 2vh, 16px) 16px;
    transform: scale(0.9);
    transform-origin: v-bind("props.textAlign === 'center' ? 'center' : 'left center'");
    will-change: filter, opacity, transform;
    transition:
      filter 0.5s,
      opacity 0.5s,
      transform 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94);
    cursor: pointer;
    width: 100%;
    opacity: 0.25;
    text-align: v-bind(textAlign);
    .content {
      display: block;
      font-size: var(--amll-lyric-player-font-size, 22px);
      font-weight: var(--amll-lyric-player-font-weight, 600);

      color: var(--amll-lyric-view-color, rgba(255, 255, 255, 1));
      width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
      hyphens: auto;
      text-align: v-bind(textAlign);
      .content-text {
        position: relative;
        display: inline-block;
        overflow: visible;
        overflow-wrap: anywhere;
        word-break: break-word;
        white-space: normal;
        font-weight: var(--amll-lyric-player-font-weight, 600);
        text-align: v-bind(textAlign);
        .yrc-word {
          font-weight: var(--amll-lyric-player-font-weight, 600);
          display: inline-block;
          box-sizing: border-box;
          padding-block: 0.2em;
          margin-block: -0.2em;
          opacity: var(--yrc-opacity, 0.3);
        }
        &.end-with-space {
          margin-right: 12px;
          &:last-child {
            margin-right: 0;
          }
        }
      }
    }
    .tran {
      margin-top: 8px;
      opacity: 0.6;
      font-size: calc(var(--amll-lyric-player-font-size, 22px) * 0.52);
      color: var(--amll-lyric-view-color, rgba(255, 255, 255, 1));
      transition: opacity 0.35s;
      width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
      hyphens: auto;
      text-align: v-bind(textAlign);
    }
    .roma {
      margin-top: 4px;
      opacity: 0.5;
      font-size: calc(var(--amll-lyric-player-font-size, 22px) * 0.73);
      color: var(--amll-lyric-view-color, rgba(255, 255, 255, 1));
      transition: opacity 0.35s;
      width: 100%;
      overflow-wrap: anywhere;
      word-break: break-word;
      white-space: normal;
      hyphens: auto;
      text-align: v-bind(textAlign);
    }
    &.is-yrc {
      .content {
        display: flex;
        flex-wrap: wrap;
        width: 100%;
        overflow-wrap: anywhere;
        word-break: break-word;
        white-space: normal;
        justify-content: v-bind("props.textAlign === 'center' ? 'center' : 'flex-start'");
      }
      .tran,
      .roma {
        opacity: 0.3;
      }
      &.is-bg {
        opacity: 0.4;
        transform: scale(0.7);
        padding: 0px 20px;
      }
      &.is-duet {
        transform-origin: right;
        .content,
        .tran,
        .roma {
          text-align: right;
          justify-content: flex-end;
        }
      }
    }
    &.on {
      opacity: 1 !important;
      transform: scale(1.05);
      .tran,
      .roma {
        opacity: 0.6;
      }
      &.is-bg {
        opacity: 0.85 !important;
      }
    }
    &::before {
      content: '';
      display: block;
      position: absolute;
      left: 0px;
      top: 0;
      width: 100%;
      height: 100%;
      border-radius: 8px;
      background-color: rgba(255, 255, 255, 0.14);
      opacity: 0;
      z-index: 0;
      transform: scale(1.05);
      transition:
        transform 0.35s ease,
        opacity 0.35s ease;
      pointer-events: none;
    }
    @media (hover: hover) and (pointer: fine) {
      .lyric &:hover {
        opacity: 1;
        &::before {
          transform: scale(1);
          opacity: 1;
        }
      }
      .lyric &:active {
        &::before {
          transform: scale(0.95);
        }
      }
    }
  }

  .lrc-line.is-yrc.on {
    .content-text {
      .yrc-word {
        will-change: -webkit-mask-position-x, transform;
        mask-image: linear-gradient(
          to right,
          rgba(0, 0, 0, var(--yrc-bright-alpha, 1)) 45.4545454545%,
          rgba(0, 0, 0, var(--yrc-dark-alpha, 0.3)) 54.5454545455%
        );
        mask-size: 220% 100%;
        mask-repeat: no-repeat;
        -webkit-mask-image: linear-gradient(
          to right,
          rgba(0, 0, 0, var(--yrc-bright-alpha, 1)) 45.4545454545%,
          rgba(0, 0, 0, var(--yrc-dark-alpha, 0.3)) 54.5454545455%
        );
        -webkit-mask-size: 220% 100%;
        -webkit-mask-repeat: no-repeat;
        -webkit-mask-position-x: var(--yrc-mask-x, 0%);
        transform: translateY(var(--yrc-translate-y, 1.5px)) scale(var(--yrc-scale, 1));
        transform-origin: center bottom;
        transition: transform var(--yrc-anim-duration, 0.4s)
          var(--yrc-anim-ease, cubic-bezier(0.25, 0.46, 0.45, 0.94));
      }
    }
  }
}
</style>

<style scoped></style>
