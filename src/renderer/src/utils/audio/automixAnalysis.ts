import { MAX_ANALYSIS_BYTES } from '@common/automix'
import { desktopBridge } from '@renderer/services/desktopBridge'
import type { BeatGrid } from './automixTempo'

const sampleRate = 11025
const recentGrids = new Map<string, BeatGrid | null>()

async function readAudio(url: URL, signal: AbortSignal): Promise<ArrayBuffer | null> {
  if (url.protocol === 'file:') return desktopBridge.api.localMusic.readAnalysisAudio(url.href)
  if (!['http:', 'https:', 'ceru-media:'].includes(url.protocol)) return null
  const response = await fetch(url, { signal })
  if (!response.ok || !response.body) return null
  const reader = response.body.getReader()
  try {
    if (Number(response.headers.get('content-length')) > MAX_ANALYSIS_BYTES) return null
    let size = 0
    const chunks: Uint8Array[] = []
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.length
      if (size > MAX_ANALYSIS_BYTES) return null
      chunks.push(value)
    }
    const bytes = new Uint8Array(size)
    let offset = 0
    for (const chunk of chunks) {
      bytes.set(chunk, offset)
      offset += chunk.length
    }
    return bytes.buffer
  } finally {
    await reader.cancel().catch(() => {})
  }
}

function analysePCM(
  pcm: Float32Array,
  offset: number,
  signal: AbortSignal
): Promise<BeatGrid | null> {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted()
    const worker = new Worker(new URL('./automixAnalysis.worker.ts', import.meta.url), {
      type: 'module'
    })
    const cleanup = () => {
      signal.removeEventListener('abort', abort)
      worker.terminate()
    }
    const abort = () => {
      cleanup()
      reject(signal.reason)
    }
    signal.addEventListener('abort', abort, { once: true })
    worker.onmessage = ({ data }) => {
      cleanup()
      resolve(data)
    }
    worker.onerror = () => {
      cleanup()
      resolve(null)
    }
    worker.postMessage({ pcm, sampleRate, offset }, [pcm.buffer])
  })
}

export async function analyseMixTrack(
  src: string,
  duration: number,
  segment: 'head' | 'tail',
  seconds: number,
  signal: AbortSignal
): Promise<BeatGrid | null> {
  if (!Number.isFinite(duration) || duration < 5 || duration > 900 || signal.aborted) return null
  try {
    const url = new URL(src)
    const key = JSON.stringify([url.href, segment, seconds])
    if (recentGrids.has(key)) return recentGrids.get(key) ?? null
    const bytes = await readAudio(url, signal)
    if (!bytes?.byteLength || signal.aborted) return null
    const audio = await new OfflineAudioContext(1, 1, sampleRate).decodeAudioData(bytes)
    signal.throwIfAborted()
    const length = Math.min(audio.length, seconds * sampleRate)
    const start = segment === 'tail' ? audio.length - length : 0
    const pcm = audio.getChannelData(0).slice(start, start + length)
    if (audio.numberOfChannels > 1) {
      const right = audio.getChannelData(1)
      for (let i = 0; i < length; i++) pcm[i] = (pcm[i] + right[start + i]) * 0.5
    }
    const grid = await analysePCM(pcm, start / sampleRate, signal)
    if (recentGrids.size >= 64) recentGrids.delete(recentGrids.keys().next().value!)
    recentGrids.set(key, grid)
    return grid
  } catch {
    return null
  }
}
