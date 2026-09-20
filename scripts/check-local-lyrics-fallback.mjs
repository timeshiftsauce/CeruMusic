import assert from 'node:assert/strict'
import { mkdtemp, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { build } from 'esbuild'

const output = await build({
  entryPoints: ['src/main/services/localLyrics.ts'],
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm'
})
const { resolveLocalLyrics } = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
)
const root = await mkdtemp(join(tmpdir(), 'ceru-local-lyrics-'))
const track = { pluginId: 'local.library', providerId: 'local', kind: 'track', id: 'test' }
const audioPath = join(root, '演员-薛之谦.flac')
const base = { audioPath, track, embedded: '', converters: [] }
const doc = (text) => ({
  format: 'crlyric',
  version: 1,
  track,
  offsetMs: 0,
  lines: [{ startTimeMs: 0, endTimeMs: 1000, text }]
})
try {
  await writeFile(audioPath, 'fixture')
  await writeFile(join(root, '演员-薛之谦.lrc'), '[00:01.00]外部歌词\n[00:02.00]下一行')
  assert.equal(
    (await resolveLocalLyrics({ ...base, embedded: '[00:01.00]内嵌优先' })).lines[0].text,
    '内嵌优先'
  )
  assert.equal((await resolveLocalLyrics(base)).lines[0].text, '外部歌词')
  assert.equal(
    (await resolveLocalLyrics({ ...base, embedded: '<tt>无法解析</tt>' })).lines[0].text,
    '外部歌词'
  )
  const words = await resolveLocalLyrics({
    ...base,
    embedded: '[00:01.00]<00:01.00>演<00:01.50>员<00:02.00>'
  })
  assert.ok(words.lines[0].words.length >= 2, 'built-in enhanced LRC needs no plugin')
  const square = await resolveLocalLyrics({
    ...base,
    embedded: '[00:01.00]演[00:01.50]员[00:02.00]'
  })
  assert.ok(square.lines[0].words.length >= 2, 'square-bracket word timing supported')
  await writeFile(join(root, '演员-薛之谦.lrc'), 'not a lyric')
  await writeFile(join(root, '演员-薛之谦.ttml'), '<tt><body>external</body></tt>')
  const calls = []
  const converter = {
    formats: ['ttml'],
    parse: async (input) => {
      calls.push(input)
      if (input.text.includes('broken')) throw Error('malformed TTML')
      return doc(input.text.includes('external') ? '外部 TTML' : '内嵌 TTML')
    }
  }
  assert.equal(
    (await resolveLocalLyrics({ ...base, embedded: '<tt>embedded</tt>', converters: [converter] }))
      .lines[0].text,
    '内嵌 TTML'
  )
  assert.equal(
    (await resolveLocalLyrics({ ...base, embedded: '<tt>broken</tt>', converters: [converter] }))
      .lines[0].text,
    '外部 TTML'
  )
  assert.ok(calls.every((call) => call.format === 'ttml' && !('path' in call)))
  assert.equal(
    await resolveLocalLyrics({ ...base, embedded: '<tt>embedded</tt>' }),
    null,
    'TTML not parsed without plugin'
  )
  const empty = { formats: ['ttml'], parse: async () => ({ ...doc(''), lines: [] }) }
  const unrelated = {
    formats: ['qrc'],
    parse: async () => {
      throw Error('wrong converter')
    }
  }
  assert.equal(
    (await resolveLocalLyrics({ ...base, converters: [unrelated, empty, converter] })).lines[0]
      .text,
    '外部 TTML'
  )
  await rm(join(root, '演员-薛之谦.ttml'))
  await writeFile(join(root, '演员-薛之谦.LRC'), Buffer.from('\ufeff[00:01.00]编码歌词', 'utf16le'))
  assert.equal((await resolveLocalLyrics(base)).lines[0].text, '编码歌词')
  await rm(join(root, '演员-薛之谦.LRC'))
  await writeFile(join(root, '其他歌曲.lrc'), '[00:01.00]不能串歌')
  assert.equal(await resolveLocalLyrics(base), null, 'only exact same basename is eligible')
  await writeFile(join(root, '演员-薛之谦.lrc'), '[00:01.00]'.repeat(300000))
  assert.equal(await resolveLocalLyrics(base), null, 'oversize lyrics are skipped')
  console.log(
    'PASS: embedded priority, same-name fallback, both word-LRC variants, format-routed plugins, malformed/empty fallback, UTF-16, size limits and no-plugin TTML'
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
