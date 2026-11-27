import { desktopBridge } from '@renderer/services/desktopBridge'
import { songKey, selectSong, restoredSong, durationMilliseconds } from '@common/musicItem'
import { ref, toRaw, watch } from 'vue'
import { interceptsAdvance, interceptsQueueEnd, interceptsShuffle, runAdjustment, runAdvance, runPlay, runPlaybackFailure, runQueueEnd, runShuffle, runTransport } from '@renderer/plugin/operations'
import { storeToRefs } from 'pinia'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { PlayMode, type SongList } from '@renderer/types/audio'
import { MessagePlugin } from '@renderer/plugin/notifications'
import defaultCoverImg from '/default-cover.png'
import mediaSessionController from '@renderer/utils/audio/useSmtc'
import {
  getSongRealUrl,
  initPlaylistEventListeners,
  destroyPlaylistEventListeners
} from '@renderer/utils/playlist/playlistManager'
import { waitForAudioReady, parseInterval } from './audioHelpers'
import { createPlaybackFallback, notePlaybackThrottle } from './playbackFallback'
import { crossfadeManager } from './crossfade'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'

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
let selectionSequence = 0
let pendingSongId: SongList['songmid'] | null = null
let pendingMetadataController: AbortController | undefined

const AUTO_NEXT_DELAY_MS = 1500
let pendingAutoNextTimer: ReturnType<typeof setTimeout> | null = null
let pendingAutoNextToken = 0

let _unsubscribeThrottle: (() => void) | null = null
let _unsubscribeDisabled: (() => void) | null = null
let unsubscribeLocalTags: (() => void) | undefined
let unsubscribeRestorePosition: (() => void) | undefined
let playbackController: AbortController | undefined

const setUrl = controlAudio.setUrl

function reloadPlaybackUrl(url: string): void {
  const audio = Audio.value.audio
  if (audio) {
    audio.pause()
    if (audio.getAttribute('src') !== url.trim()) audio.removeAttribute('src')
    audio.load()
  }
  setUrl(url)
}
const start = controlAudio.start
const stop = controlAudio.stop
const setCurrentTime = controlAudio.setCurrentTime

const cancelPendingAutoNext = (keepAutomaticDecision = false) => {
  if (!keepAutomaticDecision) automaticAdvance = undefined
  pendingAutoNextToken++
  if (pendingAutoNextTimer !== null) {
    clearTimeout(pendingAutoNextTimer)
    pendingAutoNextTimer = null
  }
}



/**
 * 异步取一起听 store —— 用动态 import 避免循环依赖
 *
 * ListenTogether store 内部也动态 import 本文件;静态 import 会导致循环。
 * 顶层声明后,handlePlay/handlePause/playSong 等都能在房间内分流到 lt.* 命令。
 *
 * 同时缓存一份同步引用 `cachedLtStore`,供 seekTo 等同步路径使用 ——
 * 第一次成功取到后即缓存,后续调用立即可用。
 */
let cachedLtStore: any = null
const getListenTogetherStore = async () => {
  if (cachedLtStore) return cachedLtStore
  const { useListenTogetherStore } = await import('@renderer/store')
  cachedLtStore = useListenTogetherStore()
  return cachedLtStore
}

const handlePlay = (pluginId?: string, system = false) =>
  runTransport('player.resume', () => resumePlayback(pluginId), pluginId, system)
