import { createServer } from 'node:http'

const port = 43130

function wav(frequency = 440, seconds = 4) {
  const sampleRate = 22050
  const samples = sampleRate * seconds
  const dataSize = samples * 2
  const buffer = Buffer.alloc(44 + dataSize)
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVEfmt ', 8)
  buffer.writeUInt32LE(16, 16)
  buffer.writeUInt16LE(1, 20)
  buffer.writeUInt16LE(1, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * 2, 28)
  buffer.writeUInt16LE(2, 32)
  buffer.writeUInt16LE(16, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  for (let index = 0; index < samples; index++) {
    const fade = Math.min(1, index / 1500, (samples - index) / 1500)
    const value = Math.sin((index / sampleRate) * Math.PI * 2 * frequency) * 0.16 * fade
    buffer.writeInt16LE(Math.round(value * 32767), 44 + index * 2)
  }
  return buffer
}

createServer((request, response) => {
  if (request.url?.startsWith('/audio/')) {
    const id = request.url.split('/').at(-1) ?? ''
    const frequency = 330 + ([...id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 330)
    const body = wav(frequency)
    response.writeHead(200, {
      'Content-Type': 'audio/wav',
      'Content-Length': body.length,
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'no-store',
    })
    response.end(body)
    return
  }
  response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
  response.end(JSON.stringify({ ok: true, service: 'ceru-account-native-tutorial' }))
}).listen(port, '127.0.0.1', () => {
  console.log(`Mock audio: http://127.0.0.1:${port}`)
})
