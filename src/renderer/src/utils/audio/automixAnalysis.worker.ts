import { detectBeatGrid } from './automixTempo'

self.onmessage = ({
  data
}: MessageEvent<{ pcm: Float32Array; sampleRate: number; offset: number }>) => {
  self.postMessage(detectBeatGrid(data.pcm, data.sampleRate, data.offset))
}
