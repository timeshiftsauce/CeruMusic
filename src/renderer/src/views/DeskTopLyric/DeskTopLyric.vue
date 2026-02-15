<template>
  <!-- <NConfigProvider :theme="null"> -->
  <div
    :class="[
      'desktop-lyric',
      {
        locked: lyricConfig.isLock,
        hovered: isHovered,
        'no-animation': !lyricConfig.animation
      }
    ]"
    :style="{
      '--mask-bg-color': lyricConfig.backgroundMaskColor,
      cursor: cursorStyle
    }"
  >
    <div class="header" align="center" justify="space-between">
      <div class="header-left" @pointerdown.stop>
        <div class="menu-btn" @click.stop="sendToMain('win-show')">
          <SvgIcon name="Music" />
        </div>
        <span class="song-name">{{ lyricData.playName }} - {{ lyricData.artistName }}</span>
      </div>
      <div class="header-center" @pointerdown.stop>
        <div class="menu-btn" @click.stop="sendToMainWin('playPrev')">
          <SvgIcon name="SkipPrev" />
        </div>
        <div
          class="menu-btn"
          :title="lyricData.playStatus ? '暂停' : '播放'"
          @click.stop="sendToMainWin('toggle')"
        >
          <SvgIcon :name="lyricData.playStatus ? 'Pause' : 'Play'" />
        </div>
        <div class="menu-btn" @click.stop="sendToMainWin('playNext')">
          <SvgIcon name="SkipNext" />
        </div>
      </div>
      <div class="header-right" @pointerdown.stop>
        <div
          class="menu-btn lock-btn"
          @mouseenter.stop="tempToggleLyricLock(false)"
          @mouseleave.stop="tempToggleLyricLock(true)"
          @click.stop="toggleLyricLock"
        >
          <SvgIcon :name="lyricConfig.isLock ? 'ListLockOpen' : 'EyeLock'" />
        </div>
        <div class="menu-btn" @click.stop="sendToMain('closeDesktopLyric')">
          <SvgIcon name="WindowClose" />
        </div>
      </div>
      <div
        v-if="lyricConfig.alwaysShowPlayInfo"
        :class="[
          'play-title',
          lyricConfig.position,
          { 'has-background-mask': lyricConfig.textBackgroundMask }
        ]"
        :style="{ fontFamily: lyricConfig.fontFamily, fontWeight: lyricConfig.fontWeight }"
      >
        <span class="name">{{ lyricData.playName }}</span>
        <span class="artist">{{ lyricData.artistName }}</span>
      </div>
    </div>
    <TransitionGroup
      tag="div"
      :name="transitionName"
      :style="{
        fontSize: lyricConfig.fontSize + 'px',
        fontFamily: lyricConfig.fontFamily,
        fontWeight: lyricConfig.fontWeight,
        textShadow: `0 0 4px ${lyricConfig.shadowColor}`
      }"
      :class="['lyric-container', lyricConfig.position]"
    >
      <div
        v-for="(line, index) in renderLyricLines"
        :key="line.key"
        :ref="(el) => setLineRef(el, line.key)"
        :class="[
          'lyric-line',
          {
            active: line.active,
            'is-yrc': Boolean(lyricData?.yrcData?.length && line.line?.words?.length > 1),
            'has-background-mask': lyricConfig.textBackgroundMask,
            'is-next': !line.active && lyricConfig.isDoubleLine,
            'align-left': lyricConfig.position === 'both' && line.index % 2 === 0,
            'align-right': lyricConfig.position === 'both' && line.index % 2 !== 0
          }
        ]"
        :style="{
          color: line.active ? lyricConfig.playedColor : lyricConfig.unplayedColor,
          top: getLineTop(index),
          fontSize: index > 0 ? '0.8em' : '1em',
          '--line-index': index
        }"
      >
        <template
          v-if="lyricConfig.showYrc && lyricData?.yrcData?.length && line.line?.words?.length > 1"
        >
          <span
            :ref="(el) => setContentRef(el, line.key)"
            class="scroll-content"
            :style="getScrollStyle(line)"
          >
            <span class="content">
              <span
                v-for="(text, textIndex) in line.line.words"
                :key="textIndex"
                :class="{
                  'content-text': true,
                  'end-with-space': text.word.endsWith(' ') || text.startTime === 0
                }"
              >
                <span
                  class="word"
                  :style="[
                    {
                      fontWeight: lyricConfig.fontWeight,
                      backgroundImage: `linear-gradient(to right, ${lyricConfig.playedColor} 50%, ${lyricConfig.unplayedColor} 50%)`,
                      textShadow: 'none',
                      filter: `drop-shadow(0 0 1px ${lyricConfig.shadowColor}) drop-shadow(0 0 2px ${lyricConfig.shadowColor})`
                    },
                    getYrcStyle(text, line.index)
                  ]"
                >
                  {{ text.word }}
                </span>
              </span>
            </span>
          </span>
        </template>
        <template v-else>
          <span
            :ref="(el) => setContentRef(el, line.key)"
            class="scroll-content"
            :style="[getScrollStyle(line), { fontWeight: lyricConfig.fontWeight }]"
          >
            {{ getPlainText(line.line?.words || []) }}
          </span>
        </template>
      </div>
      <span v-if="renderLyricLines.length === 0" key="placeholder" class="lyric-line">
        &nbsp;
      </span>
    </TransitionGroup>
  </div>
  <!-- </NConfigProvider> -->
