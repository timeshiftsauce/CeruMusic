import type { CrLyric, ResourceRef } from '@shiqianjiang/ceru-plugin-sdk'

export interface LyricsResponse {
  offsetMs?: number
  lines: { startTimeMs: number; endTimeMs?: number; text: string }[]
}

export function toLyrics(track: ResourceRef, raw: LyricsResponse): CrLyric {
  const lines = raw.lines
    .filter(
      (line) =>
        Number.isFinite(line.startTimeMs) &&
        line.startTimeMs >= 0 &&
        typeof line.text === 'string' &&
        (line.endTimeMs === undefined ||
          (Number.isFinite(line.endTimeMs) && line.endTimeMs >= line.startTimeMs))
    )
    .map((line) => ({
      startTimeMs: line.startTimeMs,
      endTimeMs: line.endTimeMs,
      text: line.text
    }))
    .sort((a, b) => a.startTimeMs - b.startTimeMs)

  return {
    format: 'crlyric',
    version: 1,
    track,
    offsetMs: Number.isFinite(raw.offsetMs) ? Number(raw.offsetMs) : 0,
    lines
  }
}
