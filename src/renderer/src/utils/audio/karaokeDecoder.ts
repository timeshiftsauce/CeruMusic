import { ALL_FORMATS, AudioBufferSink, CustomSource, Input, UrlSource } from 'mediabunny'
import { desktopBridge } from '@renderer/services/desktopBridge'

const modelRate = 44100

export async function openKaraokeDecoder(url: string, signal: AbortSignal) {
  const api = desktopBridge.api.karaoke
  const local = /^(file|ceru-local):/.test(url)
  const source = local
    ? new CustomSource({
        getSize: () => api.fileSize(url),
        read: async (start, end) => {
          const bytes = new Uint8Array(end - start)
          for (let pos = start; pos < end; pos += 1024 * 1024) {
            signal.throwIfAborted()
            bytes.set(await api.readFile(url, pos, Math.min(pos + 1024 * 1024, end)), pos - start)
          }
          return bytes
        }
      })
    : new UrlSource(url, { maxCacheSize: 8 * 1024 * 1024, getRetryDelay: () => null })
  const input = new Input({ formats: ALL_FORMATS, source })
  const dispose = () => input.dispose()
  signal.addEventListener('abort', dispose, { once: true })
  try {
    signal.throwIfAborted()
    const track = await input.getPrimaryAudioTrack()
    if (!track || !(await track.canDecode())) throw Error('当前音频格式无法分离')
    const first = await track.getFirstTimestamp()
    const sink = new AudioBufferSink(track)
    return async (start: number, end: number) => {
      const length = Math.round(end * modelRate) - Math.round(start * modelRate)
      const offline = new OfflineAudioContext(2, length, modelRate)
      let decoded = false
      for await (const part of sink.buffers(Math.max(first, first + start - 0.25), first + end)) {
        signal.throwIfAborted()
        const at = part.timestamp - first - start
        if (at + part.duration <= 0 || at >= end - start) continue
        const node = offline.createBufferSource()
        node.buffer = part.buffer
        node.connect(offline.destination)
        node.start(Math.max(0, at), Math.max(0, -at))
        decoded = true
      }
      if (!decoded) throw Error('未能读取当前音频片段')
      const buffer = await offline.startRendering()
      signal.throwIfAborted()
      return [buffer.getChannelData(0), buffer.getChannelData(1)]
    }
  } catch (error) {
    signal.removeEventListener('abort', dispose)
    dispose()
    throw error
  }
}
