import { songKey } from '@common/musicItem'
import { nextTick, reactive } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { usePlaySettingStore } from '@renderer/store'
import { useDlnaStore } from '@renderer/store/dlna'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { isLtInRoom } from '@renderer/utils/listenTogether/state'
import { waitForAudioReady } from './audioHelpers'
import { createPlaybackFallback } from './playbackFallback'
import AudioManager from './audioManager'
import { analyseMixTrack } from './automixAnalysis'
import { alignedMixPosition, matchTempos, type TempoMatch } from './automixTempo'
import type { SongList } from '@renderer/types/audio'

type GetNextSong = () => SongList | null
type AuthorizeAdvance = (song: SongList) => Promise<boolean>
let _authorizeAdvance: AuthorizeAdvance | undefined
let _traceMedia: string | undefined
let _lastStage: string | undefined
let _rejectedMedia: string | undefined

function trace(stage: string, details?: Record<string, unknown>) {
  if (stage === _lastStage) return
  _lastStage = stage
  console.info('[crossfade]', stage, details ?? {})
}

// ---- 常量 ----
const OBSERVATION_WINDOW = 40 // 预缓冲和观察开始（秒）
const QUIET_REMAINING = 11 // 安静时刻可提前混入（秒）
const FORCED_REMAINING = 8 // 未遇到安静段时按媒体时钟触发（秒）
const QUIET_RMS = 0.04 // 安静阈值（更敏感，让更多尾段时刻被判定为安静）
const MIN_SONG_DURATION = 25 // 太短的歌不过渡
const MAX_FADE_TIME = 10
const FADE_SAFETY_MARGIN = 0.3

// ---- 预计算等功率曲线（smoothstep 时间扭曲） ----
// 使用 smoothstep(t) = 3t² - 2t³ 对时间做非线性变换后再走 cos/sin,
// 起止阶段变化极缓（导数=0），中段加速。等功率恒等式 cos² + sin² = 1 始终成立。
const CURVE_SAMPLES = 256
const cosCurve = new Float32Array(CURVE_SAMPLES) // 1 -> 0 (fade out)
const sinCurve = new Float32Array(CURVE_SAMPLES) // 0 -> 1 (fade in)
for (let i = 0; i < CURVE_SAMPLES; i++) {
  const t = i / (CURVE_SAMPLES - 1)
  const s = t * t * (3 - 2 * t) // smoothstep
  cosCurve[i] = Math.cos((s * Math.PI) / 2)
  sinCurve[i] = Math.sin((s * Math.PI) / 2)
}

/**
 * 对外暴露的 reactive 状态，供 UI (hint, progress bar) 订阅显示。
 * active: 交叉淡化 gain 包络已启动
 * scheduled: 已进入观察窗口（尾段，但尚未触发淡化）
 * fadeStart / fadeDuration: 当前曲目内的过渡起始时间 & 时长
 * markStart / markEnd: 进度条标记范围（显示过渡可能发生的区段）
 * fadeInMarkEnd: 交叉淡化完成后新歌曲开头的淡入区间结束位置（秒）
 */
export const crossfadeState = reactive({
  active: false,
  scheduled: false,
  fadeStart: 0,
  fadeDuration: 0,
  // 进度条上预告区间（单位：秒，相对当前曲目）
  markStart: 0,
  markEnd: 0,
  // 过渡完成后，标记新歌开头 0 ~ fadeInMarkEnd 秒为淡入区段
  fadeInMarkEnd: 0
})

// ---- 模块内部状态 ----
let _getNextSong: GetNextSong | null = null
let _inited = false
let _unsubs: Array<() => void> = []

let _rmsInterval: any = null
let _rmsWindow: number[] = []

let _finalizing = false
let _completeTimer: any = null
let _preparation: AbortController | null = null
let _requestMix: (() => void) | null = null
let _mixTempo: { audio: HTMLAudioElement; baseRate: number; factor: number } | null = null
let _tempoTimer: ReturnType<typeof setInterval> | undefined

let _currentNextSong: SongList | null = null
let _beginningInProgress = false
let _fadeInClearTimer: any = null
let _naturalNextDelayEnabled = false