</template>

<script setup lang="ts">
import SvgIcon from '@renderer/components/SvgIcon.vue'
import { reactive, ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useWindowSize, useRafFn, useTimeoutFn, useDebounceFn, useThrottleFn } from '@vueuse/core'
import type { ComponentPublicInstance } from 'vue'
import type { LyricLine, LyricWord } from '@applemusic-like-lyrics/lyric'

type RenderLine = {
  line: LyricLine
  index: number
  key: string
  active: boolean
}

type LyricData = {
  playName: string
  artistName: string
  playStatus: boolean
  currentTime: number
  lyricLoading: boolean
  songId: number | string
  songOffset: number
  lrcData: LyricLine[]
  yrcData: LyricLine[]
  lyricIndex: number
}

type LyricConfig = {
  fontSize: number
  fontWeight: number | string
  fontFamily: string
  position: 'left' | 'center' | 'right' | 'both'
  alwaysShowPlayInfo: boolean
  isLock: boolean
  animation: boolean
  showYrc: boolean
  showTran: boolean
  isDoubleLine: boolean
  textBackgroundMask: boolean
  backgroundMaskColor: string
  playedColor: string
  unplayedColor: string
  shadowColor: string
  limitBounds: boolean
}

const FALLBACK_INITIALIZATION_TIMEOUT = 2000

const lyricData = reactive<LyricData>({
  playName: '',
  artistName: '',
  playStatus: false,
  currentTime: 0,
  lyricLoading: false,
  songId: 0,
  songOffset: 0,
  lrcData: [],
  yrcData: [],
  lyricIndex: -1
})

let baseMs = 0
let anchorTick = 0

const playSeekMs = ref<number>(0)
const { pause: pauseSeek, resume: resumeSeek } = useRafFn(() => {
  if (lyricData.playStatus) {
    playSeekMs.value = baseMs + (performance.now() - anchorTick)
  } else {
    playSeekMs.value = baseMs
  }
})

const LYRIC_LOOKAHEAD = 300

const currentLyricIndex = computed(() => {
  const lyrics =
    lyricConfig.showYrc && lyricData?.yrcData?.length ? lyricData.yrcData : lyricData.lrcData
  if (!lyrics || !lyrics.length) return -1
  const seek = playSeekMs.value + 0
  const idx = lyrics.findIndex((v) => (v.startTime || 0) > seek)
  if (idx === -1) return lyrics.length - 1
  if (idx > 0) return idx - 1
  return -1
})

const lyricConfig = reactive<LyricConfig>({
  fontSize: 30,
  fontWeight: 600,
  fontFamily: 'PingFangSC-Semibold',
  position: 'center',
  alwaysShowPlayInfo: false,
  isLock: false,
  animation: true,
  showYrc: true,
  showTran: false,
  isDoubleLine: true,
  textBackgroundMask: false,
  backgroundMaskColor: 'rgba(0,0,0,0.2)',
  playedColor: '#73BCFC',
  unplayedColor: 'rgba(255,255,255,0.5)',
  shadowColor: 'rgba(255,255,255,0.5)',
  limitBounds: true
})

const isHovered = ref<boolean>(false)
const isInitializing = ref(true)
const { start: startHoverTimer } = useTimeoutFn(
  () => {
    isHovered.value = false
  },
  1000,
  { immediate: false }
)

const handleMouseMove = (event: MouseEvent) => {
  isHovered.value = true
  startHoverTimer()
  if (lyricConfig.isLock) return
  if (dragState.isDragging || dragState.isResizing) return
  const edgeCursor = computeHoverCursor(event.clientX, event.clientY)
  if (edgeCursor) {
    cursorStyle.value = edgeCursor
    return
  }
  const target = event.target as HTMLElement | null
  if (target && target.closest('.lyric-container')) {
    cursorStyle.value = 'move'
    return
  }
  cursorStyle.value = ''
}
const handleMouseLeave = () => {
  isHovered.value = false
  if (dragState.isDragging || dragState.isResizing) return
  cursorStyle.value = ''
}

const getSafeEndTime = (lyrics: LyricLine[], idx: number) => {
  const cur = lyrics?.[idx]
  const next = lyrics?.[idx + 1]
  const curEnd = Number(cur?.endTime)
  const curStart = Number(cur?.startTime)
  if (Number.isFinite(curEnd) && curEnd > curStart) return curEnd
  const nextStart = Number(next?.startTime)
  if (Number.isFinite(nextStart) && nextStart > curStart) return nextStart
  return 0
}

const placeholder = (word: string): RenderLine[] => [
  {
    line: {
      startTime: 0,
      endTime: 0,
      words: [{ word, startTime: 0, endTime: 0, romanWord: '' }] as any,
      translatedLyric: '',
      romanLyric: '',
      isBG: false,
      isDuet: false
    } as any,
    index: -1,
    key: 'placeholder',
    active: true
  }
]

