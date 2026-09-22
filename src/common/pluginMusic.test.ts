import { describe, expect, jest, test } from '@jest/globals'
import { exportBuiltinLyrics, parseLocalLyrics } from './localLyrics'
import { normalizeAppTrackRef, targetAppTrackRef } from './pluginMusic'
import { filterLyricInfo, sanitizeLyricText, toPlayerLyrics } from './pluginLyrics'

jest.mock('@shiqianjiang/ceru-plugin-sdk', () => ({
  assertLyricsDocument: () => undefined
}))

const track = {
  pluginId: 'test.plugin',
  providerId: 'test',
  kind: 'track',
  id: 'song'
}

describe('plugin lyric compatibility', () => {
  test('filters lyric credit lines like the 1.14.1 player', () => {
    const document = {
      format: 'crlyric',
      version: 1,
      lines: [
        { startTimeMs: 0, endTimeMs: 1000, text: '作词：测试' },
        { startTimeMs: 1000, endTimeMs: 2000, text: '普通歌词' },
        { startTimeMs: 2000, endTimeMs: 3000, text: 'OP: Ceru' }
      ]
    } as any
    expect(filterLyricInfo(document).lines.map((line: any) => line.text)).toEqual(['普通歌词'])
    expect(
      filterLyricInfo({ ...document, lines: [{ text: '你好：世界' }] } as any, true).lines
    ).toEqual([])
  })
  test('removes leaked QRC/YRC timing tokens from visible sidecar text', () => {
    expect(sanitizeLyricText('ying (24760,202)yin (24962,186)yi (25148,204)zoi (25352,360)')).toBe(
      'ying yin yi zoi'
    )
    expect(sanitizeLyricText('13010,1860')).toBe('')
    expect(sanitizeLyricText('13010,1860,0')).toBe('')
  })

  test('prefers clean structured alternatives while accepting legacy summaries', () => {
    const lines = toPlayerLyrics({
      format: 'crlyric',
      version: 1,
      track,
      offsetMs: 0,
      lines: [
        {
          startTimeMs: 1000,
          endTimeMs: 2000,
          text: '你好',
          translation: 'Hello (1000,500)world (1500,500)',
          romanization: 'ni (1000,500)hao (1500,500)',
          translations: [
            {
              language: 'en',
              text: 'Hello world',
              words: [
                { startTimeMs: 1000, endTimeMs: 1500, text: 'Hello ' },
                { startTimeMs: 1500, endTimeMs: 2000, text: 'world' }
              ]
            }
          ],
          words: [
            { startTimeMs: 1000, endTimeMs: 1500, text: '你' },
            { startTimeMs: 1500, endTimeMs: 2000, text: '好' }
          ]
        }
      ]
    } as any)

    expect(lines[0].translatedLyric).toBe('Hello world')
    expect(lines[0].romanLyric).toBe('ni hao')
  })

  test('drops malformed words and creates safe fallback timing for AMLL', () => {
    const lines = toPlayerLyrics({
      format: 'crlyric',
      version: 1,
      track,
      lines: [
        {
          startTimeMs: 1000,
          text: '安全歌词',
          words: [
            undefined,
            { text: '安全', startTimeMs: 1000, endTimeMs: 1400 },
            { text: '歌词', startTimeMs: 'invalid', endTimeMs: undefined }
          ]
        }
      ]
    } as any)

    expect(lines).toHaveLength(1)
    expect(lines[0].words).toEqual([
      { word: '安全', startTime: 1000, endTime: 1400 },
      { word: '歌词', startTime: 1400, endTime: 6000 }
    ])
    expect(lines[0].startTime).toBe(1000)
    expect(lines[0].endTime).toBe(6000)
  })

  test('passes source-aligned romanization to AMLL romanWord', () => {
    const lines = toPlayerLyrics({
      format: 'crlyric',
      version: 1,
      track,
      offsetMs: 0,
      lines: [
        {
          startTimeMs: 1000,
          endTimeMs: 2000,
          text: '你好',
          romanization: 'ni hao',
          words: [
            { startTimeMs: 1000, endTimeMs: 1500, text: '你', romanization: 'ni ' },
            { startTimeMs: 1500, endTimeMs: 2000, text: '好', romanization: 'hao' }
          ]
        }
      ]
    } as any)

    expect(lines[0].words.map((word) => word.romanWord)).toEqual(['ni', 'hao'])
    expect(lines[0].romanLyric).toBe('')
  })

  test('keeps timed TTML translations through parse and export', () => {
    const ttml =
      '<tt xmlns:itunes="http://music.apple.com/lyric-ttml-internal" xmlns:ttm="http://www.w3.org/ns/ttml#metadata" itunes:timing="Word" xmlns="http://www.w3.org/ns/ttml"><head><metadata><ttm:agent type="person" xml:id="v1"/><iTunesMetadata xmlns="http://music.apple.com/lyric-ttml-internal"><translations><translation xml:lang="en"><text for="L1"><span begin="1.000" end="1.400">hel</span><span begin="1.400" end="2.000">lo</span></text></translation></translations></iTunesMetadata></metadata></head><body dur="2.000"><div begin="1.000" end="2.000"><p begin="1.000" end="2.000" itunes:key="L1" ttm:agent="v1"><span begin="1.000" end="1.400">你</span><span begin="1.400" end="2.000">好</span></p></div></body></tt>'
    const parsed = parseLocalLyrics(ttml, track as any, 'ttml') as any

    expect(parsed.lines[0].translation).toBe('hello')
    expect(parsed.lines[0].translations[0].words).toEqual([
      { text: 'hel', startTimeMs: 1000, endTimeMs: 1400 },
      { text: 'lo', startTimeMs: 1400, endTimeMs: 2000 }
    ])

    const exported = exportBuiltinLyrics(parsed, 'ttml')!
    const roundtrip = parseLocalLyrics(exported.text, track as any, 'ttml') as any
    expect(roundtrip.lines[0].translations[0].words).toEqual(parsed.lines[0].translations[0].words)
  })
})

describe('public track routing', () => {
  test('removes discovery-plugin ownership from new and legacy Linglan songs', () => {
    expect(
      normalizeAppTrackRef({
        pluginId: 'local.linglan-source',
        providerId: 'wy',
        kind: 'track',
        id: '42',
        data: { song: { source: 'wy', songmid: '42' } }
      })
    ).toEqual({ providerId: 'wy', kind: 'track', id: '42', scope: 'provider' })

    expect(
      targetAppTrackRef(
        { providerId: 'wy', kind: 'track', id: '42', scope: 'provider' },
        'netease-account'
      )
    ).toEqual({
      pluginId: 'netease-account',
      providerId: 'wy',
      kind: 'track',
      id: '42',
      scope: 'provider'
    })
  })

  test('keeps private resources bound to their owner', () => {
    const privateRef = {
      pluginId: 'account-plugin',
      providerId: 'wy',
      connectionId: 'account-a',
      kind: 'track',
      id: 'private-42'
    }
    expect(normalizeAppTrackRef(privateRef)).toBe(privateRef)
  })
})
