import { expect, jest, test } from '@jest/globals'
import { IdleMonitor } from './idle'

test('idle thresholds share sampling, rearm once active, and release the timer', () => {
  jest.useFakeTimers()
  try {
    let seconds = 59
    const sample = jest.fn(() => seconds), short = jest.fn(), long = jest.fn()
    const idle = new IdleMonitor(sample)
    expect(() => idle.subscribe(59999, short)).toThrow()
    const offShort = idle.subscribe(60000, short), offLong = idle.subscribe(120000, long)
    expect(jest.getTimerCount()).toBe(1)
    jest.advanceTimersByTime(1000)
    expect(short).not.toHaveBeenCalled()
    seconds = 60; jest.advanceTimersByTime(2000)
    expect(short).toHaveBeenCalledTimes(1)
    seconds = 120; jest.advanceTimersByTime(1000)
    expect(long).toHaveBeenCalledTimes(1)
    seconds = 0; jest.advanceTimersByTime(1000)
    offLong(); seconds = 121; jest.advanceTimersByTime(1000)
    expect(short).toHaveBeenCalledTimes(2)
    expect(long).toHaveBeenCalledTimes(1)
    offShort(); expect(jest.getTimerCount()).toBe(0)
  } finally { jest.useRealTimers() }
})
