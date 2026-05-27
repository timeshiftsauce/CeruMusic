import { isPageIdle } from '@renderer/utils/idleSleep'

let timer: any

export function transitionVolume(
  audio: HTMLAudioElement,
  volume: number,
  target: boolean = true,
  lengthen: boolean = false
): Promise<undefined> {
  clearInterval(timer)
  const playVolume = lengthen ? 40 : 20
  const pauseVolume = lengthen ? 30 : 20
  return new Promise((resolve) => {
    if (target) {
      timer = setInterval(() => {
        if (document.hidden || isPageIdle()) return
        audio.volume = Math.min(audio.volume + volume / playVolume, volume)
        if (audio.volume >= volume) {
          resolve(undefined)
          clearInterval(timer)
        }
      }, 50)
      return
    }
    timer = setInterval(() => {
      if (document.hidden || isPageIdle()) return
      audio.volume = Math.max(audio.volume - volume / pauseVolume, 0)
      if (audio.volume <= 0) {
        clearInterval(timer)
        audio.volume = volume
        resolve(undefined)
      }
    }, 50)
  })
}
