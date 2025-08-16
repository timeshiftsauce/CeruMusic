<script setup lang="ts">
import { ref, computed } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import {  SkipBackIcon, SkipForwardIcon } from '../../assets/icon_font/icons'
import { storeToRefs } from 'pinia'
import { PlayIcon, PauseIcon } from 'tdesign-icons-vue-next'


const controlAudio = ControlAudioStore()
const { Audio } = storeToRefs(controlAudio)
const {  setCurrentTime, start, stop } = controlAudio

controlAudio.setUrl('http://www.yinsuge.com/d/file/p/2020/05-14/3c3653104476b164566c84184466d193.mp3')


// 进度条相关
const progressRef = ref<HTMLDivElement | null>(null)
const isDraggingProgress = ref(false)
const tempProgressPercentage = ref(Audio.value.audio?.currentTime||0)
const progressPercentage = computed(() => {
  if (isDraggingProgress.value) {
    return tempProgressPercentage.value
  }
  if (Audio.value.duration === 0) return 0
  return (Audio.value.currentTime / Audio.value.duration) * 100
})

// 格式化时间显示
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 当前播放时间和总时长的格式化显示
const currentTimeFormatted = computed(() => formatTime(Audio.value.currentTime))
const durationFormatted = computed(() => formatTime(Audio.value.duration))


// 播放/暂停切换
const togglePlayPause = async () => {
  if (Audio.value.isPlay) {
    await stop()
  } else {
    await start()
  }
}

// 进度条拖动处理
const handleProgressClick = (event: MouseEvent) => {
  if (!progressRef.value) return

  const rect = progressRef.value.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const percentage = (offsetX / rect.width) * 100

  // 更新临时进度值，使UI立即响应
  tempProgressPercentage.value = percentage

  const newTime = (percentage / 100) * Audio.value.duration

  setCurrentTime(newTime)
  if (Audio.value.audio) {
    Audio.value.audio.currentTime = newTime
  }
}

const handleProgressDragMove = (event: MouseEvent) => {
  if (!isDraggingProgress.value || !progressRef.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const percentage = (offsetX / rect.width) * 100

  // 拖动时只更新UI，不频繁设置audio.currentTime
  tempProgressPercentage.value = percentage
}

const handleProgressDragEnd = (event: MouseEvent) => {
  document.querySelector('.progress-handle')?.classList.remove('dragging')

  if (!isDraggingProgress.value || !progressRef.value) {
    isDraggingProgress.value = false
    window.removeEventListener('mousemove', handleProgressDragMove)
    window.removeEventListener('mouseup', handleProgressDragEnd)
    return
  }

  const rect = progressRef.value.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const percentage = (offsetX / rect.width) * 100
  const newTime = (percentage / 100) * Audio.value.duration

  setCurrentTime(newTime)
  if (Audio.value.audio) {
    Audio.value.audio.currentTime = newTime
  }

  isDraggingProgress.value = false
  window.removeEventListener('mousemove', handleProgressDragMove)
  window.removeEventListener('mouseup', handleProgressDragEnd)
}

const handleProgressDragStart = (event: MouseEvent) => {
  event.preventDefault()
  document.querySelector('.progress-handle')?.classList.add('dragging')

  isDraggingProgress.value = true
  window.addEventListener('mousemove', handleProgressDragMove)
  window.addEventListener('mouseup', handleProgressDragEnd)
}


// 歌曲信息
const songInfo = ref({
  title: '别让我担心 (Acoustic Ver.)',
  artist: 'ChillChill',
  cover: '@renderer/assets/images/cover.png'
})
</script>

<template>
  <div class="player-container">
    <!-- 进度条 -->
    <div class="progress-bar-container">
      <div
        class="progress-bar"
        ref="progressRef"
        @mousedown="handleProgressDragStart($event)"
        @click.stop="handleProgressClick"
      >
        <div class="progress-background"></div>
        <div class="progress-filled" :style="{ width: `${progressPercentage}%` }"></div>
        <div class="progress-handle" :style="{ left: `${progressPercentage}%` }"></div>
      </div>
    </div>

    <div class="player-content">
      <!-- 左侧：封面和歌曲信息 -->
      <div class="left-section">
        <div class="album-cover">
          <img src="@renderer/assets/images/cover.png" alt="专辑封面" />
        </div>

        <div class="song-info">
          <div class="song-name">{{ songInfo.title }}</div>
          <div class="artist-name">{{ songInfo.artist }}</div>
        </div>
      </div>

      <!-- 中间：播放控制 -->
      <div class="center-controls">
        <button class="control-btn">
          <skip-back-icon class="icon" />
        </button>
        <button class="control-btn play-btn" @click.stop="togglePlayPause">
          <!-- <component :is="Audio.isPlay ? PauseIcon : PlayIcon " class="icon play-icon" /> -->
          <transition name="fade" mode="out-in">
            <PauseIcon v-if="Audio.isPlay" class="icon play-icon"/>
            <PlayIcon v-else class="icon play-icon"/>
          </transition>
        </button>
        <button class="control-btn">
          <skip-forward-icon class="icon" />
        </button>
      </div>

      <!-- 右侧：时间和其他控制 -->
      <div class="right-section">
        <div class="time-display">
          {{ currentTimeFormatted }} / {{ durationFormatted }}
        </div>

        <div class="extra-controls">
          <button class="control-btn">
            <i class="iconfont icon-suijibofang"></i>
          </button>
          <button class="control-btn">
            <i class="iconfont icon-a-yinleyinxiaoduomeiti"></i>
          </button>
          <button class="control-btn">
            <i class="iconfont icon-gengduo"></i>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
.fade-leave-active {
  transition: all 0.2s ease-in-out;
}
.fade-enter-active{
  transition: all 0.1s ease-in-out;
}
.fade-leave-to {
  opacity: 0;
  transform: rotate(180deg);
}
.fade-enter-from {
  opacity: 0;
  transform: rotate(-180deg);
}

.player-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  background: #fff;
  border-top: 1px solid #e5e7eb;
  z-index: 1000;
  height: var(--play-bottom-height);
  display: flex;
  flex-direction: column;
}

