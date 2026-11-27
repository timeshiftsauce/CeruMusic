import audioManager from '@renderer/utils/audio/audioManager'
import type { PlayerRegion } from '@shiqianjiang/ceru-plugin-sdk'

type Consumer = (bins: Float32Array) => void
type Source = { id:string; analyser:AnalyserNode; bytes:Uint8Array<ArrayBuffer>; bins:Float32Array; time:number; users:number; frame:number; listeners:Set<Consumer>; releaseActivity?:()=>void }
const sources = new WeakMap<HTMLAudioElement, Source>()
let sequence = 0
export function listenRegionSpectrum(name: PlayerRegion, audio: HTMLAudioElement | null | undefined, playing: boolean, simulated: boolean, deliver: Consumer) {
  if (name !== 'player.stage' && name !== 'player.visualizer' && name !== 'player.background') return
  if (simulated || !playing) {
    deliver(new Float32Array(128))
    return
  }
  if (!audio) return
  const lease = acquireSpectrum(audio)
  lease?.listen(deliver)
  return lease?.release
}
function sample(source:Source, audio:HTMLAudioElement, time:number) {
  if (document.hidden) return source.bytes
  if (audio.paused || audio.seeking || audio.readyState < 2) {
    source.time = -1
    source.bytes.fill(0)
    source.bins.fill(0)
  } else if (time !== source.time) {
    source.time = time
    source.analyser.getByteFrequencyData(source.bytes)
    for (let index = 0; index < source.bytes.length; index++) source.bins[index] = source.bytes[index] / 255
  }
  return source.bytes
}
export function acquireSpectrum(audio:HTMLAudioElement) {
  let existing = sources.get(audio)
  if (!existing) {
    const id = 'player-region-spectrum-' + ++sequence
    const analyser = audioManager.createAnalyser(audio,id,256)
    if (!analyser) return null
    existing = {id,analyser,bytes:new Uint8Array(128),bins:new Float32Array(128),time:-1,users:0,frame:0,listeners:new Set()}
    sources.set(audio,existing)
  }
  const source = existing
  source.users++
  let released = false
  const owned = new Set<Consumer>()
  const tick = (time:number) => {
    source.frame = 0
    if (!source.listeners.size || document.hidden) return
    sample(source,audio,time)
    for (const listener of source.listeners) listener(source.bins)
    if (source.listeners.size) source.frame = requestAnimationFrame(tick)
  }
  const activity = () => {
    if (document.hidden) { cancelAnimationFrame(source.frame); source.frame = 0; source.time = -1 }
    else if (source.listeners.size && !source.frame) source.frame = requestAnimationFrame(tick)
  }
  if (!source.releaseActivity) {
    document.addEventListener('visibilitychange', activity)
    source.releaseActivity = () => {
      document.removeEventListener('visibilitychange', activity)
    }
  }
  return {
    bytes: (time:number) => sample(source,audio,time),
    listen(listener:Consumer) {
      if (released) return
      const subscription: Consumer = bins => listener(bins)
      owned.add(subscription); source.listeners.add(subscription)
      if (!source.frame && !document.hidden) source.frame = requestAnimationFrame(tick)
    },
    release() {
      if (released) return
      released = true
      for (const listener of owned) source.listeners.delete(listener)
      if (!source.listeners.size) { cancelAnimationFrame(source.frame); source.frame = 0 }
      if (--source.users === 0) { source.releaseActivity?.(); sources.delete(audio); audioManager.removeAnalyser(source.id) }
    },
  }
}
