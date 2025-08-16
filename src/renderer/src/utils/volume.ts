let timer: any

export function transitionVolume(
  audio: HTMLAudioElement,
  volume: number,
  target: boolean = true,
  lengthen: boolean = false
): Promise<undefined> {
  clearInterval(timer)
  const playVolume = lengthen ? 40 : 20
  const pauseVolume = lengthen ? 20 : 10
  return new Promise((resolve) => {
    if (target) {
      timer = setInterval(() => {
        audio.volume = Math.min(audio.volume + volume / playVolume, volume)
        if (audio.volume >= volume) {
          resolve(undefined)
          clearInterval(timer)
        }
      }, 50)
      return
    }
    timer = setInterval(() => {
      audio.volume = Math.max(audio.volume - volume / pauseVolume, 0)
      if (audio.volume <= 0) {
        clearInterval(timer)
        audio.volume = volume
        resolve(undefined)
      }
    }, 50)
  })
}
