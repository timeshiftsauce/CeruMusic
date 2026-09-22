import assert from 'node:assert/strict'
import { build } from 'esbuild'
import { resolve } from 'node:path'
const result = await build({
  entryPoints: ['src/renderer/src/components/Share/shareComments.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm',
  alias: { '@common': resolve('src/common') }
})
const { collectShareComments } = await import(
  'data:text/javascript;base64,' + Buffer.from(result.outputFiles[0].text).toString('base64')
)
const song = { source: 'wy', songmid: '42', name: '待分享歌曲' }
const comments = [
  {
    userName: '读者',
    text: '分享热评',
    likedCount: 12,
    avatar: 'https://example.com/avatar',
    timeStr: '昨天'
  }
]
const calls = []
const request = async (method, input) => {
  calls.push({ method, input })
  return { comments }
}
assert.deepEqual(await collectShareComments(song, {}, request), comments)
assert.equal(calls[0].method, 'getHotComment')
assert.equal(calls[0].input.songInfo.songmid, '42')
calls.length = 0
await collectShareComments(song, { song: { ...song, songmid: 42 }, comments }, request)
assert.equal(calls.length, 0, 'reuse comments only for the same complete song identity')
await collectShareComments(song, { song: { ...song, source: 'tx' }, comments }, request)
assert.equal(calls.length, 1, 'another platform with the same ID cannot supply share comments')
const privateSong = (connectionId) => ({
  ...song,
  pluginResource: { pluginId: 'library', providerId: 'wy', kind: 'track', id: '42', connectionId }
})
await collectShareComments(privateSong('a'), { song: privateSong('b'), comments }, request)
assert.equal(calls.at(-1).input.songInfo.pluginResource.connectionId, 'a')
assert.equal(
  (
    await collectShareComments(song, {}, async () => ({
      comments: [...Array(20)].map(() => comments[0])
    }))
  ).length,
  10
)
await assert.rejects(
  collectShareComments(song, {}, async () => {
    throw new Error('offline')
  }),
  /offline/
)
await assert.rejects(
  collectShareComments(song, {}, async () => ({ error: 'provider failed' })),
  /provider failed/
)
console.log(
  'Share comments: fetch, matching cache, cross-provider/private isolation, limit and error propagation passed'
)
