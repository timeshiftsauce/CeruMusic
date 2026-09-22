import {
  parseLrcLike,
  parseLqe,
  parseLyl,
  parseLys,
  parseQrc,
  parseYrc,
  decryptQrcHex,
  stringifyLrc,
  stringifySPL,
  stringifyEslrc,
  stringifyLqe,
  stringifyLyl,
  stringifyLys,
  stringifyQrc,
  stringifyYrc,
  type LyricLine
} from '@applemusic-like-lyrics/lyric'
import { TTMLParser, TTMLGenerator, toAmllLyrics, toTTMLResult } from '@applemusic-like-lyrics/ttml'
import { DOMParser, DOMImplementation, XMLSerializer } from '@xmldom/xmldom'
import { assertLyricsDocument, type CrLyric, type ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'
import { lyricFormats, normalizeLyricFormat } from './lyricFormats'
import { sanitizeLyricText, toPlayerLyrics } from './pluginLyrics'

const MAX_LENGTH = 2 * 1024 * 1024

/** Content takes precedence over extensions, including user-chosen sidecar extensions. */
export function detectLyricFormat(text: string): string {
  if (/<(?:[\w.-]+:)?tt(?:\s|>)/i.test(text)) return 'ttml'
  if (/\bLyricContent\s*=|<QrcInfos\b/i.test(text)) return 'qrc'
  if (/^\s*\[Lyricify Quick Export\]|^\s*\[lyrics:/im.test(text)) return 'lqe'
  if (/^\s*\[type:LyricifyLines\]/im.test(text)) return 'lyl'
  if (/^\s*\[\d+,\d+\].*<\d+,\d+,\d+>/m.test(text)) return 'krc'
  if (/^\s*\[\d+,\d+\].*\(\d+,\d+,\d+\)/m.test(text)) return 'yrc'
  if (/^\s*\[\d+,\d+\].*\(\d+,\d+\)/m.test(text)) return 'qrc'
  if (/^\s*\[[0-8]\].*\(\d+,\d+\)/m.test(text)) return 'lys'
  if (/^\s*\[\d+,\d+\]/m.test(text)) return 'lyl'
  if (/^\s*\[\d+:\d+(?:\.\d+)?\]/m.test(text)) return 'lrc'
  return 'auto'
}

const xmlParser = () =>
  new DOMParser({
    onError: (level, message) => {
      if (level !== 'warning') throw new Error(message)
    }
  })

function qrcContent(text: string): string {
  if (!/\bLyricContent\s*=/.test(text)) return text
  const xml = xmlParser().parseFromString(text, 'text/xml')
  const nodes = xml.getElementsByTagName('*')
  for (let i = 0; i < nodes.length; i++) {
    const content = nodes[i].getAttribute('LyricContent')
    if (content) return content
  }
  return ''
}

function toDocument(
  parsed: LyricLine[],
  track: ResourceRef,
  offsetMs: number,
  timedWords: boolean,
  structuredSources: any[] = []
): CrLyric | null {
  parsed = parsed
    .filter((line) => Number.isFinite(line.startTime) && line.words.some((w) => w.word.trim()))
    .sort((a, b) => a.startTime - b.startTime)
  if (!parsed.length) return null
  const nextStarts: (number | undefined)[] = []
  for (let i = parsed.length - 2; i >= 0; i--) {
    nextStarts[i] =
      parsed[i + 1].startTime > parsed[i].startTime ? parsed[i + 1].startTime : nextStarts[i + 1]
  }
  const lines: CrLyric['lines'] = parsed.map((line, index) => {
    const source = structuredSources[index]
    const alternatives = (values: any) =>
      Array.isArray(values)
        ? values
            .map((value: any) => {
              const text = sanitizeLyricText(value?.text)
              if (!text) return undefined
              const words = Array.isArray(value.words)
                ? value.words
                    .map((word: any) => ({
                      text: sanitizeLyricText(word.text) + (word.endsWithSpace ? ' ' : ''),
                      startTimeMs: word.startTime,
                      endTimeMs: word.endTime
                    }))
                    .filter((word: any) => word.text)
                : []
              return {
                ...(value.language ? { language: value.language } : {}),
                text,
                ...(words.length ? { words } : {})
              }
            })
            .filter((value): value is NonNullable<typeof value> => value !== undefined)
        : []
    const translations = alternatives(source?.translations)
    const romanizations = alternatives(source?.romanizations)
    const startTimeMs = Math.max(0, line.startTime)
    const end =
      Number.isFinite(line.endTime) && line.endTime > startTimeMs && line.endTime < 60039999
        ? line.endTime
        : (nextStarts[index] ?? startTimeMs + 5000)
    let previous = startTimeMs
    const words = line.words
      .filter((word) => word.word.length > 0)
      .map((word, wordIndex, source) => {
        const start = Math.max(
          previous,
          Number.isFinite(word.startTime) ? word.startTime : previous
        )
        previous = start
        const next = source[wordIndex + 1]?.startTime
        const finish =
          Number.isFinite(word.endTime) && word.endTime > start && word.endTime < 60039999
            ? word.endTime
            : Number.isFinite(next) && next > start
              ? next
              : Math.max(start + 1, end)
        return {
          text: word.word,
          startTimeMs: start,
          endTimeMs: Math.max(start, finish),
          ...(word.romanWord ? { romanization: word.romanWord } : {})
        }
      })
    return {
      startTimeMs,
      endTimeMs: Math.max(end, ...(timedWords ? words.map((word) => word.endTimeMs) : [])),
      text: words.map((word) => word.text).join(''),
      ...(timedWords ? { words } : {}),
      ...(sanitizeLyricText(line.translatedLyric || translations[0]?.text)
        ? { translation: sanitizeLyricText(line.translatedLyric || translations[0]?.text) }
        : {}),
      ...(sanitizeLyricText(line.romanLyric || romanizations[0]?.text)
        ? { romanization: sanitizeLyricText(line.romanLyric || romanizations[0]?.text) }
        : {}),
      ...(translations.length ? { translations } : {}),
      ...(romanizations.length ? { romanizations } : {}),
      isBackground: line.isBG,
      isDuet: line.isDuet
    }
  })
  const document: CrLyric = { format: 'crlyric', version: 1, track, offsetMs, lines }
  assertLyricsDocument(document)
  return document
}

/** Return null for unsupported text so plugin converters can handle it. */
export function parseLocalLyrics(text: string, track: ResourceRef, hint = 'auto'): CrLyric | null {
  if (text.length > MAX_LENGTH) throw new Error('歌词内容过大')
  let input = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
  if (!input) return null
  if (/<!DOCTYPE|<!ENTITY/i.test(input)) throw new Error('歌词 XML 不支持 DTD 或实体声明')
  if (hint === 'qrc' && /^(?:[0-9a-f]{2})+$/i.test(input)) input = decryptQrcHex(input)
  if (input.length > MAX_LENGTH) throw new Error('歌词内容过大')
  const detected = detectLyricFormat(input)
  const format = detected === 'auto' ? hint : detected
  let parsed: LyricLine[]
  let timedWords = true
  let structuredSources: any[] = []
  switch (format) {
    case 'lrc':
    case 'enhanced-lrc':
    case 'spl':
    case 'eslrc': {
      parsed = parseLrcLike(input).lines
      timedWords = /<\d+:\d+(?:\.\d+)?>|\]\s*[^\[\]\n]+\[\d+:\d+(?:\.\d+)?\]/.test(input)
      break
    }
    case 'ttml': {
      const result = TTMLParser.parse(input, { domParser: xmlParser() })
      parsed = toAmllLyrics(result).lines
      structuredSources = result.lines.flatMap((line: any) =>
        line.backgroundVocal ? [line, line.backgroundVocal] : [line]
      )
      break
    }
    case 'qrc':
      parsed = parseQrc(qrcContent(input))
      break
    case 'yrc':
      parsed = parseYrc(input)
      break
    case 'lys':
      parsed = parseLys(input)
      break
    case 'lyl':
      parsed = parseLyl(input)
      timedWords = false
      break
    case 'lqe':
      parsed = parseLqe(input)
      break
    default:
      return null
  }
  const offset = Number(input.match(/^\s*\[offset:([+-]?\d+)\]/im)?.[1] || 0)
  return toDocument(
    parsed,
    track,
    Number.isFinite(offset) ? offset : 0,
    timedWords,
    structuredSources
  )
}

/** Compatibility for callers explicitly expecting LRC only. */
export function parseLocalLrc(text: string, track: ResourceRef): CrLyric | null {
  return detectLyricFormat(text) === 'lrc' ? parseLocalLyrics(text, track) : null
}

export function exportBuiltinLyrics(document: CrLyric, requestedFormat?: string) {
  const format = normalizeLyricFormat(requestedFormat)
  if (!format) return null
  assertLyricsDocument(document)
  // Apply offsets exactly once; exported timestamps no longer need an offset tag.
  const lines = toPlayerLyrics(document)
  if (!lines.length) throw new Error('没有可导出的带时间歌词')
  let text: string
  switch (format) {
    case 'lrc':
      text = stringifyLrc(lines)
      break
    case 'enhanced-lrc':
      text = stringifySPL(lines)
      break
    case 'eslrc':
      text = stringifyEslrc(lines)
      break
    case 'ttml':
      text = TTMLGenerator.generate(toStructuredTtmlResult(document, lines), {
        domImplementation: new DOMImplementation(),
        xmlSerializer: new XMLSerializer()
      })
      break
    case 'qrc':
      text = stringifyQrc(lines)
      break
    case 'yrc':
      text = stringifyYrc(lines)
      break
    case 'lys':
      text = stringifyLys(lines)
      break
    case 'lyl':
      text = stringifyLyl(lines)
      break
    case 'lqe':
      text = stringifyLqe(lines)
      break
  }
  return {
    format,
    text,
    mime: 'text/plain' as const,
    extension: lyricFormats.find((item) => item.value === format)!.extension
  }
}

function toStructuredTtmlResult(
  document: CrLyric,
  lines: import('@applemusic-like-lyrics/core').LyricLine[]
) {
  const result: any = toTTMLResult(lines, [])
  const targets = result.lines.flatMap((line: any) =>
    line.backgroundVocal ? [line, line.backgroundVocal] : [line]
  )
  document.lines.forEach((line: any, index: number) => {
    const target = targets[index]
    if (!target) return
    if (Array.isArray(line.translations))
      target.translations = toTtmlAlternatives(line.translations)
    if (Array.isArray(line.romanizations))
      target.romanizations = toTtmlAlternatives(line.romanizations)
  })
  return result
}

function toTtmlAlternatives(values: any[]) {
  return values.map((value) => ({
    ...(value.language ? { language: value.language } : {}),
    text: sanitizeLyricText(value.text),
    ...(Array.isArray(value.words)
      ? {
          words: value.words.map((word: any) => ({
            text: word.text,
            startTime: word.startTimeMs,
            endTime: word.endTimeMs
          }))
        }
      : {})
  }))
}
