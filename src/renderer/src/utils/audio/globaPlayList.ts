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
import { waitForAudioReady, getCandidateSongs } from './audioHelpers'

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
let currentPlaybackErrorHandler: ((e: Event) => void) | null = null
let currentPlaybackPlayingHandler: ((e: Event) => void) | null = null
let currentPlayRequestId: number = 0

const setUrl = controlAudio.setUrl
const start = controlAudio.start
const stop = controlAudio.stop
const setCurrentTime = controlAudio.setCurrentTime

const PluginErrorMsgs = [
  '插件都不配就想播放，想的倒挺美呢',
  '插件插件老弟我需要插件',
  '我肚子饿啦，请给我安装一个插件吧',
  '插件呢？插件呢？插件呢？',
  '哥哥~ 你需要安装一个插件来播放歌曲哦~'
]

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
      if (Audio.value.audio) {
        await waitForAudioReady(Audio.value.audio)
      }
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
  if (!localUserStore.userSource.pluginId && song.source !== 'local') {
    MessagePlugin.error(PluginErrorMsgs[Math.floor(Math.random() * PluginErrorMsgs.length)])
    return
  }
  // 使用当前时间戳作为请求ID，解决快速切歌的竞态问题
  const requestId = Date.now()
  // songInfo 上不存在 requestId 属性，移除该行；requestId 仅通过闭包变量跟踪即可

  // 更好的方式：使用闭包变量跟踪是否是最新请求
  // 但是 playSong 是 async 的，我们需要在关键的 await 之后检查

  // 更新全局的 currentPlayRequestId
  currentPlayRequestId = requestId

  // 防抖：给一个短暂的缓冲期，避免连续快速点击导致并发请求错误
  await new Promise((resolve) => setTimeout(resolve, 300))
  if (currentPlayRequestId !== requestId) return

  try {
    isLoadingSong.value = true
    // 清理之前的监听器
    if (Audio.value.audio) {
      if (currentPlaybackErrorHandler) {
        Audio.value.audio.removeEventListener('error', currentPlaybackErrorHandler)
        currentPlaybackErrorHandler = null
      }
      if (currentPlaybackPlayingHandler) {
        Audio.value.audio.removeEventListener('playing', currentPlaybackPlayingHandler)
        currentPlaybackPlayingHandler = null
      }
    }

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

    // 如果切歌了，这里先不更新 UI，等真正开始获取 URL 了再说？
    // 不，UI 应该立即响应。
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
    // let usedAutoSwitch = false
    try {
      urlToPlay = await getSongRealUrl(toRaw(song))
    } catch (error: any) {
      // 检查是否已过期
      if (currentPlayRequestId !== requestId) return

      console.warn('Original source failed, trying auto switch...', error)
      try {
        throw new Error('Force switch')
      } catch (switchError) {}
    }

    // 再次检查请求ID
    if (currentPlayRequestId !== requestId) return

    // 如果 urlToPlay 为空或者上面抛出了错误，说明原源不行，开始尝试 candidates
    if (!urlToPlay || urlToPlay.includes('error')) {
      try {
        const candidates = await getCandidateSongs(song, userInfo.value)

        // 再次检查请求ID，因为 search 也耗时
        if (currentPlayRequestId !== requestId) return

        let playSuccess = false
        for (const item of candidates) {
          // 每次循环前都检查是否被新的播放请求打断
          if (currentPlayRequestId !== requestId) return

          try {
            const url = await getSongRealUrl(toRaw(item))
            if (currentPlayRequestId !== requestId) return // getSongRealUrl 也是 async

            if (!url || typeof url !== 'string' || url.includes('error')) continue

            setUrl(url)
            if (Audio.value.audio) {
              const a = Audio.value.audio
              try {
                a.pause()
              } catch {}
              a.removeAttribute('src')
              a.load()

              try {
                await waitForAudioReady(Audio.value.audio)
                if (currentPlayRequestId !== requestId) return // 等待期间可能切歌

                MessagePlugin.success(`已自动切换到 ${item.source} 源播放`)
                playSuccess = true
                urlToPlay = url
                songInfo.value = { ...song }
                break
              } catch (e) {
                continue
              }
            }
          } catch {
            continue
          }
        }

        if (currentPlayRequestId !== requestId) return

        if (!playSuccess) {
          isLoadingSong.value = false
          tryAutoNext('自动换源失败：所有源均无法播放')
          return
        }
      } catch (e: any) {
        if (currentPlayRequestId !== requestId) return
        isLoadingSong.value = false
        tryAutoNext('自动换源失败,原因:' + e?.message || '未知')
        return
      }
    } else {
      // 原源 URL 获取成功，尝试播放
      if (Audio.value.audio) {
        const a = Audio.value.audio
        try {
          a.pause()
        } catch {}
        a.removeAttribute('src')
        a.load()
      }
      setUrl(urlToPlay)
      try {
        if (Audio.value.audio) {
          await waitForAudioReady(Audio.value.audio)
        }
        if (currentPlayRequestId !== requestId) return
      } catch (e) {
        if (currentPlayRequestId !== requestId) return
        // 原源 URL 获取成功但播放/加载失败
        console.warn('Audio ready failed, trying auto switch...', e)
        try {
          const candidates = await getCandidateSongs(song, userInfo.value)
          if (currentPlayRequestId !== requestId) return

          let playSuccess = false
          for (const item of candidates) {
            if (currentPlayRequestId !== requestId) return
            try {
              const url = await getSongRealUrl(toRaw(item))
              if (currentPlayRequestId !== requestId) return

              if (!url || typeof url !== 'string' || url.includes('error')) continue

              // 避免重复尝试那个失败的 URL
              if (url === urlToPlay) continue

              setUrl(url)
              if (Audio.value.audio) {
                Audio.value.audio.load()
                try {
                  await waitForAudioReady(Audio.value.audio)
                  if (currentPlayRequestId !== requestId) return

                  MessagePlugin.success(`已自动切换到 ${item.source} 源播放`)
                  playSuccess = true
                  break
                } catch (e) {
                  continue
                }
              }
            } catch {
              continue
            }
          }

          if (currentPlayRequestId !== requestId) return

          if (!playSuccess) {
            throw e
          }
        } catch (switchError) {
          if (currentPlayRequestId !== requestId) return
          throw switchError
        }
      }
    }

    if (currentPlayRequestId !== requestId) return

    songInfo.value = { ...song }
    isLoadingSong.value = false
    start()
      .catch(async () => {
        if (currentPlayRequestId !== requestId) return
        tryAutoNext('启动播放失败')
      })
      .then(() => {
        if (currentPlayRequestId !== requestId) return
        autoNextCount.value = 0
      })

    // 只有在确定是当前请求时，才挂载错误监听
    if (Audio.value.audio) {
      currentPlaybackPlayingHandler = () => {
        isLoadingSong.value = false
        currentPlaybackPlayingHandler = null
      }
      Audio.value.audio.addEventListener('playing', currentPlaybackPlayingHandler, { once: true })
      currentPlaybackErrorHandler = async () => {
        // 如果触发了 error，也要检查是不是当前这首歌的 error
        // 其实 error listener 是一次性的，并且每次 playSong 开头都会清理
        // 所以理论上只要 playSong 没被新的打断，这个 listener 就是有效的。
        // 但如果快速切歌，旧的 playSong 可能还在运行，挂载了 listener，
        // 然后新的 playSong 运行，清理了 listener。
        //
        // 现在的逻辑是：只有 playSong 走到最后才会挂载 listener。
        // 由于我们加了 currentPlayRequestId check，旧的 playSong 即使没执行完，
        // 只要遇到 await 就会停止，不会走到最后挂载 listener。
        //
        // 唯一的问题是：如果旧的 playSong 已经挂载了 listener，然后新的 playSong 开始了，
        // 新的 playSong 会清理旧的 listener。
        // 所以这里不需要额外的 check，只要保证 playSong 中途退出即可。

        console.warn('Playback error, trying auto switch...')
        currentPlaybackErrorHandler = null

        try {
          const candidates = await getCandidateSongs(song, userInfo.value)
          // 注意：这里的 song 是闭包变量，仍然引用着当时那首歌。
          // 如果此时用户已经切到下一首了，我们不应该继续这个重试逻辑。
          // 所以这里也需要检查 requestId。
          if (currentPlayRequestId !== requestId) return

          let playSuccess = false
          for (const item of candidates) {
            if (currentPlayRequestId !== requestId) return
            try {
              const url = await getSongRealUrl(toRaw(item))
              if (currentPlayRequestId !== requestId) return
              if (!url || typeof url !== 'string' || url.includes('error')) continue

              if (Audio.value.audio && Audio.value.audio.src === url) continue

              setUrl(url)
              if (Audio.value.audio) {
                Audio.value.audio.load()
                await waitForAudioReady(Audio.value.audio)
                if (currentPlayRequestId !== requestId) return

                MessagePlugin.success(`已自动切换到 ${item.source} 源播放`)
                playSuccess = true
                start().catch(() => {
                  if (currentPlayRequestId !== requestId) return
                  tryAutoNext('换源后启动播放失败')
                })
                break
              }
            } catch (e) {
              continue
            }
          }

          if (currentPlayRequestId !== requestId) return

          if (!playSuccess) {
            isLoadingSong.value = false
            tryAutoNext('所有自动换源尝试均失败')
          }
        } catch (e) {
          if (currentPlayRequestId !== requestId) return
          isLoadingSong.value = false
          tryAutoNext('播放出错且自动换源失败')
        }
      }
      Audio.value.audio.addEventListener('error', currentPlaybackErrorHandler, { once: true })
    }
  } catch (error: any) {
    if (currentPlayRequestId !== requestId) return
    tryAutoNext('播放歌曲失败')
    isLoadingSong.value = false
  } finally {
    // 只有当前请求才能关闭 loading
    if (currentPlayRequestId === requestId) {
      isLoadingSong.value = false
    }
  }
}