const transitionName = computed(() => {
  if (!lyricConfig.animation) return ''
  return 'lyric-slide'
})

const getLineTop = (index: number) => {
  if (index === 0) return '0px'
  return `${lyricConfig.fontSize * 1.9}px`
}

const renderLyricLines = computed<RenderLine[]>(() => {
  if (isInitializing.value) {
    return []
  }
  const lyrics =
    lyricConfig.showYrc && lyricData?.yrcData?.length ? lyricData.yrcData : lyricData.lrcData
  if (!lyricData.playName && !lyrics?.length) {
    return placeholder('Ceru Desktop Lyric')
  }
  if (lyricData.lyricLoading) return placeholder('歌词加载中...')
  if (!lyrics?.length) return placeholder('纯音乐，请欣赏')
  const idx = currentLyricIndex.value
  if (idx < 0) {
    const playTitle = `${lyricData.playName} - ${lyricData.artistName}`
    return placeholder(playTitle)
  }
  const current = lyrics[idx]
  const next = lyrics[idx + 1]
  if (!current) return []
  const safeEnd = getSafeEndTime(lyrics, idx)
  if (lyricConfig.showTran && current.translatedLyric) {
    const lines: RenderLine[] = [
      { line: { ...current, endTime: safeEnd }, index: idx, key: `${idx}-orig`, active: true },
      {
        line: {
          startTime: current.startTime,
          endTime: safeEnd,
          words: [
            {
              word: current.translatedLyric,
              startTime: current.startTime,
              endTime: safeEnd,
              romanWord: ''
            } as any
          ],
          translatedLyric: '',
          romanLyric: '',
          isBG: false,
          isDuet: false
        } as any,
        index: idx,
        key: `${idx}-tran`,
        active: false
      }
    ]
    return lines
  }
  if (lyricConfig.isDoubleLine) {
    const lines: RenderLine[] = []
    lines.push({
      line: { ...current, endTime: safeEnd },
      index: idx,
      key: `${idx}-orig`,
      active: true
    })
    if (next) {
      lines.push({
        line: next,
        index: idx + 1,
        key: `${idx + 1}-orig`,
        active: false
      })
    }
    return lines
  }
  return [{ line: { ...current, endTime: safeEnd }, index: idx, key: `${idx}-orig`, active: true }]
})

const getYrcStyle = (wordData: LyricWord, lyricIndex: number) => {
  const currentLine = lyricData.yrcData?.[lyricIndex]
  if (!currentLine) return { backgroundPositionX: '100%' }
  const seekSec = playSeekMs.value + LYRIC_LOOKAHEAD
  const startSec = currentLine.startTime || 0
  const endSec = currentLine.endTime || 0
  const isLineActive =
    (seekSec >= startSec && seekSec < endSec) || currentLyricIndex.value === lyricIndex
  if (!isLineActive) {
    const hasPlayed = seekSec >= (wordData.endTime || 0)
    return { backgroundPositionX: hasPlayed ? '0%' : '100%' }
  }
  const durationSec = Math.max((wordData.endTime || 0) - (wordData.startTime || 0), 0.001)
  const progress = Math.max(Math.min((seekSec - (wordData.startTime || 0)) / durationSec, 1), 0)
  return {
    backgroundPositionX: `${100 - progress * 100}%`
  }
}

const getPlainText = (words: LyricWord[]) => {
  if (!Array.isArray(words)) return ''
  return words.map((w) => w?.word || '').join('')
}

const lineRefs = new Map<string, HTMLElement>()
const contentRefs = new Map<string, HTMLElement>()
const setLineRef = (el: Element | ComponentPublicInstance | null, key: string) => {
  if (el) lineRefs.set(key, el as HTMLElement)
  else lineRefs.delete(key)
}
const setContentRef = (el: Element | ComponentPublicInstance | null, key: string) => {
  if (el) contentRefs.set(key, el as HTMLElement)
  else contentRefs.delete(key)
}
const scrollStartAtProgress = 0.3

const getScrollStyle = (line: RenderLine) => {
  const container = lineRefs.get(line.key)
  const content = contentRefs.get(line.key)
  if (!container || !content || !line?.line) return {}
  const containerStyle = window.getComputedStyle(container)
  const contentStyle = window.getComputedStyle(content)
  const padL = parseFloat(containerStyle.paddingLeft) || 0
  const padR = parseFloat(containerStyle.paddingRight) || 0
  const marginL = parseFloat(contentStyle.marginLeft) || 0
  const marginR = parseFloat(contentStyle.marginRight) || 0
  const borderL = parseFloat(contentStyle.borderLeftWidth) || 0
  const borderR = parseFloat(contentStyle.borderRightWidth) || 0
  const visibleWidth = Math.max(0, container.clientWidth - padL - padR)
  const contentFullWidth = Math.max(0, content.scrollWidth + marginL + marginR + borderL + borderR)
  const overflow = Math.max(0, contentFullWidth - visibleWidth)
  if (overflow <= 0) return { transform: 'translateX(0px)' }
  const seekSec = playSeekMs.value
  const start = Number(line.line.startTime ?? 0)
  const END_MARGIN_SEC = 2
  const endRaw = Number(line.line.endTime)
  const hasSafeEnd = Number.isFinite(endRaw) && endRaw > 0 && endRaw > start
  if (!hasSafeEnd) return { transform: 'translateX(0px)' }
  const end = Math.max(start + 0.001, endRaw - END_MARGIN_SEC)
  const duration = Math.max(end - start, 0.001)
  const progress = Math.max(Math.min((seekSec - start) / duration, 1), 0)
  if (progress <= scrollStartAtProgress) return { transform: 'translateX(0px)' }
  const ratio = (progress - scrollStartAtProgress) / (1 - scrollStartAtProgress)
  const offset = Math.round(overflow * ratio)
  return {
    transform: `translateX(-${offset}px)`,
    willChange: 'transform'
  }
}

