import { reactive, toRaw } from 'vue'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { usePlaySettingStore } from '@renderer/store'
import { useDlnaStore } from '@renderer/store/dlna'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { getSongRealUrl } from '@renderer/utils/playlist/playlistManager'
import { getCandidateSongs, waitForAudioReady } from './audioHelpers'
import AudioManager from './audioManager'
import mediaSessionController from './useSmtc'
import defaultCoverImg from '/default-cover.png'
import type { SongList } from '@renderer/types/audio'

type GetNextSong = () => SongList | null

// ---- 常量 ----
const OBSERVATION_WINDOW = 15 // 进入尾段观察窗口 (秒)
const QUIET_REMAINING = 13 // 安静时刻可触发 (秒)
const FORCED_REMAINING = 12 // 保底触发 (秒)，参考 Apple Music：保证每首歌都有完整过渡
const EMERGENCY_REMAINING = 8 // 紧急兜底 (秒)
const QUIET_RMS = 0.04 // 安静阈值（更敏感，让更多尾段时刻被判定为安静）
const MIN_SONG_DURATION = 25 // 太短的歌不过渡
const MIN_FADE_TIME = 6
const MAX_FADE_TIME = 12
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
let _cancelled = false

let _currentNextSong: SongList | null = null
let _beginningInProgress = false
let _fadeInClearTimer: any = null

// ------- 工具 -------

const stopRmsWatch = () => {
  if (_rmsInterval !== null) {
    clearInterval(_rmsInterval)
    _rmsInterval = null
  }
  _rmsWindow = []
}

const resetState = () => {
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
 * 当设置启用、歌曲时长合适、且 DLNA 未连接时，标记末尾的 OBSERVATION_WINDOW ~ FORCED_REMAINING 区间
 */
const updateMarkRange = () => {
  try {
    const audioStore = ControlAudioStore()
    const playSetting = usePlaySettingStore()
    const dlnaStore = useDlnaStore()

    const duration = audioStore.Audio.duration
    if (
      !playSetting.getIsSeamlessTransition ||
      dlnaStore.currentDevice ||
      !duration ||
      duration < MIN_SONG_DURATION
    ) {
      crossfadeState.markStart = 0
      crossfadeState.markEnd = 0
      return
    }
    // 预告区间：从 duration - OBSERVATION_WINDOW 到 duration - FORCED_REMAINING
    // 这正是"最早可能触发（安静时刻）"和"最晚一定触发"的两个端点
    const start = Math.max(0, duration - OBSERVATION_WINDOW)
    const end = Math.max(start, duration - FORCED_REMAINING)
    crossfadeState.markStart = start
    crossfadeState.markEnd = end
  } catch {
    // 忽略
  }
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

      const duration = audioStore.Audio.duration
      const current = audioStore.Audio.currentTime
      const remaining = duration - current
      if (remaining <= 0) {
        stopRmsWatch()
        return
      }

      // 触发规则 (任一命中):
      // 1. 安静时刻且 remaining <= QUIET_REMAINING
      // 2. remaining <= FORCED_REMAINING (无论音量)
      // 3. remaining <= EMERGENCY_REMAINING (强制兜底)
      if (
        (avgRms < QUIET_RMS && remaining <= QUIET_REMAINING) ||
        remaining <= FORCED_REMAINING ||
        remaining <= EMERGENCY_REMAINING
      ) {
        stopRmsWatch()
        void beginCrossfade()
      }
    } catch (e) {
      console.warn('[crossfade] RMS watch error:', e)
    }
  }, 100)
}

// ------- 事件回调 -------

const onTimeUpdate = () => {
  try {
    const audioStore = ControlAudioStore()
    const playSetting = usePlaySettingStore()
    const dlnaStore = useDlnaStore()

    // 每次 timeupdate 都刷新 mark range（低成本）
    updateMarkRange()

    if (!playSetting.getIsSeamlessTransition) return
    if (dlnaStore.currentDevice) return
    if (crossfadeState.scheduled || crossfadeState.active) return

    const duration = audioStore.Audio.duration
    const current = audioStore.Audio.currentTime
    if (!duration || duration < MIN_SONG_DURATION) return
    const remaining = duration - current
    if (remaining > OBSERVATION_WINDOW) return

    // 进入观察窗口
    if (!_getNextSong) return
    const next = _getNextSong()
    if (!next) return // 单曲循环或列表末尾：不触发
    _currentNextSong = next

    crossfadeState.scheduled = true
    startRmsWatch()
  } catch (e) {
    console.warn('[crossfade] onTimeUpdate error:', e)
  }
}