const tryAutoNext = (reason: string) => {
  if (
    localUserStore.userSource.pluginId === undefined ||
    reason.includes('频率') ||
    reason.includes('限制')
  ) {
    return
  }
  const limit = getAutoNextLimit()
  MessagePlugin.error(`自动跳过当前歌曲：原因：${reason}`)
  if ((autoNextCount.value >= limit || autoNextCount.value >= 10) && autoNextCount.value > 2) {
    MessagePlugin.error(
      `自动下一首失败：${autoNextCount.value}/${limit > 10 ? 10 : limit}次。原因：${reason}`
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
    let nextIndex: number | string
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

let playbackInstalled = false
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
      console.log('next')
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
    case 'setPlayMode':
      {
        const v = String(val || '')
        if (v === 'sequence') {
          playMode.value = PlayMode.SEQUENCE
          userInfo.value.playMode = playMode.value
        } else if (v === 'random') {
          playMode.value = PlayMode.RANDOM
          userInfo.value.playMode = playMode.value
        } else if (v === 'toggleSingle') {
          playMode.value = playMode.value === PlayMode.SINGLE ? PlayMode.SEQUENCE : PlayMode.SINGLE
          userInfo.value.playMode = playMode.value
        }
      }
      break
  }
}

const initPlayback = async () => {
  if (playbackInstalled) return
  playbackInstalled = true

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
        try {
          console.log('initPlayback', lastPlayedSong)
          const url = await getSongRealUrl(toRaw(lastPlayedSong))
          setUrl(url)
        } catch {}
        if (userInfo.value.currentTime) {
          pendingRestorePosition = userInfo.value.currentTime
          pendingRestoreSongId = lastPlayedSong.songmid
          if (Audio.value.audio) {
            console.log('上次进度', userInfo.value.currentTime)
            await waitForAudioReady(Audio.value.audio)
            Audio.value.currentTime = userInfo.value.currentTime
            Audio.value.audio.currentTime = userInfo.value.currentTime
          }
        }
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
  // controlAudio.subscribe('ended', () => {
  //   window.requestAnimationFrame(() => {
  //     void playNext()
  //   })
  // })
}
window.addEventListener('global-music-control', onGlobalCtrl)

const uninstallPlayback = () => {
  if (!playbackInstalled) return
  playbackInstalled = false

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
  uninstallPlayback,
  playSong,
  playNext,
  playPrevious,
  updatePlayMode,
  togglePlayPause,
  handlePlay,
  handlePause,
  setVolume,
  seekTo,
  onGlobalCtrl
}
