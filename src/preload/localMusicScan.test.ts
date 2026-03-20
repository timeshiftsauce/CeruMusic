import { normalizeLocalMusicScanResult } from './localMusicScan'

describe('local music scan result normalization', () => {
  it('should normalize legacy stringified scan results to a summary', () => {
    expect(normalizeLocalMusicScanResult(JSON.stringify([{ songmid: 1 }, { songmid: 2 }]))).toEqual({
      success: true,
      count: 2
    })
  })

  it('should normalize array scan results to a summary', () => {
    expect(normalizeLocalMusicScanResult([{ songmid: 1 }])).toEqual({
      success: true,
      count: 1
    })
  })

  it('should keep summary objects as-is', () => {
    expect(normalizeLocalMusicScanResult({ success: true, count: 3 })).toEqual({
      success: true,
      count: 3
    })
  })
})
