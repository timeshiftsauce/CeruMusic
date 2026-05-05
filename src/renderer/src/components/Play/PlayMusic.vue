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
  h
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
import {
  HeartIcon,
  DownloadIcon,
  CheckIcon,
  LockOnIcon,
  ChatBubble1Icon,
  EllipsisIcon,
  ShareIcon,
  SoundIcon
} from 'tdesign-icons-vue-next'
import _ from 'lodash'
import { songListAPI } from '@renderer/api/songList'
import { useDlnaStore } from '@renderer/store/dlna'
import { crossfadeState, crossfadeManager } from '@renderer/utils/audio/crossfade'
import CrossfadeHint from './CrossfadeHint.vue'
import ShareSongDialog from '@renderer/components/Share/ShareSongDialog.vue'
import { getSongRealUrl } from '@renderer/utils/playlist/playlistManager'
import { waitForAudioReady } from '@renderer/utils/audio/audioHelpers'

const dlnaStore = useDlnaStore()
const controlAudio = ControlAudioStore()
const localUserStore = LocalUserDetailStore()
const globalPlayStatus = useGlobalPlayStatusStore()
const { Audio } = storeToRefs(controlAudio)
const { list, userInfo } = storeToRefs(localUserStore)
const { player } = storeToRefs(globalPlayStatus)
const songInfo = computed(() => player.value.songInfo || ({} as any))

const {} = controlAudio

watch(
  () => dlnaStore.currentDevice,
  (device) => {
    if (Audio.value.audio) {
      Audio.value.audio.muted = !!device
    }
  },
  { immediate: true }
)

let dlnaSyncInterval: any = null

watch(
  () => dlnaStore.currentDevice,
  (device) => {
    if (device) {
      if (!dlnaSyncInterval) {
        dlnaSyncInterval = setInterval(async () => {
          if (Audio.value.isPlay) {
            const position = await dlnaStore.getPosition()
            if (position && typeof position === 'number') {
              // Only sync if the difference is more than 2 seconds to avoid jitter
              if (Math.abs(Audio.value.currentTime - position) > 2) {
                if (Audio.value.audio) {
                  Audio.value.audio.currentTime = position
                }
              }
            }
          }
        }, 1000)
      }
    } else {
      if (dlnaSyncInterval) {
        clearInterval(dlnaSyncInterval)
        dlnaSyncInterval = null
      }
    }
  }
)

watch(
  () => Audio.value.audio,
  (newAudio) => {
    if (newAudio && dlnaStore.currentDevice) {
      newAudio.muted = true
    }
  }
)

watch(
  () => Audio.value.url,
  (newUrl) => {
    if (dlnaStore.currentDevice && newUrl) {
      if (Audio.value.audio) {
        Audio.value.audio.pause() // Pause locally while TV loads
      }
      dlnaStore.play(newUrl, songInfo.value.name || 'CeruMusic').then(() => {
        // After loading on TV, sync and play
        setTimeout(async () => {
          if (Audio.value.audio) {
            const pos = await dlnaStore.getPosition()
            if (pos && typeof pos === 'number') {
              Audio.value.audio.currentTime = pos
            }
            Audio.value.audio.play().catch(() => {})
          }
        }, 1500)
      })
    }
  }
)

watch(
  () => Audio.value.isPlay,
  (isPlay) => {
    if (dlnaStore.currentDevice) {
      if (isPlay) dlnaStore.resume()
      else dlnaStore.pause()
    }
  }
)

watch(
  () => Audio.value.volume,
  (newVol) => {
    if (dlnaStore.currentDevice) {
      dlnaStore.setVolume(newVol)
    }
  }
)

// 当前歌曲是否已在“我的喜欢”
const likeState = ref(false)
const isLiked = computed(() => likeState.value)
let cachedFavoritesId: string | null = null

