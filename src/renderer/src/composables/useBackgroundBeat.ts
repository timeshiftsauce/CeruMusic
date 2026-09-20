import { watch } from 'vue'
import audioManager from '@renderer/utils/audio/audioManager'

let nextAnalyserId = 0

/** 为背景提供独立的低频采样，不依赖频谱条是否显示。 */
export function useBackgroundBeat(
  getAudio: () => HTMLAudioElement | null | undefined,
  isActive: () => boolean,
  onVolume: (volume: number) => void
) {
  const analyserId = `background-beat-${++nextAnalyserId}`

  watch(
    [getAudio, isActive],
    ([audio, active], _previous, onCleanup) => {
      onVolume(0)
      if (!audio || !active) return

      // 4096 点 FFT 可分辨 80–120 Hz；256 点在 48 kHz 下每个频段宽达 187.5 Hz。
      const analyser = audioManager.createAnalyser(audio, analyserId, 4096)
      if (!analyser) return
      analyser.smoothingTimeConstant = 0.2
      const frequencies = new Uint8Array(analyser.frequencyBinCount)
      const binWidth = analyser.context.sampleRate / analyser.fftSize
      const firstBin = Math.max(1, Math.ceil(80 / binWidth))
      const lastBin = Math.min(
        frequencies.length - 1,
        Math.max(firstBin, Math.floor(120 / binWidth))
      )
      let frameId = 0
      let lastSampleTime = -Infinity

      const sample = (time: number) => {
        frameId = requestAnimationFrame(sample)
        if (time - lastSampleTime < 1000 / 30) return
        lastSampleTime = time
        analyser.getByteFrequencyData(frequencies)
        let total = 0
        for (let bin = firstBin; bin <= lastBin; bin++) total += frequencies[bin]
        onVolume(total / (lastBin - firstBin + 1) / 255)
      }

      frameId = requestAnimationFrame(sample)
      onCleanup(() => {
        cancelAnimationFrame(frameId)
        audioManager.removeAnalyser(analyserId)
        onVolume(0)
      })
    },
    { immediate: true }
  )
}
