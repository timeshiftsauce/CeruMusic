/** 仅用于背景动效的低频起音检测，不改变播放声音。 */
export class BackgroundBeatDetector {
  private previousTime: number | undefined
  private startedAt = 0
  private baseline = 0
  private previousEnergy = 0
  private lastBeat = -Infinity
  private envelope = 0
  private readonly firstBin: number
  private readonly lastBin: number

  constructor(sampleRate: number, fftSize: number) {
    const binWidth = sampleRate / fftSize
    this.firstBin = Math.max(1, Math.ceil(40 / binWidth))
    this.lastBin = Math.min(fftSize / 2 - 1, Math.floor(180 / binWidth))
  }

  reset() {
    this.previousTime = undefined
    this.baseline = 0
    this.previousEnergy = 0
    this.lastBeat = -Infinity
    this.envelope = 0
  }

  update(spectrum: Float32Array, time: number): number {
    let power = 0
    let count = 0
    for (let bin = this.firstBin; bin <= this.lastBin && bin < spectrum.length; bin++) {
      // FloatFrequencyData 是 dB；先还原功率，避免把对数刻度当作音量。
      const db = spectrum[bin]
      power += Number.isFinite(db) ? Math.pow(10, db / 10) : 0
      count++
    }
    const energy = count ? Math.sqrt(power / count) : 0
    if (this.previousTime === undefined || time - this.previousTime > 250 || time < this.previousTime) {
      this.reset()
      this.previousTime = time
      this.startedAt = time
      this.baseline = energy
      this.previousEnergy = energy
      return 0
    }

    const elapsed = time - this.previousTime
    if (elapsed <= 0) return this.envelope
    this.previousTime = time
    this.envelope *= Math.exp(-elapsed / 160)
    const rise = energy - this.previousEnergy
    // 暖机、防静音噪声和 180ms 不应期：持续低音不应每帧都被当作新鼓点。
    if (
      time - this.startedAt >= 120 &&
      time - this.lastBeat >= 180 &&
      energy > Math.max(0.003, this.baseline * 1.5) &&
      rise > Math.max(0.001, this.baseline * 0.18)
    ) {
      const contrast = (energy - this.baseline) / energy
      this.envelope = Math.min(0.85, contrast)
      this.lastBeat = time
    }
    this.baseline += (energy - this.baseline) * (1 - Math.exp(-elapsed / 400))
    this.previousEnergy = energy
    if (this.envelope < 0.005) this.envelope = 0
    return this.envelope
  }
}
