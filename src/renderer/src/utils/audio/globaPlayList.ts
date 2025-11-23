import { ref, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { PlayMode, type SongList } from '@renderer/types/audio'
import { MessagePlugin } from 'tdesign-vue-next'
import defaultCoverImg from '/default-cover.png'
import mediaSessionController from '@renderer/utils/audio/useSmtc'
import {
  getSongRealUrl,
  initPlaylistEventListeners,
  destroyPlaylistEventListeners
} from '@renderer/utils/playlist/playlistManager'

const controlAudio = ControlAudioStore()
const localUserStore = LocalUserDetailStore()
const { Audio } = storeToRefs(controlAudio)
const { list, userInfo } = storeToRefs(localUserStore)

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

let pendingRestorePosition = 0
let pendingRestoreSongId: number | string | null = null

const waitForAudioReady = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    const audio = Audio.value.audio
    if (!audio) {
      reject(new Error('音频元素未初始化'))
      return
    }
    if (audio.readyState >= 3) {
      resolve()
      return
    }
    const timeout = setTimeout(() => {
      audio.removeEventListener('canplay', onCanPlay)
      audio.removeEventListener('error', onError)
      reject(new Error('音频加载超时'))
    }, 10000)
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
    audio.addEventListener('canplay', onCanPlay, { once: true })
    audio.addEventListener('error', onError, { once: true })
  })
}

const setUrl = controlAudio.setUrl
const start = controlAudio.start
const stop = controlAudio.stop
const setCurrentTime = controlAudio.setCurrentTime

const handlePlay = async () => {
  if (!Audio.value.url) {
    if (list.value.length > 0) {
      await playSong(list.value[0])
    } else {
      MessagePlugin.warning('播放列表为空，请先添加歌曲')
    }
    return
  }
  try {
    if (pendingRestorePosition > 0 && pendingRestoreSongId === userInfo.value.lastPlaySongId) {
      await waitForAudioReady()
      setCurrentTime(pendingRestorePosition)
      if (Audio.value.audio) {
        Audio.value.audio.currentTime = pendingRestorePosition
      }
      pendingRestorePosition = 0
      pendingRestoreSongId = null
    }
    const startResult = start()
    if (startResult && typeof (startResult as any).then === 'function') {
      await startResult
    }
    mediaSessionController.updatePlaybackState('playing')
  } catch (error) {
    MessagePlugin.error('播放失败，请重试')
  }
}

const handlePause = async () => {
  const a = Audio.value.audio
  if (Audio.value.url && a && !a.paused) {
    const stopResult = stop()
    if (stopResult && typeof (stopResult as any).then === 'function') {
      await stopResult
    }
    mediaSessionController.updatePlaybackState('paused')
  } else if (Audio.value.url) {
    mediaSessionController.updatePlaybackState('paused')
  }
}

const togglePlayPause = async () => {
  const a = Audio.value.audio
  const isActuallyPlaying = a ? !a.paused : Audio.value.isPlay
  if (isActuallyPlaying) {
    await handlePause()
  } else {
    await handlePlay()
  }
}

const playSong = async (song: SongList) => {
  try {
    isLoadingSong.value = true
    const isHistoryPlay =
      song.songmid === userInfo.value.lastPlaySongId &&
      userInfo.value.currentTime !== undefined &&
      userInfo.value.currentTime > 0
    if (isHistoryPlay && userInfo.value.currentTime !== undefined) {
      pendingRestorePosition = userInfo.value.currentTime
      pendingRestoreSongId = song.songmid
      userInfo.value.currentTime = 0
    } else {
      pendingRestorePosition = 0
      pendingRestoreSongId = null
    }
    if (Audio.value.isPlay && Audio.value.audio) {
      Audio.value.isPlay = false
      Audio.value.audio.pause()
      Audio.value.audio.volume = Audio.value.volume / 100
    }
    songInfo.value.name = song.name
    songInfo.value.singer = song.singer
    songInfo.value.albumName = song.albumName
    songInfo.value.img = song.img
    userInfo.value.lastPlaySongId = song.songmid
    mediaSessionController.updateMetadata({
      title: song.name,
      artist: song.singer,
      album: song.albumName || '未知专辑',
      artworkUrl: song.img || defaultCoverImg
    })
    let urlToPlay = ''
    try {
      urlToPlay = await getSongRealUrl(toRaw(song))
    } catch (error: any) {
      isLoadingSong.value = false
      tryAutoNext('获取歌曲 URL 失败')
      return
    }
    if (Audio.value.audio) {
      const a = Audio.value.audio
      try {
        a.pause()
      } catch {}
      a.removeAttribute('src')
      a.load()
    }
    setUrl(urlToPlay)
    await waitForAudioReady()
    songInfo.value = { ...song }
    isLoadingSong.value = false
    start()
      .catch(async () => {
        tryAutoNext('启动播放失败')
      })
      .then(() => {
        autoNextCount.value = 0
      })
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
    tryAutoNext('播放歌曲失败')
    isLoadingSong.value = false
  } finally {
    isLoadingSong.value = false
  }
}

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

const playMode = ref(userInfo.value.playMode || PlayMode.SEQUENCE)
const isLoadingSong = ref(false)
const autoNextCount = ref(0)
const getAutoNextLimit = () => Math.max(1, Math.floor(list.value.length * 0.3))

