import { alignedMixPosition, detectBeatGrid, matchTempos } from './automixTempo'

const sampleRate = 11025

function beatTrack(bpm: number, phase: number) {
  const pcm = new Float32Array(15 * sampleRate)
  for (let time = phase; time < 15; time += 60 / bpm) {
    const start = Math.round(time * sampleRate)
    for (let i = 0; i < 400 && start + i < pcm.length; i++) {
      pcm[start + i] = Math.sin((2 * Math.PI * 90 * i) / sampleRate) * Math.exp(-i / 90)
    }
  }
  return pcm
}

it('estimates compatible tempos and aligns different beat phases at the adjusted rate', () => {
  const outgoing = detectBeatGrid(beatTrack(120, 0.13), sampleRate, 15)!
  const incoming = detectBeatGrid(beatTrack(117, 0.29), sampleRate)!
  expect(60 / outgoing.period).toBeCloseTo(120, 0)
  expect(60 / incoming.period).toBeCloseTo(117, 0)
  const match = matchTempos(outgoing, incoming)!
  expect(match.rate).toBeCloseTo(120 / 117, 3)
  const position = alignedMixPosition(match, 22.23)
  expect(position).toBeCloseTo(0.29 + 0.1 * (120 / 117), 1)
  expect(Math.abs(position - 0.39256)).toBeLessThan(0.02)
})

it('keeps incompatible or rhythm-free tracks on the ordinary transition', () => {
  expect(detectBeatGrid(new Float32Array(10 * sampleRate), sampleRate)).toBeNull()
  expect(matchTempos({ period: 0.5, phase: 0 }, { period: 0.6, phase: 0 })).toBeNull()
})