const cachedBounds = reactive({
  x: 0,
  y: 0,
  width: 800,
  height: 180,
  screenMinX: -99999,
  screenMinY: -99999,
  screenMaxX: 99999,
  screenMaxY: 99999
})

const updateCachedBounds = async () => {
  try {
    const [winBounds, stored, workAreas] = await Promise.all([
      window.electron?.ipcRenderer?.invoke?.('get-window-bounds'),
      window.electron?.ipcRenderer?.invoke?.('get-desktop-lyric-option'),
      window.electron?.ipcRenderer?.invoke?.('get-all-work-area')
    ])
    cachedBounds.x = winBounds?.x ?? 0
    cachedBounds.y = winBounds?.y ?? 0
    cachedBounds.width = Number(stored?.width) > 0 ? Number(stored.width) : 800
    cachedBounds.height = Number(stored?.height) > 0 ? Number(stored.height) : 180
    const areas = Array.isArray(workAreas) ? workAreas : []
    const minX = Math.min(...areas.map((a: any) => a.x))
    const minY = Math.min(...areas.map((a: any) => a.y))
    const maxX = Math.max(...areas.map((a: any) => a.x + a.width))
    const maxY = Math.max(...areas.map((a: any) => a.y + a.height))
    cachedBounds.screenMinX = Number.isFinite(minX) ? minX : -99999
    cachedBounds.screenMinY = Number.isFinite(minY) ? minY : -99999
    cachedBounds.screenMaxX = Number.isFinite(maxX) ? maxX : 99999
    cachedBounds.screenMaxY = Number.isFinite(maxY) ? maxY : 99999
  } catch (e) {
    console.warn('Failed to update cached bounds:', e)
  }
}

const dragState = reactive({
  isDragging: false,
  isResizing: false,
  resizeEdge: '' as
    | ''
    | 'left'
    | 'right'
    | 'top'
    | 'bottom'
    | 'top-left'
    | 'top-right'
    | 'bottom-left'
    | 'bottom-right',
  resizeBorderSize: 10,
  wasResizing: false,
  startX: 0,
  startY: 0,
  startWinX: 0,
  startWinY: 0,
  winWidth: 0,
  winHeight: 0,
  minX: -99999,
  minY: -99999,
  maxX: 99999,
  maxY: 99999
})

const cursorStyle = ref<string>('')

const onDocPointerDown = (event: PointerEvent) => {
  if (lyricConfig.isLock) return
  if (event.button !== 0) return
  const target = event?.target as HTMLElement | null
  if (!target) return
  if (target.closest('.menu-btn')) return
  const safeWidth = cachedBounds.width > 0 ? cachedBounds.width : 800
  const safeHeight = cachedBounds.height > 0 ? cachedBounds.height : 180
  // 判断是否命中窗口边缘热区
  const w = window.innerWidth
  const h = window.innerHeight
  const b = dragState.resizeBorderSize || 14
  const nearLeft = event.clientX <= b
  const nearRight = event.clientX >= w - b
  const nearTop = event.clientY <= b
  const nearBottom = event.clientY >= h - b
  let edge: typeof dragState.resizeEdge = ''
  if (nearLeft && nearTop) edge = 'top-left'
  else if (nearRight && nearTop) edge = 'top-right'
  else if (nearLeft && nearBottom) edge = 'bottom-left'
  else if (nearRight && nearBottom) edge = 'bottom-right'
  else if (nearLeft) edge = 'left'
  else if (nearRight) edge = 'right'
  else if (nearTop) edge = 'top'
  else if (nearBottom) edge = 'bottom'
  dragState.isResizing = !!edge
  dragState.resizeEdge = edge
  dragState.isDragging = !edge
  dragState.wasResizing = false
  dragState.startX = event.screenX ?? 0
  dragState.startY = event.screenY ?? 0
  dragState.startWinX = cachedBounds.x
  dragState.startWinY = cachedBounds.y
  dragState.winWidth = safeWidth
  dragState.winHeight = safeHeight
  if (lyricConfig.limitBounds) {
    dragState.minX = cachedBounds.screenMinX
    dragState.minY = cachedBounds.screenMinY
    dragState.maxX = cachedBounds.screenMaxX
    dragState.maxY = cachedBounds.screenMaxY
  }
  if (dragState.isResizing) {
    cursorStyle.value =
      edge === 'top-left' || edge === 'bottom-right'
        ? 'nwse-resize'
        : edge === 'top-right' || edge === 'bottom-left'
          ? 'nesw-resize'
          : edge === 'left' || edge === 'right'
            ? 'ew-resize'
            : 'ns-resize'
  } else {
    cursorStyle.value = 'move'
  }
  document.addEventListener('pointermove', onDocPointerMove)
  document.addEventListener('pointerup', onDocPointerUp)
  event.preventDefault()
}

