<script setup lang="ts">
import {
  ref,
  computed,
  onMounted,
  onUnmounted,
  watch,
  nextTick,
  onActivated,
  onDeactivated,
  toRaw
} from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import icons from '../../assets/icon_font/icons'
const { liebiao, shengyin } = icons
import { storeToRefs } from 'pinia'
import FullPlay from './FullPlay.vue'
import PlaylistDrawer from './PlaylistDrawer.vue'
import { PlayMode } from '@renderer/types/audio'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  playNext,
  playPrevious,
  updatePlayMode,
  togglePlayPause,
  isLoadingSong,
  setVolume,
  seekTo,
  playSong,
  playMode
} from '@renderer/utils/audio/globaPlayList'
import songCover from '@renderer/assets/images/song.jpg'
import { downloadSingleSong } from '@renderer/utils/audio/download'
import { HeartIcon, DownloadIcon, CheckIcon, LockOnIcon } from 'tdesign-icons-vue-next'
import _ from 'lodash'
import { songListAPI } from '@renderer/api/songList'

const controlAudio = ControlAudioStore()
const localUserStore = LocalUserDetailStore()
const globalPlayStatus = useGlobalPlayStatusStore()
const { Audio } = storeToRefs(controlAudio)
const { list, userInfo } = storeToRefs(localUserStore)
const { player } = storeToRefs(globalPlayStatus)
const songInfo = computed(() => player.value.songInfo || ({} as any))

const {} = controlAudio

// 当前歌曲是否已在“我的喜欢”
const likeState = ref(false)
const isLiked = computed(() => likeState.value)

const refreshLikeState = async () => {
  try {
    if (!userInfo.value.lastPlaySongId) {
      likeState.value = false
      return
    }
    const favIdRes = await window.api.songList.getFavoritesId()
    const favoritesId: string | null = (favIdRes && favIdRes.data) || null
    if (!favoritesId) {
      likeState.value = false
      return
    }
    const hasRes = await songListAPI.hasSong(favoritesId, userInfo.value.lastPlaySongId)
    likeState.value = !!(hasRes.success && hasRes.data)
  } catch {
    likeState.value = false
  }
}

watch(
  () => userInfo.value.lastPlaySongId,
  () => refreshLikeState()
)
onMounted(() => refreshLikeState())
const showFullPlay = ref(false)
// 桌面歌词开关与锁定状态
const desktopLyricOpen = ref(false)
const desktopLyricLocked = ref(false)

// 桌面歌词按钮逻辑：
// - 若未打开：打开桌面歌词
// - 若已打开且锁定：先解锁，不关闭
// - 若已打开且未锁定：关闭桌面歌词
const toggleDesktopLyric = async () => {
  try {
    if (!desktopLyricOpen.value) {
      window.electron?.ipcRenderer?.send?.('change-desktop-lyric', true)
      desktopLyricOpen.value = true
      // 恢复最新锁定状态
      const lock = await window.electron?.ipcRenderer?.invoke?.('get-lyric-lock-state')
      desktopLyricLocked.value = !!lock
      return
    }
    // 已打开
    const lock = await window.electron?.ipcRenderer?.invoke?.('get-lyric-lock-state')
    desktopLyricLocked.value = !!lock
    if (desktopLyricLocked.value) {
      // 先解锁，本次不关闭
      window.electron?.ipcRenderer?.send?.('toogleDesktopLyricLock', false)
      desktopLyricLocked.value = false
      return
    }
    // 未锁定则关闭
    window.electron?.ipcRenderer?.send?.('change-desktop-lyric', false)
    desktopLyricOpen.value = false
  } catch (e) {
    console.error('切换桌面歌词失败:', e)
  }
}
// 等待音频准备就绪
// 播放位置恢复逻辑由全局播放管理器处理

// 记录组件被停用前的播放状态
// let wasPlaying = false

// let playbackPosition = 0
let isFull = false