// ------- 工具 -------

const stopRmsWatch = () => {
  if (_rmsInterval !== null) {
    clearInterval(_rmsInterval)
    _rmsInterval = null
  }
  _rmsWindow = []
}

const restoreMixTempo = () => {
  clearInterval(_tempoTimer)
  _tempoTimer = undefined
  const tempo = _mixTempo
  _mixTempo = null
  if (tempo) tempo.audio.playbackRate = tempo.baseRate
}

const resetState = () => {
  restoreMixTempo()
  _preparation?.abort()
  _preparation = null
  _requestMix = null
  crossfadeState.active = false
  crossfadeState.scheduled = false
  crossfadeState.fadeStart = 0
  crossfadeState.fadeDuration = 0
  crossfadeState.markStart = 0
  crossfadeState.markEnd = 0
  _finalizing = false
  _currentNextSong = null
  _beginningInProgress = false
  if (_completeTimer !== null) {
    clearTimeout(_completeTimer)
    _completeTimer = null
  }
  stopRmsWatch()
}

/**
 * 计算进度条上应标记的过渡预告区间
 * 当可以过渡时，标记安静段可切入到按媒体时钟强制切入的区间。
 */
const updateMarkRange = () => {
  try {
    const playSetting = usePlaySettingStore()
    const dlnaStore = useDlnaStore()

    const duration = readLiveDuration()
    if (
      _naturalNextDelayEnabled ||
      !playSetting.getIsSeamlessTransition ||
      isLtInRoom() ||
      dlnaStore.currentDevice ||
      !Number.isFinite(duration) ||
      duration < MIN_SONG_DURATION
    ) {
      crossfadeState.markStart = 0
      crossfadeState.markEnd = 0
      return
    }
    // 预告区间以混入时机为准，不包含提前缓冲音频的时间。
    // 这正是"最早可能触发（安静时刻）"和"最晚一定触发"的两个端点
    const start = Math.max(0, duration - QUIET_REMAINING)
    const end = Math.max(start, duration - FORCED_REMAINING)
    crossfadeState.markStart = start
    crossfadeState.markEnd = end
  } catch {
    // 忽略
  }
}

/**
 * 读取当前主音频元素的真实播放时间（秒）。
 * store 的 currentTime 由渲染循环同步，窗口后台时可能被冻结或降频；
 * 过渡判定应以媒体时钟为准（元素时间不受渲染帧率影响）。
 */
const readLiveCurrentTime = (): number => {
  const audioStore = ControlAudioStore()
  const el = audioStore.Audio.audio
  const live = el?.currentTime
  return typeof live === 'number' && Number.isFinite(live) ? live : audioStore.Audio.currentTime
}

const readLiveDuration = (): number => {
  const { Audio } = ControlAudioStore()
  const duration = Audio.audio?.duration
  return typeof duration === 'number' && Number.isFinite(duration) && duration > 0
    ? duration
    : Audio.duration
}

// ------- RMS 观察 -------

const startRmsWatch = () => {
  if (_rmsInterval !== null) return
  const audioStore = ControlAudioStore()
  const primary = audioStore.getPrimaryEl()
  if (!primary) return

  const analyser = AudioManager.getEnvelopeAnalyser(primary)
  if (!analyser) return
  const buf = new Uint8Array(analyser.fftSize)

  _rmsInterval = setInterval(() => {
    try {
      analyser.getByteTimeDomainData(buf)
      let sum = 0
      for (let i = 0; i < buf.length; i++) {
        const v = buf[i] / 128 - 1
        sum += v * v
      }
      const rms = Math.sqrt(sum / buf.length)
      _rmsWindow.push(rms)
      if (_rmsWindow.length > 10) _rmsWindow.shift()
      const avgRms = _rmsWindow.reduce((a, b) => a + b, 0) / Math.max(1, _rmsWindow.length)

      const duration = readLiveDuration()
      const current = readLiveCurrentTime()
      const remaining = duration - current
      if (remaining <= 0) {
        stopRmsWatch()
        return
      }

      if (avgRms < QUIET_RMS && remaining <= QUIET_REMAINING) triggerCrossfade()
    } catch (e) {
      console.warn('[crossfade] RMS watch error:', e)
    }
  }, 100)
}