const onDocPointerMove = useThrottleFn((event: PointerEvent) => {
  if (lyricConfig.isLock) return
  // 更新光标样式（非拖拽/缩放时）
  if (!dragState.isDragging && !dragState.isResizing) {
    const w = window.innerWidth
    const h = window.innerHeight
    const b = dragState.resizeBorderSize || 14
    const nearLeft = event.clientX <= b
    const nearRight = event.clientX >= w - b
    const nearTop = event.clientY <= b
    const nearBottom = event.clientY >= h - b
    let cursor = ''
    if ((nearLeft && nearTop) || (nearRight && nearBottom)) cursor = 'nwse-resize'
    else if ((nearRight && nearTop) || (nearLeft && nearBottom)) cursor = 'nesw-resize'
    else if (nearLeft || nearRight) cursor = 'ew-resize'
    else if (nearTop || nearBottom) cursor = 'ns-resize'
    cursorStyle.value = cursor
    return
  }
  // 缩放处理
  if (dragState.isResizing) {
    const dx = (event.screenX ?? 0) - dragState.startX
    const dy = (event.screenY ?? 0) - dragState.startY
    const minWidth = 440
    const minHeight = 120
    const maxWidth = 1600
    const maxHeight = 300
    let newX = dragState.startWinX
    let newY = dragState.startWinY
    let newWidth = dragState.winWidth
    let newHeight = dragState.winHeight
    if (dragState.resizeEdge.includes('right')) newWidth = dragState.winWidth + dx
    if (dragState.resizeEdge.includes('bottom')) newHeight = dragState.winHeight + dy
    if (dragState.resizeEdge.includes('left')) {
      newX = dragState.startWinX + dx
      newWidth = dragState.winWidth - dx
    }
    if (dragState.resizeEdge.includes('top')) {
      newY = dragState.startWinY + dy
      newHeight = dragState.winHeight - dy
    }
    // 尺寸限制
    if (newWidth < minWidth) {
      if (dragState.resizeEdge.includes('left')) newX -= minWidth - newWidth
      newWidth = minWidth
    } else if (newWidth > maxWidth) {
      if (dragState.resizeEdge.includes('left')) newX -= maxWidth - newWidth
      newWidth = maxWidth
    }
    if (newHeight < minHeight) {
      if (dragState.resizeEdge.includes('top')) newY -= minHeight - newHeight
      newHeight = minHeight
    } else if (newHeight > maxHeight) {
      if (dragState.resizeEdge.includes('top')) newY -= maxHeight - newHeight
      newHeight = maxHeight
    }
    // 边界限制
    if (lyricConfig.limitBounds) {
      newX = Math.round(Math.max(dragState.minX, Math.min(dragState.maxX - newWidth, newX)))
      newY = Math.round(Math.max(dragState.minY, Math.min(dragState.maxY - newHeight, newY)))
    }
    window.electron?.ipcRenderer?.send?.('move-window', newX, newY, newWidth, newHeight)
    cursorStyle.value =
      dragState.resizeEdge === 'top-left' || dragState.resizeEdge === 'bottom-right'
        ? 'nwse-resize'
        : dragState.resizeEdge === 'top-right' || dragState.resizeEdge === 'bottom-left'
          ? 'nesw-resize'
          : dragState.resizeEdge === 'left' || dragState.resizeEdge === 'right'
            ? 'ew-resize'
            : 'ns-resize'
    return
  }
  // 拖拽处理
  if (dragState.isDragging) {
    let newWinX = Math.round(dragState.startWinX + ((event.screenX ?? 0) - dragState.startX))
    let newWinY = Math.round(dragState.startWinY + ((event.screenY ?? 0) - dragState.startY))
    if (lyricConfig.limitBounds) {
      newWinX = Math.round(
        Math.max(dragState.minX, Math.min(dragState.maxX - dragState.winWidth, newWinX))
      )
      newWinY = Math.round(
        Math.max(dragState.minY, Math.min(dragState.maxY - dragState.winHeight, newWinY))
      )
    }
    window.electron?.ipcRenderer?.send?.(
      'move-window',
      newWinX,
      newWinY,
      dragState.winWidth,
      dragState.winHeight
    )
    cursorStyle.value = 'move'
  }
}, 16)

const onDocPointerUp = () => {
  if (!dragState.isDragging && !dragState.isResizing) return
  dragState.wasResizing = dragState.isResizing
  dragState.isDragging = false
  dragState.isResizing = false
  dragState.resizeEdge = ''
  cursorStyle.value = ''
  document.removeEventListener('pointermove', onDocPointerMove)
  document.removeEventListener('pointerup', onDocPointerUp)
  requestAnimationFrame(() => {
    // 非缩放情况下才按字体大小联动高度
    if (!dragState.wasResizing) {
      const height = fontSizeToHeight(lyricConfig.fontSize)
      if (height) pushWindowHeight(height)
    }
    updateCachedBounds()
  })
}