const updatePlayMode = () => {
  const modes = [PlayMode.SEQUENCE, PlayMode.RANDOM, PlayMode.SINGLE]
  const currentIndex = modes.indexOf(playMode.value)
  const nextIndex = (currentIndex + 1) % modes.length
  playMode.value = modes[nextIndex]
  userInfo.value.playMode = playMode.value
}

const playPrevious = async () => {
  if (list.value.length === 0) return
  try {
    const currentIndex = list.value.findIndex(
      (song) => song.songmid === userInfo.value.lastPlaySongId
    )
    let prevIndex
    if (playMode.value === PlayMode.RANDOM) {
      prevIndex = Math.floor(Math.random() * list.value.length)
    } else {
      prevIndex = currentIndex <= 0 ? list.value.length - 1 : currentIndex - 1
    }
    if (prevIndex >= 0 && prevIndex < list.value.length) {
      await playSong(list.value[prevIndex])
    }
  } catch {
    MessagePlugin.error('播放上一首失败')
  }
}

const playNext = async () => {
  if (list.value.length === 0) return
  try {
    if (playMode.value === PlayMode.SINGLE && userInfo.value.lastPlaySongId) {
      const currentSong = list.value.find((song) => song.songmid === userInfo.value.lastPlaySongId)
      if (currentSong) {
        if (Audio.value.audio) {
          Audio.value.audio.currentTime = 0
        }
        const startResult = start()
        if (startResult && typeof (startResult as any).then === 'function') {
          await startResult
        }
        return
      }
    }
    const currentIndex = list.value.findIndex(
      (song) => song.songmid === userInfo.value.lastPlaySongId
    )
    let nextIndex
    if (playMode.value === PlayMode.RANDOM) {
      nextIndex = Math.floor(Math.random() * list.value.length)
    } else {
      nextIndex = (currentIndex + 1) % list.value.length
    }
    if (nextIndex >= 0 && nextIndex < list.value.length) {
      await playSong(list.value[nextIndex])
    }
  } catch {
    MessagePlugin.error('播放下一首失败')
  }
}

const setVolume = (v: number) => controlAudio.setVolume(v)
const seekTo = (time: number) => {
  setCurrentTime(time)
  if (Audio.value.audio) {
    Audio.value.audio.currentTime = time
  }
}

let savePositionInterval: number | null = null
const onGlobalCtrl = (e: any) => {
  const name = e?.detail?.name
  const val = e?.detail?.val
  switch (name) {
    case 'play':
      void handlePlay()
      break
    case 'pause':
      void handlePause()
      break
    case 'toggle':
      void togglePlayPause()
      break
    case 'playPrev':
      void playPrevious()
      break
    case 'playNext':
      void playNext()
      break
    case 'volumeDelta':
      {
        const next = Math.max(0, Math.min(100, (Audio.value.volume || 0) + (Number(val) || 0)))
        setVolume(next)
      }
      break
    case 'seekDelta':
      {
        const a = Audio.value.audio
        if (a) {
          const cur = a.currentTime || 0
          const target = Math.max(0, Math.min(a.duration || 0, cur + (Number(val) || 0)))
          seekTo(target)
        }
      }
      break
  }
}

const initPlayback = async () => {
  initPlaylistEventListeners(localUserStore, playSong)
  if (userInfo.value.lastPlaySongId && list.value.length > 0) {
    const lastPlayedSong = list.value.find((song) => song.songmid === userInfo.value.lastPlaySongId)
    if (lastPlayedSong) {
      songInfo.value = { ...lastPlayedSong }
      mediaSessionController.updateMetadata({
        title: lastPlayedSong.name,
        artist: lastPlayedSong.singer,
        album: lastPlayedSong.albumName || '未知专辑',
        artworkUrl: lastPlayedSong.img || defaultCoverImg
      })
      if (!Audio.value.isPlay) {
        if (userInfo.value.currentTime && userInfo.value.currentTime > 0) {
          pendingRestorePosition = userInfo.value.currentTime
          pendingRestoreSongId = lastPlayedSong.songmid
          if (Audio.value.audio) {
            Audio.value.audio.currentTime = userInfo.value.currentTime
          }
        }
        try {
          const url = await getSongRealUrl(toRaw(lastPlayedSong))
          setUrl(url)
        } catch {}
      } else {
        if (Audio.value.audio) {
          mediaSessionController.updatePlaybackState(
            Audio.value.audio.paused ? 'paused' : 'playing'
          )
        }
      }
    }
  }
  savePositionInterval = window.setInterval(() => {
    if (Audio.value.isPlay) {
      userInfo.value.currentTime = Audio.value.currentTime
    }
  }, 1000)
  window.addEventListener('global-music-control', onGlobalCtrl)
  controlAudio.subscribe('ended', () => {
    window.requestAnimationFrame(() => {
      void playNext()
    })
  })
}

const destroyPlayback = () => {
  destroyPlaylistEventListeners()
  window.removeEventListener('global-music-control', onGlobalCtrl)
  if (savePositionInterval !== null) {
    clearInterval(savePositionInterval)
    savePositionInterval = null
  }
}

export {
  songInfo,
  playMode,
  isLoadingSong,
  initPlayback,
  destroyPlayback,
  playSong,
  playNext,
  playPrevious,
  updatePlayMode,
  togglePlayPause,
  handlePlay,
  handlePause,
  setVolume,
  seekTo
}
