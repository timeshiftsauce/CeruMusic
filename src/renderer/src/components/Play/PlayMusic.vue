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
  toRaw,
  provide
} from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import icons from '../../assets/icon_font/icons'
const { liebiao, shengyin } = icons
import { storeToRefs } from 'pinia'
import FullPlay from './FullPlay.vue'
import PlaylistDrawer from './PlaylistDrawer.vue'
import { extractDominantColor } from '@renderer/utils/color/colorExtractor'
import { getBestContrastTextColorWithOpacity } from '@renderer/utils/color/contrastColor'
import { PlayMode, type SongList } from '@renderer/types/audio'
import { MessagePlugin } from 'tdesign-vue-next'
import {
  initPlaylistEventListeners,
  destroyPlaylistEventListeners,
  getSongRealUrl
} from '@renderer/utils/playlist/playlistManager'
import mediaSessionController from '@renderer/utils/audio/useSmtc'
import defaultCoverImg from '/default-cover.png'
import { downloadSingleSong } from '@renderer/utils/audio/download'
import { HeartIcon, DownloadIcon } from 'tdesign-icons-vue-next'
import _ from 'lodash'
import { songListAPI } from '@renderer/api/songList'

const controlAudio = ControlAudioStore()
const localUserStore = LocalUserDetailStore()
const { Audio } = storeToRefs(controlAudio)
const { list, userInfo } = storeToRefs(localUserStore)
const { setCurrentTime, start, stop, setVolume, setUrl } = controlAudio

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
document.addEventListener('keydown', KeyEvent)
// 处理最小化右键的事件
const removeMusicCtrlListener = window.api.onMusicCtrl(() => {
  togglePlayPause()
})
let timer: any = null

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
let pendingRestoreSongId: number | string | null = null

// 记录组件被停用前的播放状态
let wasPlaying = false

// let playbackPosition = 0
let isFull = false

// 播放指定歌曲
const playSong = async (song: SongList) => {
  try {
    // 设置加载状态
    isLoadingSong.value = true

    // 检查是否需要恢复播放位置(历史播放)
    const isHistoryPlay =
      song.songmid === userInfo.value.lastPlaySongId &&
      userInfo.value.currentTime !== undefined &&
      userInfo.value.currentTime > 0

    if (isHistoryPlay && userInfo.value.currentTime !== undefined) {
      pendingRestorePosition = userInfo.value.currentTime
      pendingRestoreSongId = song.songmid
      console.log(`准备恢复播放位置: ${pendingRestorePosition}秒`)
      // 清除历史位置,避免重复恢复
      userInfo.value.currentTime = 0
    } else {
      pendingRestorePosition = 0
      pendingRestoreSongId = null
    }

    // 立刻暂停当前播放 - 不等待渐变
    if (Audio.value.isPlay && Audio.value.audio) {
      Audio.value.isPlay = false
      Audio.value.audio.pause()
      // 恢复音量，避免下次播放音量为0
      Audio.value.audio.volume = Audio.value.volume / 100
    }

    // 立刻更新 UI 到新歌曲
    songInfo.value.name = song.name
    songInfo.value.singer = song.singer
    songInfo.value.albumName = song.albumName
    songInfo.value.img = song.img
    userInfo.value.lastPlaySongId = song.songmid

    // 如果播放列表是打开的,滚动到当前播放歌曲
    if (showPlaylist.value) {
      nextTick(() => {
        playlistDrawerRef.value?.scrollToCurrentSong()
      })
    }

    // 更新媒体会话元数据
    mediaSessionController.updateMetadata({
      title: song.name,
      artist: song.singer,
      album: song.albumName || '未知专辑',
      artworkUrl: song.img || defaultCoverImg
    })

    // 尝试获取 URL
    let urlToPlay = ''
    try {
      urlToPlay = await getSongRealUrl(toRaw(song))
    } catch (error: any) {
      console.error('获取歌曲 URL 失败,播放下一首原歌曲:', error)
      isLoadingSong.value = false
      tryAutoNext('获取歌曲 URL 失败')
      return
    }

    // 在切换前彻底重置旧音频，释放缓冲与解码器
    if (Audio.value.audio) {
      const a = Audio.value.audio
      try {
        a.pause()
      } catch {}
      a.removeAttribute('src')
      a.load()
    }
    // 设置 URL(这会触发音频重新加载)
    setUrl(urlToPlay)

    // 等待音频准备就绪
    await waitForAudioReady()
    await setColor()

    // 更新完整歌曲信息
    songInfo.value = { ...song }

    /**
     * 提前关闭加载状态
     * 这样UI不会卡在“加载中”，用户能立刻看到播放键切换
     */
    isLoadingSong.value = false

    /**
     * 异步开始播放（不await，以免阻塞UI）
     */
    start()
      .catch(async (error: any) => {
        console.error('启动播放失败:', error)
        tryAutoNext('启动播放失败')
      })
      .then(() => {
        autoNextCount.value = 0
      })

    /**
     * 注册事件监听，确保浏览器播放事件触发时同步关闭loading
     * （多一道保险）
     */
    if (Audio.value.audio) {
      Audio.value.audio.addEventListener(
        'playing',
        () => {
          isLoadingSong.value = false
        },
        { once: true }
      )
      Audio.value.audio.addEventListener(
        'error',
        () => {
          isLoadingSong.value = false
        },
        { once: true }
      )
    }
  } catch (error: any) {
    console.error('播放歌曲失败(外层捕获):', error)
    tryAutoNext('播放歌曲失败')
    // MessagePlugin.error('播放失败，原因：' + error.message)
    isLoadingSong.value = false
  } finally {
    // 最后的保险,确保加载状态一定会被关闭
    isLoadingSong.value = false
  }
}

