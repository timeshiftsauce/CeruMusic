function formatTimestamp(timeMs: number): string {
  const t = Math.max(0, Math.floor(timeMs))
  const minutes = Math.floor(t / 60000)
  const seconds = Math.floor((t % 60000) / 1000)
  const milliseconds = t % 1000

  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}

function convertNewFormat(baseTimeMs: number, content: string): string | null {
  const baseTimestamp = formatTimestamp(baseTimeMs)
  let convertedContent = `<${formatTimestamp(0)}>`

  const charPattern = /\((\d+),(\d+),(\d+)\)([^(]*?)(?=\(|$)/g
  let match
  let isFirstChar = true
  let lastConsumedIndex = 0

  while ((match = charPattern.exec(content)) !== null) {
    const [, charStartMs, , , char] = match
    const charTimeMs = parseInt(charStartMs, 10)
    const charTimestamp = formatTimestamp(charTimeMs)
    const text = char ?? ''
    if (match.index > lastConsumedIndex) {
      const beforeText = content.substring(lastConsumedIndex, match.index)
      convertedContent += beforeText
    }
    lastConsumedIndex = match.index + match[0].length

    if (isFirstChar) {
      if (charTimeMs !== 0) {
        convertedContent += `<${charTimestamp}>${text}`
      } else {
        convertedContent += text
      }
      isFirstChar = false
    } else {
      convertedContent += `<${charTimestamp}>${text}`
    }
  }

  if (isFirstChar) return null

  if (lastConsumedIndex < content.length) {
    const remainingText = content.substring(lastConsumedIndex)
    if (remainingText) convertedContent += remainingText
  }

  return `[${baseTimestamp}]${convertedContent}`
}

function convertOldFormat(timestamp: string, content: string): string | null {
  let convertedContent = `<${formatTimestamp(0)}>`

  const charPattern = /([^()]*?)\((\d+),(\d+)\)/g
  let match
  let lastIndex = 0
  let isFirstChar = true
  let matched = false

  while ((match = charPattern.exec(content)) !== null) {
    const [fullMatch, char, offsetMs, _durationMs] = match
    const charTimeMs = parseInt(offsetMs, 10)
    const charTimestamp = formatTimestamp(charTimeMs)
    matched = true

    if (match.index > lastIndex) {
      const beforeText = content.substring(lastIndex, match.index)
      convertedContent += beforeText
    }

    if (isFirstChar) {
      if (charTimeMs !== 0) {
        convertedContent += `<${charTimestamp}>${char}`
      } else {
        convertedContent += char
      }
      isFirstChar = false
    } else {
      convertedContent += `<${charTimestamp}>${char}`
    }
    lastIndex = match.index + fullMatch.length
  }

  if (!matched) return null

  if (lastIndex < content.length) {
    const remainingText = content.substring(lastIndex)
    convertedContent += remainingText
  }

  return `[${timestamp}]${convertedContent}`
}

export function convertLrcFormat(lrcContent: string): string {
  if (!lrcContent) return ''

  const lines = lrcContent.split('\n')
  const convertedLines: string[] = []

  for (const line of lines) {
    if (!line.trim()) {
      convertedLines.push(line)
      continue
    }

    const newFormatMatch = line.match(/^\[(\d+),(\d+)\](.*)$/)
    if (newFormatMatch) {
      const [, startTimeMs, , content] = newFormatMatch
      const baseTimeMs = parseInt(startTimeMs, 10)
      if (!/\(\d+,\d+,\d+\)/.test(content)) {
        convertedLines.push(`[${formatTimestamp(baseTimeMs)}]${content}`)
        continue
      }
      const convertedLine = convertNewFormat(baseTimeMs, content)
      convertedLines.push(convertedLine ?? `[${formatTimestamp(baseTimeMs)}]${content}`)
      continue
    }

    const oldFormatMatch = line.match(/^\[(\d{2}:\d{2}\.\d{3})\](.*)$/)
    if (oldFormatMatch) {
      const [, timestamp, content] = oldFormatMatch

      if (!/\(\d+,\d+\)/.test(content)) {
        convertedLines.push(line)
        continue
      }

      const convertedLine = convertOldFormat(timestamp, content)
      convertedLines.push(convertedLine ?? line)
      continue
    }

    convertedLines.push(line)
  }

  return convertedLines.join('\n')
}

export function convertToStandardLrc(lrc: string): string {
  if (!lrc) return ''

  const lines = lrc.replace(/\\n/g, '\n').split('\n')
  const resultLines: string[] = []

  for (const line of lines) {
    const enhancedMatch = line.match(/^\[(\d+),(\d+)\](.*)/)
    if (enhancedMatch) {
      const startTime = parseInt(enhancedMatch[1], 10)
      const textContent = enhancedMatch[3] || ''

      const mm = Math.floor(startTime / 60000)
        .toString()
        .padStart(2, '0')
      const ss = Math.floor((startTime % 60000) / 1000)
        .toString()
        .padStart(2, '0')
      const xx = Math.floor((startTime % 1000) / 10)
        .toString()
        .padStart(2, '0')

      const pureText = textContent.replace(/\(\d+,\d+,\d+\)/g, '')
      resultLines.push(`[${mm}:${ss}.${xx}]${pureText}`)
      continue
    }

    const standardMatch = line.match(/^(\[\d{2}:\d{2}(?:\.\d{1,3})?\])(.*)/)
    if (standardMatch) {
      const timestamp = standardMatch[1]
      const textContent = standardMatch[2]
      const pureText = textContent.replace(/\(\d+,\d+\)/g, '')
      const normalizedTimestamp = timestamp.length > 9 ? timestamp.substring(0, 9) + ']' : timestamp
      resultLines.push(`${normalizedTimestamp}${pureText}`)
      continue
    }

    resultLines.push(line)
  }

  return resultLines.join('\n')
}

function timeToMs(s: string): number {
  const m = /(\d{2}):(\d{2})\.(\d{3})/.exec(s)
  if (!m) return NaN
  return parseInt(m[1]) * 60000 + parseInt(m[2]) * 1000 + parseInt(m[3])
}

export function normalizeLyricsToCrLyric(input: string): string {
  const raw = String(input).replace(/\r/g, '')
  const lines = raw.split('\n')
  let offset = 0
  const res: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) {
      res.push(line)
      continue
    }
    const off = /^\[offset:([+-]?\d+)\]$/i.exec(line.trim())
    if (off) {
      offset = parseInt(off[1]) || 0
      res.push(line)
      continue
    }
    const yrcLike = /\[\d+,\d+\]/.test(line) && /\(\d+,\d+,\d+\)/.test(line)
    if (yrcLike) {
      res.push(line)
      continue
    }
    const mLine = /^\[(\d{2}:\d{2}\.\d{3})\](.*)$/.exec(line)
    if (!mLine) {
      res.push(line)
      continue
    }
    const lineStart = timeToMs(mLine[1]) + offset
    let rest = mLine[2]
    rest = rest.replace(/\(\d+,\d+(?:,\d+)?\)/g, '')
    const segs: { start: number; text: string }[] = []
    const re = /<(\d{2}:\d{2}\.\d{3})>([^<]*)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(rest))) {
      const start = timeToMs(m[1]) + offset
      const text = m[2] || ''
      if (text) segs.push({ start, text })
    }
    if (segs.length === 0) {
      res.push(line)
      continue
    }
    let nextLineStart: number | null = null
    for (let j = i + 1; j < lines.length; j++) {
      const ml = /^\[(\d{2}:\d{2}\.\d{3})\]/.exec(lines[j])
      if (ml) {
        nextLineStart = timeToMs(ml[1]) + offset
        break
      }
      const skip = lines[j].trim()
      if (!skip || /^\[offset:/.test(skip)) continue
      break
    }
    const tokens: string[] = []
    for (let k = 0; k < segs.length; k++) {
      const cur = segs[k]
      const nextStart =
        k < segs.length - 1 ? segs[k + 1].start : (nextLineStart ?? cur.start + 1000)
      const span = Math.max(1, nextStart - cur.start)
      const chars = Array.from(cur.text)
      if (chars.length <= 1) {
        if (chars.length === 1) tokens.push(`(${cur.start},${span},0)` + chars[0])
      } else {
        const per = Math.max(1, Math.floor(span / chars.length))
        for (let c = 0; c < chars.length; c++) {
          const cs = cur.start + c * per
          const cd = c === chars.length - 1 ? Math.max(1, nextStart - cs) : per
          tokens.push(`(${cs},${cd},0)` + chars[c])
        }
      }
    }
    const lineEnd =
      nextLineStart ??
      segs[segs.length - 1].start +
        Math.max(
          1,
          (nextLineStart ?? segs[segs.length - 1].start + 1000) - segs[segs.length - 1].start
        )
    const ld = Math.max(0, lineEnd - lineStart)
    res.push(`[${lineStart},${ld}]` + tokens.join(''))
  }
  return res.join('\n')
}