const refreshLikeState = async () => {
  try {
    if (!userInfo.value.lastPlaySongId) {
      likeState.value = false
      return
    }
    if (!cachedFavoritesId) {
      const favIdRes = await window.api.songList.getFavoritesId()
      cachedFavoritesId = (favIdRes && favIdRes.data) || null
    }
    if (!cachedFavoritesId) {
      likeState.value = false
      return
    }
    const hasRes = await songListAPI.hasSong(cachedFavoritesId, userInfo.value.lastPlaySongId)
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
const showComments = ref(false)

const toggleComments = () => {
  showComments.value = !showComments.value
  if (showComments.value && !showFullPlay.value) {
    showFullPlay.value = true
  }
}

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

let lyricLockHandler: ((_: any, lock: any) => void) | null = null
let lyricOpenChangeHandler: ((_: any, visible: boolean) => void) | null = null
let lyricCloseHandler: (() => void) | null = null
let openPlaylistHandler: (() => void) | null = null
let closePlaylistHandler: (() => void) | null = null

function globalControls(e) {
  console.log('全局:', e)
  if (e.detail.name === 'toggleFullPlay') {
    toggleFullPlay()
  }
}

onMounted(async () => {
  // 监听来自主进程的锁定状态广播
  lyricLockHandler = (_: any, lock: any) => {
    desktopLyricLocked.value = !!lock
  }
  lyricOpenChangeHandler = async (_: any, visible: boolean) => {
    desktopLyricOpen.value = !!visible
    if (desktopLyricOpen.value) {
      const lock = await window.electron?.ipcRenderer?.invoke?.('get-lyric-lock-state')
      desktopLyricLocked.value = !!lock
    } else {
      desktopLyricLocked.value = false
    }
  }
  lyricCloseHandler = () => {
    desktopLyricOpen.value = false
    desktopLyricLocked.value = false
  }
  window.electron?.ipcRenderer?.on?.('toogleDesktopLyricLock', lyricLockHandler)
  window.electron?.ipcRenderer?.on?.('desktop-lyric-open-change', lyricOpenChangeHandler)
  window.electron?.ipcRenderer?.on?.('closeDesktopLyric', lyricCloseHandler)
  // 初始化同步当前打开与锁定状态
  try {
    const open = await window.electron?.ipcRenderer?.invoke?.('get-lyric-open-state')
    desktopLyricOpen.value = !!open
    const lock = await window.electron?.ipcRenderer?.invoke?.('get-lyric-lock-state')
    desktopLyricLocked.value = !!lock
  } catch {}
  window.addEventListener('global-music-control', globalControls)
  openPlaylistHandler = () => {
    showPlaylist.value = true
    nextTick(() => {
      playlistDrawerRef.value?.scrollToCurrentSong?.()
    })
  }
  closePlaylistHandler = () => {
    showPlaylist.value = false
  }
  window.addEventListener('open-playlist', openPlaylistHandler)
  window.addEventListener('close-playlist', closePlaylistHandler)
})

// 组件卸载时清理
onUnmounted(() => {
  if (lyricLockHandler) {
    window.electron?.ipcRenderer?.removeListener?.('toogleDesktopLyricLock', lyricLockHandler)
  }
  if (lyricOpenChangeHandler) {
    window.electron?.ipcRenderer?.removeListener?.(
      'desktop-lyric-open-change',
      lyricOpenChangeHandler
    )
  }
  if (lyricCloseHandler) {
    window.electron?.ipcRenderer?.removeListener?.('closeDesktopLyric', lyricCloseHandler)
  }
  window.removeEventListener('global-music-control', globalControls)
  if (openPlaylistHandler) window.removeEventListener('open-playlist', openPlaylistHandler)
  if (closePlaylistHandler) window.removeEventListener('close-playlist', closePlaylistHandler)
  lyricLockHandler = null
  lyricOpenChangeHandler = null
  lyricCloseHandler = null
  openPlaylistHandler = null
  closePlaylistHandler = null

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
    cachedFavoritesId = favoritesId

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

// 分享对话框
const shareDialogVisible = ref(false)

// 更多菜单是否打开（打开时阻止控制栏自动隐藏）
const isMoreMenuOpen = ref(false)

// 音质切换相关
const qualityDisplayMap: Record<string, string> = {
  low: '标准',
  standard: '高品质',
  high: '超高品质',
  lossless: '无损',
  '128k': '标准 128K',
  '192k': '高品质 192K',
  '320k': '超高品质 320K',
  flac: '无损 FLAC',
  flac24bit: '高解析度无损',
  hires: '高清臻音',
  atmos: '沉浸环绕声',
  master: '超清母带'
}

const getQualityDisplayName = (quality: string) => qualityDisplayMap[quality] || quality

// 当前歌曲是否支持音质切换（来自插件音源、且非 service 插件直链）
const canSwitchQuality = computed(() => {
  const src = (songInfo.value as any).source
  if (!src || src === 'local') return false
  if ((songInfo.value as any).url) return false
  return true
})

// 当前歌曲对应音源插件支持的音质列表
const currentSourceQualities = computed<string[]>(() => {
  if (!canSwitchQuality.value) return []
  const src = (songInfo.value as any).source
  const sources = userInfo.value.supportedSources || {}
  return sources[src]?.qualitys || []
})

// 当前歌曲使用的音质
const currentQuality = computed(() => {
  const src = (songInfo.value as any).source
  if (!src) return ''
  return (userInfo.value.sourceQualityMap || {})[src] || userInfo.value.selectQuality || ''
})

const switchingQuality = ref(false)

// 切换音质：保留当前进度与播放状态
const switchQuality = async (quality: string) => {
  if (switchingQuality.value) return
  if (!quality || quality === currentQuality.value) return
  if (!canSwitchQuality.value) return

  if (dlnaStore.currentDevice) {
    MessagePlugin.warning('投屏模式下暂不支持切换音质')
    return
  }

  const src = (songInfo.value as any).source
  const currentSong = list.value.find((s) => s.songmid === userInfo.value.lastPlaySongId)
  if (!currentSong) {
    MessagePlugin.warning('当前没有正在播放的歌曲')
    return
  }

  switchingQuality.value = true
  // 取消可能正在进行的无感过渡，避免新旧 URL 抢占
  crossfadeManager.cancel()

  const savedTime = Audio.value.currentTime || Audio.value.audio?.currentTime || 0
  const wasPlaying = Audio.value.isPlay && !!Audio.value.audio && !Audio.value.audio.paused

  if (!userInfo.value.sourceQualityMap) userInfo.value.sourceQualityMap = {}
  userInfo.value.sourceQualityMap[src] = quality
  if (userInfo.value.selectSources === src) {
    userInfo.value.selectQuality = quality
  }

  const hideLoading = MessagePlugin.loading({
    content: `正在切换到${getQualityDisplayName(quality)}...`,
    duration: 0
  })
  const closeLoading = () => {
    try {
      const v = hideLoading as any
      if (v && typeof v.close === 'function') v.close()
      else if (v && typeof v.then === 'function') v.then((m: any) => m?.close && m.close())
    } catch {}
  }

  try {
    const newUrl = await getSongRealUrl(_.cloneDeep(toRaw(currentSong)) as any)
    if (!newUrl || (typeof newUrl === 'string' && newUrl.includes('error'))) {
      throw new Error('获取播放链接失败')
    }

    // 关键：先置 isPlay=false，避免 setUrl 内部触发 stop() 的异步音量淡出
    // （否则后续 play() 时音量已被淡到 0，听起来像没有恢复播放）
    Audio.value.isPlay = false
    const a = Audio.value.audio
    if (a) {
      try {
        a.pause()
      } catch {}
    }

    controlAudio.setUrl(newUrl)

    // 等待 GlobalAudio 中 srcA/srcB watcher 完成（pause -> nextTick -> load()）
    // 否则其延迟的 load() 会在我们调用 play() 之后再触发一次重置，
    // 表现为：刚切换到新音质就立刻被暂停。
    await nextTick()
    await nextTick()

    if (Audio.value.audio) {
      // 恢复用户音量（防止被前一次 stop 的淡出残留为 0）
      Audio.value.audio.volume = (Audio.value.volume || 0) / 100

      await waitForAudioReady(Audio.value.audio)
      Audio.value.audio.currentTime = savedTime
      controlAudio.setCurrentTime(savedTime)

      if (wasPlaying) {
        try {
          await controlAudio.start()
        } catch (e) {
          console.warn('恢复播放失败:', e)
        }
      }
    }

    closeLoading()
    MessagePlugin.success(`已切换到${getQualityDisplayName(quality)}`)
  } catch (e: any) {
    console.error('切换音质失败:', e)
    closeLoading()
    MessagePlugin.error('切换音质失败：' + (e?.message || '未知错误'))
  } finally {
    switchingQuality.value = false
  }
}

// 更多菜单选项
const moreMenuOptions = computed(() => {
  const opts: any[] = [
    {
      label: '分享',
      key: 'share',
      icon: () => h(ShareIcon, { size: '16' }),
      disabled: !songInfo.value.songmid
    }
  ]

  if (currentSourceQualities.value.length > 0) {
    const cur = currentQuality.value
    opts.push({
      label: cur ? `音质 · ${getQualityDisplayName(cur)}` : '音质',
      key: 'quality',
      icon: () => h(SoundIcon, { size: '16' }),
      disabled: !songInfo.value.songmid || switchingQuality.value,
      children: currentSourceQualities.value.map((q) => ({
        label: getQualityDisplayName(q),
        key: `quality:${q}`,
        icon:
          q === cur
            ? () => h(CheckIcon, { size: '14', style: { color: 'var(--td-brand-color-5)' } })
            : undefined,
        disabled: switchingQuality.value
      }))
    })
  }

  return opts
})

const handleMoreMenuSelect = (key: string) => {
  if (key === 'share') {
    if (!songInfo.value.songmid) return
    shareDialogVisible.value = true
    return
  }
  if (typeof key === 'string' && key.startsWith('quality:')) {
    const q = key.slice('quality:'.length)
    void switchQuality(q)
    return
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

// 无感过渡预告区间在进度条上的百分比位置
const crossfadeMarkVisible = computed(() => {
  return (
    crossfadeState.markEnd > crossfadeState.markStart &&
    Audio.value.duration > 0 &&
    !dlnaStore.currentDevice
  )
})
const crossfadeMarkLeft = computed(() => {
  if (!crossfadeMarkVisible.value) return 0
  return (crossfadeState.markStart / Audio.value.duration) * 100
})
const crossfadeMarkWidth = computed(() => {
  if (!crossfadeMarkVisible.value) return 0
  const d = Audio.value.duration
  return ((crossfadeState.markEnd - crossfadeState.markStart) / d) * 100
})
// 过渡激活时也标注实际正在发生淡化的区段
const crossfadeActiveMarkVisible = computed(() => {
  return crossfadeState.active && crossfadeState.fadeDuration > 0 && Audio.value.duration > 0
})
const crossfadeActiveMarkLeft = computed(() => {
  if (!crossfadeActiveMarkVisible.value) return 0
  return (crossfadeState.fadeStart / Audio.value.duration) * 100
})
const crossfadeActiveMarkWidth = computed(() => {
  if (!crossfadeActiveMarkVisible.value) return 0
  return (crossfadeState.fadeDuration / Audio.value.duration) * 100
})

// 过渡完成后，新歌开头的淡入区段标记（从 0 到 fadeInMarkEnd 秒）
const crossfadeFadeInMarkVisible = computed(() => {
  return crossfadeState.fadeInMarkEnd > 0 && Audio.value.duration > 0 && !dlnaStore.currentDevice
})
const crossfadeFadeInMarkWidth = computed(() => {
  if (!crossfadeFadeInMarkVisible.value) return 0
  return (crossfadeState.fadeInMarkEnd / Audio.value.duration) * 100
})

// 格式化时间显示
const formatTime = (seconds: number) => {
  const mins = Math.floor(seconds / 60)
  const secs = Math.floor(seconds % 60)
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

// 拖动进度条时，时间显示同步反映拖动位置（而非松开后才更新）
const displayCurrentTime = computed(() => {
  if (isDraggingProgress.value) {
    return (tempProgressPercentage.value / 100) * (Audio.value.duration || 0)
  }
  return Audio.value.currentTime
})
const currentTimeFormatted = computed(() => formatTime(displayCurrentTime.value))
const durationFormatted = computed(() => formatTime(Audio.value.duration))

// 进度条悬停 / 拖动时的鼠标位置 tooltip：显示对应时间与该时间点的歌词
const isCursorOverProgress = ref(false)
const cursorProgressPercentage = ref(0)
const showProgressTooltip = computed(
  () => (isCursorOverProgress.value || isDraggingProgress.value) && Audio.value.duration > 0
)
const cursorProgressTime = computed(
  () => (cursorProgressPercentage.value / 100) * (Audio.value.duration || 0)
)
const cursorProgressTimeFormatted = computed(() => formatTime(cursorProgressTime.value))
const cursorProgressLyric = computed(() => {
  const lines = player.value.lyrics?.lines || []
  if (lines.length === 0) return ''
  const timeMs = cursorProgressTime.value * 1000
  for (let i = lines.length - 1; i >= 0; i--) {
    const line: any = lines[i]
    if (line.startTime <= timeMs) {
      const wordsText = (line.words || [])
        .map((w: any) => w.word)
        .join('')
        .trim()
      const text = wordsText || line.translatedLyric || line.romanLyric || ''
      if (text) return text
    }
  }
  return ''
})

const updateCursorPositionFromEvent = (event: MouseEvent) => {
  if (!progressRef.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  cursorProgressPercentage.value = (offsetX / rect.width) * 100
}
const handleProgressMouseEnter = () => {
  isCursorOverProgress.value = true
}
const handleProgressMouseMove = (event: MouseEvent) => {
  updateCursorPositionFromEvent(event)
}
const handleProgressMouseLeave = () => {
  isCursorOverProgress.value = false
}

// 进度条拖动处理
const handleProgressClick = (event: MouseEvent) => {
  if (dlnaStore.currentDevice) {
    MessagePlugin.warning('投屏模式下不支持拖拽进度')
    return
  }
  if (!progressRef.value) return

  const rect = progressRef.value.getBoundingClientRect()
  const offsetX = event.clientX - rect.left
  const percentage = (offsetX / rect.width) * 100

  // 更新临时进度值，使UI立即响应
  tempProgressPercentage.value = percentage
  cursorProgressPercentage.value = percentage

  const wasPlaying = Audio.value.isPlay
  const newTime = (percentage / 100) * Audio.value.duration
  if (dlnaStore.currentDevice) {
    // Pause local audio while DLNA seeks/buffers
    if (Audio.value.audio && !Audio.value.audio.paused) {
      Audio.value.audio.pause()
    }
    dlnaStore.seek(newTime).then(() => {
      seekTo(newTime)
      // Wait a bit for DLNA to buffer, then sync and resume
      setTimeout(async () => {
        if (wasPlaying && Audio.value.audio) {
          const position = await dlnaStore.getPosition()
          if (position && typeof position === 'number') {
            Audio.value.audio.currentTime = position
          }
          Audio.value.audio.play().catch(() => {})
        }
      }, 1000)
    })
  } else {
    seekTo(newTime)
  }
}

const handleProgressDragMove = (event: MouseEvent) => {
  if (!isDraggingProgress.value || !progressRef.value) return
  const rect = progressRef.value.getBoundingClientRect()
  const offsetX = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
  const percentage = (offsetX / rect.width) * 100

  // 拖动时只更新UI，不频繁设置audio.currentTime
  tempProgressPercentage.value = percentage
  cursorProgressPercentage.value = percentage
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
  const wasPlaying = Audio.value.isPlay
  const newTime = (percentage / 100) * Audio.value.duration

  if (dlnaStore.currentDevice) {
    // Pause local audio while DLNA seeks/buffers
    if (Audio.value.audio && !Audio.value.audio.paused) {
      Audio.value.audio.pause()
    }
    dlnaStore.seek(newTime).then(() => {
      seekTo(newTime)
      // Wait a bit for DLNA to buffer, then sync and resume
      setTimeout(async () => {
        if (wasPlaying && Audio.value.audio) {
          const position = await dlnaStore.getPosition()
          if (position && typeof position === 'number') {
            Audio.value.audio.currentTime = position
          }
          Audio.value.audio.play().catch(() => {})
        }
      }, 1000)
    })
  } else {
    seekTo(newTime)
  }

  isDraggingProgress.value = false
  window.removeEventListener('mousemove', handleProgressDragMove)
  window.removeEventListener('mouseup', handleProgressDragEnd)
}

const handleProgressDragStart = (event: MouseEvent) => {
  if (dlnaStore.currentDevice) {
    MessagePlugin.warning('投屏模式下不支持拖拽进度')
    return
  }
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
  () => songInfo.value.songmid,
  (songmid) => {
    bg.value = bg.value === 'var(--player-bg-idle)' ? 'var(--player-bg-default)' : toRaw(bg.value)
    if (!songmid) {
      bg.value = 'var(--player-bg-idle)'
    }
  },
  { immediate: true }
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
    :class="{ 'full-play-idle': isFullPlayIdle && showFullPlay && !isMoreMenuOpen }"
    @click.stop="toggleFullPlay"
  >
    <!-- 进度条 -->
    <div class="progress-bar-container">
      <div
        ref="progressRef"
        class="progress-bar"
        @mousedown="handleProgressDragStart($event)"
        @click.stop="handleProgressClick"
        @mouseenter="handleProgressMouseEnter"
        @mousemove="handleProgressMouseMove"
        @mouseleave="handleProgressMouseLeave"
      >
        <div class="progress-background"></div>
        <!-- 无感过渡预告区间标记 -->
        <div
          v-if="crossfadeMarkVisible"
          class="crossfade-mark"
          :style="{ left: crossfadeMarkLeft + '%', width: crossfadeMarkWidth + '%' }"
        ></div>
        <!-- 过渡进行中的活跃区段标记 -->
        <div
          v-if="crossfadeActiveMarkVisible"
          class="crossfade-active-mark"
          :style="{ left: crossfadeActiveMarkLeft + '%', width: crossfadeActiveMarkWidth + '%' }"
        ></div>
        <!-- 过渡完成后：新歌开头的淡入标记 -->
        <div
          v-if="crossfadeFadeInMarkVisible"
          class="crossfade-fadein-mark"
          :style="{ left: '0%', width: crossfadeFadeInMarkWidth + '%' }"
        ></div>
        <div class="progress-filled" :style="{ width: `${progressPercentage}%` }"></div>
        <div class="progress-handle" :style="{ left: `${progressPercentage}%` }"></div>
        <!-- 鼠标悬停 / 拖动时的 tooltip：显示位置时间与对应歌词 -->
        <transition name="progress-tip-fade">
          <div
            v-if="showProgressTooltip"
            class="progress-tooltip"
            :style="{ left: `${cursorProgressPercentage}%` }"
            @click.stop
            @mousedown.stop
          >
            <div v-if="cursorProgressLyric" class="progress-tooltip-lyric">
              {{ cursorProgressLyric }}
            </div>
            <div class="progress-tooltip-time">{{ cursorProgressTimeFormatted }}</div>
          </div>
        </transition>
      </div>
    </div>

    <div class="player-content">
      <!-- 左侧：封面 + 歌曲信息 + 歌曲操作 -->
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
              class="control-btn like-btn"
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
          <Transition name="comment-fade" mode="out-in" appear>
            <div v-if="songInfo.source !== 'local' && showFullPlay" class="comment-btn-wrapper">
              <t-tooltip content="评论">
                <t-button
                  class="control-btn"
                  variant="text"
                  shape="circle"
                  :disabled="!songInfo.songmid"
                  @click.stop="toggleComments"
                >
                  <chat-bubble-1-icon
                    :fill-color="'transparent'"
                    :stroke-color="'currentColor'"
                    :stroke-width="1.5"
                  />
                </t-button>
              </t-tooltip>
            </div>
          </Transition>
          <!-- 更多按钮 -->
          <n-dropdown
            trigger="click"
            placement="top-start"
            :options="moreMenuOptions"
            @select="handleMoreMenuSelect"
            @update:show="(s: boolean) => (isMoreMenuOpen = s)"
          >
            <t-button
              class="control-btn"
              shape="circle"
              variant="text"
              :disabled="!songInfo.songmid"
              @click.stop
            >
              <ellipsis-icon size="18" />
            </t-button>
          </n-dropdown>
        </div>
      </div>

      <!-- 中间：核心播放控制 -->
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

      <!-- 右侧：时间 + 辅助控制 -->
      <div class="right-section">
        <div class="time-display">
          <span class="time-current">{{ currentTimeFormatted }}</span>
          <span class="time-sep">/</span>
          <span class="time-total">{{ durationFormatted }}</span>
        </div>

        <div class="extra-controls">
          <!-- 播放模式按钮 -->
          <t-tooltip :content="playModeTip">
            <t-button
              class="control-btn mode-btn"
              shape="circle"
              variant="text"
              @click.stop="updatePlayMode"
            >
              <i :class="playModeIconClass + ' ' + 'PlayMode'" style="width: 1.4em"></i>
            </t-button>
          </t-tooltip>

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
      v-model:show-comments="showComments"
      :song-id="songInfo.songmid ? songInfo.songmid.toString() : null"
      :show="showFullPlay"
      :cover-image="player.cover"
      :song-info="songInfo"
      :main-color="maincolor"
      :disable-auto-hide="isMoreMenuOpen"
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

  <!-- 无感过渡提示 -->
  <CrossfadeHint />

  <!-- 分享对话框 -->
  <ShareSongDialog v-model="shareDialogVisible" />
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

.comment-btn-wrapper {
  display: inline-flex;
  will-change: opacity, transform;
}

.comment-fade-enter-active,
.comment-fade-leave-active {
  transition: all 0.2s ease-in-out;
}
.comment-fade-enter-from,
.comment-fade-leave-to {
  opacity: 0;
  transform: scale(0.9);
}

/* 进度条 tooltip 过渡 */
.progress-tip-fade-enter-active,
.progress-tip-fade-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}
.progress-tip-fade-enter-from,
.progress-tip-fade-leave-to {
  opacity: 0;
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

@keyframes crossfade-pulse {
  0%,
  100% {
    opacity: 0.65;
    filter: brightness(1);
  }
  50% {
    opacity: 1;
    filter: brightness(1.35);
  }
}

@keyframes crossfade-fadein-glow {
  0% {
    opacity: 0;
    transform: translateY(-50%) scaleX(0.6);
    transform-origin: left center;
  }
  35% {
    opacity: 1;
    transform: translateY(-50%) scaleX(1);
  }
  100% {
    opacity: 0.9;
    transform: translateY(-50%) scaleX(1);
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
  backdrop-filter: blur(30px) saturate(1.5);
  -webkit-backdrop-filter: blur(30px) saturate(1.5);
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

    // 无感过渡预告区间：在进度条末尾以斜纹/半透明条块显示
    .crossfade-mark {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      height: var(--play-line-height);
      border-radius: 999px;
      pointer-events: none;
      background: repeating-linear-gradient(
        45deg,
        rgba(255, 255, 255, 0.35),
        rgba(255, 255, 255, 0.35) 3px,
        rgba(255, 255, 255, 0.1) 3px,
        rgba(255, 255, 255, 0.1) 6px
      );
      box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
      opacity: 0.75;
      transition:
        left 0.2s linear,
        width 0.2s linear,
        height 0.2s ease;
    }

    // 过渡进行中的活跃区段：更醒目的脉动高亮
    .crossfade-active-mark {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      height: var(--play-line-height);
      border-radius: 999px;
      pointer-events: none;
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.85),
        v-bind(maincolor) 50%,
        rgba(255, 255, 255, 0.85)
      );
      box-shadow: 0 0 8px rgba(255, 255, 255, 0.6);
      animation: crossfade-pulse 1.2s ease-in-out infinite;
    }

    // 过渡完成后：新歌开头的淡入段标记（从左向右渐弱的条带 + 轻微辉光）
    .crossfade-fadein-mark {
      position: absolute;
      top: 50%;
      transform: translateY(-50%);
      height: var(--play-line-height);
      border-radius: 999px;
      pointer-events: none;
      background: linear-gradient(
        90deg,
        rgba(255, 255, 255, 0.7),
        rgba(255, 255, 255, 0.25) 70%,
        rgba(255, 255, 255, 0)
      );
      box-shadow: 0 0 6px rgba(255, 255, 255, 0.4);
      opacity: 0.9;
      animation: crossfade-fadein-glow 2.4s ease-out;
      transition:
        width 0.3s linear,
        opacity 0.8s ease,
        height 0.2s ease;
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

    /* 进度条悬停 / 拖动时的位置 tooltip */
    .progress-tooltip {
      position: absolute;
      bottom: calc(50% + 12px);
      transform: translateX(-50%);
      pointer-events: none;
      background: rgba(0, 0, 0, 0.78);
      color: #fff;
      backdrop-filter: blur(10px);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12px;
      line-height: 1.4;
      max-width: 320px;
      min-width: 56px;
      text-align: center;
      box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
      white-space: normal;
      z-index: 10;

      &::after {
        content: '';
        position: absolute;
        left: 50%;
        bottom: -5px;
        width: 0;
        height: 0;
        border-left: 5px solid transparent;
        border-right: 5px solid transparent;
        border-top: 5px solid rgba(0, 0, 0, 0.78);
        transform: translateX(-50%);
      }

      .progress-tooltip-lyric {
        font-size: 12px;
        opacity: 0.95;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 300px;
      }

      .progress-tooltip-time {
        font-size: 11px;
        font-variant-numeric: tabular-nums;
        opacity: 0.85;
        margin-top: 2px;
      }
    }

    // 悬停或拖拽时，轻微加粗提升可见性
    &:hover {
      .progress-background,
      .progress-filled,
      .crossfade-mark,
      .crossfade-active-mark,
      .crossfade-fadein-mark {
        height: 6px;
      }
    }
    &:has(.progress-handle.dragging) {
      .progress-background,
      .progress-filled,
      .crossfade-mark,
      .crossfade-active-mark,
      .crossfade-fadein-mark {
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
  gap: 4px;
  margin-left: 16px;

  .control-btn {
    background: transparent;
    border: none;
    color: v-bind(contrastTextColor);
    cursor: pointer;
    width: 32px;
    height: 32px;
    padding: 0;
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
  gap: 14px;
  flex: 0 0 auto;

  .control-btn {
    background: transparent;
    border: none;
    color: v-bind(contrastTextColor);
    cursor: pointer;
    width: 36px;
    height: 36px;
    padding: 0;
    display: flex;
    align-items: center;
    justify-content: center;

    span {
      font-size: 26px;
      line-height: 1;
    }

    &:hover {
      color: v-bind(hoverColor);
    }

    &.play-btn {
      width: 40px;
      height: 40px;
      background-color: v-bind(playbg);
      transition: background-color 0.2s ease;

      border-radius: 50%;

      span {
        font-size: 24px;
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

/* 右侧：时间 + 辅助控制 */
.right-section {
  display: flex;
  align-items: center;
  gap: 14px;
  flex: 1;
  justify-content: flex-end;

  .time-display {
    font-size: 12px;
    line-height: 1;
    color: v-bind(contrastTextColor);
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
    display: inline-flex;
    align-items: baseline;
    gap: 4px;

    .time-current {
      color: v-bind(hoverColor);
      min-width: 32px;
      text-align: right;
    }
    .time-sep {
      opacity: 0.5;
    }
    .time-total {
      opacity: 0.75;
      min-width: 32px;
      text-align: left;
    }
  }

  .extra-controls {
    display: flex;
    align-items: center;
    gap: 10px;

    .control-btn {
      background: transparent;
      border: none;
      color: v-bind(contrastTextColor);
      cursor: pointer;
      width: 32px;
      height: 32px;
      padding: 0;
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
    gap: 10px;
  }

  .right-section .extra-controls {
    gap: 8px;
  }
}

@media (max-width: 576px) {
  .left-section .song-info {
    max-width: 120px;
  }

  .left-actions .comment-btn-wrapper {
    display: none;
  }

  .right-section .extra-controls .control-btn:nth-child(1) {
    display: none;
  }
}
</style>