provide('PlaySong', playSong)
// 歌曲信息
const playMode = ref(userInfo.value.playMode || PlayMode.SEQUENCE)
// const playMode = ref(PlayMode.SEQUENCE)

// 歌曲加载状态
const isLoadingSong = ref(false)

// 自动下一首次数限制：不超过当前列表的30%
const autoNextCount = ref(0)
const getAutoNextLimit = () => Math.max(1, Math.floor(list.value.length * 0.3))
const tryAutoNext = (reason: string) => {
  const limit = getAutoNextLimit()
  MessagePlugin.error(`自动跳过当前歌曲：原因：${reason}`)

  if (autoNextCount.value >= limit && autoNextCount.value > 2) {
    MessagePlugin.error(
      `自动下一首失败：超过当前列表30%限制（${autoNextCount.value}/${limit}）。原因：${reason}`
    )
    return
  }
  autoNextCount.value++
  playNext()
}

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
let unEnded: () => any = () => {}
// 初始化播放器
onMounted(async () => {
  console.log('加载')
  // 初始化播放列表事件监听器
  initPlaylistEventListeners(localUserStore, playSong)

  // 初始化媒体会话控制器
  if (Audio.value.audio) {
    mediaSessionController.init(Audio.value.audio, {
      play: async () => {
        // 专门的播放函数，只处理播放逻辑
        if (!Audio.value.isPlay) {
          await handlePlay()
        }
      },
      pause: async () => {
        // 专门的暂停函数，只处理暂停逻辑
        if (Audio.value.isPlay) {
          await handlePause()
        }
      },
      playPrevious: () => playPrevious(),
      playNext: () => playNext()
    })
  }

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

      // 立即更新媒体会话元数据，让系统显示当前歌曲信息
      mediaSessionController.updateMetadata({
        title: lastPlayedSong.name,
        artist: lastPlayedSong.singer,
        album: lastPlayedSong.albumName || '未知专辑',
        artworkUrl: lastPlayedSong.img || defaultCoverImg
      })

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
      } else {
        // 同步实际播放状态，避免误写为 playing
        if (Audio.value.audio) {
          mediaSessionController.updatePlaybackState(
            Audio.value.audio.paused ? 'paused' : 'playing'
          )
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
  // 清理媒体会话控制器
  mediaSessionController.cleanup()
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

// 专门的播放函数
const handlePlay = async () => {
  if (!Audio.value.url) {
    // 如果没有URL但有播放列表，尝试播放第一首歌
    if (list.value.length > 0) {
      await playSong(list.value[0])
    } else {
      MessagePlugin.warning('播放列表为空，请先添加歌曲')
    }
    return
  }

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
    // 播放已开始后，同步 SMTC 状态
    mediaSessionController.updatePlaybackState('playing')
  } catch (error) {
    console.error('播放失败:', error)
    MessagePlugin.error('播放失败，请重试')
  }
}

// 专门的暂停函数
const handlePause = async () => {
  if (Audio.value.url && Audio.value.isPlay) {
    const stopResult = stop()
    if (stopResult && typeof stopResult.then === 'function') {
      await stopResult
    }
    // 暂停后，同步 SMTC 状态
    mediaSessionController.updatePlaybackState('paused')
  }
}

// 播放/暂停切换
const togglePlayPause = async () => {
  if (Audio.value.isPlay) {
    await handlePause()
  } else {
    await handlePlay()
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
const songInfo = ref<Omit<SongList, 'songmid'> & { songmid: null | number | string }>({
  songmid: null,
  hash: '',
  name: '欢迎使用CeruMusic 🎉',
  singer: '可以配置音源插件来播放你的歌曲',
  albumName: '',
  albumId: '0',
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
    bg.value = bg.value === '#ffffff' ? '#ffffff46' : toRaw(bg.value)
    if (newVal.img) {
      await setColor()
    } else if (songInfo.value.songmid) {
      songInfo.value.img = defaultCoverImg
      await setColor()
    } else {
      bg.value = '#ffffff'
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
  <div
    class="player-container"
    :style="!showFullPlay && 'box-shadow: none'"
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
          <img v-if="songInfo.img" :src="songInfo.img" alt="专辑封面" />
          <img :src="defaultCoverImg" alt="默认封面" />
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
      :cover-image="songInfo.img"
      :song-info="songInfo"
      :main-color="maincolor"
      @toggle-fullscreen="toggleFullPlay"
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
  transition: background 0.3s;
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
  height: 4px;
  position: absolute;
  // padding-top: 2px;
  cursor: pointer;
  transition: all 0.2s ease-in-out;

  &:has(.progress-handle.dragging, *:hover) {
    // margin-bottom: 0;
    height: 6px;
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
