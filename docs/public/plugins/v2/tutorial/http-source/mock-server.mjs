import { createServer } from 'node:http'

const port = 43120
const tracks = [
  {
    id: 'morning',
    title: 'Morning Light',
    artist: 'Ceru Tutorial',
    album: 'First Source',
    durationMs: 2200,
    qualities: ['lossless'],
  },
  {
    id: 'rain',
    title: 'Rainy Afternoon',
    artist: 'Ceru Tutorial',
    album: 'First Source',
    durationMs: 2200,
    qualities: ['lossless'],
  },
  {
    id: 'night',
    title: 'Night Walk',
    artist: 'Ceru Tutorial',
    album: 'First Source',
    durationMs: 2200,
    qualities: ['lossless'],
  },
]

function wave() {
  const sampleRate = 8000
  const seconds = 2.2
  const samples = Math.floor(sampleRate * seconds)
  const dataSize = samples * 2
  const out = Buffer.alloc(44 + dataSize)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + dataSize, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(sampleRate, 24)
  out.writeUInt32LE(sampleRate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(dataSize, 40)
  for (let i = 0; i < samples; i++) {
    const fade = Math.min(1, i / 400, (samples - i) / 400)
    const sample = Math.sin((i / sampleRate) * Math.PI * 2 * 440) * 0.12 * fade
    out.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }
  return out
}

const audio = wave()
const json = (response, status, value) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify(value))
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  if (url.pathname === '/v1/health') return json(response, 200, { ok: true, tracks: tracks.length })
  if (url.pathname === '/v1/tracks') {
    const query = (url.searchParams.get('q') ?? '').toLocaleLowerCase()
    const offset = Math.max(0, Number(url.searchParams.get('offset')) || 0)
    const limit = Math.max(1, Math.min(50, Number(url.searchParams.get('limit')) || 20))
    const matches = tracks.filter((track) =>
      `${track.title} ${track.artist} ${track.album}`.toLocaleLowerCase().includes(query),
    )
    const items = matches.slice(offset, offset + limit)
    const nextOffset = offset + items.length < matches.length ? offset + items.length : undefined
    return json(response, 200, { items, nextOffset })
  }
  const match = /^\/v1\/tracks\/([^/]+)\/(stream|lyrics)$/.exec(url.pathname)
  const track = match && tracks.find((item) => item.id === decodeURIComponent(match[1]))
  if (!match || !track) return json(response, 404, { message: 'track not found' })
  if (match[2] === 'stream') {
    response.writeHead(200, {
      'content-type': 'audio/wav',
      'content-length': String(audio.length),
      'cache-control': 'no-store',
    })
    return response.end(audio)
  }
  return json(response, 200, {
    offsetMs: 0,
    lines: [
      { startTimeMs: 0, endTimeMs: 900, text: track.title },
      { startTimeMs: 1000, endTimeMs: 2100, text: '这是本机模拟服务返回的歌词' },
    ],
  })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock music API: http://127.0.0.1:${port}/v1/health`)
  console.log('Press Ctrl+C to stop')
})