const computeHoverCursor = (clientX: number, clientY: number) => {
  const w = window.innerWidth
  const h = window.innerHeight
  const b = dragState.resizeBorderSize || 14
  const nearLeft = clientX <= b
  const nearRight = clientX >= w - b
  const nearTop = clientY <= b
  const nearBottom = clientY >= h - b
  if ((nearLeft && nearTop) || (nearRight && nearBottom)) return 'nwse-resize'
  if ((nearRight && nearTop) || (nearLeft && nearBottom)) return 'nesw-resize'
  if (nearLeft || nearRight) return 'ew-resize'
  if (nearTop || nearBottom) return 'ns-resize'
  return ''
}

const { height: winHeight, width: winWidth } = useWindowSize()
watch([winWidth, winHeight], ([w, h]) => {
  if (!dragState.isDragging) {
    cachedBounds.width = w
    cachedBounds.height = h
  }
})

const computedFontSize = computed(() => {
  const h = dragState.isDragging ? dragState.winHeight : Math.round(Number(winHeight?.value ?? 0))
  const minH = 140
  const maxH = 360
  const minF = 20
  const maxF = 96
  if (!Number.isFinite(h) || h <= minH) return minF
  if (h >= maxH) return maxF
  const ratio = (h - minH) / (maxH - minH)
  return Math.round(minF + ratio * (maxF - minF))
})

const debouncedSaveConfig = useDebounceFn((size: number) => {
  sendToMain('set-desktop-lyric-option', { fontSize: size }, true)
}, 500)

watch(computedFontSize, (size) => {
  if (!Number.isFinite(size)) return
  if (dragState.isDragging) return
  if (isInitializing.value) return
  if (Math.abs(lyricConfig.fontSize - size) > 1) {
    lyricConfig.fontSize = size
    debouncedSaveConfig(size)
  }
})

const fontSizeToHeight = (size: number) => {
  const minH = 140
  const maxH = 360
  const minF = 20
  const maxF = 96
  const s = Math.min(Math.max(Math.round(size), minF), maxF)
  const ratio = (s - minF) / (maxF - minF)
  return Math.round(minH + ratio * (maxH - minH))
}

const pushWindowHeight = (nextHeight: number) => {
  if (!Number.isFinite(nextHeight)) return
  if (dragState.isDragging) return
  window.electron?.ipcRenderer?.send?.('update-window-height', nextHeight)
}

watch(
  () => lyricConfig.fontSize,
  (size) => {
    const height = fontSizeToHeight(size)
    if (height && Math.abs(height - winHeight.value) > 2) {
      pushWindowHeight(height)
    }
  },
  { immediate: true }
)

const sendToMain = (eventName: string, ...args: any[]) => {
  window.electron?.ipcRenderer?.send?.(eventName, ...args)
}
const sendToMainWin = (eventName: string, ...args: any[]) => {
  window.electron?.ipcRenderer?.send?.('send-main-event', eventName, ...args)
}

const toggleLyricLock = async () => {
  const next = !lyricConfig.isLock
  window.electron?.ipcRenderer?.send?.('toogleDesktopLyricLock', next)
  lyricConfig.isLock = next
}
const tempToggleLyricLock = (isLock: boolean) => {
  if (!lyricConfig.isLock) return
  window.electron?.ipcRenderer?.send?.('toogleDesktopLyricLock', isLock)
}

