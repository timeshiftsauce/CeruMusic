import FFT from 'fft.js'
import * as ort from 'onnxruntime-node'
import { availableParallelism } from 'node:os'
import { join } from 'node:path'
import type { KaraokePack, SeparatedAudio } from '../../common/karaoke'

// MDX Karaoke uses a 6144-point STFT (three interleaved 2048-point transforms).
// Spleeter uses a 4096-point STFT. Both use periodic Hann windows and a 1024-sample hop.
class Fourier {
  private radix: number
  private fft: FFT
  private parts: Float64Array[]
  private scratch: Float64Array
  private cos: Float64Array
  private sin: Float64Array
  constructor(readonly size: number) {
    this.radix = size === 6144 ? 3 : 1
    this.fft = new FFT(size / this.radix)
    this.parts = Array.from({ length: this.radix }, () => new Float64Array((size * 2) / this.radix))
    this.scratch = new Float64Array((size * 2) / this.radix)
    this.cos = Float64Array.from({ length: size }, (_, k) => Math.cos((-2 * Math.PI * k) / size))
    this.sin = Float64Array.from({ length: size }, (_, k) => Math.sin((-2 * Math.PI * k) / size))
  }
  transform(input: Float64Array, out: Float64Array, inverse: boolean) {
    if (this.radix === 1) {
      if (inverse) this.fft.inverseTransform(out, input)
      else this.fft.transform(out, input)
      return
    }
    const n = this.size / 3,
      sign = inverse ? -1 : 1
    for (let r = 0; r < 3; r++) {
      for (let i = 0; i < n; i++) {
        this.scratch[2 * i] = input[2 * (3 * i + r)]
        this.scratch[2 * i + 1] = sign * input[2 * (3 * i + r) + 1]
      }
      this.fft.transform(this.parts[r], this.scratch)
    }
    for (let k = 0; k < this.size; k++) {
      const j = 2 * (k % n)
      let re = this.parts[0][j],
        im = this.parts[0][j + 1]
      for (let r = 1; r < 3; r++) {
        const w = (k * r) % this.size,
          a = this.parts[r][j],
          b = this.parts[r][j + 1]
        re += a * this.cos[w] - b * this.sin[w]
        im += a * this.sin[w] + b * this.cos[w]
      }
      out[2 * k] = inverse ? re / this.size : re
      out[2 * k + 1] = inverse ? -im / this.size : im
    }
  }
}
const hop = 1024

export async function createSeparator(pack: KaraokePack, directory: string) {
  const sessions: ort.InferenceSession[] = []
  for (const file of pack.files) {
    sessions.push(
      await ort.InferenceSession.create(join(directory, file.name), {
        executionProviders: ['cpu'],
        intraOpNumThreads: Math.min(4, availableParallelism()),
        interOpNumThreads: 1,
        enableCpuMemArena: false
      })
    )
  }
  const mdx = pack.id === 'karaoke-duo'
  const size = mdx ? 6144 : 4096,
    bins = mdx ? 2048 : 1024,
    steps = mdx ? 256 : 512
  const pad = mdx ? size / 2 : size - hop
  const fft = new Fourier(size)
  const window = Float64Array.from(
    { length: size },
    (_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size)
  )

  return async (samples: Float32Array[]): Promise<SeparatedAudio> => {
    const length = samples[0].length,
      frames = Math.ceil((length + pad) / hop)
    if (frames > steps) throw Error('分离窗口过长')
    const input = new Float32Array((mdx ? 4 : 2) * steps * bins)
    const spectra: Float32Array[][] = [[], []]
    const time = new Float64Array(size * 2),
      spectrum = new Float64Array(size * 2)
    for (let c = 0; c < 2; c++) {
      for (let t = 0; t < frames; t++) {
        for (let i = 0; i < size; i++)
          time[2 * i] = (samples[c][t * hop + i - pad] || 0) * window[i]
        fft.transform(time, spectrum, false)
        spectra[c].push(Float32Array.from(spectrum.subarray(0, size + 2)))
        for (let f = 0; f < bins; f++) {
          if (mdx) {
            if (f < 3) continue
            input[(2 * c * bins + f) * steps + t] = spectrum[2 * f]
            input[((2 * c + 1) * bins + f) * steps + t] = spectrum[2 * f + 1]
          } else
            input[(c * steps + t) * bins + f] = Math.hypot(spectrum[2 * f], spectrum[2 * f + 1])
        }
      }
    }
    const tensor = new ort.Tensor('float32', input, mdx ? [1, 4, bins, steps] : [1, 2, steps, bins])
    const outputs: Float32Array[] = []
    for (const session of sessions) {
      const result = await session.run({ [session.inputNames[0]]: tensor })
      outputs.push(result[session.outputNames[0]].data as Float32Array)
    }
    const stems = pack.stems.map(() => [new Float32Array(length), new Float32Array(length)])
    const norm = new Float32Array(length)
    for (let t = 0; t < frames; t++) {
      const offset = t * hop - pad
      const lo = Math.max(0, -offset),
        hi = Math.min(size, length - offset)
      for (let i = lo; i < hi; i++) norm[offset + i] += window[i] ** 2
      for (let c = 0; c < 2; c++) {
        const original = spectra[c][t]
        if (!mdx) {
          // Joint softmax followed by Spleeter's squared ratio mask is softmax(2 * logits).
          for (let f = 0; f < bins; f++) {
            const j = (c * steps + t) * bins + f
            let max = -Infinity,
              sum = 0
            for (const values of outputs) max = Math.max(max, values[j])
            for (const values of outputs) {
              values[j] = Math.exp(2 * (values[j] - max))
              sum += values[j]
            }
            for (const values of outputs) values[j] /= sum
          }
        }
        for (let stem = 0; stem < outputs.length; stem++) {
          const values = outputs[stem],
            base = (c * steps + t) * bins
          let highMask = 0
          if (!mdx) {
            for (let f = 0; f < bins; f++) highMask += values[base + f]
            highMask /= bins
          }
          for (let f = 0; f <= size / 2; f++) {
            const mask = f < bins ? values[base + f] : highMask
            const re = mdx
              ? f < bins
                ? values[(2 * c * bins + f) * steps + t]
                : 0
              : original[2 * f] * mask
            const im = mdx
              ? f < bins
                ? values[((2 * c + 1) * bins + f) * steps + t]
                : 0
              : original[2 * f + 1] * mask
            spectrum[2 * f] = re
            spectrum[2 * f + 1] = im
            if (f > 0 && f < size / 2) {
              spectrum[2 * (size - f)] = re
              spectrum[2 * (size - f) + 1] = -im
            }
          }
          fft.transform(spectrum, time, true)
          for (let i = lo; i < hi; i++) stems[stem][c][offset + i] += time[2 * i] * window[i]
        }
      }
    }
    for (let c = 0; c < 2; c++)
      for (let i = 0; i < length; i++) {
        for (let stem = 0; stem < outputs.length; stem++) stems[stem][c][i] /= norm[i] || 1
        if (mdx) stems[1][c][i] = samples[c][i] - stems[0][c][i]
      }
    return { sampleRate: 44100, stems }
  }
}
