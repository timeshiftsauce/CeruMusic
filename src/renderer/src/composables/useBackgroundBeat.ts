import { watch } from 'vue'
import audioManager from '@renderer/utils/audio/audioManager'
import { BackgroundBeatDetector } from '@renderer/utils/audio/backgroundBeat'

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

      // 2048 点兼顾低频分辨率与起音延迟，包络平滑交给检测器处理。
      const analyser = audioManager.createAnalyser(audio, analyserId, 2048)
      if (!analyser) return
      analyser.smoothingTimeConstant = 0
      const frequencies = new Float32Array(analyser.frequencyBinCount)
      const detector = new BackgroundBeatDetector(analyser.context.sampleRate, analyser.fftSize)
      const reset = () => {
        detector.reset()
        onVolume(0)
      }
      audio.addEventListener('seeking', reset)
      audio.addEventListener('emptied', reset)
      audio.addEventListener('loadedmetadata', reset)
      let frameId = 0
      let lastSampleTime = -Infinity

      const sample = (time: number) => {
        frameId = requestAnimationFrame(sample)
        if (time - lastSampleTime < 1000 / 60) return
        lastSampleTime = time
        if (audio.paused || audio.seeking || audio.readyState < 3) {
          reset()
          return
        }
        analyser.getFloatFrequencyData(frequencies)
        onVolume(detector.update(frequencies, time))
      }

      frameId = requestAnimationFrame(sample)
      onCleanup(() => {
        cancelAnimationFrame(frameId)
        audio.removeEventListener('seeking', reset)
        audio.removeEventListener('emptied', reset)
        audio.removeEventListener('loadedmetadata', reset)
        audioManager.removeAnalyser(analyserId)
        onVolume(0)
      })
    },
    { immediate: true }
  )
}
