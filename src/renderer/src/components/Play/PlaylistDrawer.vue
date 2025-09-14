<script setup lang="ts">
import { ref, computed, nextTick, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import type { SongList } from '@renderer/types/audio'

// Props
interface Props {
  show: boolean
  currentSongId: string | number | null | undefined
  fullScreenMode?: boolean
}

const props = withDefaults(defineProps<Props>(), {
  fullScreenMode: false
})

// Emits
const emit = defineEmits<{
  close: []
  playSong: [song: SongList]
}>()

// Stores
const localUserStore = LocalUserDetailStore()
const { list } = storeToRefs(localUserStore)

// 拖拽排序相关状态
const isDragSorting = ref(false)
const draggedIndex = ref(-1)
const dragOverIndex = ref(-1)
const longPressTimer = ref<number | null>(null)
const longPressDelay = 500 // 长按延迟时间（毫秒）
const dragStartY = ref(0)
const dragCurrentY = ref(0)
const dragThreshold = 10 // 拖拽阈值（像素）
const draggedSong = ref<any>(null)
const isDragStarted = ref(false) // 标记是否已经开始拖动，防止触发点击事件
const wasLongPressed = ref(false) // 标记是否发生了长按操作
const autoScrollTimer = ref<number | null>(null)
const scrollSpeed = ref(0) // 自动滚动速度
const originalList = ref<any[]>([]) // 保存原始列表，用于取消拖拽时恢复

// 悬停提示相关状态
const hoverTipVisible = ref(false)
const hoverTipIndex = ref(-1)
const hoverTimer = ref<number | null>(null)
const hoverDelay = 1500 // 悬停1.5秒后显示提示

// 播放列表容器类
const playlistSongsClass = computed(() => ({
  'playlist-songs': true,
  'drag-sorting': isDragSorting.value
}))

// 格式化时间显示
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 滚动到当前播放歌曲
const scrollToCurrentSong = () => {
  if (!props.currentSongId) return

  // 使用 nextTick 确保 DOM 已更新
  nextTick(() => {
    const activeSong = window.document.querySelector('.playlist-song.active') as HTMLElement
    if (activeSong) {
      activeSong.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      })
    }
  })
}



// 关闭播放列表
const handleClose = () => {
  emit('close')
}

// 悬停提示相关方法
const handleMouseEnter = (index: number) => {
  // 如果正在拖拽，不显示提示
  if (isDragSorting.value) return
  
  // 清除之前的定时器
  if (hoverTimer.value) {
    clearTimeout(hoverTimer.value)
  }
  
  // 设置新的定时器
  hoverTimer.value = window.setTimeout(() => {
    hoverTipVisible.value = true
    hoverTipIndex.value = index
  }, hoverDelay)
}

const handleMouseLeave = () => {
  // 清除定时器
  if (hoverTimer.value) {
    clearTimeout(hoverTimer.value)
    hoverTimer.value = null
  }
  
  // 隐藏提示
  hoverTipVisible.value = false
  hoverTipIndex.value = -1
}

const hideTip = () => {
  hoverTipVisible.value = false
  hoverTipIndex.value = -1
  if (hoverTimer.value) {
    clearTimeout(hoverTimer.value)
    hoverTimer.value = null
  }
}

// 当前操作的歌曲信息
const currentOperatingSong = ref<any>(null)

// 统一的鼠标/触摸事件处理
const handleMouseDown = (event: MouseEvent, index: number, song: any) => {
  handlePointerStart(event, index, song, false)
}

const handleTouchStart = (event: TouchEvent, index: number, song: any) => {
  handlePointerStart(event, index, song, true)
}