// 获取播放模式图标类名
const playModeTip = ref('')
const playModeIconClass = computed(() => {
  switch (playMode.value) {
    case PlayMode.SEQUENCE:
      playModeTip.value = '顺序播放'
      return 'iconfont icon-shunxubofangtubiao'
    case PlayMode.RANDOM:
      playModeTip.value = '随机播放'
      return 'iconfont icon-suijibofang'
    case PlayMode.SINGLE:
      playModeTip.value = '单曲循环'
      return 'iconfont icon-bofang-xunhuanbofang'
    default:
      return 'iconfont icon-shunxubofangtubiao'
  }
})

// 音量控制相关
const showVolumeSlider = ref(false)
const volumeBarRef = ref<HTMLDivElement | null>(null)
const isDraggingVolume = ref(false)

const volumeValue = computed({
  get: () => Audio.value.volume,
  set: (val) => {
    setVolume(val)
  }
})

// 音量控制拖动处理
const handleVolumeClick = (event: MouseEvent) => {
  if (!volumeBarRef.value) return

  const rect = volumeBarRef.value.getBoundingClientRect()
  const offsetY = rect.bottom - event.clientY
  const percentage = Math.max(0, Math.min(100, (offsetY / rect.height) * 100))

  volumeValue.value = Math.round(percentage)
}

const handleVolumeDragStart = (event: MouseEvent) => {
  event.preventDefault()
  isDraggingVolume.value = true
  window.addEventListener('mousemove', handleVolumeDragMove)
  window.addEventListener('mouseup', handleVolumeDragEnd)
}

const handleVolumeDragMove = (event: MouseEvent) => {
  if (!isDraggingVolume.value || !volumeBarRef.value) return

  const rect = volumeBarRef.value.getBoundingClientRect()
  const offsetY = rect.bottom - event.clientY
  const percentage = Math.max(0, Math.min(100, (offsetY / rect.height) * 100))

  volumeValue.value = Math.round(percentage)
}

const handleVolumeDragEnd = () => {
  isDraggingVolume.value = false
  window.removeEventListener('mousemove', handleVolumeDragMove)
  window.removeEventListener('mouseup', handleVolumeDragEnd)
}

const handleVolumeWheel = (event: WheelEvent) => {
  event.preventDefault()

  const volumeStep = event.deltaY > 0 ? -5 : 5
  const updatedVolume = Math.max(0, Math.min(100, volumeValue.value + volumeStep))

  if (updatedVolume === volumeValue.value) {
    return
  }

  volumeValue.value = updatedVolume
}

// 播放列表相关
const showPlaylist = ref(false)
const playlistDrawerRef = ref<InstanceType<typeof PlaylistDrawer> | null>(null)

const togglePlaylist = (e: MouseEvent) => {
  e.stopPropagation()
  showPlaylist.value = !showPlaylist.value

  // 如果打开播放列表，滚动到当前播放歌曲
  if (showPlaylist.value) {
    nextTick(() => {
      playlistDrawerRef.value?.scrollToCurrentSong()
    })
  }
}

// 播放列表中的歌曲
const currentSongId = computed(() => userInfo.value.lastPlaySongId)

// 关闭播放列表
const closePlaylist = () => {
  showPlaylist.value = false
}

// 播放上一首
// 上一首/下一首由全局播放管理器提供

// 定期保存当前播放位置
// 全局快捷控制事件由全局播放管理器处理
// 初始化播放器

function globalControls(e) {
  console.log('全局:', e)
  if (e.detail.name === 'toggleFullPlay') {
    toggleFullPlay()
  }
}

onMounted(async () => {
  // 监听来自主进程的锁定状态广播
  window.electron?.ipcRenderer?.on?.('toogleDesktopLyricLock', (_, lock) => {
    desktopLyricLocked.value = !!lock
  })
  window.electron?.ipcRenderer?.on?.(
    'desktop-lyric-open-change',
    async (_: any, visible: boolean) => {
      desktopLyricOpen.value = !!visible
      if (desktopLyricOpen.value) {
        const lock = await window.electron?.ipcRenderer?.invoke?.('get-lyric-lock-state')
        desktopLyricLocked.value = !!lock
      } else {
        desktopLyricLocked.value = false
      }
    }
  )
  // 监听主进程通知关闭桌面歌词
  window.electron?.ipcRenderer?.on?.('closeDesktopLyric', () => {
    desktopLyricOpen.value = false
    desktopLyricLocked.value = false
  })
  // 初始化同步当前打开与锁定状态
  try {
    const open = await window.electron?.ipcRenderer?.invoke?.('get-lyric-open-state')
    desktopLyricOpen.value = !!open
    const lock = await window.electron?.ipcRenderer?.invoke?.('get-lyric-lock-state')
    desktopLyricLocked.value = !!lock
  } catch {}
  window.addEventListener('global-music-control', globalControls)
})