const resumePlayback = async (pluginId?: string) => {
  cancelPendingAutoNext()
  /* 一起听:在房间且有控制权 → 发命令给服务端,不本地播放;
   * 服务端 SYNC 回来后 ensureRoomSongLoadedAndSynced/applySnapshot 驱动本地 audio。
   * 无控制权 → 提示并 return,避免与远端状态打架。 */
  const lt = await getListenTogetherStore()
  if (lt.isInRoom) {
    if (lt.canControl) {
      lt.play()
    } else {
      MessagePlugin.warning('当前在一起听房间中,无播放控制权')
    }
    return
  }
  if (!Audio.value.url) {
    if (list.value.length > 0) {
      const target =
        restoredSong(
          list.value,
          userInfo.value,
          useGlobalPlayStatusStore().player.songInfo as SongList
        ) || list.value[0]
      await playSong(target, { pluginId })
    } else {
      MessagePlugin.warning('播放列表为空，请先添加歌曲')
    }
    return
  }
  try {
    if (pendingRestorePosition > 0 && pendingRestoreSongId === userInfo.value.lastPlaySongKey) {
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

const handlePause = (pluginId?: string, system = false) =>
  runTransport('player.pause', pausePlayback, pluginId, system)
const pausePlayback = async () => {
  cancelPendingAutoNext()
  /* 一起听:在房间且有控制权 → 发命令,不直接 stop 本地 */
  const lt = await getListenTogetherStore()
  if (lt.isInRoom) {
    if (lt.canControl) {
      lt.pause()
    }
    return
  }
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

const togglePlayPause = async (system = false) => {
  /* 一起听:在房间且有控制权时,以"本地 audio 实际状态"判断按钮意图。
   *
   * 不能用 lt.current.isPlaying —— 那是服务端权威状态,在以下情形会与本地音频
   * 不一致,导致按一次暂停按钮变成发 play 命令,自己不暂停:
   *  - SYNC 应用失败(浏览器拒绝 play()/pause())
   *  - 网络抖动期间状态短暂落后
   *  - 漂移校准窗口
   * 用户的意图永远是"我看到的状态的反面",所以以本地 audio.paused 为准最靠谱。 */
  const lt = await getListenTogetherStore()
  if (lt.isInRoom) {
    if (!lt.canControl) {
      MessagePlugin.warning('当前在一起听房间中,无播放控制权')
      return
    }
  }
  const a = Audio.value.audio
  const isActuallyPlaying = a ? !a.paused : Audio.value.isPlay
  if (isActuallyPlaying) {
    await handlePause(undefined, system)
  } else {
    await handlePlay(undefined, system)
  }
}

type PlayOptions = {
  immediate?: boolean
  shouldAutoStart?: () => boolean
  pluginId?: string
  beforePlay?: (song: SongList) => void
  fromFailure?: boolean
}
let playIntent = 0
const playSong = (song:SongList, options:PlayOptions = {}):Promise<void> => {
  const intent = ++playIntent
  return runPlay(song,localUserStore.list,options.pluginId,async selected => {
    if (intent!==playIntent) return
    options.beforePlay?.(selected)
    if (!options.fromFailure) autoNextCount.value = 0
    await playSelectedSong(selected, options, intent)
  })
}
const playSelectedSong = async (song: SongList, options: PlayOptions, intent: number) => {
  const selection = ++selectionSequence
  cancelPendingAutoNext()
  // 用户主动切歌，取消可能正在进行的无感过渡
  crossfadeManager.cancel()

  /* 一起听守卫与路由
   *
   * 三种情形:
   *  1. 房间内、有控制权(host/admin)、song != current.song
   *     → host 立即本地播放(不等 SYNC),同时 markLocalLoadingSong 防止 SYNC 回声
   *     触发再次加载。URL 取到后通过 lt.changeSong 携带广播给 member,member 直接
   *     setUrl 跳过自己的 getSongRealUrl(节省 ~1-2 秒)。
   *  2. 房间内、song == current.song
   *     → 这次调用源自 ensureRoomSongLoadedAndSynced 的远端同步,放行进入实际加载逻辑。
   *  3. 房间内、无控制权、song != current.song
   *     → 提示并 return,member 不能自己切歌。
   */
  let isHostInitiatedChange = false
  const lt = await getListenTogetherStore()
  if (selection !== selectionSequence || intent !== playIntent) return
  if (lt.isInRoom) {
    const remoteSongmid = lt.current.song?.songmid
    const remoteSource = lt.current.song?.source
    const isApplyingRemoteSync =
      remoteSongmid !== undefined &&
      String(remoteSongmid) === String(song.songmid) &&
      remoteSource === song.source

    if (!isApplyingRemoteSync) {
      if (!lt.canControl) {
        /* member 点歌:提交审批 + 提示,不动本地 list/audio。
         * 服务端把请求加入 pending,广播 PENDING_UPDATE,管理员可在 PendingPanel 审批。 */
        lt.requestSong({
          songmid: String(song.songmid),
          source: song.source,
          name: song.name,
          singer: song.singer,
          cover: song.img,
          albumName: song.albumName,
          albumId: song.albumId !== undefined ? String(song.albumId) : undefined,
          hash: song.hash,
          types: song.types,
          lrc: song.lrc ?? null
        })
        MessagePlugin.success(`已提交点歌《${song.name || '?'}》,等待管理员审核`)
        return
      }
      /* 标记本地加载,防止后续 server SYNC 在 audio.src 暂时清空时被
       * ensureRoom 误判需要"重新加载"导致死循环 */
      lt.markLocalLoadingSong(song.source, String(song.songmid))
      isHostInitiatedChange = true
      /* 用户主动切歌:跳过 300ms 防抖等待,直接进入加载 ——
       * currentPlayRequestId 已经能处理连点(后续 playSong 会覆盖 requestId 让前面 return),
       * 这里的 sleep(300) 是早期为防误触加的,在房间内是 8s+ 体感延迟的主要来源之一。 */
      options.immediate = true
      /* 不 return —— host 直接走下面的本地加载播放流程 */
    }
  }

  /* 拿到有效 URL 后调用,把切歌意图 + URL 一起广播给 member ——
   * 让 member 跳过自己的 getSongRealUrl(节省 ~1-2 秒)。
   * 单次触发(broadcastedChange flag),candidates 换源场景下用最终成功的 URL。 */
  let broadcastedChange = false
  const broadcastChangeSongIfNeeded = (urlToBroadcast: string): void => {
    if (!isHostInitiatedChange || broadcastedChange) return
    if (!urlToBroadcast || urlToBroadcast.includes('error')) return
    broadcastedChange = true
    lt.changeSong({
      songmid: String(song.songmid),
      source: song.source,
      name: song.name,
      singer: song.singer,
      cover: song.img,
      albumName: song.albumName,
      albumId: song.albumId !== undefined ? String(song.albumId) : undefined,
      hash: song.hash,
      types: song.types,
      lrc: song.lrc ?? null,
      url: urlToBroadcast
    })
  }

  // Monotonic IDs keep rapid clicks distinct, even within one millisecond.
  const requestId = ++currentPlayRequestId
  playbackController?.abort()
  const controller = new AbortController()
  playbackController = controller
  const current = () => requestId === currentPlayRequestId &&
    intent === playIntent && !controller.signal.aborted
  const fallback = createPlaybackFallback(song, current)
  let pending = true
  controller.signal.addEventListener('abort', () => {
    if (pending) fallback.trace.status('cancelled')
  }, { once: true })
  let failureHandled = false
  const tryAutoNext = (reason: string, error: Parameters<typeof runPlaybackFailure>[1]) => {
    if (failureHandled || !current()) return
    failureHandled = true
    void runPlaybackFailure(song, error, async () => {
      if (!current()) return
      if (fallback.autoNext) {
        fallback.trace.step('尝试自动跳过', 'warning')
        await advanceAfterFailure(song, reason, current)
      } else {
        fallback.trace.step('停止自动推进播放列表', 'warning')
        MessagePlugin.error(reason)
      }
    }).catch(console.warn)
  }
  pendingSongId = songKey(song)
  pendingMetadataController?.abort()
  const metadataController = new AbortController()
  pendingMetadataController = metadataController
  isLoadingSong.value = true
  if (!options.immediate) {
    // 防抖：给一个短暂的缓冲期，避免连续快速点击导致并发请求错误
    await new Promise((resolve) => setTimeout(resolve, 300))
  }

  let preparedMetadata:
    | Awaited<ReturnType<ReturnType<typeof useGlobalPlayStatusStore>['prepareSong']>>
    | undefined
  let metadataCommitted = false
  try {
    if (!current()) return
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
      songKey(song) ===
        (userInfo.value.lastPlaySongKey ||
          songKey(
            restoredSong(
              list.value,
              userInfo.value,
              useGlobalPlayStatusStore().player.songInfo as SongList
            )
          )) &&
      userInfo.value.currentTime !== undefined &&
      userInfo.value.currentTime > 0
    if (isHistoryPlay && userInfo.value.currentTime !== undefined) {
      pendingRestorePosition = userInfo.value.currentTime
      pendingRestoreSongId = songKey(song)
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

    const metadataStore = useGlobalPlayStatusStore()
    const preparedPromise = metadataStore
      .prepareSong(song, metadataController.signal)
      .then((prepared) => {
        preparedMetadata = prepared
        return prepared
      })
    preparedPromise.catch(() => {})
    // 注意：SMTC 的 updateMetadata 会在音频准备好后再调用，避免切换时空隙

    const load = (url: string) => {
      const audio = Audio.value.audio
      if (!audio) throw new Error('音频元素未初始化')
      reloadPlaybackUrl(url)
      return waitForAudioReady(audio, controller.signal)
    }
    const loaded = await fallback.load(load)
    if (!current()) return
    if (!loaded) {
      tryAutoNext('无法播放当前歌曲', 'resolve')
      return
    }

    // 等到「封面 + 歌词」全部就绪后再提交并出声 —— 切歌时不出现中间态。
    // （prepareSong 内部会 await 这两者。）
    const prepared = await preparedPromise
    if (!current()) {
      prepared.dispose()
      return
    }
    metadataStore.commitPrepared(prepared)
    metadataCommitted = true

    songInfo.value = { ...song }
    userInfo.value.lastPlaySongId = song.songmid
    userInfo.value.lastPlaySongKey = songKey(song)
    // SMTC 元数据由 commitPrepared 统一更新(使用已加载好的封面)，
    // 此处不再重复调用，避免用 song.img(可能为空/不可达)覆盖。
    isLoadingSong.value = false

    let activating = loaded
    let markedPlaying: typeof loaded | undefined
    const markPlaying = () => {
      if (!current() || markedPlaying === activating) return
      markedPlaying = activating
      fallback.playing(activating)
      autoNextCount.value = 0
    }

    if (Audio.value.audio) {
      currentPlaybackPlayingHandler = () => {
        if (!current()) return
        markPlaying()
        isLoadingSong.value = false
        currentPlaybackPlayingHandler = null
        // 最终一致性兜底：音频真正开始播放时，把当前歌曲重新推给系统媒体卡片。
        // 后台（窗口最小化）场景切歌链路可能与前台不同，任一环节掉队都会让
        // 卡片停留在旧歌；这里以“实际出声”为准强制对齐一次。
        try {
          const gp = useGlobalPlayStatusStore()
          const cur = gp.player?.songInfo as SongList | undefined
          if (cur && cur.name) {
            mediaSessionController.updateMetadata({
              title: cur.name,
              artist: cur.singer,
              album: cur.albumName || '未知专辑',
              artworkUrl: gp.player?.cover || cur.img || '',
              duration: (parseInterval(cur.interval) || 0) * 1000 || undefined,
              songInfo: cur,
              // 上游原链接用于高清转换；为空时 useSmtc 会退而用 cur.img。
              sourceArtworkUrl: gp.player?.coverSourceUrl
            })
          }
          // 元数据刷新后显式重申「正在播放」——updateMetadata 之后卡片状态可能
          // 被系统重置，这行保证卡片与「已经出声」的事实一致。
          mediaSessionController.updatePlaybackState('playing')
        } catch {}
      }
      Audio.value.audio.addEventListener('playing', currentPlaybackPlayingHandler, { once: true })
    }

    const audio = Audio.value.audio
    const playLoaded = async (
      result: NonNullable<typeof loaded>,
      failure: 'start' | 'media'
    ) => {
      while (current()) {
        activating = result
        const shouldStart = !options.shouldAutoStart || options.shouldAutoStart()
        if (shouldStart) {
          try {
            await start()
            if (!current()) return
          } catch {
            if (!current()) return
            fallback.failPlayback(result, 'start')
            const next = await fallback.load(load)
            if (!next) break
            result = next
            continue
          }
          if (audio && !audio.paused) markPlaying()
        } else {
          mediaSessionController.updatePlaybackState('paused')
        }
        broadcastChangeSongIfNeeded(result.url)
        if (result.fallback) MessagePlugin.success('已自动换源')
        // Attach after load/start so one audio error cannot start a second recovery.
        currentPlaybackErrorHandler = () => {
          currentPlaybackErrorHandler = null
          if (!current()) return
          fallback.failPlayback(result, 'media')
          Audio.value.isPlay = false
          isLoadingSong.value = true
          pending = true
          void fallback.load(load)
            .then(async (next) => {
              if (!current()) return
              if (next) await playLoaded(next, 'media')
              else tryAutoNext('播放中断，未找到可播放的音源', 'media')
            })
            .catch(() => {
              if (!current()) return
              fallback.trace.status('failed')
              tryAutoNext('播放中断，换源失败', 'media')
            })
            .finally(() => {
              pending = false
              if (current()) isLoadingSong.value = false
            })
        }
        audio?.addEventListener('error', currentPlaybackErrorHandler, { once: true })
        return
      }
      if (current()) tryAutoNext('启动播放失败', failure)
    }
    await playLoaded(loaded, 'start')
  } catch {
    if (!current()) return
    fallback.trace.status('failed')
    tryAutoNext('播放歌曲失败', 'playback')
  } finally {
    pending = false
    if (!metadataCommitted) {
      metadataController.abort()
      preparedMetadata?.dispose()
    }
    // 只有当前请求才能关闭 loading
    if (currentPlayRequestId === requestId) {
      isLoadingSong.value = false
      pendingSongId = null
      pendingMetadataController = undefined
    }
    /* 一起听:无论成功/失败/cancel,清掉本地加载标记。
     * 用 IfMatch 版避免误清:用户连续切歌时前一次 finally 不应清掉后一次刚标记的 key。
     * 若 broadcastedChange=false 说明 URL 全部解析失败,playSong 会走 tryAutoNext,
     * 此时不广播 changeSong —— 让 host 自己跳过的歌不污染房间状态。 */
    if (isHostInitiatedChange) {
      lt.clearLocalLoadingSongIfMatch(song.source, String(song.songmid))
    }
  }
}

const advanceAfterFailure = async (song: SongList, reason: string, current: () => boolean) => {
  const limit = Math.min(10, Math.max(3, getAutoNextLimit()), list.value.length - 1)
  if (limit < 1) {
    MessagePlugin.error(reason)
    return
  }
  MessagePlugin.error(`自动跳过当前歌曲：原因：${reason}`)
  if (autoNextCount.value >= limit) {
    MessagePlugin.error(
      `自动下一首失败：${autoNextCount.value}/${limit > 10 ? 10 : limit}次。原因：${reason}`
    )
    return
  }
  autoNextCount.value++
  await runAdvance('error', list.value, (selected) =>
    nextPlayback(selected, undefined, { key: songKey(song), current }), undefined, true)
}

const playMode = ref(userInfo.value.playMode || PlayMode.SEQUENCE)
const isLoadingSong = ref(false)
const autoNextCount = ref(0)
const getAutoNextLimit = () => Math.max(1, Math.floor(list.value.length * 0.3))

const shuffleOrder = ref<Array<number | string>>([])
let shuffleRevision = 0
let pendingShuffle: Promise<void> | undefined
const buildShuffleOrder = () => {
  const revision = ++shuffleRevision
  const songs = [...list.value]
  const ids = songs.map(songKey)
  const candidate = [...songs]
  // Fisher-Yates
  for (let index = candidate.length - 1; index > 0; index--) {
    const target = Math.floor(Math.random() * (index + 1))
    ;[candidate[index], candidate[target]] = [candidate[target], candidate[index]]
  }
  shuffleOrder.value = candidate.map(songKey)
  pendingShuffle = runShuffle(candidate, ordered => {
    if (revision === shuffleRevision && playMode.value === PlayMode.RANDOM && ids.length === list.value.length && ids.every((id,index) => id === songKey(list.value[index]))) {
      shuffleOrder.value = ordered.map(songKey)
    }
  })?.catch(console.warn).finally(() => { if (revision === shuffleRevision) pendingShuffle = undefined })
}

const isShuffleOrderValid = () => {
  if (shuffleOrder.value.length !== list.value.length) return false
  const listIds = list.value.map(songKey)
  const shuffleIds = new Set(shuffleOrder.value)
  return listIds.every((id) => shuffleIds.has(id))
}

const ensureShuffleOrder = (rebuild = false) => {
  if (list.value.length === 0) {
    shuffleRevision++
    pendingShuffle = undefined
    shuffleOrder.value = []
    return
  }
  if (rebuild || !isShuffleOrderValid()) {
    buildShuffleOrder()
  }
}

watch(
  () => playMode.value,
  (mode) => {
    // 同步到系统媒体控件的随机/循环指示（仅原生通道生效，浏览器通道内部 no-op）。
    try {
      mediaSessionController.updatePlayMode(
        mode === PlayMode.SINGLE ? 'Track' : mode === PlayMode.SEQUENCE ? 'List' : 'None',
        mode === PlayMode.RANDOM
      )
    } catch {}
    if (mode === PlayMode.RANDOM) {
      ensureShuffleOrder()
      return
    }
    shuffleRevision++
    pendingShuffle = undefined
    shuffleOrder.value = []
  }
)

watch(
  () => list.value,
  () => {
    if (playMode.value === PlayMode.RANDOM) {
      ensureShuffleOrder(true)
    }
  },
  { deep: true }
)

const setPlaybackMode = (mode: PlayMode, pluginId?: string, system = false) =>
  runAdjustment('player.setMode', {mode}, value => {
    playMode.value = { sequence: PlayMode.SEQUENCE, random: PlayMode.RANDOM, single: PlayMode.SINGLE }[value.mode]
    if (!pluginId) userInfo.value.playMode = playMode.value
  }, pluginId, system)
const updatePlayMode = () => {
  const modes = [PlayMode.SEQUENCE, PlayMode.RANDOM, PlayMode.SINGLE]
  const currentIndex = modes.indexOf(playMode.value)
  const nextIndex = (currentIndex + 1) % modes.length
  return setPlaybackMode(modes[nextIndex])
}

const resolveNextSong = ({
  respectSingleMode,
  rebuildShuffleOnWrap,
  fromSongKey
}: {
  respectSingleMode: boolean
  rebuildShuffleOnWrap: boolean
  fromSongKey?: string
}): SongList | null => {
  if (list.value.length === 0) return null
  if (respectSingleMode && playMode.value === PlayMode.SINGLE) return null

  if (playMode.value === PlayMode.RANDOM) {
    ensureShuffleOrder()
    const curId = fromSongKey ?? pendingSongId ?? userInfo.value.lastPlaySongKey ?? userInfo.value.lastPlaySongId
    let idx = shuffleOrder.value.findIndex((id) => id === curId)
    if (idx < 0) idx = -1
    let nextIdx = idx + 1
    if (nextIdx >= shuffleOrder.value.length) {
      if (rebuildShuffleOnWrap) {
        ensureShuffleOrder(true)
      }
      nextIdx = 0
    }
    const nextId = shuffleOrder.value[nextIdx]
    return list.value.find((s) => songKey(s) === nextId) || null
  }

  const currentIndex = list.value.findIndex(
    (song) =>
      songKey(song) ===
      (fromSongKey ?? pendingSongId ??
        userInfo.value.lastPlaySongKey ??
        songKey(
          restoredSong(
            list.value,
            userInfo.value,
            useGlobalPlayStatusStore().player.songInfo as SongList
          )
        ))
  )
  const nextIndex = (currentIndex + 1) % list.value.length
  return list.value[nextIndex] || null
}

/**
 * 计算下一首歌曲（不推进播放，仅返回引用，供无感过渡预取 URL 使用）。
 * - SINGLE 模式下返回 null（单曲循环不过渡）
 * - RANDOM 模式使用 shuffleOrder，必要时重建
 * - SEQUENCE 模式按列表顺序循环
 * - 列表为空返回 null
 */
const atQueueEnd = () => {
  if (playMode.value === PlayMode.SINGLE || !list.value.length || cachedLtStore?.isInRoom) return false
  const current = pendingSongId ?? userInfo.value.lastPlaySongKey ?? songKey(restoredSong(list.value,userInfo.value,useGlobalPlayStatusStore().player.songInfo as SongList))
  const tail = playMode.value === PlayMode.RANDOM ? shuffleOrder.value.at(-1) : songKey(list.value[list.value.length-1])
  return current === tail
}

const getNextSong = (): SongList | null => {
  if (interceptsQueueEnd() && atQueueEnd()) return null
  if (
    playMode.value === PlayMode.RANDOM &&
    (pendingShuffle || (interceptsShuffle() && atQueueEnd()))
  )
    return null
  return resolveNextSong({
    respectSingleMode: true,
    rebuildShuffleOnWrap: false
  })
}

const resolvePlaybackAdvance = (respectSingleMode: boolean, fromSongKey?: string) => {
  if (playMode.value !== PlayMode.RANDOM || (!interceptsShuffle() && !pendingShuffle))
    return resolveNextSong({respectSingleMode, rebuildShuffleOnWrap:true, fromSongKey})
  return resolveHookedShuffleAdvance(respectSingleMode, fromSongKey)
}

const resolveHookedShuffleAdvance = async (respectSingleMode: boolean, fromSongKey?: string) => {
  const token = pendingAutoNextToken, intent = playIntent
  ensureShuffleOrder()
  let revision = shuffleRevision
  const current = () => token === pendingAutoNextToken && intent === playIntent && revision === shuffleRevision && playMode.value === PlayMode.RANDOM
  if (pendingShuffle) await pendingShuffle
  if (!current() || !shuffleOrder.value.length) return null
  const id = fromSongKey ?? pendingSongId ?? userInfo.value.lastPlaySongKey ?? userInfo.value.lastPlaySongId
  if (id != null && shuffleOrder.value.indexOf(id) === shuffleOrder.value.length - 1) {
    ensureShuffleOrder(true)
    revision = shuffleRevision
    if (pendingShuffle) await pendingShuffle
    return current() ? list.value.find(song => songKey(song) === shuffleOrder.value[0]) ?? null : null
  }
  return resolveNextSong({respectSingleMode, rebuildShuffleOnWrap:false, fromSongKey})
}

const playPrevious = (pluginId?: string, system = false) =>
  runTransport('player.previous', () => previousPlayback(pluginId), pluginId, system)
const previousPlayback = async (pluginId?: string) => {
  cancelPendingAutoNext()
  crossfadeManager.cancel()
  const lt = await getListenTogetherStore()
  if (lt.isInRoom) {
    /* 一起听:有控制权 → 发 ctl:prev 让 server 单点裁决推进队列;
     * member 无控制权 → 提示。和 playNext 对称。 */
    if (lt.canControl) {
      lt.previous()
    } else {
      MessagePlugin.warning('当前在一起听房间中,无播放控制权')
    }
    return
  }
  if (list.value.length === 0) return
  try {
    const currentIndex = list.value.findIndex(
      (song) =>
        songKey(song) ===
        (pendingSongId ??
          userInfo.value.lastPlaySongKey ??
          songKey(
            restoredSong(
              list.value,
              userInfo.value,
              useGlobalPlayStatusStore().player.songInfo as SongList
            )
          ))
    )
    const prevIndex = currentIndex <= 0 ? list.value.length - 1 : currentIndex - 1
    if (prevIndex >= 0 && prevIndex < list.value.length) {
      await playSong(list.value[prevIndex], { pluginId })
    }
  } catch {
    MessagePlugin.error('播放上一首失败')
  }
}

const playNext = (pluginId?: string, system = false, reason: 'user' | 'error' = 'user') =>
  runAdvance(reason, list.value, selected => nextPlayback(selected, pluginId), pluginId, system)
const nextPlayback = async (
  selected?: SongList,
  pluginId?: string,
  failed?: { key: string; current: () => boolean }
) => {
  if (failed && !failed.current()) return
  cancelPendingAutoNext()
  crossfadeManager.cancel()
  const lt = await getListenTogetherStore()
  if (failed && !failed.current()) return
  if (lt.isInRoom) {
    if (lt.canControl) {
      lt.skip()
    } else {
      MessagePlugin.warning('当前在一起听房间中，无播放控制权')
    }
    return
  }
  if (list.value.length === 0) return
  try {
    const advance = selected ?? resolvePlaybackAdvance(false, failed?.key)
    const nextSong = advance instanceof Promise ? await advance : advance
    if (nextSong && (!failed || (failed.current() && songKey(nextSong) !== failed.key))) {
      await playSong(nextSong, { pluginId, fromFailure: !!failed })
    }
  } catch {
    MessagePlugin.error('播放下一首失败')
  }
}

const playNextAutoNow = async (selected?: SongList) => {
  // 若无感过渡正在完成最后的推进，避免重复推进
  if (crossfadeManager.isFinalizingCurrentAdvance()) return
  const lt = await getListenTogetherStore()
  if (lt.isInRoom) {
    /* 一起听:歌曲自然结束(autoNext)走 onSongEnded —— 服务端按 (songmid, source, seq)
     * 幂等去重,避免多客户端同时报 ended 重复推进。用户主动 next 仍走 lt.skip()。 */
    if (lt.canControl) {
      lt.onSongEnded()
    }
    return
  }
  if (list.value.length === 0) return
  try {
    if (selected) {
      await playSong(selected)
      return
    }
    if (playMode.value === PlayMode.SINGLE && userInfo.value.lastPlaySongId) {
      const currentSong = selectSong(
        list.value,
        userInfo.value.lastPlaySongKey || userInfo.value.lastPlaySongId!
      )
      if (currentSong) {
        setCurrentTime(0)
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
    const advance = resolvePlaybackAdvance(true)
    const nextSong = advance instanceof Promise ? await advance : advance
    if (nextSong) {
      await playSong(nextSong)
    }
  } catch {
    MessagePlugin.error('播放下一首失败')
  }
}

const playNextAuto = () => {
  cancelPendingAutoNext(true)
  if (list.value.length === 0) return

  /* 一起听场景:不需要 1500ms 的 crossfade 缓冲(房间内不预加载下一首),
   * 缩短到 100ms 提高切歌响应速度 —— 否则歌曲结束后会有 1.5s 的"假装在播"沉默。 */
  const lt = cachedLtStore
  const delay = lt?.isInRoom ? 100 : AUTO_NEXT_DELAY_MS

  const token = pendingAutoNextToken
  pendingAutoNextTimer = setTimeout(() => {
    if (token !== pendingAutoNextToken) return
    pendingAutoNextTimer = null
    if (crossfadeManager.isFinalizingCurrentAdvance()) return
    const advance = async () => {
      const decision = getAutomaticAdvance()
      if (decision) {
        const { allowed, selected } = await decision
        if (allowed && token === pendingAutoNextToken) await playNextAutoNow(selected)
        return
      }
      await runAdvance('ended', list.value, async selected => {
        if (token === pendingAutoNextToken) await playNextAutoNow(selected)
      }, undefined, true)
    }
    if (!interceptsQueueEnd()) { void advance(); return }
    const intent = playIntent, mode = playMode.value
    const handleEnd = async () => {
      if (mode === PlayMode.RANDOM && pendingShuffle) await pendingShuffle
      if (token !== pendingAutoNextToken || intent !== playIntent || mode !== playMode.value) return
      if (!atQueueEnd()) return advance()
      const originalKeys = list.value.map(songKey)
      await runQueueEnd(list.value,async tracks=>{
        if (token !== pendingAutoNextToken || intent !== playIntent || mode !== playMode.value || !atQueueEnd() || originalKeys.length!==list.value.length || !originalKeys.every((key,index)=>key===songKey(list.value[index]))) return
        if (!tracks) return advance()
        const moving = new Set(tracks.map(songKey))
        localUserStore.replaceSongList([...list.value.filter(song=>!moving.has(songKey(song))),...tracks])
        await playSong(tracks[0])
      })
    }
    void handleEnd().catch(console.warn)
  }, delay)
}

// A plugin may allow, redirect or veto the advance. Reuse its decision at ended
// if the fade misses its window, so the same automatic advance only runs hooks once.
type AutomaticDecision = { allowed: boolean; selected?: SongList }
let automaticAdvance: {
  audio: typeof Audio.value.audio
  url: string
  intent: number
  mode: PlayMode
  result: Promise<AutomaticDecision>
} | undefined

const getAutomaticAdvance = () => {
  const advance = automaticAdvance
  if (
    advance &&
    advance.audio === Audio.value.audio &&
    advance.url === Audio.value.url &&
    advance.intent === playIntent &&
    advance.mode === playMode.value
  ) return advance.result
  return undefined
}

const authorizeCrossfade = async (song: SongList) => {
  let decision = getAutomaticAdvance()
  if (!decision && !interceptsAdvance()) return true
  if (!decision) {
    const state = { audio: Audio.value.audio, url: Audio.value.url, intent: playIntent, mode: playMode.value }
    let outcome: AutomaticDecision = { allowed: false }
    decision = runAdvance('ended', list.value, async (selected) => {
      outcome = { allowed: true, selected }
    }, undefined, true).then(() => outcome).catch((error) => {
      console.warn('[crossfade] plugin advance failed', error)
      return { allowed: true }
    })
    automaticAdvance = { ...state, result: decision }
  }
  const { allowed, selected } = await decision
  const candidate = selected ?? getNextSong()
  const matches = allowed && !!candidate && songKey(candidate) === songKey(song)
  console.info('[crossfade] plugin advance', { allowed, matches })
  return matches && decision === getAutomaticAdvance()
}

const setVolume = (percent: number, pluginId?: string, system = false) => {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw Error('音量超出范围')
  return runAdjustment('player.setVolume', { volume: percent / 100 }, value => controlAudio.setVolume(Math.round(value.volume * 100)), pluginId, system)
}
const seekTo = (time: number, pluginId?: string, system = false) => {
  const positionMs = Math.round(time * 1000)
  if (!Number.isSafeInteger(positionMs) || positionMs < 0) throw Error('无效的播放位置')
  const intent = playIntent, currentUrl = Audio.value.url
  return runAdjustment('player.seek', { positionMs }, value => {
    if (playIntent === intent && Audio.value.url === currentUrl) applySeek(value.positionMs / 1000)
  }, pluginId, system)
}
const applySeek = (time: number) => {
  cancelPendingAutoNext()
  /* 一起听:用同步缓存的 store 引用判断;若有控制权则发命令,等 SYNC 回来再 seek 本地。
   * 第一次进房的极短窗口内 cachedLtStore 可能尚未填充 —— 此时按非房间逻辑直接 seek
   * 是安全的(此刻一定不在房间)。 */
  if (cachedLtStore?.isInRoom) {
    if (cachedLtStore.canControl) {
      cachedLtStore.seek(time)
    }
    return
  }
  setCurrentTime(time)
  if (Audio.value.audio) {
    Audio.value.audio.currentTime = time
  }
}

let playbackInstalled = false
let playbackInitPromise: Promise<void> | null = null
let savePositionInterval: number | null = null
const onGlobalCtrl = (e: any) => {
  const name = e?.detail?.name
  const val = e?.detail?.val
  switch (name) {
    case 'play':
      void handlePlay(undefined, true)
      break
    case 'pause':
      void handlePause(undefined, true)
      break
    case 'toggle':
      void togglePlayPause(true)
      break
    case 'playPrev':
      void playPrevious(undefined, true)
      break
    case 'playNext':
      void playNext(undefined, true)
      console.log('next')
      break
    case 'autoNext':
      void playNextAuto()
      break
    case 'volumeDelta':
      {
        const next = Math.max(0, Math.min(100, (Audio.value.volume || 0) + (Number(val) || 0)))
        void setVolume(next, undefined, true).catch(console.warn)
      }
      break
    case 'seekDelta':
      {
        const a = Audio.value.audio
        if (a) {
          const cur = a.currentTime || 0
          const target = Math.max(0, Math.min(a.duration || 0, cur + (Number(val) || 0)))
          void seekTo(target, undefined, true).catch(console.warn)
        }
      }
      break
    case 'setPlayMode':
      {
        const v = String(val || '')
        const target = v === 'sequence' ? PlayMode.SEQUENCE : v === 'random' ? PlayMode.RANDOM :
          v === 'toggleSingle' ? (playMode.value === PlayMode.SINGLE ? PlayMode.SEQUENCE : PlayMode.SINGLE) : undefined
        if (target) void setPlaybackMode(target, undefined, true).catch(console.warn)
      }
      break
  }
}

const installPlayback = async () => {
  // 先连接播放指令，恢复历史音频或可选 IPC 订阅不能阻断双击播放。
  initPlaylistEventListeners(localUserStore, playSong)
  if (playbackInstalled) return
  playbackInstalled = true
  crossfadeManager.init(getNextSong, authorizeCrossfade)
  unsubscribeLocalTags = desktopBridge.api.localMusic.onTagsChanged?.(({ oldSongmid, song }) => {
    if (songInfo.value.source === 'local' && String(songInfo.value.songmid) === oldSongmid) {
      songInfo.value = { ...songInfo.value, ...song }
      void desktopBridge.api.localMusic.getCoverBase64(song.songmid).then((artworkUrl) => {
        if (songInfo.value.source !== 'local' || String(songInfo.value.songmid) !== song.songmid)
          return
        mediaSessionController.updateMetadata({
          title: song.name,
          artist: song.singer,
          album: song.albumName,
          artworkUrl: artworkUrl || defaultCoverImg
        })
      })
    }
  })

  if (playMode.value === PlayMode.RANDOM) {
    ensureShuffleOrder(true)
  }

  unsubscribeRestorePosition = controlAudio.subscribe('canplay', () => {
    if (
      pendingRestoreSongId !== userInfo.value.lastPlaySongKey ||
      pendingRestorePosition <= 0 ||
      !Audio.value.audio
    )
      return
    Audio.value.audio.currentTime = pendingRestorePosition
    Audio.value.currentTime = pendingRestorePosition
    pendingRestorePosition = 0
    pendingRestoreSongId = null
  })

  // 注册插件限流监听（绑定到生命周期，避免重复注册）
  _unsubscribeThrottle =
    desktopBridge.api.pluginNotice?.onPluginThrottle?.(({ pluginId, reason, duration }) => {
      notePlaybackThrottle(pluginId, duration)
      MessagePlugin.warning('插件请求受限：' + reason)
    }) ?? null

  // 注册插件禁用监听：插件因崩溃次数过多被永久禁用，提示用户并停止换源
  _unsubscribeDisabled =
    desktopBridge.api.pluginNotice?.onPluginDisabled?.(({ reason }) => {
      MessagePlugin.error(
        `插件已被禁用：${reason}。请检查插件是否包含死循环或异常逻辑，必要时重新加载或卸载该插件。`,
        8000
      )
    }) ?? null

  // 初始化无感过渡管理器：注入 getNextSong 回调，订阅 slotSwap 重置自动下一首计数
  controlAudio.subscribe('slotSwap', () => {
    autoNextCount.value = 0
    // 关键：翻转槽位后，playSong 挂在旧 primary 上的 DOM error/playing 监听器仍然存在。
    // 翻转后 completeCrossfade 会对旧 primary 执行 removeAttribute('src') + load()，
    // 这会异步触发 'error' 事件，带着旧歌闭包跑 auto-switch，结果把上一首 URL 又写回了新 primary。
    // 所以这里同步清理这些过期的监听器。翻转后旧 primary === 新 secondary。
    const oldPrimary = controlAudio.getSecondaryEl()
    if (oldPrimary) {
      if (currentPlaybackErrorHandler) {
        try {
          oldPrimary.removeEventListener('error', currentPlaybackErrorHandler)
        } catch {}
        currentPlaybackErrorHandler = null
      }
      if (currentPlaybackPlayingHandler) {
        try {
          oldPrimary.removeEventListener('playing', currentPlaybackPlayingHandler)
        } catch {}
        currentPlaybackPlayingHandler = null
      }
    }
  })

  savePositionInterval = window.setInterval(() => {
    if (!Audio.value.isPlay) return
    // 使用真实音频元素时间：窗口进入后台被节流时渲染循环停摆，store 的 currentTime 会冻结，
    // 直接保存会导致重启后从进入后台时的旧位置恢复。
    const activeEl = Audio.value.audio
    userInfo.value.currentTime = activeEl ? activeEl.currentTime : Audio.value.currentTime
  }, 1000)

  {
    const gp = useGlobalPlayStatusStore()
    const restoreSelection = selectionSequence
    const lastPlayedSong = restoredSong(list.value, userInfo.value, gp.player.songInfo as SongList)
    if (lastPlayedSong) {
      // Resolve old scalar selections before asynchronous plugin work.
      userInfo.value.lastPlaySongId = lastPlayedSong.songmid
      userInfo.value.lastPlaySongKey = songKey(lastPlayedSong)
      songInfo.value = { ...lastPlayedSong }
      if (!Audio.value.isPlay) {
        const savedPosition = Math.max(0, Number(userInfo.value.currentTime) || 0)
        Audio.value.currentTime = savedPosition
        Audio.value.duration = durationMilliseconds(lastPlayedSong.interval) / 1000
        pendingRestorePosition = savedPosition
        pendingRestoreSongId = songKey(lastPlayedSong)
        try {
          console.log('initPlayback', lastPlayedSong)
          const url = await getSongRealUrl(toRaw(lastPlayedSong))
          if (selectionSequence !== restoreSelection || !playbackInstalled) return
          setUrl(url)
          Audio.value.currentTime = savedPosition
          // SMTC 元数据在音频准备好后再更新，避免切换时空隙。
          // 优先用已加载好的封面(player.cover)，避免空/不可达 URL 导致卡片异常。
          mediaSessionController.updateMetadata({
            title: lastPlayedSong.name,
            artist: lastPlayedSong.singer,
            album: lastPlayedSong.albumName || '未知专辑',
            artworkUrl: gp.player.cover || lastPlayedSong.img || defaultCoverImg,
            songInfo: lastPlayedSong,
            sourceArtworkUrl: gp.player.coverSourceUrl
          })
          if (savedPosition && Audio.value.audio) {
            await waitForAudioReady(Audio.value.audio)
            if (selectionSequence !== restoreSelection || !playbackInstalled) return
            Audio.value.currentTime = savedPosition
            Audio.value.audio.currentTime = savedPosition
            pendingRestorePosition = 0
            pendingRestoreSongId = null
          }
        } catch (error) {
          // Retain the saved position for a later play attempt; never wait on an empty src.
          console.warn('恢复上次歌曲失败，已保留播放进度:', error)
        }
      } else {
        // 如果已经在播放，更新 SMTC
        mediaSessionController.updateMetadata({
          title: lastPlayedSong.name,
          artist: lastPlayedSong.singer,
          album: lastPlayedSong.albumName || '未知专辑',
          artworkUrl: gp.player.cover || lastPlayedSong.img || defaultCoverImg,
          songInfo: lastPlayedSong,
          sourceArtworkUrl: gp.player.coverSourceUrl
        })
        if (Audio.value.audio) {
          mediaSessionController.updatePlaybackState(
            Audio.value.audio.paused ? 'paused' : 'playing'
          )
        }
      }
    }
  }
}

// Welcome and App can both request startup during the route transition. Keep
// initialization single-flight so playlist listeners are registered once.
const initPlayback = async () => {
  if (playbackInitPromise) return playbackInitPromise
  if (playbackInstalled) return
  playbackInitPromise = installPlayback()
  try {
    await playbackInitPromise
  } finally {
    playbackInitPromise = null
  }
}
window.addEventListener('global-music-control', onGlobalCtrl)

const uninstallPlayback = () => {
  if (!playbackInstalled) return
  playbackInstalled = false

  cancelPendingAutoNext()
  destroyPlaylistEventListeners()
  crossfadeManager.destroy()
  window.removeEventListener('global-music-control', onGlobalCtrl)
  if (savePositionInterval !== null) {
    clearInterval(savePositionInterval)
    savePositionInterval = null
  }
  _unsubscribeThrottle?.()
  _unsubscribeThrottle = null
  _unsubscribeDisabled?.()
  _unsubscribeDisabled = null
  unsubscribeLocalTags?.()
  unsubscribeLocalTags = undefined
  unsubscribeRestorePosition?.()
  unsubscribeRestorePosition = undefined
  playbackController?.abort()
  playbackController = undefined
}

export {
  songInfo,
  playMode,
  isLoadingSong,
  initPlayback,
  uninstallPlayback,
  playSong,
  playNext,
  playNextAuto,
  playPrevious,
  updatePlayMode,
  setPlaybackMode,
  togglePlayPause,
  handlePlay,
  handlePause,
  setVolume,
  seekTo,
  onGlobalCtrl,
  getNextSong
}