// 拖拽排序相关方法
const handlePointerStart = (event: MouseEvent | TouchEvent, index: number, song: any, isTouch: boolean) => {
  event.preventDefault()
  event.stopPropagation()
  
  // 重置标记
  isDragStarted.value = false
  wasLongPressed.value = false
  currentOperatingSong.value = song
  
  // 清除之前的定时器
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
  }
  
  // 记录初始位置
  const clientY = isTouch ? (event as TouchEvent).touches[0].clientY : (event as MouseEvent).clientY
  dragStartY.value = clientY
  dragCurrentY.value = clientY
  
  // 设置长按定时器
  longPressTimer.value = window.setTimeout(() => {
    wasLongPressed.value = true // 标记发生了长按
    startDragSort(index, song)
    isDragStarted.value = true // 标记已开始拖动
  }, longPressDelay)
  
  // 添加移动和结束事件监听
  const handleMove = (e: MouseEvent | TouchEvent) => {
    const currentY = 'touches' in e ? e.touches[0].clientY : e.clientY
    const deltaY = Math.abs(currentY - dragStartY.value)
    
    // 如果移动距离超过阈值，取消长按
    if (deltaY > dragThreshold && longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }
    
    // 如果已经开始拖拽，更新位置
    if (isDragSorting.value) {
      dragCurrentY.value = currentY
      updateDragOverIndex(currentY)
    }
  }
  
  const handleEnd = () => {
    const hadLongPressTimer = !!longPressTimer.value
    const wasInDragMode = isDragSorting.value
    
    if (longPressTimer.value) {
      clearTimeout(longPressTimer.value)
      longPressTimer.value = null
    }
    
    if (isDragSorting.value) {
      endDragSort()
    }
    
    // 如果没有发生长按且没有在拖拽模式，说明是正常点击，触发播放
    if (!wasLongPressed.value && !wasInDragMode && hadLongPressTimer && currentOperatingSong.value) {
      // 短暂延迟后播放，确保状态已经稳定
      setTimeout(() => {
        emit('playSong', currentOperatingSong.value)
        wasLongPressed.value = false
        isDragStarted.value = false
        currentOperatingSong.value = null
      }, 10)
    } else {
      // 长按或拖拽情况，延迟重置标记
      setTimeout(() => {
        wasLongPressed.value = false
        isDragStarted.value = false
        currentOperatingSong.value = null
      }, 200)
    }
    
    // 移除事件监听
    document.removeEventListener('mousemove', handleMove)
    document.removeEventListener('mouseup', handleEnd)
    document.removeEventListener('touchmove', handleMove)
    document.removeEventListener('touchend', handleEnd)
  }
  
  // 添加事件监听
  document.addEventListener('mousemove', handleMove)
  document.addEventListener('mouseup', handleEnd)
  document.addEventListener('touchmove', handleMove)
  document.addEventListener('touchend', handleEnd)
}

const startDragSort = (index: number, song: any) => {
  // 隐藏悬停提示
  hideTip()
  
  isDragSorting.value = true
  draggedIndex.value = index
  draggedSong.value = song
  dragOverIndex.value = index
  
  // 保存原始列表用于实时预览
  originalList.value = [...list.value]
  
  // 添加拖拽样式
  document.body.style.userSelect = 'none'
  
  // 触觉反馈（如果支持）
  if ('vibrate' in navigator) {
    navigator.vibrate(50)
  }
}

const updateDragOverIndex = (clientY: number) => {
  const playlistContainer = document.querySelector('.playlist-content')
  if (!playlistContainer) return
  
  const containerRect = playlistContainer.getBoundingClientRect()
  const scrollThreshold = 80 // 增加边缘滚动触发区域
  const maxScrollSpeed = 15 // 增加最大滚动速度
  
  // 检查是否需要自动滚动
  const distanceFromTop = clientY - containerRect.top
  const distanceFromBottom = containerRect.bottom - clientY
  
  // 检查是否可以滚动
  const canScrollUp = playlistContainer.scrollTop > 0
  const canScrollDown = playlistContainer.scrollTop < (playlistContainer.scrollHeight - playlistContainer.clientHeight)
  
  if (distanceFromTop < scrollThreshold && distanceFromTop > 0 && canScrollUp) {
    // 向上滚动
    const intensity = (scrollThreshold - distanceFromTop) / scrollThreshold
    scrollSpeed.value = -intensity * maxScrollSpeed
    startAutoScroll()
  } else if (distanceFromBottom < scrollThreshold && distanceFromBottom > 0 && canScrollDown) {
    // 向下滚动
    const intensity = (scrollThreshold - distanceFromBottom) / scrollThreshold
    scrollSpeed.value = intensity * maxScrollSpeed
    startAutoScroll()
  } else {
    // 停止自动滚动
    stopAutoScroll()
  }
  
  // 计算拖拽位置，考虑容器滚动偏移
  const playlistSongs = document.querySelectorAll('.playlist-song')
  let newOverIndex = draggedIndex.value
  
  // 如果在容器范围内，计算最接近的插入位置
  if (clientY >= containerRect.top && clientY <= containerRect.bottom) {
    for (let i = 0; i < playlistSongs.length; i++) {
      const songElement = playlistSongs[i] as HTMLElement
      const rect = songElement.getBoundingClientRect()
      const centerY = rect.top + rect.height / 2
      
      if (clientY < centerY) {
        newOverIndex = i
        break
      } else if (i === playlistSongs.length - 1) {
        newOverIndex = i + 1 // 允许插入到最后
      }
    }
  } else if (clientY < containerRect.top) {
    // 在容器上方，插入到开头
    newOverIndex = 0
  } else if (clientY > containerRect.bottom) {
    // 在容器下方，插入到末尾
    newOverIndex = playlistSongs.length
  }
  
  // 实时更新列表顺序进行预览
  if (newOverIndex !== dragOverIndex.value && newOverIndex >= 0 && newOverIndex <= list.value.length) {
    dragOverIndex.value = newOverIndex
    updatePreviewList()
  }
}