onMounted(() => {
  window.electron?.ipcRenderer?.on?.(
    'play-song-change',
    (_event, data: { name?: string; artist?: string }) => {
      lyricData.playName = data?.name || ''
      lyricData.artistName = data?.artist || ''
    }
  )
  window.electron?.ipcRenderer?.on?.('play-lyric-change', (_event, lines: LyricLine[]) => {
    lyricData.lrcData = lines || []
    // 优先把逐字歌词当作 yrcData（如果行 words 长度>1）
    lyricData.yrcData =
      Array.isArray(lines) && lines.some((l) => Array.isArray(l.words) && l.words.length > 1)
        ? lines
        : []
    lyricData.lyricLoading = false
    if (isInitializing.value) isInitializing.value = false
  })
  window.electron?.ipcRenderer?.on?.('play-lyric-index', (_event, index: number) => {
    lyricData.lyricIndex = index
  })
  window.electron?.ipcRenderer?.on?.(
    'play-lyric-progress',
    (
      _event,
      payload: { index: number; progress: number; currentMs?: number; timestamp?: number }
    ) => {
      if (typeof payload?.currentMs === 'number') {
        const newBase = Math.floor(payload.currentMs)
        const drift = Math.abs(newBase - playSeekMs.value)
        const SYNC_THRESHOLD = 300
        if (drift > SYNC_THRESHOLD) {
          baseMs = newBase
          anchorTick = performance.now()
        }
      }
    }
  )
  window.electron?.ipcRenderer?.on?.('play-status-change', (_event, status: boolean) => {
    lyricData.playStatus = !!status
    if (lyricData.playStatus) {
      resumeSeek()
    } else {
      baseMs = playSeekMs.value
      anchorTick = performance.now()
      pauseSeek()
    }
  })
  window.electron?.ipcRenderer?.on?.('desktop-lyric-option-change', (_event, option: any) => {
    if (!option) return
    const merged = { ...option }
    lyricConfig.fontSize = Number(merged.fontSize) || lyricConfig.fontSize
    lyricConfig.fontWeight = merged.fontWeight ?? lyricConfig.fontWeight
    lyricConfig.playedColor = merged.mainColor || lyricConfig.playedColor
    lyricConfig.shadowColor = merged.shadowColor || lyricConfig.shadowColor
    lyricConfig.fontFamily = merged.fontFamily || lyricConfig.fontFamily
    lyricConfig.position = merged.position || lyricConfig.position
    lyricConfig.animation = merged.animation ?? lyricConfig.animation
    lyricConfig.showYrc = merged.showYrc ?? lyricConfig.showYrc
    lyricConfig.showTran = merged.showTran ?? lyricConfig.showTran
    lyricConfig.isDoubleLine = merged.isDoubleLine ?? lyricConfig.isDoubleLine
    lyricConfig.textBackgroundMask = merged.textBackgroundMask ?? lyricConfig.textBackgroundMask
    lyricConfig.backgroundMaskColor = merged.backgroundMaskColor || lyricConfig.backgroundMaskColor
    lyricConfig.alwaysShowPlayInfo = merged.alwaysShowPlayInfo ?? lyricConfig.alwaysShowPlayInfo
    const height = fontSizeToHeight(lyricConfig.fontSize)
    if (height) pushWindowHeight(height)
  })
  window.electron?.ipcRenderer?.on?.('set-desktop-lyric-font', (_event, font: string) => {
    lyricConfig.fontFamily = font || lyricConfig.fontFamily
  })
  window.electron?.ipcRenderer?.on?.('toogleDesktopLyricLock', (_event, lock: boolean) => {
    lyricConfig.isLock = !!lock
  })
  window.electron?.ipcRenderer
    ?.invoke?.('get-desktop-lyric-option')
    .then((opt: any) => {
      if (opt) {
        const merged = { ...opt }
        lyricConfig.fontSize = Number(merged.fontSize) || lyricConfig.fontSize
        lyricConfig.fontWeight = merged.fontWeight ?? lyricConfig.fontWeight
        lyricConfig.playedColor = merged.mainColor || lyricConfig.playedColor
        lyricConfig.shadowColor = merged.shadowColor || lyricConfig.shadowColor
        lyricConfig.fontFamily = merged.fontFamily || lyricConfig.fontFamily
        lyricConfig.position = merged.position || lyricConfig.position
        lyricConfig.animation = merged.animation ?? lyricConfig.animation
        lyricConfig.showYrc = merged.showYrc ?? lyricConfig.showYrc
        lyricConfig.showTran = merged.showTran ?? lyricConfig.showTran
        lyricConfig.isDoubleLine = merged.isDoubleLine ?? lyricConfig.isDoubleLine
        lyricConfig.textBackgroundMask = merged.textBackgroundMask ?? lyricConfig.textBackgroundMask
        lyricConfig.backgroundMaskColor =
          merged.backgroundMaskColor || lyricConfig.backgroundMaskColor
        lyricConfig.alwaysShowPlayInfo = merged.alwaysShowPlayInfo ?? lyricConfig.alwaysShowPlayInfo
      }
    })
    .catch(() => {})
  updateCachedBounds()
  useTimeoutFn(() => {
    if (isInitializing.value) {
      isInitializing.value = false
    }
  }, FALLBACK_INITIALIZATION_TIMEOUT)
  if (lyricData.playStatus) {
    resumeSeek()
  } else {
    pauseSeek()
  }
  document.addEventListener('pointerdown', onDocPointerDown)
  document.addEventListener('mousemove', handleMouseMove)
  document.addEventListener('mouseleave', handleMouseLeave)
  // 通知主进程：桌面歌词窗口已准备就绪，便于主窗口侧补发快照
  window.electron?.ipcRenderer?.send?.('lyric-window-ready')
})

onBeforeUnmount(() => {
  pauseSeek()
  document.removeEventListener('pointerdown', onDocPointerDown)
  document.removeEventListener('mousemove', handleMouseMove)
  document.removeEventListener('mouseleave', handleMouseLeave)
  if (dragState.isDragging) onDocPointerUp()
})
</script>

