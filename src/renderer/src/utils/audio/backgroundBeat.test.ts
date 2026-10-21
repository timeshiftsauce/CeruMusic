import { BackgroundBeatDetector } from './backgroundBeat'

const spectrum = (db: number) => new Float32Array(1024).fill(db)

function warm(detector: BackgroundBeatDetector, db = -60) {
  for (let time = 0; time <= 200; time += 20) detector.update(spectrum(db), time)
}

describe('背景鼓点起音检测', () => {
  test('持续贝斯和静音不能持续驱动鼓点', () => {
    for (const db of [-20, -100, -Infinity]) {
      const detector = new BackgroundBeatDetector(48000, 2048)
      for (let time = 0; time < 2000; time += 20) {
        expect(detector.update(spectrum(db), time)).toBe(0)
      }
    }
  })

  test('低频起音触发后自然回落，密集波动不能重复触发', () => {
    const detector = new BackgroundBeatDetector(48000, 2048)
    warm(detector)
    const hit = detector.update(spectrum(-20), 220)
    expect(hit).toBeGreaterThan(0.5)
    detector.update(spectrum(-60), 240)
    expect(detector.update(spectrum(-18), 280)).toBeLessThan(hit)
    let released = 0
    for (let time = 300; time <= 1200; time += 20) {
      released = detector.update(spectrum(-60), time)
    }
    expect(released).toBe(0)
    expect(detector.update(spectrum(-20), 1220)).toBeGreaterThan(0.5)
  })

  test.each([44100, 48000])('只响应低频，兼容 %i Hz 采样率', (sampleRate) => {
    const detector = new BackgroundBeatDetector(sampleRate, 2048)
    warm(detector)
    const highOnly = spectrum(-60)
    highOnly[Math.round(1000 / (sampleRate / 2048))] = -10
    expect(detector.update(highOnly, 220)).toBe(0)
    const kick = spectrum(-60)
    kick[Math.round(60 / (sampleRate / 2048))] = -15
    expect(detector.update(kick, 240)).toBeGreaterThan(0.5)
  })

  test('切歌重置及后台长时间中断后不产生假起音', () => {
    const detector = new BackgroundBeatDetector(48000, 2048)
    warm(detector)
    expect(detector.update(spectrum(-20), 220)).toBeGreaterThan(0)
    detector.reset()
    expect(detector.update(spectrum(-20), 240)).toBe(0)
    expect(detector.update(spectrum(-10), 2000)).toBe(0)
  })
})