// 实时预览列表更新
const updatePreviewList = () => {
  if (draggedIndex.value === -1 || dragOverIndex.value === -1) return
  
  const newList = [...list.value]
  const draggedItem = newList.splice(draggedIndex.value, 1)[0]
  
  // 计算实际插入位置
  let insertIndex = dragOverIndex.value
  if (dragOverIndex.value > draggedIndex.value) {
    insertIndex = dragOverIndex.value - 1
  }
  
  newList.splice(insertIndex, 0, draggedItem)
  
  // 更新预览列表（不保存到localStorage）
  list.value = newList
  
  // 更新拖拽索引
  draggedIndex.value = insertIndex
}

// 自动滚动相关方法
const startAutoScroll = () => {
  if (autoScrollTimer.value) return
  
  autoScrollTimer.value = window.setInterval(() => {
    const playlistContainer = document.querySelector('.playlist-content')
    if (playlistContainer && scrollSpeed.value !== 0) {
      playlistContainer.scrollTop += scrollSpeed.value
      
      // 在自动滚动过程中持续更新拖拽位置预览
      if (isDragSorting.value) {
        updateDragOverIndex(dragCurrentY.value)
      }
    }
  }, 16) // 约60fps
}

const stopAutoScroll = () => {
  if (autoScrollTimer.value) {
    clearInterval(autoScrollTimer.value)
    autoScrollTimer.value = null
  }
  scrollSpeed.value = 0
}

const endDragSort = () => {
  // 停止自动滚动
  stopAutoScroll()
  
  // 由于实时预览已经更新了列表，这里只需要确保保存
  // list.value 的变化会被 watch 监听器自动保存到 localStorage
  
  // 重置状态
  isDragSorting.value = false
  draggedIndex.value = -1
  dragOverIndex.value = -1
  draggedSong.value = null
  isDragStarted.value = false
  wasLongPressed.value = false
  
  // 移除拖拽样式
  document.body.style.userSelect = ''
}

// 组件卸载时清理
onUnmounted(() => {
  // 清理悬停提示定时器
  if (hoverTimer.value) {
    clearTimeout(hoverTimer.value)
  }
  
  // 清理拖拽相关定时器
  if (longPressTimer.value) {
    clearTimeout(longPressTimer.value)
  }
  
  // 清理自动滚动定时器
  stopAutoScroll()
})

// 暴露方法给父组件
defineExpose({
  scrollToCurrentSong
})
</script>

