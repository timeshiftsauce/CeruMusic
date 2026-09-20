import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { runInNewContext } from 'node:vm'
import { build } from 'esbuild'
import { effectScope, ref, nextTick } from 'vue'

const require = createRequire(import.meta.url)
const calls = []
let fetchList = async () => ({ list: [{ img: 'first-song.jpg' }] })
const result = await build({
  entryPoints: [
    'src/renderer/src/components/community/usePostAttachmentCover.ts',
    'src/renderer/src/components/community/noteCoverTheme.ts'
  ],
  outdir: 'unused',
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  plugins: [
    {
      name: 'api',
      setup(b) {
        b.onResolve({ filter: /^@renderer\/api\/cloudSongList$/ }, () => ({
          path: 'api',
          namespace: 'mock'
        }))
        b.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({
          contents:
            'export const cloudSongListAPI={getSongListDetail:(...args)=>fixture.fetch(...args)}'
        }))
      }
    }
  ]
})
const modules = result.outputFiles.map((file) => {
  const module = { exports: {} }
  runInNewContext(file.text, {
    require,
    module,
    exports: module.exports,
    fixture: {
      fetch: (...args) => {
        calls.push(args)
        return fetchList(...args)
      }
    }
  })
  return module.exports
})
const { usePostAttachmentCover } = modules.find((m) => m.usePostAttachmentCover)
const { noteCoverTheme, noteCoverLayout } = modules.find((m) => m.noteCoverTheme)
const scope = effectScope()
const post = ref({ id: 'one', images: [], attachment: { type: 'song', song: { img: 'song.jpg' } } })
const enabled = ref(true)
const cover = scope.run(() =>
  usePostAttachmentCover(
    () => post.value,
    () => enabled.value
  )
)
const flush = async () => {
  for (let i = 0; i < 8; i++) await nextTick()
}
try {
  assert.equal(cover.cover.value, 'song.jpg')
  post.value = {
    id: 'two',
    images: [],
    attachment: {
      type: 'playlist',
      cover: 'playlist.jpg',
      preview: [{ img: 'preview.jpg' }],
      listId: 'list'
    }
  }
  await flush()
  assert.equal(cover.cover.value, 'playlist.jpg')
  cover.onCoverError('playlist.jpg')
  await flush()
  assert.equal(cover.cover.value, 'preview.jpg')
  assert.equal(calls.length, 0)
  cover.onCoverError('preview.jpg')
  await flush()
  assert.equal(cover.cover.value, 'first-song.jpg')
  assert.deepEqual(calls[0], ['list', 'asc', 1])
  cover.onCoverError('first-song.jpg')
  await flush()
  assert.equal(cover.cover.value, '')
  assert.equal(calls.length, 1, 'no retry loop when all images fail')
  let finish
  fetchList = () =>
    new Promise((resolve) => {
      finish = resolve
    })
  post.value = { id: 'three', images: [], attachment: { type: 'playlist', listId: 'slow' } }
  await flush()
  post.value = { id: 'four', images: [], attachment: { type: 'song', song: { img: 'new.jpg' } } }
  await flush()
  finish({ list: [{ img: 'stale.jpg' }] })
  await flush()
  assert.equal(cover.cover.value, 'new.jpg')
  enabled.value = false
  await flush()
  assert.equal(cover.cover.value, '')
  fetchList = async () => {
    throw Error('unavailable')
  }
  post.value = { id: 'five', images: [], attachment: { type: 'playlist', listId: 'missing' } }
  enabled.value = true
  await flush()
  assert.equal(cover.cover.value, '')
  console.log(
    'PASS: song cover, playlist cover failure, first-track fallback, no retry loop, stale request isolation, unavailable playlist'
  )
  assert.equal(noteCoverLayout('fixed-id'), noteCoverLayout('fixed-id'))
  assert.deepEqual(noteCoverTheme('fixed-id'), noteCoverTheme('fixed-id'))
  const seeds = Array.from({ length: 100 }, (_, i) => `note-${i}`)
  assert.equal(new Set(seeds.map(noteCoverLayout)).size, 4)
  assert.equal(new Set(seeds.map((seed) => noteCoverTheme(seed)['--note-paper'])).size, 6)
  const fonts = new Set(seeds.map((seed) => noteCoverTheme(seed)['--note-font']))
  assert.equal(fonts.size, 9)
  assert.ok(fonts.has('"lyricfont"'))
  assert.ok(fonts.has('"PingFangSC-Semibold"'))
  for (const layout of ['journal', 'letter', 'quote', 'postcard']) {
    assert.ok(
      new Set(
        seeds
          .filter((seed) => noteCoverLayout(seed) === layout)
          .map((seed) => noteCoverTheme(seed)['--note-font'])
      ).size > 1
    )
  }
  console.log('PASS: deterministic seed with four layouts, six palettes and nine independent fonts')
} finally {
  scope.stop()
}
