import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { unstable_dev, type Unstable_DevWorker } from 'wrangler'

let worker: Unstable_DevWorker

before(async () => {
  worker = await unstable_dev('src/worker.ts', {
    config: 'wrangler.toml',
    experimental: { disableExperimentalWarning: true },
    logLevel: 'warn'
  })
})

after(async () => {
  await worker?.stop()
})

async function get(path: string, init?: { redirect?: 'manual' | 'follow' }) {
  return worker.fetch(path, init as any)
}

test('GET / returns service info with latest tag', async () => {
  const res = await get('/')
  assert.equal(res.status, 200)
  const json = (await res.json()) as any
  assert.equal(json.service, 'ceru-update-server')
  assert.equal(json.runtime, 'cloudflare-workers')
  assert.match(json.repo, /\//)
  assert.ok(json.latest?.tag, 'should have latest.tag')
  console.log('  latest tag:', json.latest.tag)
  console.log('  assets:', json.latest.assets.length)
})

test('GET /latest.yml returns YAML for Windows', async () => {
  const res = await get('/latest.yml')
  if (res.status === 404) {
    console.log('  skipped: latest.yml not yet in release')
    return
  }
  assert.equal(res.status, 200)
  assert.match(res.headers.get('content-type') || '', /yaml/)
  const body = await res.text()
  assert.match(body, /version:/)
  assert.match(body, /files:/)
  console.log('  size:', body.length, 'bytes')
})

test('GET /latest-mac.yml returns YAML', async () => {
  const res = await get('/latest-mac.yml')
  if (res.status === 404) {
    console.log('  skipped: latest-mac.yml not yet in release')
    return
  }
  assert.equal(res.status, 200)
  const body = await res.text()
  assert.match(body, /version:/)
  console.log('  size:', body.length, 'bytes')
})

test('GET /latest-linux.yml returns YAML', async () => {
  const res = await get('/latest-linux.yml')
  if (res.status === 404) {
    console.log('  skipped: latest-linux.yml not yet in release')
    return
  }
  assert.equal(res.status, 200)
})

test('GET /<file>.dmg returns 302 to github.com', async () => {
  const res = await get('/ceru-music-1.10.1-x64.dmg', { redirect: 'manual' })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.match(loc, /^https:\/\/github\.com\//)
  assert.match(loc, /releases\/download\//)
  console.log('  →', loc)
})

test('GET /<file>.blockmap returns 302', async () => {
  const res = await get('/ceru-music-1.10.1-x64.dmg.blockmap', { redirect: 'manual' })
  assert.equal(res.status, 302)
  const loc = res.headers.get('location') || ''
  assert.match(loc, /\.blockmap$/)
})

test('GET /update/win32/0.0.1 returns Hazel JSON for older version', async () => {
  const res = await get('/update/win32/0.0.1')
  assert.equal(res.status, 200)
  const json = (await res.json()) as any
  assert.ok(json.url)
  assert.ok(json.name)
  assert.match(json.url, /^https:\/\//)
  console.log('  url:', json.url)
  console.log('  name:', json.name)
})

test('GET /update/win32/9.99.99 returns 204 when client is newer', async () => {
  const res = await get('/update/win32/9.99.99')
  assert.equal(res.status, 204)
})

test('GET /update/darwin/0.0.1 returns dmg url', async () => {
  const res = await get('/update/darwin/0.0.1')
  assert.equal(res.status, 200)
  const json = (await res.json()) as any
  assert.match(json.url, /\.dmg$/)
})

test('GET /update/badplatform/1.0.0 returns 400', async () => {
  const res = await get('/update/wtf/1.0.0')
  assert.equal(res.status, 400)
})

test('GET /<file>.dmg with embedded slash rejected by router (404)', async () => {
  // 多段路径不会落到 asset 处理(只匹配单段)
  const res = await get('/foo/bar.dmg', { redirect: 'manual' })
  assert.equal(res.status, 404)
})

test('GET /random.txt (unknown ext) returns 404', async () => {
  const res = await get('/something.txt')
  assert.equal(res.status, 404)
})