// 组件卸载时清理
onUnmounted(() => {
  window.electron?.ipcRenderer?.removeAllListeners?.('toogleDesktopLyricLock')
  window.electron?.ipcRenderer?.removeAllListeners?.('desktop-lyric-open-change')
  window.electron?.ipcRenderer?.removeAllListeners?.('closeDesktopLyric')
  window.removeEventListener('global-music-control', globalControls)

  // 清理可能存在的拖动监听器
  window.removeEventListener('mousemove', handleVolumeDragMove)
  window.removeEventListener('mouseup', handleVolumeDragEnd)
  window.removeEventListener('mousemove', handleProgressDragMove)
  window.removeEventListener('mouseup', handleProgressDragEnd)
})

// 组件被激活时（从缓存中恢复）
onActivated(async () => {
  console.log('PlayMusic组件被激活')
  if (isFull) {
    showFullPlay.value = true
  }
})

// 组件被停用时（缓存但不销毁）
onDeactivated(() => {
  console.log('PlayMusic组件被停用')
  // 仅记录状态，不主动暂停，避免页面切换导致音乐暂停
  // wasPlaying = Audio.value.isPlay
  isFull = showFullPlay.value
})

// 监听用户信息变化，更新音量
watch(
  () => userInfo.value.volume,
  (newVolume) => {
    if (newVolume !== undefined) {
      setVolume(newVolume)
    }
  },
  { immediate: true }
)

// 全屏展示相关
const toggleFullPlay = () => {
  if (!songInfo.value.songmid) return
  showFullPlay.value = !showFullPlay.value
}

// 全屏闲置状态
const isFullPlayIdle = ref(false)
const handleIdleChange = (idle: boolean) => {
  isFullPlayIdle.value = idle
}

// 左侧操作：喜欢/取消喜欢（支持切换）
const onToggleLike = async () => {
  try {
    // 获取当前播放歌曲对象
    const currentSong = list.value.find((s) => s.songmid === userInfo.value.lastPlaySongId)
    if (!currentSong) {
      MessagePlugin.warning('当前没有正在播放的歌曲')
      return
    }

    // 读取持久化的“我的喜欢”歌单ID
    const favIdRes = await window.api.songList.getFavoritesId()
    let favoritesId: string | null = (favIdRes && favIdRes.data) || null

    // 如果已有ID但歌单不存在，则置空
    if (favoritesId) {
      const existsRes = await songListAPI.exists(favoritesId)
      if (!existsRes.success || !existsRes.data) {
        favoritesId = null
      }
    }

    // 如果没有ID，尝试查找同名歌单；找不到则创建
    if (!favoritesId) {
      const searchRes = await songListAPI.search('我的喜欢', 'local')
      if (searchRes.success && Array.isArray(searchRes.data)) {
        const exact = searchRes.data.find((pl) => pl.name === '我的喜欢' && pl.source === 'local')
        favoritesId = exact?.id || null
      }
      if (!favoritesId) {
        const createRes = await songListAPI.create('我的喜欢', '', 'local')
        if (!createRes.success || !createRes.data?.id) {
          MessagePlugin.error(createRes.error || '创建“我的喜欢”失败')
          return
        }
        favoritesId = createRes.data.id
      }
      // 持久化ID到主进程配置
      await window.api.songList.setFavoritesId(favoritesId)
    }

    // 根据当前状态决定添加或移除
    if (likeState.value) {
      const removeRes = await songListAPI.removeSong(
        favoritesId!,
        userInfo.value.lastPlaySongId as any
      )
      if (removeRes.success && removeRes.data) {
        likeState.value = false
        // MessagePlugin.success('已取消喜欢')
      } else {
        MessagePlugin.error(removeRes.error || '取消喜欢失败')
      }
    } else {
      const addRes = await songListAPI.addSongs(favoritesId!, [
        _.cloneDeep(toRaw(currentSong)) as any
      ])
      if (addRes.success) {
        likeState.value = true
        // MessagePlugin.success('已添加到“我的喜欢”')
      } else {
        MessagePlugin.error(addRes.error || '添加到“我的喜欢”失败')
      }
    }
  } catch (error: any) {
    console.error('切换喜欢状态失败:', error)
    MessagePlugin.error('操作失败，请稍后重试')
  }
}