<template>
  <!-- 播放列表 -->
  <div v-show="show" class="cover" @click="handleClose"></div>
  <transition name="playlist-drawer">
    <div
      v-show="show"
      class="playlist-container"
      :class="{ 'full-screen-mode': fullScreenMode }"
      @click.stop
    >
      <div class="playlist-header">
        <div class="playlist-title">播放列表 ({{ list.length }})</div>
        <button class="playlist-close" @click.stop="handleClose">
          <span class="iconfont icon-guanbi"></span>
        </button>
      </div>

      <div class="playlist-content">
        <div v-if="list.length === 0" class="playlist-empty">
          <p>播放列表为空</p>
          <p>请添加歌曲到播放列表，也可在设置中导入歌曲列表</p>
        </div>
        <TransitionGroup 
          v-else 
          :class="playlistSongsClass"
          name="list-item"
          tag="div"
        >
          <div
            v-for="(song, index) in list"
            :key="song.songmid"
            class="playlist-song"
            :class="{ 
              active: song.songmid === currentSongId,
              'dragging': isDragSorting && index === draggedIndex
            }"
            @mousedown="handleMouseDown($event, index, song)"
            @touchstart="handleTouchStart($event, index, song)"
            @mouseenter="handleMouseEnter(index)"
            @mouseleave="handleMouseLeave"
          >
            <!-- 拖拽手柄 -->
            <div class="drag-handle" v-if="isDragSorting && index === draggedIndex">
              <span class="drag-dots">⋮⋮</span>
            </div>
            
            <div class="song-info">
              <div class="song-name">{{ song.name }}</div>
              <div class="song-artist">{{ song.singer }}</div>
            </div>
            <div class="song-duration">
              {{
                song.interval.includes(':')
                  ? song.interval
                  : formatTime(parseInt(song.interval) / 1000)
              }}
            </div>
            <button class="song-remove" @click.stop="localUserStore.removeSong(song.songmid)">
              <span class="iconfont icon-xuanxiangshanchu"></span>
            </button>
            
            <!-- 悬停提示 -->
            <transition name="hover-tip">
              <div 
                v-if="hoverTipVisible && hoverTipIndex === index" 
                class="hover-tip"
                @click.stop
              >
                长按可拖动排序
              </div>
            </transition>
          </div>
        </TransitionGroup>
      </div>
    </div>
  </transition>
</template>

<style lang="scss" scoped>
/* 播放列表 */
.playlist-container {
  position: fixed;
  border-radius: 16px 0 0 16px;
  top: 72px;
  right: 0;
  width: 380px;
  height: calc(100vh - var(--play-bottom-height) - 80px);
  transition:
    background-color 0.3s ease,
    color 0.3s ease;
  background: rgba(255, 255, 255, 0.6);
  /* 默认白色毛玻璃 */
  backdrop-filter: blur(20px);
  box-shadow: -5px 0 25px rgba(0, 0, 0, 0.15);
  z-index: 9001;
  display: flex;
  flex-direction: column;
  color: #333;
  transform: translateX(0);
  /* 初始位置 */
}

.cover {
  position: fixed;
  background-color: transparent;
  width: 100vw;
  height: 100vh;
  z-index: 9000;
  bottom: 0px;
  right: 0;
}

/* 全屏模式下的样式 */
.playlist-container.full-screen-mode {
  background: rgba(0, 0, 0, 0.2);
  /* 黑色毛玻璃 */
  color: #fff;
  /* 白色文字 */
}

.playlist-container.full-screen-mode .song-artist,
.playlist-container.full-screen-mode .song-duration,
.playlist-container.full-screen-mode .playlist-close,
.playlist-container.full-screen-mode .song-remove {
  color: #ccc;
}

.playlist-container.full-screen-mode .playlist-song:hover {
  background-color: rgba(255, 255, 255, 0.1);
}

.playlist-container.full-screen-mode .playlist-song.active {
  border-left: #2373ce5d 4px solid;
  background-color: rgba(255, 255, 255, 0.2);
}

.playlist-container .playlist-song.active {
  border-left: #2373ce93 4px solid;
  background-color: rgba(114, 231, 255, 0.183);
}

.playlist-container.full-screen-mode .playlist-header {
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.playlist-container.full-screen-mode .playlist-empty {
  color: #ccc;
}

.playlist-header {
  -webkit-app-region: no-drag;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px;
  flex-shrink: 0;
  border-bottom: 1px solid rgba(0, 0, 0, 0.1);
}

.playlist-title {
  font-size: 16px;
  font-weight: 600;
}

.playlist-close {
  -webkit-app-region: no-drag;
  background: transparent;
  border: none;
  color: #666;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.playlist-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: none;
  margin: 10px 0;
  padding: 0 8px;
}

.playlist-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100px;
  color: #333;
  font-size: 14px;
  text-align: center;
}

