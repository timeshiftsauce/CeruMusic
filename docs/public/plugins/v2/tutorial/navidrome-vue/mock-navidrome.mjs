import { createHash } from 'node:crypto'
import { createServer } from 'node:http'

const port = 4533
const username = 'demo'
const password = 'demo'
const songs = [
  { id: 'nd-morning', title: 'Morning Light', artist: 'Ceru Tutorial', album: 'My Server', duration: 2 },
  { id: 'nd-rain', title: 'Rainy Afternoon', artist: 'Ceru Tutorial', album: 'My Server', duration: 2 },
]

function wave() {
  const rate = 8000
  const samples = rate * 2
  const out = Buffer.alloc(44 + samples * 2)
  out.write('RIFF', 0)
  out.writeUInt32LE(36 + samples * 2, 4)
  out.write('WAVEfmt ', 8)
  out.writeUInt32LE(16, 16)
  out.writeUInt16LE(1, 20)
  out.writeUInt16LE(1, 22)
  out.writeUInt32LE(rate, 24)
  out.writeUInt32LE(rate * 2, 28)
  out.writeUInt16LE(2, 32)
  out.writeUInt16LE(16, 34)
  out.write('data', 36)
  out.writeUInt32LE(samples * 2, 40)
  for (let i = 0; i < samples; i++) {
    const sample = Math.sin((i / rate) * Math.PI * 2 * 392) * 0.1
    out.writeInt16LE(Math.round(sample * 32767), 44 + i * 2)
  }
  return out
}

const audio = wave()
const send = (response, payload, status = 200) => {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ 'subsonic-response': payload }))
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? '/', `http://127.0.0.1:${port}`)
  const salt = url.searchParams.get('s') ?? ''
  const expected = createHash('md5').update(password + salt).digest('hex')
  if (url.searchParams.get('u') !== username || url.searchParams.get('t') !== expected) {
    return send(response, { status: 'failed', error: { code: 40, message: 'Wrong username or password' } })
  }
  const endpoint = /^\/rest\/([a-zA-Z0-9]+)\.view$/.exec(url.pathname)?.[1]
  if (endpoint === 'ping') {
    return send(response, { status: 'ok', type: 'navidrome', serverVersion: '0.54.5-mock' })
  }
  if (endpoint === 'search3') {
    const query = (url.searchParams.get('query') ?? '').toLocaleLowerCase()
    const offset = Number(url.searchParams.get('songOffset')) || 0
    const count = Number(url.searchParams.get('songCount')) || 20
    const matched = songs.filter((song) =>
      `${song.title} ${song.artist}`.toLocaleLowerCase().includes(query),
    )
    return send(response, {
      status: 'ok',
      searchResult3: { song: matched.slice(offset, offset + count) },
    })
  }
  if (endpoint === 'getLyricsBySongId') {
    return send(response, {
      status: 'ok',
      lyricsList: {
        structuredLyrics: [
          {
            synced: true,
            offset: 0,
            line: [
              { start: 0, value: 'Navidrome 教程版' },
              { start: 1000, value: '歌词来自 OpenSubsonic 接口' },
            ],
          },
        ],
      },
    })
  }
  if (endpoint === 'stream' && songs.some((song) => song.id === url.searchParams.get('id'))) {
    response.writeHead(200, { 'content-type': 'audio/wav', 'content-length': String(audio.length) })
    return response.end(audio)
  }
  return send(response, { status: 'failed', error: { code: 70, message: 'Unknown endpoint' } })
})

server.listen(port, '127.0.0.1', () => {
  console.log(`Mock Navidrome: http://127.0.0.1:${port}`)
  console.log('Username: demo  Password: demo')
  console.log('Press Ctrl+C to stop')
})
