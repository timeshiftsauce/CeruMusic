/// <reference types="jest" />

import { createIdleLeaseManager } from './localMusicWorkerLifecycle'

describe('localMusicWorkerLifecycle', () => {
  it('should dispose after the last lease is released and idle timeout expires', () => {
    const dispose = jest.fn()
    const timers: Array<() => void> = []
    const manager = createIdleLeaseManager({
      idleMs: 1000,
      onDispose: dispose,
      setTimeoutFn: ((callback: () => void) => {
        timers.push(callback)
        return timers.length as unknown as ReturnType<typeof setTimeout>
      }) as any,
      clearTimeoutFn: jest.fn()
    })

    const release = manager.acquire()
    release()

    expect(dispose).not.toHaveBeenCalled()
    expect(timers).toHaveLength(1)

    timers[0]()

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('should cancel pending disposal when a new lease is acquired', () => {
    const dispose = jest.fn()
    const clearTimeoutFn = jest.fn()
    const timers: Array<() => void> = []
    const manager = createIdleLeaseManager({
      idleMs: 1000,
      onDispose: dispose,
      setTimeoutFn: ((callback: () => void) => {
        timers.push(callback)
        return timers.length as unknown as ReturnType<typeof setTimeout>
      }) as any,
      clearTimeoutFn
    })

    const firstRelease = manager.acquire()
    firstRelease()
    const secondRelease = manager.acquire()

    expect(clearTimeoutFn).toHaveBeenCalled()

    timers[0]()
    expect(dispose).not.toHaveBeenCalled()

    secondRelease()
    timers[1]()
    expect(dispose).toHaveBeenCalledTimes(1)
  })
})
