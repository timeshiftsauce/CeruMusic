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
import icons from '../../assets/icon_font/icons'
const { liebiao, shengyin } = icons
import { storeToRefs } from 'pinia'
import FullPlay from './FullPlay.vue'
import { extractDominantColor } from '@renderer/utils/colorExtractor'
import { getBestContrastTextColorWithOpacity } from '@renderer/utils/contrastColor'
import { PlayMode, type SongList } from '@renderer/types/audio'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  initPlaylistEventListeners,
  destroyPlaylistEventListeners,
  getSongRealUrl
} from '@renderer/utils/playlistManager'
import defaultCoverImg from '/default-cover.png'

const controlAudio = ControlAudioStore()
const localUserStore = LocalUserDetailStore()
const { Audio } = storeToRefs(controlAudio)
const { list, userInfo } = storeToRefs(localUserStore)
const { setCurrentTime, start, stop, setVolume, setUrl } = controlAudio
const showFullPlay = ref(false)
document.addEventListener('keydown', KeyEvent)
// 处理最小化右键的事件
const removeMusicCtrlListener = window.api.onMusicCtrl(() => {
  togglePlayPause()
})
let timer: any = null
// eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
function throttle(callback: Function, delay: number) {
  if (timer) return
  timer = setTimeout(() => {
    callback()
    timer = null
  }, delay)
}

function KeyEvent(e: KeyboardEvent) {
  throttle(() => {
    if (e.code == 'Space' && showFullPlay.value) {
      e.preventDefault()
      togglePlayPause()
    } else if (e.code == 'ArrowUp') {
      e.preventDefault()
      console.log('up')
      controlAudio.setVolume(Audio.value.volume + 5)
    } else if (e.code == 'ArrowDown') {
      e.preventDefault()
      console.log('down')
      controlAudio.setVolume(Audio.value.volume - 5)
    } else if (e.code == 'ArrowLeft' && Audio.value.audio && Audio.value.audio.currentTime >= 0) {
      Audio.value.audio.currentTime -= 5
    } else if (
      e.code == 'ArrowRight' &&
      Audio.value.audio &&
      Audio.value.audio.currentTime <= Audio.value.audio.duration
    ) {
      console.log('right')
      Audio.value.audio.currentTime += 5
    }
  }, 100)
}

// 等待音频准备就绪
const waitForAudioReady = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const audio = Audio.value.audio
    if (!audio) {
      reject(new Error('音频元素未初始化'))
      return
    }

    // 如果音频已经准备就绪
    if (audio.readyState >= 3) {
      // HAVE_FUTURE_DATA
      resolve()
      return
    }

    // 设置超时
    const timeout = setTimeout(() => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      reject(new Error('音频加载超时'))
    }, 10000) // 10秒超时

    const onCanPlay = () => {
      clearTimeout(timeout)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      resolve()
    }

    const onError = () => {
      clearTimeout(timeout)
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      reject(new Error('音频加载失败'))
    }

    // 监听事件
    audio.addEventListener('canplay', onCanPlay, { once: true })
    audio.addEventListener('error', onError, { once: true })
  })
}

// 存储待恢复的播放位置
let pendingRestorePosition = 0
let pendingRestoreSongId: number | null = null

// 记录组件被停用前的播放状态
let wasPlaying = false

// let playbackPosition = 0
let isFull = false