// ------- 事件回调 -------

const onTimeUpdate = () => {
  try {
    const playSetting = usePlaySettingStore()
    const dlnaStore = useDlnaStore()
    const media = ControlAudioStore().Audio.audio?.currentSrc
    if (_traceMedia !== media) {
      _traceMedia = media
      _lastStage = undefined
      _rejectedMedia = undefined
    }

    // 每次 timeupdate 都刷新 mark range（低成本）
    updateMarkRange()

    if (_naturalNextDelayEnabled) return trace('skipped: delayed next')
    if (!playSetting.getIsSeamlessTransition) return trace('skipped: disabled')
    /* 一起听:房间内不做无感过渡 —— 切歌由服务端 SYNC 驱动,提前过渡会和 SYNC
     * 冲突(本地切到下一首,但服务端可能切到完全不同的歌)。 */
    if (isLtInRoom()) return trace('skipped: listen together')
    if (dlnaStore.currentDevice) return trace('skipped: DLNA')
    if (crossfadeState.active) return
    if (_rejectedMedia !== undefined && _rejectedMedia === media) return

    const duration = readLiveDuration()
    const current = readLiveCurrentTime()
    if (!Number.isFinite(duration) || duration < MIN_SONG_DURATION)
      return trace('waiting: unavailable or short duration', { duration })
    const remaining = duration - current
    if (remaining <= 0) return
    if (remaining > OBSERVATION_WINDOW) return trace('monitoring', { duration, current })

    // 保底触发使用媒体时钟，即使 RMS 分析器不可用也能进入过渡。
    if (crossfadeState.scheduled) {
      if (remaining <= FORCED_REMAINING) triggerCrossfade()
      return
    }

    // 进入观察窗口
    if (!_getNextSong) return trace('skipped: no queue resolver')
    const next = _getNextSong()
    if (!next) return trace('waiting: no eligible next track', { remaining })
    _currentNextSong = next

    crossfadeState.scheduled = true
    trace('preparing next', { source: next.source, remaining })
    void beginCrossfade()
    if (remaining <= FORCED_REMAINING) triggerCrossfade()
    else startRmsWatch()
  } catch (e) {
    console.warn('[crossfade] onTimeUpdate error:', e)
  }
}

const cancelCrossfade = () => {
  if (!crossfadeState.scheduled && !crossfadeState.active && !_beginningInProgress) {
    return
  }
  const audioStore = ControlAudioStore()
  const primary = audioStore.getPrimaryEl()
  const secondary = audioStore.getSecondaryEl()

  if (primary) AudioManager.resetCrossfadeNodes(primary)
  if (secondary) {
    AudioManager.resetCrossfadeNodes(secondary)
    try {
      const gS = AudioManager.getCrossfadeGain(secondary)
      const ctxS = AudioManager.getContext(secondary)
      if (gS && ctxS) {
        gS.gain.cancelScheduledValues(0)
        gS.gain.setValueAtTime(0, ctxS.currentTime)
      }
    } catch {}
    try {
      secondary.pause()
    } catch {}
    try {
      secondary.removeAttribute('src')
      secondary.load()
    } catch {}
  }
  try {
    audioStore.clearSecondarySrc()
  } catch {}

  // 取消时也清除淡入标记
  crossfadeState.fadeInMarkEnd = 0
  if (_fadeInClearTimer !== null) {
    clearTimeout(_fadeInClearTimer)
    _fadeInClearTimer = null
  }

  resetState()
  console.info('[crossfade] cancelled', { stage: _lastStage })
}

const onSeeked = () => {
  // 仅在 scheduled（观察期）且尚未 active（未开始淡化）时，才判断是否取消
  // 一旦 active，槽位已翻转到新歌，seek 是用户在新歌上操作，不影响老歌淡出
  if (!crossfadeState.scheduled || crossfadeState.active) return
  const remaining = readLiveDuration() - readLiveCurrentTime()
  if (remaining > OBSERVATION_WINDOW + 1) {
    cancelCrossfade()
  }
}