.playlist-songs {
  display: flex;
  flex-direction: column;
}

/* 拖拽排序时的动画优化 */
.playlist-songs.drag-sorting .playlist-song:not(.dragging) {
  transition: transform 0.2s cubic-bezier(0.4, 0, 0.2, 1);
}

.playlist-songs.drag-sorting .playlist-song.dragging {
  transition: none;
  z-index: 1000;
  opacity: 0.8;
  transform: scale(1.02);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.15);
}

/* TransitionGroup 列表动画 */
.list-item-move,
.list-item-enter-active,
.list-item-leave-active {
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

.list-item-enter-from,
.list-item-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}

.list-item-leave-active {
  position: absolute;
  width: 100%;
}

/* 拖拽时禁用列表动画，避免冲突 */
.playlist-songs.drag-sorting .list-item-move,
.playlist-songs.drag-sorting .list-item-enter-active,
.playlist-songs.drag-sorting .list-item-leave-active {
  transition: none;
}

.playlist-song {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 10px;
  margin: 5px 0;
  transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  position: relative;
  user-select: none;
  transform: translateY(0);
}

.playlist-song:hover {
  background-color: rgba(123, 123, 123, 0.384);
}

.playlist-song.active {
  background-color: rgba(255, 255, 255, 0.15);
}

/* 拖拽相关样式 */
.playlist-song.dragging {
  opacity: 0.8;
  transform: scale(1.02);
  box-shadow: 0 8px 25px rgba(0, 0, 0, 0.3);
  z-index: 1000;
  background-color: rgba(255, 255, 255, 0.2) !important;
}

/* 拖拽手柄样式 */
.drag-handle {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  margin-right: 8px;
  transition: opacity 0.2s ease;
  cursor: grab;
  color: #999;
}

.drag-handle:active {
  cursor: grabbing;
}

.drag-dots {
  font-size: 16px;
  line-height: 1;
  letter-spacing: -2px;
  transform: rotate(90deg);
}

/* 拖拽状态下的样式调整 */
.playlist-songs.drag-sorting {
  pointer-events: none;
}

.playlist-songs.drag-sorting .playlist-song {
  pointer-events: auto;
}

.playlist-songs.drag-sorting .playlist-song:not(.dragging) {
  cursor: default;
}

.playlist-song .song-info {
  flex: 1;
  min-width: 0;
}

.playlist-song .song-name {
  font-size: 14px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-container.full-screen-mode .playlist-song .song-name {
  color: #fff;
}

.playlist-song .song-artist {
  font-size: 12px;
  color: #666;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.playlist-song .song-duration {
  font-size: 12px;
  color: #888;
  margin: 0 12px;
}

.playlist-song .song-remove {
  background: transparent;
  border: none;
  color: #999;
  opacity: 0;
  cursor: pointer;
  padding: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: opacity 0.2s ease;
}

.playlist-song:hover .song-remove {
  opacity: 1;
}

/* 悬停提示样式 */
.hover-tip {
  position: absolute;
  top: 50%;
  right: 50px;
  transform: translateY(-50%);
  background: rgba(0, 0, 0, 0.6);
  color: white;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  white-space: nowrap;
  pointer-events: none;
  z-index: 1001;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

.playlist-container.full-screen-mode .hover-tip {
  background: rgba(255, 255, 255, 0.6);
  color: #000000;
}

/* 悬停提示过渡动画 */
.hover-tip-enter-active,
.hover-tip-leave-active {
  transition: all 0.2s ease;
}

.hover-tip-enter-from,
.hover-tip-leave-to {
  opacity: 0;
  transform: translateY(-50%) scale(0.9);
}

/* 播放列表抽屉过渡 */
.playlist-drawer-enter-active,
.playlist-drawer-leave-active {
  transition: transform 0.2s cubic-bezier(0.8, 0, 0.8, 0.43);
}

.playlist-drawer-enter-from,
.playlist-drawer-leave-to {
  transform: translateX(100%);
}

/* 响应式设计 */
@media (max-width: 768px) {
  .playlist-container {
    width: 100%;
    right: 0;
    border-radius: 8px 8px 0 0;
  }
}
</style>