// 播放指定歌曲
const playSong = async (song: SongList) => {
  try {
    // 检查是否需要恢复播放位置（历史播放）
    const isHistoryPlay =
      song.songmid === userInfo.value.lastPlaySongId &&
      userInfo.value.currentTime !== undefined &&
      userInfo.value.currentTime > 0
    if (isHistoryPlay && userInfo.value.currentTime !== undefined) {
      pendingRestorePosition = userInfo.value.currentTime
      pendingRestoreSongId = song.songmid
      console.log(`准备恢复播放位置: ${pendingRestorePosition}秒`)
      // 清除历史位置，避免重复恢复
      userInfo.value.currentTime = 0
    } else {
      pendingRestorePosition = 0
      pendingRestoreSongId = null
    }

    // 更新当前播放歌曲ID
    userInfo.value.lastPlaySongId = song.songmid

    // 如果播放列表是打开的，滚动到当前播放歌曲
    if (showPlaylist.value) {
      scrollToCurrentSong()
    }

    // 更新歌曲信息并触发主题色更新
    songInfo.value = {
      ...song
    }

    // 确保主题色更新
    await setColor()

    let urlToPlay = ''

    // 如果没有URL，需要获取URL
    if (!urlToPlay) {
      // eslint-disable-next-line no-useless-catch
      try {
        urlToPlay = await getSongRealUrl(toRaw(song))

        // 同时更新播放列表中对应歌曲的URL
        const playlistIndex = list.value.findIndex((item) => item.songmid === song.songmid)
        if (playlistIndex !== -1) {
          ; (list.value[playlistIndex] as any).url = urlToPlay
        }
      } catch (error) {
        throw error
      }
    }

    // 先停止当前播放
    if (Audio.value.isPlay) {
      const stopResult = stop()
      if (stopResult && typeof stopResult.then === 'function') {
        await stopResult
      }
    }

    // 设置URL（这会触发音频重新加载）
    setUrl(urlToPlay)

    // 等待音频准备就绪
    await waitForAudioReady()

    // 短暂延迟确保音频状态稳定
    await new Promise((resolve) => setTimeout(resolve, 100))

    // 开始播放
    try {
      const startResult = start()
      if (startResult && typeof startResult.then === 'function') {
        await startResult
      }
    } catch (error) {
      console.error('启动播放失败:', error)
      // 如果是 AbortError，尝试重新播放
      if ((error as { name: string }).name === 'AbortError') {
        console.log('检测到 AbortError，尝试重新播放...')
        await new Promise((resolve) => setTimeout(resolve, 200))
        try {
          const retryResult = start()
          if (retryResult && typeof retryResult.then === 'function') {
            await retryResult
          }
        } catch (retryError) {
          console.error('重试播放也失败:', retryError)
          throw retryError
        }
      } else {
        throw error
      }
    }
  } catch (error: any) {
    console.error('播放歌曲失败:', error)
    MessagePlugin.error('播放失败，原因：' + error.message)
  }
}

// 歌曲信息
// const playMode = ref(userInfo.value.playMode || PlayMode.SEQUENCE)
const playMode = ref(PlayMode.SEQUENCE)

// 更新播放模式
const updatePlayMode = () => {
  const modes = [PlayMode.SEQUENCE, PlayMode.RANDOM, PlayMode.SINGLE]
  const currentIndex = modes.indexOf(playMode.value)
  const nextIndex = (currentIndex + 1) % modes.length
  playMode.value = modes[nextIndex]

  // 更新用户信息
  userInfo.value.playMode = playMode.value
}

