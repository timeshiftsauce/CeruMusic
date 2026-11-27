import audioManager from '@renderer/utils/audio/audioManager'
import { acquireSpectrum, listenRegionSpectrum } from './spectrum'

jest.mock('@renderer/utils/audio/audioManager', () => ({
  __esModule: true,
  default: { createAnalyser: jest.fn(), removeAnalyser: jest.fn() }
}))
let focused = true
beforeEach(() => {
  focused = true
  Object.defineProperty(globalThis, 'window', {value:new EventTarget(), configurable:true})
  Object.defineProperty(globalThis, 'document', {value:Object.assign(new EventTarget(), {hidden:false,hasFocus:()=>focused}),configurable:true})
})
afterEach(() => {
  Reflect.deleteProperty(globalThis, 'window')
  Reflect.deleteProperty(globalThis, 'document')
})

test('only spectrum regions sample audio or receive idle frames', () => {
  const audio = {} as HTMLAudioElement, deliver = jest.fn()
  const create = jest.mocked(audioManager.createAnalyser)
  create.mockClear().mockReturnValue(null)
  for (const region of ['player.lyrics', 'player.artwork', 'player.songInfo', 'desktopLyric'] as const) {
    for (const [playing, simulated] of [[true, false], [false, false], [true, true]]) {
      expect(listenRegionSpectrum(region, audio, playing, simulated, deliver)).toBeUndefined()
    }
  }
  expect(create).not.toHaveBeenCalled()
  expect(deliver).not.toHaveBeenCalled()
  for (const region of ['player.background', 'player.visualizer', 'player.stage'] as const) {
    listenRegionSpectrum(region, audio, true, false, deliver)
    listenRegionSpectrum(region, audio, false, false, deliver)
    listenRegionSpectrum(region, audio, true, true, deliver)
  }
  expect(create).toHaveBeenCalledTimes(3)
  expect(deliver).toHaveBeenCalledTimes(6)
  for (const [bins] of deliver.mock.calls) expect(bins).toEqual(new Float32Array(128))
  create.mockClear()
})

test('canvas and plugin leases share each sample until the last consumer releases it', () => {
  const audio = { paused: false, seeking: false, readyState: 4 } as HTMLAudioElement
  const read = jest.fn((buffer: Uint8Array) => buffer.fill(153))
  jest.mocked(audioManager.createAnalyser).mockReturnValue({ getByteFrequencyData: read } as unknown as AnalyserNode)
  const request = jest.fn((_callback: FrameRequestCallback) => 1)
  const cancel = jest.fn()
  const originals = [globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] as const
  globalThis.requestAnimationFrame = request
  globalThis.cancelAnimationFrame = cancel
  try {
    const canvas = acquireSpectrum(audio)!, plugin = acquireSpectrum(audio)!
    expect(audioManager.createAnalyser).toHaveBeenCalledTimes(1)
    const listener = jest.fn()
    canvas.listen(listener)
    plugin.listen(listener)
    expect(request).toHaveBeenCalledTimes(1)
    expect(canvas.bytes(16)[0]).toBe(153)
    request.mock.calls[0][0](16)
    expect(read).toHaveBeenCalledTimes(1)
    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener.mock.calls[0][0]).toHaveLength(128)
    expect(listener.mock.calls[0][0][0]).toBeCloseTo(0.6)
    canvas.release()
    expect(audioManager.removeAnalyser).not.toHaveBeenCalled()
    Object.assign(audio, { paused: true })
    request.mock.calls[1][0](32)
    expect(listener).toHaveBeenCalledTimes(3)
    expect(listener.mock.calls[2][0].every((value: number) => value === 0)).toBe(true)
    expect(plugin.bytes(32).every(value => value === 0)).toBe(true)
    expect(read).toHaveBeenCalledTimes(1)
    plugin.release()
    plugin.release()
    expect(cancel).toHaveBeenCalledTimes(1)
    expect(audioManager.removeAnalyser).toHaveBeenCalledTimes(1)
  } finally {
    ;[globalThis.requestAnimationFrame, globalThis.cancelAnimationFrame] = originals
  }
})

test('blur keeps visible analysis running and visibility changes restart one frame loop', () => {
  const audio = {paused:false,seeking:false,readyState:4} as HTMLAudioElement
  const read = jest.fn((bytes:Uint8Array)=>bytes.fill(10))
  jest.mocked(audioManager.createAnalyser).mockReturnValue({getByteFrequencyData:read} as unknown as AnalyserNode)
  const frames = new Map<number,FrameRequestCallback>()
  let next = 0
  const original = [globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame] as const
  globalThis.requestAnimationFrame = callback => {frames.set(++next,callback);return next}
  globalThis.cancelAnimationFrame = id => {frames.delete(id)}
  const lease = acquireSpectrum(audio)!
  try {
    lease.listen(()=>{})
    expect(frames.size).toBe(1)
    focused = false
    window.dispatchEvent(new Event('blur'))
    expect(frames.size).toBe(1)
    const [id, callback] = [...frames][0]
    frames.delete(id)
    callback(10)
    expect(read).toHaveBeenCalledTimes(1)
    expect(frames.size).toBe(1)

    Object.assign(document, { hidden: true })
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(0)
    lease.bytes(20)
    expect(read).toHaveBeenCalledTimes(1)

    Object.assign(document, { hidden: false })
    document.dispatchEvent(new Event('visibilitychange'))
    document.dispatchEvent(new Event('visibilitychange'))
    expect(frames.size).toBe(1)
    const [resumedId, resumedFrame] = [...frames][0]
    frames.delete(resumedId)
    resumedFrame(30)
    expect(read).toHaveBeenCalledTimes(2)
    expect(frames.size).toBe(1)
  } finally {
    lease.release()
    ;[globalThis.requestAnimationFrame,globalThis.cancelAnimationFrame]=original
  }
  expect(frames.size).toBe(0)
})
