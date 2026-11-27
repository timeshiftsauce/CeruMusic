export interface BeatGrid {
  period: number
  phase: number
}

export interface TempoMatch {
  rate: number
  outgoing: BeatGrid
  incoming: BeatGrid
}

const wrap = (time: number, period: number) => ((time % period) + period) % period

/** Estimate a repeating beat grid from low- and mid-band energy onsets. */
export function detectBeatGrid(pcm: Float32Array, sampleRate: number, offset = 0): BeatGrid | null {
  const hop = Math.round(sampleRate * 0.01)
  const frameSeconds = hop / sampleRate
  const count = Math.floor(pcm.length / hop)
  if (count < 450) return null

  const onset = new Float64Array(count)
  const lowAlpha = 1 - Math.exp((-2 * Math.PI * 150) / sampleRate)
  let low = 0
  let previousBass = 0
  let previousMid = 0
  for (let frame = 0; frame < count; frame++) {
    let bass = 0
    let mid = 0
    for (let i = frame * hop; i < (frame + 1) * hop; i++) {
      const sample = pcm[i]
      low += (sample - low) * lowAlpha
      bass += low * low
      mid += (sample - low) ** 2
    }
    const bassEnergy = Math.log1p(80 * Math.sqrt(bass / hop))
    const midEnergy = Math.log1p(40 * Math.sqrt(mid / hop))
    if (frame > 0) {
      onset[frame] =
        0.75 * Math.max(0, bassEnergy - previousBass) + 0.25 * Math.max(0, midEnergy - previousMid)
    }
    previousBass = bassEnergy
    previousMid = midEnergy
  }

  const mean = onset.reduce((sum, value) => sum + value, 0) / count
  const peaks: { frame: number; weight: number }[] = []
  for (let i = 1; i < count - 1; i++) {
    if (
      onset[i] > Math.max(0.012, mean * 2) &&
      onset[i] >= onset[i + 1] &&
      onset[i] > onset[i - 1]
    ) {
      peaks.push({ frame: i, weight: onset[i] })
    }
  }
  if (peaks.length < 5) return null

  // Allow transients a few frames of jitter before correlating at musical tempos.
  const envelope = new Float64Array(count)
  for (const { frame, weight } of peaks) {
    for (let delta = -4; delta <= 4; delta++) {
      const index = frame + delta
      if (index >= 0 && index < count) envelope[index] += weight * (1 - Math.abs(delta) / 5)
    }
  }
  const minLag = Math.round(60 / 185 / frameSeconds)
  const maxLag = Math.round(60 / 65 / frameSeconds)
  const correlations = new Float64Array(maxLag + 2)
  for (let lag = minLag - 1; lag <= maxLag + 1; lag++) {
    let product = 0
    let earlyEnergy = 0
    let lateEnergy = 0
    for (let i = lag; i < count; i++) {
      const early = envelope[i - lag]
      const late = envelope[i]
      product += early * late
      earlyEnergy += early ** 2
      lateEnergy += late ** 2
    }
    correlations[lag] = product / Math.sqrt(earlyEnergy * lateEnergy || 1)
  }
  let bestLag = minLag
  for (let lag = minLag + 1; lag <= maxLag; lag++) {
    if (correlations[lag] > correlations[bestLag] + 0.025) bestLag = lag
  }
  const center = correlations[bestLag]
  if (center < 0.33) return null
  const left = correlations[bestLag - 1]
  const right = correlations[bestLag + 1]
  const curvature = left - 2 * center + right
  const refinement =
    curvature < 0 ? Math.max(-0.5, Math.min(0.5, (left - right) / (2 * curvature))) : 0
  let period = (bestLag + refinement) * frameSeconds

  let sine = 0
  let cosine = 0
  let total = 0
  for (const { frame, weight } of peaks) {
    const angle = (2 * Math.PI * frame * frameSeconds) / period
    sine += weight * Math.sin(angle)
    cosine += weight * Math.cos(angle)
    total += weight
  }
  if (Math.hypot(sine, cosine) < total * 0.28) return null
  let phase = wrap((Math.atan2(sine, cosine) * period) / (2 * Math.PI), period)

  // Fit the grid against its inliers to avoid a small tempo error accumulating across the excerpt.
  let w = 0
  let x = 0
  let y = 0
  let xx = 0
  let xy = 0
  for (const { frame, weight } of peaks) {
    const time = frame * frameSeconds
    const beat = Math.round((time - phase) / period)
    if (Math.abs(time - phase - beat * period) > period * 0.18) continue
    w += weight
    x += weight * beat
    y += weight * time
    xx += weight * beat * beat
    xy += weight * beat * time
  }
  const fittedPeriod = (w * xy - x * y) / (w * xx - x * x)
  if (Math.abs(fittedPeriod / period - 1) < 0.015) {
    period = fittedPeriod
    phase = (y - period * x) / w
  }
  return { period, phase: wrap(phase + offset, period) }
}

export function matchTempos(outgoing: BeatGrid, incoming: BeatGrid): TempoMatch | null {
  // Adjacent half/double tempo grids can describe the same pulse.
  for (const scale of [1, 0.5, 2]) {
    const period = incoming.period * scale
    const rate = period / outgoing.period
    if (rate >= 0.97 && rate <= 1.03) return { rate, outgoing, incoming: { ...incoming, period } }
  }
  return null
}

export function alignedMixPosition(match: TempoMatch, outgoingTime: number): number {
  const beatFraction =
    wrap(outgoingTime - match.outgoing.phase, match.outgoing.period) / match.outgoing.period
  return wrap(match.incoming.phase + beatFraction * match.incoming.period, match.incoming.period)
}
