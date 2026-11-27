import { watch, type Ref } from 'vue'
import AudioManager from './audioManager'
import { desktopBridge } from '@renderer/services/desktopBridge'
import {
  karaokeEnabled,
  karaokeBalance,
  karaokePitch,
  karaokeMessage,
  karaokeGains,
  karaokeAttempt,
  karaokePlaybackError,
  selectedPack
} from '@renderer/services/karaoke'
import type { KaraokePack, SeparatedAudio } from '@common/karaoke'

const blockSeconds = 5
const marginSeconds = 0.35

async function withDeadline<T>(
  promise: Promise<T>,
  signal: AbortSignal,
  ms: number,
  message: string
): Promise<T> {
  let stop: (() => void) | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        stop = () => reject(signal.reason)
        timer = setTimeout(() => reject(new Error(message)), ms)
        signal.addEventListener('abort', stop, { once: true })
        if (signal.aborted) stop()
      })
    ])
  } finally {
    clearTimeout(timer)
    if (stop) signal.removeEventListener('abort', stop)
  }
}

// Preserve each stem's stereo channels when resampling to the device rate.
async function outputChannels(
  audio: SeparatedAudio,
  channels: number,
  offset: number,
  frames: number,
  rate: number
) {
  const data = audio.stems.flat()
  if (
    data.length !== channels ||
    !data[0]?.length ||
    data.some((ch) => ch.length !== data[0].length)
  )
    throw Error('模型返回的音轨数据不完整')
  const start = Math.round(offset * audio.sampleRate)
  if (rate === audio.sampleRate) {
    return data.map((ch) => {
      const result = new Float32Array(frames)
      result.set(ch.subarray(start, start + frames))
      return result
    })
  }
  const ctx = new OfflineAudioContext(data.length, frames, rate)
  const buffer = ctx.createBuffer(data.length, data[0].length, audio.sampleRate)
  data.forEach((ch, i) => buffer.getChannelData(i).set(ch))
  const source = ctx.createBufferSource()
  source.buffer = buffer
  source.connect(ctx.destination)
  source.start(0, start / audio.sampleRate)
  const output = await ctx.startRendering()
  return data.map((_, i) => output.getChannelData(i).slice())
}

export function useKaraokePlayback(
  element: Ref<HTMLAudioElement | undefined>,
  url: () => string,
  active: () => boolean
) {
  watch(
    [element, url, karaokeEnabled, selectedPack, active, karaokeAttempt],
    ([el, src, enabled, pack, isActive], _, cleanup) => {
      if (!el || !src || !enabled || !isActive) return
      const controller = new AbortController()
      cleanup(() => controller.abort())
      karaokePlaybackError.value = ''
      karaokeMessage.value = '正在准备分轨音频…'
      void playback(el, src, controller.signal, pack).catch((error) => {
        if (!controller.signal.aborted) {
          karaokeMessage.value = ''
          karaokePlaybackError.value = error instanceof Error ? error.message : String(error)
        }
        controller.abort()
      })
    },
    { immediate: true, flush: 'post' }
  )
}

