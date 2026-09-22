import type { CrLyric } from '@shiqianjiang/ceru-plugin-sdk'

const LYRIC_INFO_KEYS = [
  '作曲',
  '作词',
  '编曲',
  '制作人',
  '专辑',
  '时间',
  '时长',
  '发行',
  'OP',
  'SP',
  '词',
  '曲',
  '吉他',
  '贝斯',
  '录音',
  '混音',
  '出品',
  '演唱',
  '和声',
  '弦乐',
  '企划',
  '录音室',
  '鼓',
  '弦乐部分'
]

function lyricLineText(line: any): string {
  const values: string[] = []
  const add = (value: unknown) => {
    if (typeof value === 'string' && value.trim()) values.push(value)
  }
  add(line?.text)
  add(line?.translation)
  add(line?.romanization)
  for (const word of Array.isArray(line?.words) ? line.words : []) {
    add(word?.text)
    add(word?.translation)
    add(word?.romanization)
  }
  for (const field of ['translations', 'romanizations']) {
    for (const item of Array.isArray(line?.[field]) ? line[field] : []) add(item?.text)
  }
  return values.join(' ')
}

/**
 * Applies the legacy 1.14.1 lyric-credit filter to the structured plugin document.
 * The old filter operated on text fields; keeping it at this boundary makes it work
 * for every v2 provider while preserving timing, translations and word metadata.
 */
export function filterLyricInfo(document: CrLyric, strict = false): CrLyric {
  if (!document || !Array.isArray((document as any).lines)) return document
  const keyPattern = LYRIC_INFO_KEYS.map((key) => key.split('').join('.*')).join('|')
  const infoPattern = new RegExp(`(?:${keyPattern})[^\\n]*[:：]`, 'i')
  const lines = (document as any).lines.filter((line: any) => {
    const text = lyricLineText(line)
    // Match the old implementation: timestamps/brackets were ignored before checking
    // whether a line contained a colon in strict mode.
    const withoutTimestamp = text.replace(/\[[^\]]*\]/g, '').trim()
    return strict
      ? !withoutTimestamp.includes(':') && !withoutTimestamp.includes('：')
      : !infoPattern.test(text)
  })
  return lines.length === (document as any).lines.length ? document : { ...document, lines }
}

/** Legacy plugins occasionally leak QRC/YRC timing tokens into sidecar text. */
export function sanitizeLyricText(value: unknown): string {
  return (
    String(value ?? '')
      .replace(/\(\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*\)/g, '')
      .replace(/<\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*>/g, '')
      .replace(/^\s*\[\d+\s*,\s*\d+\]\s*/, '')
      // Some legacy QRC sidecars leak a bare word timing token as the whole
      // secondary line, e.g. `13010,1860`. It is metadata, never visible text.
      .replace(/^\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*$/, '')
      .trim()
  )
}

function sanitizeLyricWord(value: unknown): string {
  return String(value ?? '')
    .replace(/\(\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*\)/g, '')
    .replace(/<\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*>/g, '')
    .replace(/^\s*\[\d+\s*,\s*\d+\]\s*/, '')
    .replace(/^\s*-?\d+\s*,\s*-?\d+(?:\s*,\s*-?\d+)?\s*$/, '')
}

function firstLyricAlternative(line: any, field: 'translations' | 'romanizations') {
  const item = Array.isArray(line?.[field]) ? line[field][0] : undefined
  return item && typeof item === 'object' ? item : undefined
}

function timedAlternativeText(line: any, field: 'translation' | 'romanization') {
  const values = Array.isArray(line?.words)
    ? line.words.map((word: any) => sanitizeLyricText(word?.[field])).filter(Boolean)
    : []
  return values.join('')
}

export function toPlayerLyrics(
  document: CrLyric
): import('@applemusic-like-lyrics/core').LyricLine[] {
  const offset = Number(document.offsetMs) || 0
  const sourceLines = Array.isArray(document?.lines) ? document.lines : []
  return sourceLines
    .filter((line: any) => line && typeof line === 'object')
    .map((line: any, index: number) => {
      const rawWords = Array.isArray(line.words) ? line.words : []
      const nextLine = sourceLines[index + 1]
      const firstWordStart = rawWords
        .map((word: any) => Number(word?.startTimeMs))
        .find((value: number) => Number.isFinite(value))
      const rawStart = Number(line.startTimeMs)
      const startTimeMs = Number.isFinite(rawStart)
        ? Math.max(0, rawStart)
        : Math.max(0, firstWordStart ?? 0)
      const rawEnd = Number(line.endTimeMs)
      const nextStart = Number(nextLine?.startTimeMs)
      const end =
        Number.isFinite(rawEnd) && rawEnd > startTimeMs
          ? rawEnd
          : Number.isFinite(nextStart) && nextStart > startTimeMs
            ? nextStart
            : startTimeMs + 5000
      const translation = firstLyricAlternative(line, 'translations')
      const romanization = firstLyricAlternative(line, 'romanizations')
      const hasRomanWords = rawWords.some((word: any) =>
        sanitizeLyricWord(word?.romanization).trim()
      )
      const translatedLyric = sanitizeLyricText(
        translation?.text ?? line.translation ?? timedAlternativeText(line, 'translation')
      )
      const romanLyric = sanitizeLyricText(
        romanization?.text ?? line.romanization ?? timedAlternativeText(line, 'romanization')
      )
      const candidateWords = rawWords.length
        ? rawWords
        : [{ text: line.text, startTimeMs, endTimeMs: end }]
      let previousEnd = startTimeMs
      const words = candidateWords
        .filter(
          (word: any) => word && typeof word === 'object' && String(word.text ?? '').length > 0
        )
        .map((word: any, wordIndex: number, values: any[]) => {
          const rawWordStart = Number(word.startTimeMs)
          const start = Math.max(
            previousEnd,
            Number.isFinite(rawWordStart) ? rawWordStart : previousEnd
          )
          const rawWordEnd = Number(word.endTimeMs)
          const nextWordStart = Number(values[wordIndex + 1]?.startTimeMs)
          const finish =
            Number.isFinite(rawWordEnd) && rawWordEnd > start
              ? rawWordEnd
              : Number.isFinite(nextWordStart) && nextWordStart > start
                ? nextWordStart
                : Math.max(start + 1, end)
          previousEnd = finish
          return {
            word: String(word.text),
            startTime: Math.max(0, start + offset),
            endTime: Math.max(0, finish + offset),
            ...(sanitizeLyricWord(word.romanization).trim()
              ? { romanWord: sanitizeLyricWord(word.romanization).trim() }
              : {})
          }
        })
      if (!words.length) return undefined
      return {
        startTime: Math.max(0, startTimeMs + offset),
        endTime: Math.max(0, Math.max(end, previousEnd) + offset),
        words,
        translatedLyric,
        // AMLL renders both romanLyric and romanWord. Once aligned word-level
        // romanization exists, suppress the line fallback to avoid duplicates.
        romanLyric: hasRomanWords ? '' : romanLyric,
        isBG: line.isBackground ?? false,
        isDuet: line.isDuet ?? false
      }
    })
    .filter((line): line is import('@applemusic-like-lyrics/core').LyricLine => Boolean(line))
}