const onDownload = async () => {
  try {
    await downloadSingleSong(_.cloneDeep(toRaw(songInfo.value)) as any)
    MessagePlugin.success('开始下载当前歌曲')
  } catch (e: any) {
    console.error('下载失败:', e)
    MessagePlugin.error('下载失败，请稍后重试')
  }
}

// 进度条相关
const progressRef = ref<HTMLDivElement | null>(null)
const isDraggingProgress = ref(false)
const tempProgressPercentage = ref(Audio.value.audio?.currentTime || 0)
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

// 进度条拖动处理
const handleProgressClick = (event: MouseEvent) => {
  if (!progressRef.value) return

  const rect = progressRef.value.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const percentage = (offsetX / rect.width) * 100

  // 更新临时进度值，使UI立即响应
  tempProgressPercentage.value = percentage

  const newTime = (percentage / 100) * Audio.value.duration
  seekTo(newTime)
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
  seekTo(newTime)

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

// 歌曲信息由全局播放管理器提供
const maincolor = computed(() => player.value.coverDetail.mainColor || 'var(--td-brand-color-5)')
const startmaincolor = computed(() => {
  const c = player.value.coverDetail.ColorObject
  if (c) return `rgba(${c.r},${c.g},${c.b},.2)`
  return 'rgba(0, 0, 0, 1)'
})
const contrastTextColor = computed(
  () => player.value.coverDetail.textColor || 'var(--player-text-idle)'
)
const hoverColor = computed(
  () => player.value.coverDetail.hoverColor || 'var(--player-text-hover-idle)'
)
const playbg = computed(() => player.value.coverDetail.playBg || 'var(--player-btn-bg-idle)')
const playbghover = computed(
  () => player.value.coverDetail.playBgHover || 'var(--player-btn-bg-hover-idle)'
)

const bg = ref('var(--player-bg-default)')

watch(
  songInfo,
  async (newVal) => {
    bg.value = bg.value === 'var(--player-bg-idle)' ? 'var(--player-bg-default)' : toRaw(bg.value)
    if (!newVal.songmid) {
      bg.value = 'var(--player-bg-idle)'
    }
  },
  { deep: true, immediate: true }
)

watch(showFullPlay, (val) => {
  if (val) {
    console.log('背景hei')
    bg.value = '#00000020'
  } else {
    bg.value = 'var(--player-bg-default)'
  }
})
</script>

<template>
  <div
    class="player-container"
    :style="!showFullPlay && 'box-shadow: none'"
    :class="{ 'full-play-idle': isFullPlayIdle && showFullPlay }"
    @click.stop="toggleFullPlay"
  >
    <!-- 进度条 -->
    <div class="progress-bar-container">
      <div
        ref="progressRef"
        class="progress-bar"
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
        <div v-if="songInfo.songmid" class="album-cover">
          <img :src="player.cover || songCover" alt="专辑封面" />
        </div>

        <div class="song-info">
          <div class="song-name">{{ songInfo.name }}</div>
          <div class="artist-name">{{ songInfo.singer }}</div>
        </div>

        <div class="left-actions">
          <t-tooltip :content="isLiked ? '已喜欢' : '喜欢'">
            <t-button
              class="control-btn"
              variant="text"
              shape="circle"
              :disabled="!songInfo.songmid"
              @click.stop="onToggleLike"
            >
              <heart-icon
                :fill-color="isLiked ? ['#FF7878', '#FF7878'] : ''"
                :stroke-color="isLiked ? [] : [contrastTextColor, contrastTextColor]"
                :stroke-width="isLiked ? 0 : 2"
                size="18"
              />
            </t-button>
          </t-tooltip>
          <t-tooltip content="下载">
            <t-button
              class="control-btn"
              variant="text"
              shape="circle"
              :disabled="!songInfo.songmid"
              @click.stop="onDownload"
            >
              <DownloadIcon size="18" />
            </t-button>
          </t-tooltip>
        </div>
      </div>

      <!-- 中间：播放控制 -->
      <div class="center-controls">
        <t-button class="control-btn" variant="text" shape="circle" @click.stop="playPrevious">
          <span class="iconfont icon-shangyishou"></span>
        </t-button>
        <button
          class="control-btn play-btn"
          :disabled="isLoadingSong"
          @click.stop="() => !isLoadingSong && togglePlayPause()"
        >
          <transition name="fade" mode="out-in">
            <div v-if="isLoadingSong" key="loading" class="loading-spinner play-loading"></div>
            <span v-else-if="Audio.isPlay" key="play" class="iconfont icon-zanting"></span>
            <span v-else key="pause" class="iconfont icon-bofang"></span>
          </transition>
        </button>
        <t-button class="control-btn" shape="circle" variant="text" @click.stop="playNext">
          <span class="iconfont icon-xiayishou"></span>
        </t-button>
      </div>

      <!-- 右侧：时间和其他控制 -->
      <div class="right-section">
        <div class="time-display">{{ currentTimeFormatted }} / {{ durationFormatted }}</div>

        <div class="extra-controls">
          <!-- 播放模式按钮 -->
          <t-tooltip :content="playModeTip">
            <t-button
              class="control-btn"
              shape="circle"
              variant="text"
              @click.stop="updatePlayMode"
            >
              <i :class="playModeIconClass + ' ' + 'PlayMode'" style="width: 1.5em"></i>
            </t-button>
          </t-tooltip>

          <!-- 音量控制 -->
          <div
            class="volume-control"
            @mouseenter="showVolumeSlider = true"
            @mouseleave="showVolumeSlider = false"
            @wheel.prevent="handleVolumeWheel"
          >
            <button class="control-btn">
              <shengyin style="width: 1.5em; height: 1.5em" />
            </button>

            <!-- 音量滑块 -->
            <transition name="volume-popup">
              <div v-show="showVolumeSlider" class="volume-slider-container" @click.stop>
                <div class="volume-slider">
                  <div
                    ref="volumeBarRef"
                    class="volume-bar"
                    @click="handleVolumeClick"
                    @mousedown="handleVolumeDragStart"
                  >
                    <div class="volume-background"></div>
                    <div class="volume-filled" :style="{ height: `${volumeValue}%` }"></div>
                    <div class="volume-handle" :style="{ bottom: `${volumeValue}%` }"></div>
                  </div>
                  <div class="volume-value">{{ volumeValue }}%</div>
                </div>
              </div>
            </transition>
          </div>

          <!-- 桌面歌词开关按钮 -->
          <t-tooltip
            :content="
              desktopLyricOpen ? (desktopLyricLocked ? '解锁歌词' : '关闭桌面歌词') : '打开桌面歌词'
            "
          >
            <t-button
              class="control-btn lyric-btn"
              shape="circle"
              variant="text"
              :disabled="!songInfo.songmid"
              @click.stop="toggleDesktopLyric"
            >
              <SvgIcon name="lyricOpen" size="18"></SvgIcon>
              <transition name="fade" mode="out-in">
                <template v-if="desktopLyricOpen">
                  <LockOnIcon v-if="desktopLyricLocked" key="lock" class="lyric-lock" size="8" />
                  <CheckIcon v-else key="check" class="lyric-check" size="8" />
                </template>
              </transition>
            </t-button>
          </t-tooltip>

          <!-- 播放列表按钮 -->
          <t-tooltip content="播放列表">
            <n-badge :value="list.length" :max="99" color="#bbb">
              <t-button
                class="control-btn"
                shape="circle"
                variant="text"
                @click.stop="togglePlaylist"
              >
                <liebiao style="width: 1.5em; height: 1.5em" />
              </t-button>
            </n-badge>
          </t-tooltip>
        </div>
      </div>
    </div>
  </div>
  <div class="fullbox">
    <FullPlay
      :song-id="songInfo.songmid ? songInfo.songmid.toString() : null"
      :show="showFullPlay"
      :cover-image="player.cover"
      :song-info="songInfo"
      :main-color="maincolor"
      @toggle-fullscreen="toggleFullPlay"
      @idle-change="handleIdleChange"
    />
  </div>

  <!-- 播放列表组件 -->
  <PlaylistDrawer
    ref="playlistDrawerRef"
    :show="showPlaylist"
    :current-song-id="currentSongId"
    :full-screen-mode="showFullPlay"
    @close="closePlaylist"
    @play-song="playSong"
  />
</template>

<style lang="scss" scoped>
.fade-leave-active {
  transition: all 0.2s ease-in-out;
}

.fade-enter-active {
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

/* 加载动画 */
.loading-spinner {
  border: 2px solid rgba(255, 255, 255, 0.3);
  border-top: 2px solid v-bind(hoverColor);
  border-radius: 50%;
  animation: spin 1s linear infinite;
  display: inline-block;
  width: 1em;
  height: 1em;
}

/* 播放按钮中的加载动画 */
.play-loading {
  width: 20px !important;
  height: 20px !important;
  margin: 4px;
  border-width: 3px;
  border-color: rgba(255, 255, 255, 0.3);
  border-top-color: v-bind(hoverColor);
}

@keyframes spin {
  from {
    transform: rotate(0deg);
  }

  to {
    transform: rotate(360deg);
  }
}

/* 加载歌曲过渡动画 - 缩小透明效果 */
.loadSong-enter-active,
.loadSong-leave-active {
  transition: all 0.2s ease-in-out;
}

.loadSong-enter-from,
.loadSong-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.loadSong-enter-to,
.loadSong-leave-from {
  opacity: 1;
  transform: scale(1);
}

.player-container {
  box-shadow: 0px -2px 20px 0px #00000039;
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  transition:
    transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1),
    background 0.3s;
  background: v-bind(bg);
  // border-top: 1px solid #e5e7eb;
  backdrop-filter: blur(1000px);
  z-index: 1000;
  height: var(--play-bottom-height);
  display: flex;
  flex-direction: column;

  &.full-play-idle {
    transform: translateY(100%);
  }
}

/* 进度条样式 */
.progress-bar-container {
  width: 100%;
  --touch-range-height: 20px;
  --play-line-height: 4px;
  height: calc(var(--touch-range-height) + var(--play-line-height)); // 放大可点击区域，但保持视觉细
  position: absolute;
  top: calc(var(--touch-range-height) / 2 * -1);
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  .progress-bar {
    width: 100%;
    height: 100%;
    position: relative;

    // 视觉上的细轨道，垂直居中
    .progress-background,
    .progress-filled {
      position: absolute;
      left: 0;
      right: 0;
      height: var(--play-line-height);
      top: 50%;
      transform: translateY(-50%);
      border-radius: 999px;
    }

    .progress-background {
      background: transparent;
    }

    .progress-filled {
      background: linear-gradient(to right, v-bind(startmaincolor), v-bind(maincolor) 80%);
    }

    .progress-handle {
      position: absolute;
      top: 50%;
      width: 12px;
      height: 12px;
      background: v-bind(hoverColor);
      border-radius: 50%;
      transform: translate(-50%, -50%);
      opacity: 0;

      &:hover,
      &:active,
      &.dragging {
        opacity: 1;
      }
    }

    // 悬停或拖拽时，轻微加粗提升可见性
    &:hover {
      .progress-background,
      .progress-filled {
        height: 6px;
      }
    }
    &:has(.progress-handle.dragging) {
      .progress-background,
      .progress-filled {
        height: 6px;
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
  padding: 0 40px;
  height: calc(100% - 4px);
}

/* 左侧：封面和歌曲信息 */
.left-section {
  display: flex;
  align-items: center;
  min-width: 0;
  flex: 1;
  padding-top: 2px;

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
      font-weight: 700;
      color: v-bind(hoverColor);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 4px;
    }

    .artist-name {
      font-size: 12px;
      color: v-bind(contrastTextColor);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
  }
}

/* 左侧操作按钮 */
.left-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 12px;

  .control-btn {
    background: transparent;
    border: none;
    color: v-bind(contrastTextColor);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    justify-content: center;

    .iconfont {
      font-size: 18px;
    }

    &:hover {
      color: v-bind(hoverColor);
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.6;
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
    color: v-bind(contrastTextColor);
    cursor: pointer;
    padding: 5px;
    display: flex;
    align-items: center;
    justify-content: center;

    span {
      font-size: 28px;
    }

    &:hover {
      color: v-bind(hoverColor);
    }

    &.play-btn {
      background-color: v-bind(playbg);
      transition: background-color 0.2s ease;

      border-radius: 50%;

      span {
        font-size: 28px;
        font-weight: 800;
        color: v-bind(hoverColor);
      }

      .play-icon {
        width: 24px;
        height: 24px;
      }

      &:hover {
        background-color: v-bind(playbghover);
        color: v-bind(contrastTextColor);
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
    line-height: 12px;
    color: v-bind(contrastTextColor);
    white-space: nowrap;
  }

  .extra-controls {
    display: flex;
    align-items: center;
    gap: 12px;

    .control-btn {
      background: transparent;
      border: none;
      color: v-bind(contrastTextColor);
      cursor: pointer;
      padding: 4px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: relative;

      .iconfont {
        font-size: 18px;
      }

      &:hover {
        color: v-bind(hoverColor);
      }

      &.lyric-btn .lyric-check,
      &.lyric-btn .lyric-lock {
        position: absolute;
        right: -1px;
        bottom: -1px;
        background: #fff;
        border-radius: 50%;
        box-shadow: 0 0 0 2px #fff;
        color: v-bind(maincolor);
      }
    }
  }
}

/* 音量控制 */
.volume-control {
  position: relative;
}

.volume-slider-container {
  position: absolute;
  bottom: calc(100% + 10px);
  /* 向上偏移，留出间距 */
  right: -10px;
  /* 位置微调 */
  background: v-bind(contrastTextColor);
  /* 毛玻璃背景 */
  backdrop-filter: blur(60px);
  border-radius: 8px;
  padding: 15px 10px;
  width: 40px;
  height: 150px;
  z-index: 1000;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  display: flex;
  flex-direction: column;
  align-items: center;
  transform-origin: bottom center;
  /* 设置变换原点，使弹出效果更自然 */
}

.volume-slider {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: space-between;
  height: 100%;
  width: 100%;
  gap: 8px;
}

.volume-value {
  font-size: 12px;
  color: v-bind(maincolor);
  margin-top: 8px;
}

.volume-bar {
  width: 4px;
  height: 100px;
  position: relative;
  cursor: pointer;
}

.volume-background {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: #ffffff71;
  border-radius: 2px;
}

.volume-filled {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  background: v-bind(maincolor);
  border-radius: 2px;
}

.volume-handle {
  position: absolute;
  left: 50%;
  width: 12px;
  height: 12px;
  background: v-bind(maincolor);
  border-radius: 50%;
  transform: translate(-50%, 50%);
  opacity: 1;
  transition: opacity 0.2s ease;
}

// .volume-bar:hover .volume-handle {
//   opacity: 1;
// }

/* 音量条弹出过渡 */
.volume-popup-enter-active,
.volume-popup-leave-active {
  transition:
    opacity 0.2s cubic-bezier(0.8, 0, 0.8, 0.43),
    transform 0.2s cubic-bezier(0.8, 0, 0.8, 0.43);
}

.volume-popup-enter-from,
.volume-popup-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.95);
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

  .right-section .extra-controls .control-btn:nth-child(1) {
    display: none;
  }
}
</style>