const onPlaybackEnded = () => {
  if (!_finalizing) cancelCrossfade()
}

// ------- 交叉淡化主流程 -------

const triggerCrossfade = () => {
  stopRmsWatch()
  _requestMix?.()
  _requestMix = null
}

const beginCrossfade = async () => {
  if (_beginningInProgress || crossfadeState.active) return
  /* 一起听:房间内绝不进入 crossfade 流程(防御性检查;onTimeUpdate 也已经过滤) */
  if (isLtInRoom()) return
  _beginningInProgress = true
  const preparation = new AbortController()
  _preparation = preparation
  const { signal } = preparation

  const audioStore = ControlAudioStore()
  const localUserStore = LocalUserDetailStore()
  const globalPlayStatus = useGlobalPlayStatusStore()
  const playSetting = usePlaySettingStore()

  const primary = audioStore.getPrimaryEl()
  const secondary = audioStore.getSecondaryEl()
  if (
    !primary ||
    !secondary ||
    primary.paused ||
    !playSetting.getIsSeamlessTransition ||
    useDlnaStore().currentDevice
  ) {
    _beginningInProgress = false
    resetState()
    return
  }

  const nextSong = _currentNextSong || (_getNextSong ? _getNextSong() : null)
  if (!nextSong) {
    _beginningInProgress = false
    resetState()
    return
  }

  const canStart = () => {
    if (
      signal.aborted ||
      primary.paused ||
      primary.ended ||
      !playSetting.getIsSeamlessTransition ||
      isLtInRoom() ||
      useDlnaStore().currentDevice
    )
      return false
    const next = _getNextSong?.()
    return !!next && songKey(next) === songKey(nextSong)
  }
  const mixCue = new Promise<void>((resolve) => {
    _requestMix = resolve
    signal.addEventListener('abort', () => resolve(), { once: true })
  })
  const analysis = new AbortController()
  const analysisSignal = AbortSignal.any([signal, analysis.signal, AbortSignal.timeout(20_000)])
  const analysisSeconds = playSetting.getAutomixMaxAnalyzeTime
  const outgoingGrid = analyseMixTrack(
    primary.currentSrc,
    primary.duration,
    'tail',
    analysisSeconds,
    analysisSignal
  )

  // The same policy drives the secondary slot. Publish its trace only when
  // it becomes the audible track rather than while the previous track plays.
  const fallback = createPlaybackFallback(nextSong, () => !signal.aborted, true)
  const loading = fallback
    .load(async (url) => {
      audioStore.setSecondaryUrl(url)
      await nextTick()
      try {
        await waitForAudioReady(secondary, signal)
      } catch (error) {
        if (!signal.aborted)
          console.warn('[crossfade] next audio buffer failed', {
            scheme: url.match(/^([a-z][a-z0-9+.-]*):/i)?.[1],
            readyState: secondary.readyState,
            mediaError: secondary.error?.code
          })
        throw error
      }
    })
    .catch((error) => {
      if (!signal.aborted) console.warn('[crossfade] next audio preparation failed', error)
      return undefined
    })
  const pending: { ready?: Awaited<ReturnType<typeof globalPlayStatus.prepareSong>> } = {}
  const metadata = globalPlayStatus
    .prepareSong(nextSong, signal)
    .then((prepared) => {
      pending.ready = prepared
      return prepared
    })
    .catch((error) => {
      if (!signal.aborted) console.warn('[crossfade] metadata preparation failed', error)
      return null
    })
  signal.addEventListener(
    'abort',
    () => {
      void metadata.then((prepared) => prepared?.dispose())
    },
    { once: true }
  )
  const loaded = await loading
  if (!loaded || signal.aborted) {
    if (!signal.aborted) {
      trace('failed: no playable next audio')
      cancelCrossfade()
    }
    return
  }
  trace('next audio ready', {
    readyState: secondary.readyState,
    remaining: readLiveDuration() - readLiveCurrentTime()
  })
  const result: { tempo: TempoMatch | null } = { tempo: null }
  void Promise.all([
    outgoingGrid,
    analyseMixTrack(
      secondary.currentSrc || loaded.url,
      secondary.duration,
      'head',
      analysisSeconds,
      analysisSignal
    )
  ]).then(([outgoing, incoming]) => {
    if (outgoing && incoming && !analysisSignal.aborted)
      result.tempo = matchTempos(outgoing, incoming)
  })
  await mixCue
  analysis.abort()
  if (signal.aborted) return
  if (_authorizeAdvance && !(await _authorizeAdvance(nextSong))) {
    if (!signal.aborted) {
      _rejectedMedia = primary.currentSrc
      trace('skipped: plugin did not approve preloaded track')
      cancelCrossfade()
    }
    return
  }
  if (signal.aborted || !canStart()) {
    if (!signal.aborted) cancelCrossfade()
    return
  }

  try {
    secondary.currentTime = 0
    secondary.playbackRate = primary.playbackRate
  } catch {}

  // 确保非活跃槽建立了 Web Audio 链 + crossfade 节点
  AudioManager.getOrCreateAudioSource(secondary)

  const gS = AudioManager.getCrossfadeGain(secondary)
  const gP = AudioManager.getCrossfadeGain(primary)
  const bassP = AudioManager.getCrossfadeBassGain(primary)
  const bassS = AudioManager.getCrossfadeBassGain(secondary)
  const ctxP = AudioManager.getContext(primary)
  const ctxS = AudioManager.getContext(secondary)

  if (!gS || !gP || !bassP || !bassS || !ctxP || !ctxS) {
    console.warn('[crossfade] crossfade nodes unavailable, aborting')
    cancelCrossfade()
    return
  }

  // 同步音量
  const userVol = (audioStore.Audio.volume || 0) / 100
  try {
    secondary.volume = Number(userVol.toFixed(2))
    primary.volume = Number(userVol.toFixed(2))
  } catch {}

  // 预置 gain：前一首 = 1（正在播放），后一首 = 0
  try {
    gP.gain.cancelScheduledValues(0)
    gP.gain.setValueAtTime(1, ctxP.currentTime)
    gS.gain.cancelScheduledValues(0)
    gS.gain.setValueAtTime(0, ctxS.currentTime)
    bassP.cancelScheduledValues(0)
    bassP.setValueAtTime(0, ctxP.currentTime)
    bassS.cancelScheduledValues(0)
    bassS.setValueAtTime(-12, ctxS.currentTime)
  } catch {}

  // 在静音的备用槽对齐拍相。匹配可用时保留音高并临时调整倍速。
  try {
    if (result.tempo) {
      const { rate } = result.tempo
      _mixTempo = { audio: secondary, baseRate: primary.playbackRate, factor: rate }
      secondary.preservesPitch = true
      secondary.playbackRate = _mixTempo.baseRate * rate
      secondary.currentTime = alignedMixPosition(result.tempo, primary.currentTime)
    }
    await secondary.play()
  } catch (e) {
    if (!signal.aborted) {
      console.warn('[crossfade] secondary.play() failed', e)
      cancelCrossfade()
    }
    return
  }
  const remaining = (primary.duration - primary.currentTime) / primary.playbackRate
  if (!canStart() || !Number.isFinite(remaining) || remaining <= FADE_SAFETY_MARGIN) {
    if (!signal.aborted) cancelCrossfade()
    return
  }

  // 3. 计算过渡时长
  const fadeTime = Math.min(MAX_FADE_TIME, remaining - FADE_SAFETY_MARGIN)

  // 4. 启动等功率交叉淡化，在中段交接两首歌的低频。
  const startP = ctxP.currentTime
  const startS = ctxS.currentTime
  const tempo = _mixTempo
  if (tempo && tempo.factor !== 1) {
    const alignedRate = tempo.factor
    _tempoTimer = setInterval(() => {
      const progress = (ctxS.currentTime - startS) / fadeTime
      const release = Math.max(0, Math.min(1, (progress - 0.7) / 0.3))
      tempo.factor = 1 + (alignedRate - 1) * (1 - release)
      tempo.audio.playbackRate = tempo.baseRate * tempo.factor
    }, 50)
  }
  try {
    gP.gain.setValueCurveAtTime(cosCurve, startP, fadeTime)
  } catch (e) {
    // 某些浏览器对 setValueCurveAtTime 的参数有严格要求；退回线性 ramp
    try {
      gP.gain.cancelScheduledValues(0)
      gP.gain.setValueAtTime(1, startP)
      gP.gain.linearRampToValueAtTime(0, startP + fadeTime)
    } catch {}
  }
  try {
    gS.gain.setValueCurveAtTime(sinCurve, startS, fadeTime)
  } catch (e) {
    try {
      gS.gain.cancelScheduledValues(0)
      gS.gain.setValueAtTime(0, startS)
      gS.gain.linearRampToValueAtTime(1, startS + fadeTime)
    } catch {}
  }
  try {
    bassP.setValueAtTime(0, startP + fadeTime * 0.25)
    bassP.linearRampToValueAtTime(-12, startP + fadeTime * 0.65)
    bassS.setValueAtTime(-12, startS + fadeTime * 0.35)
    bassS.linearRampToValueAtTime(0, startS + fadeTime * 0.75)
  } catch {}

  crossfadeState.active = true
  // 早期翻转槽位后老歌不再在 UI 上可见，因此不填充 fadeStart/fadeDuration
  // （它们用于在老歌进度条上显示淡出区段，现已不适用）
  crossfadeState.fadeStart = 0
  crossfadeState.fadeDuration = 0
  _finalizing = true
  _beginningInProgress = false
  _preparation = null

  // 立即翻转槽位：让进度条显示新歌的时间/总时长，并让 RAF 循环从新 primary 读数据。
  // 老歌继续在"新的 secondary 槽"中完成淡出播放，completeCrossfade 负责清理。
  try {
    audioStore.swapPrimarySlot()
    fallback.playing(loaded)
    const newPrimary = audioStore.getPrimaryEl()
    if (newPrimary) {
      const d = newPrimary.duration
      if (Number.isFinite(d) && d > 0) {
        audioStore.setDuration(d)
      }
      audioStore.setCurrentTime(newPrimary.currentTime || 0)
    }
  } catch (e) {
    console.warn('[crossfade] early swap failed', e)
  }

  // 淡入已开始：立即更新当前歌曲信息（标题/歌手/封面/媒体会话/歌词触发）。
  // lastPlaySongId 同步更新以驱动歌词获取（GlobalPlayStatus 通过 watch songId 拉取歌词）。
  try {
    localUserStore.userInfo.lastPlaySongId = nextSong.songmid as any
    localUserStore.userInfo.lastPlaySongKey = songKey(nextSong)
  } catch {}
  try {
    if (pending.ready) globalPlayStatus.commitPrepared(pending.ready)
    else globalPlayStatus.commitTransitionSong(nextSong, metadata)
  } catch (error) {
    console.warn('[crossfade] failed to commit song metadata', error)
  }
  // SMTC 元数据由 commitPrepared 统一更新(使用已加载好的封面)，此处不再重复调用。

  // 在新歌开头打上淡入标记：0 ~ fadeTime 秒
  // 淡入完成后再保留 8 秒，让用户看到"这里是淡入段"
  crossfadeState.fadeInMarkEnd = fadeTime
  if (_fadeInClearTimer !== null) {
    clearTimeout(_fadeInClearTimer)
  }
  _fadeInClearTimer = setTimeout(
    () => {
      crossfadeState.fadeInMarkEnd = 0
      _fadeInClearTimer = null
    },
    (fadeTime + 8) * 1000
  )

  _completeTimer = setTimeout(
    () => {
      completeCrossfade(nextSong)
    },
    fadeTime * 1000 + 50
  )

  // 日志
  console.log('[crossfade] begin', {
    fadeTime,
    nextSong: nextSong.name,
    remaining
  })
}

