import { readdir, open } from 'node:fs/promises'
import { basename, dirname, extname, join } from 'node:path'
import {
  assertLyricsDocument,
  type CrLyric,
  type ResourceRef,
  type LyricInputFormat,
  type LyricParseRequest
} from '@shiqianjiang/ceru-plugin-sdk'
import { parseLocalLrc } from '../../common/localLyrics'

export interface LocalLyricConverter {
  formats: readonly LyricInputFormat[]
  parse(request: LyricParseRequest): Promise<CrLyric>
}

const MAX_BYTES = 2 * 1024 * 1024
const extensions: Record<string, LyricInputFormat> = {
  '.lrc': 'lrc',
  '.ttml': 'ttml',
  '.qrc': 'qrc',
  '.krc': 'krc',
  '.yrc': 'yrc',
  '.txt': 'plain'
}
// Prefer the built-in format when multiple same-name sidecars exist.
const priority = Object.keys(extensions)

function embeddedFormat(text: string): LyricInputFormat {
  if (/<(?:[\w.-]+:)?tt(?:\s|>)/i.test(text) || /<\?xml\b/i.test(text)) return 'ttml'
  if (/\bLyricContent\s*=|<QrcInfos\b/i.test(text)) return 'qrc'
  if (/^\s*\[\d+,\d+\].*<\d+,\d+,\d+>/m.test(text)) return 'krc'
  if (/^\s*\[\d+,\d+\].*\(\d+,\d+,\d+\)/m.test(text)) return 'yrc'
  if (/^\s*\[\d+:\d+(?:\.\d+)?\]/m.test(text)) return 'lrc'
  return 'auto'
}

function usable(value: CrLyric, track: ResourceRef): CrLyric | undefined {
  assertLyricsDocument(value)
  if (!value.lines.some((line) => line.text.trim()) && !value.plainText?.trim()) return
  return { ...value, track }
}

async function readSidecar(file: string): Promise<string> {
  const handle = await open(file, 'r')
  try {
    const stat = await handle.stat()
    if (!stat.isFile() || stat.size > MAX_BYTES) throw new Error('歌词文件过大或不可读取')
    const bytes = Buffer.alloc(Math.min(stat.size + 1, MAX_BYTES + 1))
    const { bytesRead } = await handle.read(bytes, 0, bytes.length, 0)
    if (bytesRead > MAX_BYTES) throw new Error('歌词文件过大')
    const content = bytes.subarray(0, bytesRead)
    const encoding =
      content[0] === 0xff && content[1] === 0xfe
        ? 'utf-16le'
        : content[0] === 0xfe && content[1] === 0xff
          ? 'utf-16be'
          : 'utf-8'
    try {
      return new TextDecoder(encoding, { fatal: true }).decode(content)
    } catch {
      // Legacy Chinese LRC files are often saved in GBK/GB18030.
      return new TextDecoder('gb18030', { fatal: true }).decode(content)
    }
  } finally {
    await handle.close()
  }
}

/** Resolves the first usable lyric, without passing paths or filesystem access to plugins. */
export async function resolveLocalLyrics(options: {
  audioPath: string
  embedded: string
  track: ResourceRef
  converters: readonly LocalLyricConverter[]
}): Promise<CrLyric | null> {
  const { audioPath, embedded, track, converters } = options
  async function parse(text: string, format: LyricInputFormat): Promise<CrLyric | undefined> {
    if (!text.trim() || Buffer.byteLength(text, 'utf8') > MAX_BYTES) return
    if (format === 'lrc' || format === 'enhanced-lrc' || format === 'auto') {
      try {
        const result = parseLocalLrc(text, track)
        if (result) {
          const document = usable(result, track)
          if (document) return document
        }
      } catch {
        /* A malformed embedded lyric must not block sidecar fallback. */
      }
    }
    const candidates = converters
      .filter((c) => c.formats.includes(format) || c.formats.includes('auto'))
      .sort((a, b) => Number(b.formats.includes(format)) - Number(a.formats.includes(format)))
    for (const converter of candidates) {
      try {
        const document = usable(await converter.parse({ text, format, track }), track)
        if (document) return document
      } catch {
        /* Try another declared converter, then the next same-name file. */
      }
    }
    return undefined
  }
  const inner = await parse(embedded, embeddedFormat(embedded))
  if (inner) return inner
  const stem = basename(audioPath, extname(audioPath))
  const directory = dirname(audioPath)
  let files: string[]
  try {
    files = (await readdir(directory, { withFileTypes: true }))
      .filter(
        (entry) =>
          entry.isFile() &&
          basename(entry.name, extname(entry.name)) === stem &&
          extensions[extname(entry.name).toLowerCase()]
      )
      .map((entry) => entry.name)
      .sort(
        (a, b) =>
          priority.indexOf(extname(a).toLowerCase()) - priority.indexOf(extname(b).toLowerCase()) ||
          a.localeCompare(b)
      )
  } catch {
    return null
  }
  for (const file of files) {
    try {
      const document = await parse(
        await readSidecar(join(directory, file)),
        extensions[extname(file).toLowerCase()]
      )
      if (document) return document
    } catch {
      /* Missing/unreadable files are optional metadata. */
    }
  }
  return null
}