// 获取播放模式图标类名
let playModeTip = ''
const playModeIconClass = computed(() => {
  switch (playMode.value) {
    case PlayMode.SEQUENCE:
      playModeTip = '顺序播放'
      return 'iconfont icon-shunxubofangtubiao'
    case PlayMode.RANDOM:
      playModeTip = '随机播放'
      return 'iconfont icon-suijibofang'
    case PlayMode.SINGLE:
      playModeTip = '单曲循环'
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

// 播放列表相关
const showPlaylist = ref(false)

const togglePlaylist = (e: MouseEvent) => {
  e.stopPropagation()
  showPlaylist.value = !showPlaylist.value

  // 如果打开播放列表，滚动到当前播放歌曲
  if (showPlaylist.value) {
    scrollToCurrentSong()
  }
}

// 滚动到当前播放歌曲
const scrollToCurrentSong = () => {
  if (!currentSongId.value) return

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

// 播放列表中的歌曲
const currentSongId = computed(() => userInfo.value.lastPlaySongId)

// 播放上一首
const playPrevious = async () => {
  if (list.value.length === 0) return

  try {
    const currentIndex = list.value.findIndex((song) => song.songmid === currentSongId.value)
    let prevIndex

    if (playMode.value === PlayMode.RANDOM) {
      // 随机模式
      prevIndex = Math.floor(Math.random() * list.value.length)
    } else {
      // 顺序模式或单曲循环模式
      prevIndex = currentIndex <= 0 ? list.value.length - 1 : currentIndex - 1
    }

    // 确保索引有效
    if (prevIndex >= 0 && prevIndex < list.value.length) {
      await playSong(list.value[prevIndex])
    }
  } catch (error) {
    console.error('播放上一首失败:', error)
    MessagePlugin.error('播放上一首失败')
  }
}

// 播放下一首
const playNext = async () => {
  if (list.value.length === 0) return

  try {
    // 单曲循环模式下，重新播放当前歌曲
    if (playMode.value === PlayMode.SINGLE && currentSongId.value) {
      const currentSong = list.value.find((song) => song.songmid === currentSongId.value)
      if (currentSong) {
        // 重新设置播放位置到开头
        if (Audio.value.audio) {
          Audio.value.audio.currentTime = 0
        }
        // 如果当前正在播放，继续播放；如果暂停，保持暂停
        const startResult = start()
        if (startResult && typeof startResult.then === 'function') {
          await startResult
        }
        return
      }
    }

    const currentIndex = list.value.findIndex((song) => song.songmid === currentSongId.value)
    let nextIndex

    if (playMode.value === PlayMode.RANDOM) {
      // 随机模式
      nextIndex = Math.floor(Math.random() * list.value.length)
    } else {
      // 顺序模式
      nextIndex = (currentIndex + 1) % list.value.length
    }

    // 确保索引有效
    if (nextIndex >= 0 && nextIndex < list.value.length) {
      await playSong(list.value[nextIndex])
    }
  } catch (error) {
    console.error('播放下一首失败:', error)
    MessagePlugin.error('播放下一首失败')
  }
}

// 定期保存当前播放位置
let savePositionInterval: number | null = null
let unEnded: () => any = () => { }
// 初始化播放器
onMounted(async () => {
  console.log('加载')
  // 初始化播放列表事件监听器
  initPlaylistEventListeners(localUserStore, playSong)

  // 监听音频结束事件，根据播放模式播放下一首
  unEnded = controlAudio.subscribe('ended', () => {
    window.requestAnimationFrame(() => {
      console.log('播放结束')
      playNext()
    })
  })

  // 检查是否有上次播放的歌曲
  // 检查是否有上次播放的歌曲
  if (userInfo.value.lastPlaySongId && list.value.length > 0) {
    const lastPlayedSong = list.value.find((song) => song.songmid === userInfo.value.lastPlaySongId)
    if (lastPlayedSong) {
      songInfo.value = {
        ...lastPlayedSong
      }

      // 如果有历史播放位置，设置为待恢复状态
      if (!Audio.value.isPlay) {
        if (userInfo.value.currentTime && userInfo.value.currentTime > 0) {
          pendingRestorePosition = userInfo.value.currentTime
          pendingRestoreSongId = lastPlayedSong.songmid
          console.log(`初始化时设置待恢复位置: ${pendingRestorePosition}秒`)

          // 设置当前播放时间以显示进度条位置，但不清除历史记录
          if (Audio.value.audio) {
            Audio.value.audio.currentTime = userInfo.value.currentTime
          }
        }
        // 通过工具函数获取歌曲URL
        try {
          const url = await getSongRealUrl(toRaw(lastPlayedSong))
          setUrl(url)
        } catch (error) {
          console.error('获取上次播放歌曲URL失败:', error)
        }
      }
    }
  }

  // 定期保存当前播放位置
  savePositionInterval = window.setInterval(() => {
    if (Audio.value.isPlay) {
      userInfo.value.currentTime = Audio.value.currentTime
    }
  }, 1000) // 每1秒保存一次
})

// 组件卸载时清理
onUnmounted(() => {
  destroyPlaylistEventListeners()
  document.removeEventListener('keydown', KeyEvent)
  if (savePositionInterval !== null) {
    clearInterval(savePositionInterval)
  }
  if (removeMusicCtrlListener) {
    removeMusicCtrlListener()
  }
  unEnded()
})

// 组件被激活时（从缓存中恢复）
onActivated(async () => {
  console.log('PlayMusic组件被激活')
  if (isFull) {
    showFullPlay.value = true
  }
  // 如果之前正在播放，恢复播放
  // if (wasPlaying && Audio.value.url) {
  //   // 恢复播放位置
  //   if (Audio.value.audio && playbackPosition > 0) {
  //     setCurrentTime(playbackPosition)
  //     Audio.value.audio.currentTime = playbackPosition
  //   }

  //   // 恢复播放
  //   try {
  //     const startResult = start()
  //     if (startResult && typeof startResult.then === 'function') {
  //       await startResult
  //     }
  //     console.log('恢复播放成功')
  //   } catch (error) {
  //     console.error('恢复播放失败:', error)
  //   }
  // }
})

// 组件被停用时（缓存但不销毁）
onDeactivated(() => {
  console.log('PlayMusic组件被停用')
  // 保存当前播放状态
  wasPlaying = Audio.value.isPlay
  // playbackPosition = Audio.value.currentTime
  isFull = showFullPlay.value
  // 如果正在播放，暂停播放但不改变状态标志
  if (wasPlaying && Audio.value.audio) {
    Audio.value.audio.pause()
    console.log('暂时暂停播放，状态已保存')
  }
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

// 播放/暂停切换
const togglePlayPause = async () => {
  if (Audio.value.url) {
    if (Audio.value.isPlay) {
      const stopResult = stop()
      if (stopResult && typeof stopResult.then === 'function') {
        await stopResult
      }
    } else {
      try {
        // 检查是否需要恢复历史播放位置
        if (pendingRestorePosition > 0 && pendingRestoreSongId === userInfo.value.lastPlaySongId) {
          console.log(`恢复播放位置: ${pendingRestorePosition}秒`)

          // 等待音频准备就绪
          await waitForAudioReady()

          // 设置播放位置
          setCurrentTime(pendingRestorePosition)
          if (Audio.value.audio) {
            Audio.value.audio.currentTime = pendingRestorePosition
          }

          // 清除待恢复的位置
          pendingRestorePosition = 0
          pendingRestoreSongId = null
        }

        const startResult = start()
        if (startResult && typeof startResult.then === 'function') {
          await startResult
        }
      } catch (error) {
        console.error('播放失败:', error)
        MessagePlugin.error('播放失败，请重试')
      }
    }
  } else {
    // 如果没有URL但有播放列表，尝试播放第一首歌
    if (list.value.length > 0) {
      await playSong(list.value[0])
    } else {
      MessagePlugin.warning('播放列表为空，请先添加歌曲')
    }
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
const songInfo = ref<Omit<SongList, 'songmid'> & { songmid: null | number }>({
  songmid: null,
  hash: '',
  name: '欢迎使用CeruMusic 🎉',
  singer: '可以配置音源插件来播放你的歌曲',
  albumName: '',
  albumId: 0,
  source: '',
  interval: '00:00',
  img: '',
  lrc: null,
  types: [],
  _types: {},
  typeUrl: {}
})
const maincolor = ref('var(--td-brand-color-5)')
const startmaincolor = ref('rgba(0, 0, 0, 1)')
const contrastTextColor = ref('rgba(0, 0, 0, .8)')
const hoverColor = ref('var(--td-brand-color-5)')
const playbg = ref('var(--td-brand-color-2)')
const playbghover = ref('var(--td-brand-color-3)')
async function setColor() {
  console.log('主题色刷新')
  const color = await extractDominantColor(songInfo.value.img)
  console.log(color)
  maincolor.value = `rgba(${color.r},${color.g},${color.b},1)`
  startmaincolor.value = `rgba(${color.r},${color.g},${color.b},.2)`
  contrastTextColor.value = await getBestContrastTextColorWithOpacity(songInfo.value.img, 0.6)
  hoverColor.value = await getBestContrastTextColorWithOpacity(songInfo.value.img, 1)
  playbg.value = 'rgba(255,255,255,0.2)'
  playbghover.value = 'rgba(255,255,255,0.33)'
}
const bg = ref('#ffffff46')

watch(
  songInfo,
  async (newVal) => {
    bg.value = bg.value==='#ffffff'?'#ffffff46':toRaw(bg.value)
    if (newVal.img) {
      await setColor()
    } else if(songInfo.value.songmid) {
      songInfo.value.img = defaultCoverImg
      await setColor()
    }else{
      bg.value='#ffffff'
    }

  },
  { deep: true, immediate: true }
)


watch(showFullPlay, (val) => {
  if (val) {
    console.log('背景hei')
    bg.value = '#00000020'
  } else {
    bg.value = '#ffffff46'
  }
})
// onMounted(setColor)
</script>

<template>
  <div class="player-container" @click.stop="toggleFullPlay">
    <!-- 进度条 -->
    <div class="progress-bar-container">
      <div ref="progressRef" class="progress-bar" @mousedown="handleProgressDragStart($event)"
        @click.stop="handleProgressClick">
        <div class="progress-background"></div>
        <div class="progress-filled" :style="{ width: `${progressPercentage}%` }"></div>
        <div class="progress-handle" :style="{ left: `${progressPercentage}%` }"></div>
      </div>
    </div>

    <div class="player-content">
      <!-- 左侧：封面和歌曲信息 -->
      <div class="left-section">
        <div class="album-cover" v-if="songInfo.albumId">
          <img :src="songInfo.img" alt="专辑封面" v-if="songInfo.img" />
          <img :src="defaultCoverImg" alt="默认封面" />
        </div>

        <div class="song-info">
          <div class="song-name">{{ songInfo.name }}</div>
          <div class="artist-name">{{ songInfo.singer }}</div>
        </div>
      </div>

      <!-- 中间：播放控制 -->
      <div class="center-controls">
        <t-button class="control-btn" variant="text" shape="circle" @click.stop="playPrevious">
          <span class="iconfont icon-shangyishou"></span>
        </t-button>
        <button class="control-btn play-btn" @click.stop="togglePlayPause">
          <transition name="fade" mode="out-in">
            <span v-if="Audio.isPlay" key="play" class="iconfont icon-zanting"></span>
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
            <t-button class="control-btn" shape="circle" variant="text" @click.stop="updatePlayMode">
              <i :class="playModeIconClass + ' ' + 'PlayMode'" style="width: 1.5em"></i>
            </t-button>
          </t-tooltip>

          <!-- 音量控制 -->
          <div class="volume-control" @mouseenter="showVolumeSlider = true" @mouseleave="showVolumeSlider = false">
            <button class="control-btn">
              <shengyin style="width: 1.5em; height: 1.5em" />
            </button>

            <!-- 音量滑块 -->
            <transition name="volume-popup">
              <div v-show="showVolumeSlider" class="volume-slider-container" @click.stop>
                <div class="volume-slider">
                  <div ref="volumeBarRef" class="volume-bar" @click="handleVolumeClick"
                    @mousedown="handleVolumeDragStart">
                    <div class="volume-background"></div>
                    <div class="volume-filled" :style="{ height: `${volumeValue}%` }"></div>
                    <div class="volume-handle" :style="{ bottom: `${volumeValue}%` }"></div>
                  </div>
                  <div class="volume-value">{{ volumeValue }}%</div>
                </div>
              </div>
            </transition>
          </div>

          <!-- 播放列表按钮 -->
          <t-tooltip content="播放列表">
            <t-badge :count="list.length" :maxCount="99" color="#aaa">
              <t-button class="control-btn" shape="circle" variant="text" @click.stop="togglePlaylist">
                <liebiao style="width: 1.5em; height: 1.5em" />
              </t-button>
            </t-badge>
          </t-tooltip>
        </div>
      </div>
    </div>
  </div>
  <div class="fullbox">
    <FullPlay :song-id="songInfo.songmid ? songInfo.songmid.toString() : null" :show="showFullPlay"
      :cover-image="songInfo.img" @toggle-fullscreen="toggleFullPlay"
      :song-info="songInfo" :main-color="maincolor" />
  </div>

  <!-- 播放列表 -->
  <div v-show="showPlaylist" class="cover" @click="showPlaylist = false"></div>
  <transition name="playlist-drawer">
    <div v-show="showPlaylist" class="playlist-container" :class="{ 'full-screen-mode': showFullPlay }" @click.stop>
      <div class="playlist-header">
        <div class="playlist-title">播放列表 ({{ list.length }})</div>
        <button class="playlist-close" @click.stop="showPlaylist = false">
          <span class="iconfont icon-guanbi"></span>
        </button>
      </div>

      <div class="playlist-content">
        <div v-if="list.length === 0" class="playlist-empty">
          <p>播放列表为空</p>
          <p>请添加歌曲到播放列表，也可在设置中导入歌曲列表</p>
        </div>
        <div v-else class="playlist-songs">
          <div v-for="song in list" :key="song.songmid" class="playlist-song"
            :class="{ active: song.songmid === currentSongId }" @click="playSong(song)">
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
          </div>
        </div>
      </div>
    </div>
  </transition>
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

.player-container {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  transition: background .3s;
  background: v-bind(bg);
  // border-top: 1px solid #e5e7eb;
  backdrop-filter: blur(1000px);
  z-index: 1000;
  height: var(--play-bottom-height);
  display: flex;
  flex-direction: column;
}

/* 进度条样式 */
.progress-bar-container {
  width: 100%;
  height: 2px;
  position: absolute;
  // padding-top: 2px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:has(.progress-handle.dragging, *:hover) {
    // margin-bottom: 0;
    height: 4px;
  }

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
      background: transparent;
    }

    .progress-filled {
      position: absolute;
      top: 0;
      left: 0;
      height: 100%;
      background: linear-gradient(to right, v-bind(startmaincolor), v-bind(maincolor) 80%);
      border-radius: 999px;
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
      // transition: opacity 0.2s ease;

      &:hover,
      &:active,
      &.dragging {
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

      .iconfont {
        font-size: 18px;
      }

      &:hover {
        color: v-bind(hoverColor);
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
  color: v-bind(contrastTextColor);
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

.playlist-song {
  display: flex;
  align-items: center;
  padding: 8px 16px;
  cursor: pointer;
  border-radius: 10px;
  margin: 5px 0;
  transition: background-color 0.2s ease;
}

.playlist-song:hover {
  background-color: rgba(123, 123, 123, 0.384);
}

.playlist-song.active {
  background-color: rgba(255, 255, 255, 0.15);
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
  .right-section .time-display {
    display: none;
  }

  .center-controls {
    gap: 8px;
  }

  .right-section .extra-controls {
    gap: 8px;
  }

  .playlist-container {
    width: 100%;
    right: 0;
    border-radius: 8px 8px 0 0;
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