async function playback(el: HTMLAudioElement, src: string, signal: AbortSignal, pack: KaraokePack) {
  const channelCount = pack.stems.length * 2
  const [decoder, { default: createStretch }] = await Promise.all([
    import('./karaokeDecoder'),
    import('virtual:ceru-karaoke-stretch')
  ])
  signal.throwIfAborted()
  const read = await withDeadline(
    decoder.openKaraokeDecoder(src, signal),
    signal,
    20000,
    '读取音频超时'
  )
  signal.throwIfAborted()
  const graph = AudioManager.getKaraokeInput(el)
  if (!graph) throw Error('音频输出不可用')
  const ctx = graph.dry.context as AudioContext
  // Buffered playback leaves this input unconnected. The processor reads inputs[0] even while paused.
  const pendingStretch = createStretch(ctx, {
    numberOfInputs: 1,
    numberOfOutputs: 1,
    outputChannelCount: [channelCount]
  })
  const disposeStretch = (node: AudioWorkletNode) => {
    node.disconnect()
    node.port.close()
  }
  const stretch = await withDeadline(pendingStretch, signal, 6000, '变调处理器启动超时').catch(
    (error) => {
      void pendingStretch.then(disposeStretch, () => {})
      throw error
    }
  )
  if (signal.aborted) {
    disposeStretch(stretch)
    return
  }
  const splitter = ctx.createChannelSplitter(channelCount)
  const mix = pack.stems.map(() => ctx.createGain())
  const wet = ctx.createGain()
  wet.gain.value = 0
  stretch.connect(splitter)
  mix.forEach((gain, stem) => {
    const stereo = ctx.createChannelMerger(2)
    splitter.connect(stereo, stem * 2, 0)
    splitter.connect(stereo, stem * 2 + 1, 1)
    stereo.connect(gain).connect(wet)
  })
  wet.connect(graph.input)

  let origin = 0,
    end = 0,
    generation = 0,
    loading = false,
    armed = false
  let clock = 0,
    position = 0,
    playingRate = 1,
    playingPitch = 0
  const message = (text: string) => {
    karaokeMessage.value = text
  }
  const smooth = (param: AudioParam, value: number) =>
    param.setTargetAtTime(value, ctx.currentTime, 0.012)
  function dry() {
    if (armed) void stretch.schedule({ active: false })
    armed = false
    smooth(wet.gain, 0)
    smooth(graph!.dry.gain, 1)
  }
  function sync() {
    if (signal.aborted) return
    const now = el.currentTime,
      rate = el.playbackRate
    const amount = karaokeBalance.value / 100
    mix.forEach((gain, i) => {
      const balance = i === 0 ? 1 - Math.max(0, amount) : 1 + Math.min(0, amount)
      smooth(gain.gain, (balance * (karaokeGains.value[pack.stems[i]] ?? 100)) / 100)
    })
    if (
      el.paused ||
      el.seeking ||
      el.readyState < 3 ||
      ctx.state !== 'running' ||
      now < origin ||
      now >= end - (end >= el.duration - 0.01 ? 0 : 0.12)
    ) {
      dry()
      if (!el.paused && !el.seeking && now < el.duration && now >= end - 0.12)
        message('正在缓冲伴唱，暂播原声')
      return
    }
    if (
      !armed ||
      Math.abs(position + (ctx.currentTime - clock) * playingRate - now) > 0.1 ||
      playingRate !== rate ||
      playingPitch !== karaokePitch.value
    ) {
      clock = ctx.currentTime
      position = now
      playingRate = rate
      playingPitch = karaokePitch.value
      void stretch.schedule({
        active: true,
        input: now - origin,
        output: clock,
        rate,
        semitones: playingPitch
      })
    }
    armed = true
    smooth(wet.gain, el.muted ? 0 : el.volume)
    smooth(graph!.dry.gain, 0)
    message('')
  }
  function reset() {
    generation++
    dry()
    origin = end = Math.max(0, el.currentTime)
    void stretch.dropBuffers()
    message('正在准备分轨音频…')
  }
  async function fill() {
    if (el.readyState >= 3 && el.duration === Infinity) {
      fail(Error('当前直播音频无法分轨'))
      return
    }
    if (
      loading ||
      !Number.isFinite(el.duration) ||
      el.duration <= 0 ||
      end >= el.duration ||
      end - el.currentTime > 10 ||
      el.seeking
    )
      return
    if (el.currentTime > end + blockSeconds) reset()
    loading = true
    const ticket = generation
    const start = end,
      stop = Math.min(start + blockSeconds, el.duration)
    const from = Math.max(0, start - marginSeconds),
      to = Math.min(el.duration, stop + marginSeconds)
    try {
      const pcm = await withDeadline(read(from, to), signal, 20000, '音频片段读取超时')
      if (signal.aborted || ticket !== generation) return
      const separated = await desktopBridge.api.karaoke.separate(pack.id, pcm, 44100)
      if (signal.aborted || ticket !== generation) return
      const frames =
        Math.round((stop - origin) * ctx.sampleRate) - Math.round((start - origin) * ctx.sampleRate)
      if (frames <= 0) {
        end = stop
        return
      }
      const channels = await outputChannels(
        separated,
        channelCount,
        start - from,
        frames,
        ctx.sampleRate
      )
      if (signal.aborted || ticket !== generation) return
      await withDeadline(
        stretch.addBuffers(
          channels,
          channels.map((ch) => ch.buffer as ArrayBuffer)
        ),
        signal,
        5000,
        '分轨音频缓冲超时'
      )
      if (signal.aborted || ticket !== generation) return
      end = stop
      await withDeadline(
        stretch.dropBuffers(Math.max(0, el.currentTime - origin - 1)),
        signal,
        5000,
        '分轨音频缓冲超时'
      )
      sync()
    } catch (error) {
      if (!signal.aborted && ticket === generation) fail(error)
    } finally {
      loading = false
    }
  }
  let rejectFailure!: (error: unknown) => void
  const failed = new Promise<never>((_, reject) => {
    rejectFailure = reject
  })
  const fail = (error: unknown) => rejectFailure(error)
  stretch.onprocessorerror = () => fail(Error('变调处理器无法继续播放'))
  reset()
  const timer = setInterval(() => {
    sync()
    void fill()
  }, 80)
  const events = ['playing', 'pause', 'waiting', 'ratechange', 'volumechange'] as const
  for (const event of events) el.addEventListener(event, sync)
  el.addEventListener('seeking', reset)
  const stopped = () => fail(signal.reason)
  signal.addEventListener('abort', stopped, { once: true })
  try {
    if (signal.aborted) stopped()
    await failed
  } finally {
    signal.removeEventListener('abort', stopped)
    clearInterval(timer)
    for (const event of events) el.removeEventListener(event, sync)
    el.removeEventListener('seeking', reset)
    dry()
    disposeStretch(stretch)
    splitter.disconnect()
    for (const gain of mix) gain.disconnect()
    wet.disconnect()
  }
}
