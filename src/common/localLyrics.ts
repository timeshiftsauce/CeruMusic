import { parseLrc, parseLrcA2, parseEslrc } from '@applemusic-like-lyrics/lyric'
import { assertLyricsDocument, type CrLyric, type ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

/** Ordinary local LRC needs no online provider. Other platform formats remain plugin-owned. */
export function parseLocalLrc(text: string, track: ResourceRef): CrLyric | null {
  if (text.length > 2 * 1024 * 1024) throw new Error('歌词内容过大')
  const input = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!/^\s*\[\d+:\d+(?:\.\d+)?\]/m.test(input)) return null
  const angular = /<\d+:\d+(?:\.\d+)?>/.test(input)
  const squareWords = !angular && /\]\s*[^\[\]\n]+\[\d+:\d+(?:\.\d+)?\]/.test(input)
  const parsed = (angular ? parseLrcA2(input) : squareWords ? parseEslrc(input) : parseLrc(input))
    .filter((line) => Number.isFinite(line.startTime))
    .sort((a, b) => a.startTime - b.startTime)
  const nextStarts: (number | undefined)[] = []
  for (let index = parsed.length - 2; index >= 0; index--) {
    nextStarts[index] =
      parsed[index + 1].startTime > parsed[index].startTime
        ? parsed[index + 1].startTime
        : nextStarts[index + 1]
  }
  const lines: CrLyric['lines'] = parsed.map((line, index) => {
    const startTimeMs = Math.max(0, line.startTime)
    const nextStart = nextStarts[index]
    const fallbackEnd = nextStart ?? startTimeMs + 5000
    // AMLL uses a very large sentinel for an unknown final end time.
    const end =
      Number.isFinite(line.endTime) && line.endTime > startTimeMs && line.endTime < 60039999
        ? line.endTime
        : fallbackEnd
    let previous = startTimeMs
    const words = line.words
      .filter((word) => word.word.length > 0)
      .map((word, wordIndex, source) => {
        // Real files can put the first word a few ms before the line timestamp or
        // omit the final word end. Repair timing without dropping the lyric text.
        const start = Math.max(
          previous,
          Number.isFinite(word.startTime) ? word.startTime : previous
        )
        previous = start
        const next = source[wordIndex + 1]?.startTime
        const finish =
          Number.isFinite(word.endTime) && word.endTime > start
            ? word.endTime
            : Number.isFinite(next) && next > start
              ? next
              : Math.max(start + 1, end)
        return { text: word.word, startTimeMs: start, endTimeMs: Math.max(start, finish) }
      })
    return {
      startTimeMs,
      endTimeMs: Math.max(
        end,
        ...(angular || squareWords ? words.map((word) => word.endTimeMs) : [])
      ),
      text: words.map((word) => word.text).join(''),
      ...(angular || squareWords ? { words } : {}),
      ...(line.translatedLyric ? { translation: line.translatedLyric } : {}),
      ...(line.romanLyric ? { romanization: line.romanLyric } : {}),
      isBackground: line.isBG,
      isDuet: line.isDuet
    }
  })
  const document: CrLyric = {
    format: 'crlyric',
    version: 1,
    track,
    offsetMs: Number(input.match(/\[offset:([+-]?\d+)\]/i)?.[1] || 0),
    lines
  }
  assertLyricsDocument(document)
  return document
}