/* 进度条样式 */
.progress-bar-container {
  width: 100%;
  height: 4px;
  cursor: pointer;
  position: relative;

  .progress-bar {
    width: 100%;
    height: 100%;
    position: relative;

    .progress-background {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 100%;
      background: #e5e7eb;
    }

    .progress-filled {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: linear-gradient(to right, #ea5a0c2f, #ea5a0ca1 80%);
      border-radius: 999px;
    }

    .progress-handle {
      position: absolute;
      top: 50%;
      width: 12px;
      height: 12px;
      background: #f97316;
      border-radius: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;
      // transition: opacity 0.2s ease;

      &:hover ,&:active,&.dragging {
        opacity: 1;
      }

    }

    &:hover .progress-handle {
      opacity: 1;
    }
  }
}

/* 播放器内容 */
.player-content {
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  height: calc(100% - 4px);
}

/* 左侧：封面和歌曲信息 */
.left-section {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;

  .album-cover {
    width: 50px;
    height: 50px;
    border-radius: 4px;
    overflow: hidden;
    margin-right: 12px;
    flex-shrink: 0;

    img {
      user-select: none;
      width: 100%;
      height: 100%;
      object-fit: cover;
      -webkit-user-drag: none;
    }
  }

  .song-info {
    min-width: 0;

    .song-name {
      font-size: 14px;
      font-weight: 500;
      color: #111827;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .artist-name {
      font-size: 12px;
      color: #6b7280;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

/* 中间：播放控制 */
.center-controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 16px;
  flex: 1;

  .control-btn {
    background: transparent;
    border: none;
    color: #6b7280;
    cursor: pointer;
    padding: 8px;
    display: flex;
    align-items: center;
    justify-content: center;

    .icon {
      width: 20px;
      height: 20px;
    }

    &:hover {
      color: #111827;
    }

    &.play-btn {
      background-color: #f97316;
      border-radius: 50%;
      width: 40px;
      height: 40px;
      color: white;

      .play-icon {
        width: 24px;
        height: 24px;
      }

      &:hover {
        background-color: #ea580c;
        color: white;
      }
    }
  }
}

/* 右侧：时间和其他控制 */
.right-section {
  display: flex;
  align-items: center;
  gap: 16px;
  flex: 1;
  justify-content: flex-end;

  .time-display {
    font-size: 12px;
    color: #6b7280;
    white-space: nowrap;
  }

  .extra-controls {
    display: flex;
    align-items: center;
    gap: 12px;

    .control-btn {
      background: transparent;
      border: none;
      color: #6b7280;
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;

      .iconfont {
        font-size: 18px;
      }

      &:hover {
        color: #111827;
      }
    }
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .right-section .time-display {
    display: none;
  }

  .center-controls {
    gap: 8px;
  }

  .right-section .extra-controls {
    gap: 8px;
  }
}

@media (max-width: 576px) {
  .left-section .song-info {
    max-width: 120px;
  }

  .right-section .extra-controls .control-btn:nth-child(1),
  .right-section .extra-controls .control-btn:nth-child(2) {
    display: none;
  }
}
</style>