const cancelCrossfade = () => {
  if (!crossfadeState.scheduled && !crossfadeState.active && !_beginningInProgress) {
    return
  }
  _cancelled = true
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
  console.log('[crossfade] cancelled')
}

const onSeeked = () => {
  // 仅在 scheduled（观察期）且尚未 active（未开始淡化）时，才判断是否取消
  // 一旦 active，槽位已翻转到新歌，seek 是用户在新歌上操作，不影响老歌淡出
  if (!crossfadeState.scheduled || crossfadeState.active) return
  const audioStore = ControlAudioStore()
  const remaining = audioStore.Audio.duration - audioStore.Audio.currentTime
  if (remaining > OBSERVATION_WINDOW + 1) {
    cancelCrossfade()
  }
}

const onPlaybackEnded = () => {
  // 若正在完成交叉淡化，由 completeCrossfade 处理后续；否则不做事，让 ended 继续常规路径
  if (_finalizing) return
}

// ------- 交叉淡化主流程 -------

const beginCrossfade = async () => {
  if (_beginningInProgress || crossfadeState.active) return
  _beginningInProgress = true
  _cancelled = false

  const audioStore = ControlAudioStore()
  const localUserStore = LocalUserDetailStore()
  const globalPlayStatus = useGlobalPlayStatusStore()
  const playSetting = usePlaySettingStore()

  const primary = audioStore.getPrimaryEl()
  const secondary = audioStore.getSecondaryEl()
  if (!primary || !secondary) {
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

  // 1. 预取下一首 URL (含换源 fallback)
  let nextUrl = ''
  try {
    nextUrl = await getSongRealUrl(toRaw(nextSong))
  } catch (e) {
    console.warn('[crossfade] primary source URL failed, trying candidates', e)
    try {
      const candidates = await getCandidateSongs(nextSong, localUserStore.userInfo)
      for (const c of candidates) {
        try {
          const u = await getSongRealUrl(toRaw(c))
          if (u && typeof u === 'string' && !u.includes('error')) {
            nextUrl = u
            break
          }
        } catch {
          continue
        }
      }
    } catch {
      // 换源失败
    }
  }

  if (_cancelled) {
    _beginningInProgress = false
    return
  }

  if (!nextUrl) {
    console.warn('[crossfade] 无法获取下一首 URL，放弃过渡')
    _beginningInProgress = false
    resetState()
    return
  }

  // 2. 装载非活跃槽
  try {
    audioStore.setSecondaryUrl(nextUrl)
  } catch (e) {
    console.warn('[crossfade] setSecondaryUrl failed', e)
    _beginningInProgress = false
    resetState()
    return
  }

  // 等模板把 src 应用到 element 上
  await new Promise((r) => setTimeout(r, 30))
  if (_cancelled) {
    _beginningInProgress = false
    return
  }

  try {
    secondary.load()
    await waitForAudioReady(secondary)
  } catch (e) {
    console.warn('[crossfade] secondary not ready', e)
    _beginningInProgress = false
    resetState()
    return
  }
  if (_cancelled) {
    _beginningInProgress = false
    return
  }

  try {
    secondary.currentTime = 0
  } catch {}

  // 确保非活跃槽建立了 Web Audio 链 + crossfade 节点
  AudioManager.getOrCreateAudioSource(secondary)

  const gS = AudioManager.getCrossfadeGain(secondary)
  const gP = AudioManager.getCrossfadeGain(primary)
  const lpP = AudioManager.getCrossfadeLowpass(primary)
  const ctxP = AudioManager.getContext(primary)
  const ctxS = AudioManager.getContext(secondary)

  if (!gS || !gP || !lpP || !ctxP || !ctxS) {
    console.warn('[crossfade] crossfade nodes unavailable, aborting')
    _beginningInProgress = false
    resetState()
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
    lpP.frequency.cancelScheduledValues(0)
    lpP.frequency.setValueAtTime(22050, ctxP.currentTime)
  } catch {}

  // 开始播放 secondary
  try {
    await secondary.play()
  } catch (e) {
    console.warn('[crossfade] secondary.play() failed', e)
    _beginningInProgress = false
    resetState()
    return
  }
  if (_cancelled) {
    try {
      secondary.pause()
    } catch {}
    _beginningInProgress = false
    return
  }

  // 3. 计算过渡时长
  const remaining = audioStore.Audio.duration - audioStore.Audio.currentTime
  const fadeTime = Math.min(MAX_FADE_TIME, Math.max(MIN_FADE_TIME, remaining - FADE_SAFETY_MARGIN))

  // 4. 启动 gain 包络 + 低通扫频
  try {
    gP.gain.setValueCurveAtTime(cosCurve, ctxP.currentTime, fadeTime)
  } catch (e) {
    // 某些浏览器对 setValueCurveAtTime 的参数有严格要求；退回线性 ramp
    try {
      gP.gain.cancelScheduledValues(0)
      gP.gain.setValueAtTime(1, ctxP.currentTime)
      gP.gain.linearRampToValueAtTime(0, ctxP.currentTime + fadeTime)
    } catch {}
  }
  try {
    gS.gain.setValueCurveAtTime(sinCurve, ctxS.currentTime, fadeTime)
  } catch (e) {
    try {
      gS.gain.cancelScheduledValues(0)
      gS.gain.setValueAtTime(0, ctxS.currentTime)
      gS.gain.linearRampToValueAtTime(1, ctxS.currentTime + fadeTime)
    } catch {}
  }
  try {
    lpP.frequency.setValueAtTime(22050, ctxP.currentTime)
    lpP.frequency.linearRampToValueAtTime(900, ctxP.currentTime + fadeTime)
  } catch {}

  crossfadeState.active = true
  // 早期翻转槽位后老歌不再在 UI 上可见，因此不填充 fadeStart/fadeDuration
  // （它们用于在老歌进度条上显示淡出区段，现已不适用）
  crossfadeState.fadeStart = 0
  crossfadeState.fadeDuration = 0
  _finalizing = true
  _beginningInProgress = false

  // 立即翻转槽位：让进度条显示新歌的时间/总时长，并让 RAF 循环从新 primary 读数据。
  // 老歌继续在"新的 secondary 槽"中完成淡出播放，completeCrossfade 负责清理。
  try {
    audioStore.swapPrimarySlot()
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
  } catch {}
  try {
    globalPlayStatus.updatePlayerInfo(nextSong)
  } catch {}
  try {
    mediaSessionController.updateMetadata({
      title: nextSong.name,
      artist: nextSong.singer,
      album: nextSong.albumName || '未知专辑',
      artworkUrl: nextSong.img || defaultCoverImg
    })
  } catch {}

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

  // 避免 unused 警告
  void playSetting
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
  init(getNextSong: GetNextSong) {
    if (_inited) {
      _getNextSong = getNextSong
      return
    }
    _inited = true
    _getNextSong = getNextSong

    const audioStore = ControlAudioStore()
    _unsubs.push(audioStore.subscribe('timeupdate', onTimeUpdate))
    _unsubs.push(audioStore.subscribe('seeked', onSeeked))
    _unsubs.push(audioStore.subscribe('ended', onPlaybackEnded))
  },

  /**
   * 设置/更新 getNextSong 回调（若 init 已经调用过，可通过此方法更新）
   */
  setGetNextSong(cb: GetNextSong) {
    _getNextSong = cb
  },

  /**
   * 取消正在进行的过渡。
   * 在用户主动切歌 / seek 离开尾段 / 禁用设置时调用。
   */
  cancel() {
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
    crossfadeState.fadeInMarkEnd = 0
    if (_fadeInClearTimer !== null) {
      clearTimeout(_fadeInClearTimer)
      _fadeInClearTimer = null
    }
    resetState()
  }
}