<style scoped lang="scss">
.desktop-lyric {
  display: flex;
  flex-direction: column;
  height: 100%;
  color: #fff;
  background-color: transparent;
  padding: 12px;
  border-radius: 12px;
  overflow: hidden;
  transition: background-color 0.3s;
  cursor: default;
  .header {
    position: relative;
    margin-bottom: 12px;
    cursor: default;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    grid-gap: 12px;
    > * {
      min-width: 0;
    }
    .header-left,
    .header-center,
    .header-right {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-content: center;
    }
    .header-left {
      justify-content: flex-start;
    }
    .header-right {
      justify-content: flex-end;
    }
    .song-name {
      font-size: 1em;
      text-align: left;
      flex: 1 1 auto;
      line-height: 36px;
      padding: 0 8px;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition: opacity 0.3s;
    }
    .menu-btn {
      display: flex;
      align-items: center;
      justify-content: center;
      flex: 0 0 auto;
      padding: 6px;
      border-radius: 8px;
      will-change: transform;
      transition:
        opacity 0.3s,
        background-color 0.3s,
        transform 0.3s;
      cursor: pointer;
      .n-icon {
        font-size: 24px;
      }
      &.lock-btn {
        pointer-events: auto;
        .n-icon {
          filter: drop-shadow(0 0 4px rgba(0, 0, 0, 0.8));
        }
      }
      &:hover {
        background-color: rgba(255, 255, 255, 0.3);
      }
      &:active {
        transform: scale(0.98);
      }
    }
    .song-name,
    .menu-btn {
      opacity: 0;
    }
    .play-title {
      position: absolute;
      padding: 0 12px;
      width: 100%;
      text-align: left;
      transition: opacity 0.3s;
      pointer-events: none;
      z-index: 0;
      span {
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        text-shadow: 0 0 4px rgba(0, 0, 0, 0.8);
        padding: 0 4px;
      }
      .artist {
        font-size: 12px;
        opacity: 0.6;
      }
      &.center,
      &.both {
        text-align: center;
      }
      &.right {
        text-align: right;
      }
      &.has-background-mask {
        background-color: var(--mask-bg-color);
        border-radius: 8px;
        padding: 4px 12px;
        width: fit-content;
        max-width: 100%;
        &.center,
        &.both {
          left: 50%;
          transform: translateX(-50%);
        }
        &.right {
          right: 0;
          left: auto;
        }
        span {
          background-color: transparent;
          padding: 0;
        }
      }
    }
  }
  .lyric-container {
    height: 100%;
    padding: 0 8px;
    position: relative;
    .lyric-line {
      position: absolute;
      width: 100%;
      left: 0;
      line-height: normal;
      padding: 4px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      transition:
        top 0.6s cubic-bezier(0.55, 0, 0.1, 1),
        font-size 0.6s cubic-bezier(0.55, 0, 0.1, 1),
        color 0.6s cubic-bezier(0.55, 0, 0.1, 1),
        opacity 0.6s cubic-bezier(0.55, 0, 0.1, 1),
        transform 0.6s cubic-bezier(0.55, 0, 0.1, 1);
      will-change: top, font-size, transform;
      transform-origin: left center;
      &.has-background-mask {
        .scroll-content {
          background-color: var(--mask-bg-color);
          border-radius: 6px;
          padding: 2px 8px;
          display: inline-block;
        }
      }
      .scroll-content {
        display: inline-block;
        white-space: nowrap;
        will-change: transform;
      }
      &.is-yrc {
        .content {
          display: inline-flex;
          flex-wrap: nowrap;
          width: auto;
          overflow-wrap: normal;
          word-break: normal;
          white-space: nowrap;
          text-align: inherit;
        }
        .content-text {
          position: relative;
          display: inline-block;
          .word {
            display: inline-block;
            background-clip: text;
            -webkit-background-clip: text;
            color: transparent;
            background-size: 200% 100%;
            background-repeat: no-repeat;
            background-position-x: 100%;
            will-change: background-position-x;
          }
          &.end-with-space {
            margin-right: 5vh;
            &:last-child {
              margin-right: 0;
            }
          }
        }
      }
    }
    &.center {
      .lyric-line {
        text-align: center;
        transform-origin: center center;
        &.is-yrc {
          .content {
            justify-content: center;
          }
        }
      }
    }
    &.right {
      .lyric-line {
        text-align: right;
        transform-origin: right center;
        &.is-yrc {
          .content {
            justify-content: flex-end;
          }
        }
      }
    }
    &.both {
      .lyric-line {
        &.align-right {
          text-align: right;
          transform-origin: right center;
        }
        &.align-left {
          text-align: left;
          transform-origin: left center;
        }
      }
      .lyric-line.is-yrc.align-right {
        .content {
          justify-content: flex-end;
        }
      }
    }
  }
  &.no-animation {
    .lyric-line {
      transition: none !important;
    }
  }
  .lyric-slide-move,
  .lyric-slide-enter-active,
  .lyric-slide-leave-active {
    transition:
      transform 0.6s cubic-bezier(0.55, 0, 0.1, 1),
      opacity 0.6s cubic-bezier(0.55, 0, 0.1, 1);
    will-change: transform, opacity;
  }
  .lyric-slide-enter-from {
    opacity: 0;
    transform: translateY(100%);
  }
  .lyric-slide-leave-to {
    opacity: 0;
    transform: translateY(-100%);
  }
  .lyric-slide-leave-active {
    position: absolute;
  }
  &.hovered {
    &:not(.locked) {
      background-color: rgba(0, 0, 0, 0.6);
      .song-name,
      .menu-btn {
        opacity: 1;
      }
      .play-title {
        opacity: 0;
      }
    }
  }
  &.locked {
    cursor: default;
    .song-name,
    .menu-btn,
    .lyric-container {
      pointer-events: none;
    }
    &.hovered {
      .lock-btn {
        opacity: 1;
        pointer-events: auto;
      }
    }
  }
}
</style>

<style>
body {
  background-color: transparent !important;
}
</style>
