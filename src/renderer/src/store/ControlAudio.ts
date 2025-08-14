import { defineStore } from 'pinia'
import { reactive } from 'vue'
import { transitionVolume } from '@renderer/utils/volume'

type ControlAudioState = {
  audio: HTMLAudioElement | null | undefined
  isPlay: boolean
  currentTime: number
  duration: number
  volume: number
  url: string
}
export const ControlAudioStore = defineStore('controlAudio', () => {
  const Audio = reactive<ControlAudioState>({
    audio: null,
    isPlay: false,
    currentTime: 0,
    duration: 0,
    volume: 80,
    url: ''
  })

  const init = (el: ControlAudioState['audio']) => {
    console.log(el, 'init2')
    Audio.audio = el
  }
  const setCurrentTime = (time: number) => {
    if (typeof time === 'number') {
      Audio.currentTime = time
      return
    }
    throw new Error('the time is not number')
  }
  const start = () => {
    const volume = Audio.volume
    console.log(1)
    if (Audio.audio) {
      console.log(Audio)
      Audio.audio.volume = 0
      Audio.audio.play()
      Audio.isPlay = true
      return transitionVolume(Audio.audio, volume / 100, true)
    }
    return false
  }
  const stop = () => {
    if (Audio.audio) {
      Audio.isPlay = false
      return transitionVolume(Audio.audio, Audio.volume / 100, false).then(() => {
        Audio.audio?.pause()
      })
    }
    return false
  }
  // const
  return {
    Audio,
    init,
    setCurrentTime,
    start,
    stop
  }
})