const completeCrossfade = (nextSong: SongList) => {
  const audioStore = ControlAudioStore()

  // beginCrossfade 中已经执行过 swapPrimarySlot:
  //   primary   = 新歌（已在正常播放）
  //   secondary = 老歌（淡出结束，需要清理）
  const newPrimary = audioStore.getPrimaryEl()
  const oldSong = audioStore.getSecondaryEl()

  // 复位两个槽的 crossfade 节点（恢复 bypass 状态，供下次过渡使用）
  if (newPrimary) AudioManager.resetCrossfadeNodes(newPrimary)
  if (oldSong) AudioManager.resetCrossfadeNodes(oldSong)

  // 停止并清理老歌
  if (oldSong) {
    try {
      oldSong.pause()
    } catch {}
    try {
      oldSong.removeAttribute('src')
      oldSong.load()
    } catch {}
  }

  // 清空老歌对应槽的 src 绑定
  try {
    audioStore.clearSecondarySrc()
  } catch {}

  console.log('[crossfade] complete ->', nextSong.name)
  resetState()
}

// ------- 对外 API -------

export const crossfadeManager = {
  /**
   * 初始化：订阅音频事件。应在 GlobalAudio.vue 挂载后调用一次。
   * @param getNextSong 返回下一首歌曲的回调（由 globaPlayList 注入，避免循环依赖）
   */
  init(getNextSong: GetNextSong, authorizeAdvance?: AuthorizeAdvance) {
    _authorizeAdvance = authorizeAdvance
    if (_inited) {
      _getNextSong = getNextSong
      return
    }
    _inited = true
    trace('initialized')
    _getNextSong = getNextSong

    const audioStore = ControlAudioStore()
    _unsubs.push(audioStore.subscribe('timeupdate', onTimeUpdate))
    _unsubs.push(audioStore.subscribe('seeked', onSeeked))
    _unsubs.push(audioStore.subscribe('ended', onPlaybackEnded))
    _unsubs.push(audioStore.subscribe('pause', cancelCrossfade))
  },

  /**
   * 设置/更新 getNextSong 回调（若 init 已经调用过，可通过此方法更新）
   */
  setGetNextSong(cb: GetNextSong) {
    _getNextSong = cb
  },

  playbackRateFor(audio: HTMLAudioElement, baseRate: number): number {
    if (_mixTempo?.audio !== audio) return baseRate
    _mixTempo.baseRate = baseRate
    return baseRate * _mixTempo.factor
  },

  /**
   * 设置自然结束后的自动下一首是否延迟触发。
   * 启用延迟时，提前过渡必须让位，避免在歌曲结束前就被抢先推进。
   */
  setNaturalNextDelayEnabled(enabled: boolean) {
    const shouldCancel = enabled && !_naturalNextDelayEnabled
    _naturalNextDelayEnabled = enabled
    if (shouldCancel) {
      cancelCrossfade()
    }
    updateMarkRange()
  },

  /**
   * 取消正在进行的过渡。
   * 在用户主动切歌 / seek 离开尾段 / 禁用设置时调用。
   */
  cancel() {
    _rejectedMedia = undefined
    cancelCrossfade()
  },

  /** 是否正在过渡（RMS 观察或 gain 包络阶段） */
  isActive(): boolean {
    return crossfadeState.active || crossfadeState.scheduled || _beginningInProgress
  },

  /**
   * 是否正处于"即将推进到下一首"的关键窗口。
   * playNextAuto 在 ended 事件中如果命中此条件则 return，避免重复推进。
   */
  isFinalizingCurrentAdvance(): boolean {
    return _finalizing
  },

  /** 清理事件订阅（组件卸载时调用） */
  destroy() {
    for (const u of _unsubs) {
      try {
        u()
      } catch {}
    }
    _unsubs = []
    _inited = false
    _getNextSong = null
    _authorizeAdvance = undefined
    _traceMedia = undefined
    _lastStage = undefined
    _rejectedMedia = undefined
    _naturalNextDelayEnabled = false
    crossfadeState.fadeInMarkEnd = 0
    if (_fadeInClearTimer !== null) {
      clearTimeout(_fadeInClearTimer)
      _fadeInClearTimer = null
    }
    resetState()
  }
}
