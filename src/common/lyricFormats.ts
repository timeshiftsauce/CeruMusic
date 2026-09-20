/** Formats AMLL can both read and write. Safe to import in settings UI. */
export const lyricFormats = [
  { value: 'lrc', label: '标准 LRC（逐行）', extension: 'lrc' },
  { value: 'enhanced-lrc', label: '逐字 LRC / Salt Player Lyrics', extension: 'lrc' },
  { value: 'eslrc', label: 'ESLyric（方括号逐字）', extension: 'lrc' },
  { value: 'ttml', label: 'TTML', extension: 'ttml' },
  { value: 'qrc', label: 'QRC（明文）', extension: 'qrc' },
  { value: 'yrc', label: 'YRC', extension: 'yrc' },
  { value: 'lys', label: 'Lyricify Syllable（LYS）', extension: 'lys' },
  { value: 'lyl', label: 'Lyricify Lines（LYL）', extension: 'lyl' },
  { value: 'lqe', label: 'Lyricify Quick Export（LQE）', extension: 'lqe' }
] as const
export type BuiltinLyricFormat = (typeof lyricFormats)[number]['value']
export type LyricFormatPreference = BuiltinLyricFormat | 'word-by-word'
export interface LyricFileOptions {
  lyricFormat?: LyricFormatPreference
  lyricExtensionMode?: 'auto' | 'custom'
  lyricExtension?: string
}
export function normalizeLyricFormat(format?: string): BuiltinLyricFormat | undefined {
  if (!format || format === 'word-by-word' || format === 'spl') return 'enhanced-lrc'
  return lyricFormats.find((item) => item.value === format)?.value
}
export const audioExtensions = [
  'mp3',
  'flac',
  'wav',
  'aac',
  'm4a',
  'ogg',
  'wma',
  'aiff',
  'aif',
  'ape',
  'opus',
  'm4b',
  'mp4',
  'alac',
  'dsf',
  'dff'
]
export const reservedLyricExtensions = [
  ...audioExtensions,
  'jpg',
  'jpeg',
  'png',
  'webp',
  'gif',
  'bmp',
  'exe',
  'dll',
  'node',
  'zip',
  'temp'
]

export function normalizeLyricExtension(value: string): string {
  const extension = value.trim().replace(/^\./, '').toLowerCase()
  if (
    extension.length > 32 ||
    !/^[\p{L}\p{N}_-]+$/u.test(extension) ||
    reservedLyricExtensions.includes(extension)
  ) {
    throw new Error('歌词后缀应为 1–32 个字母、数字、短横线或下划线，不能使用音频、图片或程序后缀')
  }
  return extension
}
export function lyricFileExtension(options: LyricFileOptions = {}): string {
  if (options.lyricExtensionMode === 'custom')
    return normalizeLyricExtension(options.lyricExtension || '')
  const entry = lyricFormats.find(
    (item) => item.value === normalizeLyricFormat(options.lyricFormat)
  )
  if (!entry) throw new Error('不支持的歌词导出格式')
  return entry.extension
}
