import assert from 'node:assert/strict'
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { build } from 'esbuild'

const require = createRequire(import.meta.url)
const output = await build({
  stdin: {
    contents: `export * from './src/common/localLyrics'; export * from './src/common/lyricFormats'; export * from './src/common/pluginMusic'; export * from './src/main/services/localLyrics'`,
    resolveDir: process.cwd(),
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'esm'
})
const api = await import(
  'data:text/javascript;base64,' + Buffer.from(output.outputFiles[0].text).toString('base64')
)
const track = { pluginId: 'local.library', providerId: 'local', kind: 'track', id: 'test' }
const document = {
  format: 'crlyric',
  version: 1,
  track,
  offsetMs: 100,
  lines: [
    {
      startTimeMs: 1000,
      endTimeMs: 2000,
      text: '你好',
      words: [
        { text: '你', startTimeMs: 1000, endTimeMs: 1500 },
        { text: '好', startTimeMs: 1500, endTimeMs: 2000 }
      ]
    },
    {
      startTimeMs: 3000,
      endTimeMs: 4000,
      text: '世界',
      words: [
        { text: '世', startTimeMs: 3000, endTimeMs: 3500 },
        { text: '界', startTimeMs: 3500, endTimeMs: 4000 }
      ]
    }
  ]
}
const root = await mkdtemp(join(tmpdir(), 'ceru-lyric-formats-'))
const audioPath = join(root, 'sample.mp3')
const base = { audioPath, embedded: '', track, converters: [] }
const taglib = require('node-taglib-sharp')
const workerSource = await readFile('src/main/workers/downloadWorker.ts', 'utf8')
const workerOutput = await build({
  stdin: {
    contents: workerSource + '\nexport { processSongFiles }',
    resolveDir: resolve('src/main/workers'),
    loader: 'ts'
  },
  bundle: true,
  write: false,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  alias: { '@common': resolve('src/common') }
})
const Module = require('node:module')
const mod = new Module(resolve('scripts/.lyric-worker-check.cjs'))
mod.filename = resolve('scripts/.lyric-worker-check.cjs')
mod.paths = Module._nodeModulePaths(resolve('scripts'))
mod._compile(workerOutput.outputFiles[0].text, mod.filename)
async function makeAudio() {
  const frame = Buffer.alloc(417)
  frame.set([255, 251, 144, 100])
  await writeFile(audioPath, Buffer.concat(Array.from({ length: 200 }, () => frame)))
}
function readEmbedded() {
  const file = taglib.File.createFromPath(audioPath)
  try {
    return file.tag.lyrics
  } finally {
    file.dispose()
  }
}
try {
  for (const { value: format, extension } of api.lyricFormats) {
    const exported = api.exportBuiltinLyrics(document, format)
    assert.equal(exported.extension, extension)
    const parsed = api.parseLocalLyrics(exported.text, track)
    assert.ok(parsed, format + ': auto detection')
    assert.deepEqual(
      parsed.lines.map((line) => line.text),
      ['你好', '世界'],
      format + ': text'
    )
    assert.deepEqual(
      parsed.lines.map((line) => line.startTimeMs),
      [1100, 3100],
      format + ': offset applied once'
    )
    if (!['lrc', 'lyl'].includes(format))
      assert.equal(parsed.lines[0].words.length, 2, format + ': word timing')
    assert.equal(
      (await api.resolveLocalLyrics({ ...base, embedded: exported.text })).lines[0].text,
      '你好',
      format + ': embedded without plugin'
    )
    for (const suffix of [extension, 'customlyrics']) {
      const sidecar = join(root, 'sample.' + suffix)
      await writeFile(sidecar, exported.text)
      assert.equal(
        (await api.resolveLocalLyrics(base)).lines[0].text,
        '你好',
        format + ': sidecar ' + suffix
      )
      await rm(sidecar)
    }
    await makeAudio()
    await mod.exports.processSongFiles(
      audioPath,
      { name: 'Test', lrc: api.exportBuiltinLyrics(document, 'ttml').text },
      { lyrics: true, downloadLyrics: true, lyricFormat: format }
    )
    assert.equal(readEmbedded(), exported.text, format + ': worker converts existing lyrics')
    assert.equal(
      await readFile(join(root, 'sample.' + extension), 'utf8'),
      exported.text,
      format + ': extension'
    )
    await rm(join(root, 'sample.' + extension))
    console.log(
      'PASS: ' + format + ' parse/export, embedded/sidecar detection and real audio tag roundtrip'
    )
  }
  const rich = structuredClone(document)
  rich.lines[0].translation = 'Hello'
  rich.lines[0].romanization = 'Ni hao'
  rich.lines[1].isDuet = true
  const richParsed = api.parseLocalLyrics(api.exportBuiltinLyrics(rich, 'ttml').text, track)
  assert.equal(richParsed.lines[0].translation, 'Hello')
  assert.equal(richParsed.lines[0].romanization, 'Ni hao')
  assert.equal(richParsed.lines[1].isDuet, true)
  await makeAudio()
  const ttml = api.exportBuiltinLyrics(document, 'ttml').text
  await mod.exports.processSongFiles(
    audioPath,
    { lrc: ttml, lyricExportFormat: 'ttml' },
    {
      lyrics: true,
      downloadLyrics: true,
      lyricFormat: 'ttml',
      lyricExtensionMode: 'custom',
      lyricExtension: '.lrc'
    }
  )
  assert.equal(await readFile(join(root, 'sample.lrc'), 'utf8'), ttml)
  assert.equal(
    (await api.resolveLocalLyrics(base)).lines[0].text,
    '你好',
    'content beats forced lrc extension'
  )
  assert.equal(api.lyricFileExtension({ lyricFormat: 'word-by-word' }), 'lrc', 'legacy preference')
  for (const suffix of ['../mp3', 'mp3', 'png', '', 'a/b', 'x\\y', 'x:stream', 'a.b']) {
    assert.throws(
      () => api.lyricFileExtension({ lyricExtensionMode: 'custom', lyricExtension: suffix }),
      suffix
    )
  }
  const before = await readFile(audioPath)
  await mod.exports.processSongFiles(
    audioPath,
    { lrc: ttml, lyricExportFormat: 'ttml' },
    {
      lyrics: false,
      downloadLyrics: true,
      lyricFormat: 'ttml',
      lyricExtensionMode: 'custom',
      lyricExtension: 'mp3'
    }
  )
  assert.ok(
    (await readFile(audioPath)).length >= before.length,
    'invalid extension cannot replace audio with lyrics'
  )
  assert.ok(readEmbedded().includes('<tt'), 'existing tag remains intact')
  await rm(join(root, 'sample.lrc'))
  await writeFile(join(root, 'sample.other.lrc'), '[00:01.00]Wrong song')
  assert.equal(await api.resolveLocalLyrics(base), null, 'same-name only')
  let called = 0
  const converter = {
    formats: ['krc'],
    parse: async (request) => {
      called++
      assert.equal(request.format, 'krc')
      return document
    }
  }
  const krc = '[1000,1000]<0,500,0>你<500,500,0>好'
  assert.equal(
    (await api.resolveLocalLyrics({ ...base, embedded: krc, converters: [converter] })).lines[0]
      .text,
    '你好'
  )
  assert.equal(called, 1, 'unsupported format uses plugin')
  let builtinFallbackCalls = 0
  const builtinResult = await api.resolveLocalLyrics({
    ...base,
    embedded: ttml,
    converters: [
      {
        formats: ['auto'],
        parse: async () => {
          builtinFallbackCalls++
          throw Error('must not call')
        }
      }
    ]
  })
  assert.equal(builtinFallbackCalls, 0, 'recognized built-in formats never need a plugin')
  assert.equal(builtinResult.lines[0].text, '你好')
  const qrc = api.exportBuiltinLyrics(document, 'qrc').text
  const wrappedQrc = `<QrcInfos><LyricInfo><Lyric_1 LyricContent="${qrc.replaceAll('\n', '&#10;')}" /></LyricInfo></QrcInfos>`
  assert.deepEqual(
    api.parseLocalLyrics(wrappedQrc, track).lines.map((line) => line.text),
    ['你好', '世界']
  )
  const repaired = api.parseLocalLyrics(
    '[offset:-100]\n[00:01.000]<00:00.990>你<00:01.500>好\n[00:03.00]<00:03.00>世界',
    track
  )
  assert.equal(repaired.lines[0].words[0].startTimeMs, 1000)
  assert.ok(repaired.lines[1].words[0].endTimeMs > 3000)
  assert.equal(api.toPlayerLyrics(repaired)[0].startTime, 900)
  assert.deepEqual(
    api.parseLocalLyrics('[00:01.00][00:03.00]副歌', track).lines.map((line) => line.startTimeMs),
    [1000, 3000]
  )
  assert.throws(() => api.parseLocalLyrics('<!DOCTYPE tt><tt/>', track), /DTD/)
  console.log(
    'PASS: TTML translations/romanization/duet, legacy settings, forced/custom suffix, path/overwrite protection, plugin fallback, same-name isolation'
  )
} finally {
  await rm(root, { recursive: true, force: true })
}
