const palettes = [
  ['#f4e8dc', '#e7bfb3', '#d8d8bc', '#654d43'],
  ['#e7eee5', '#b7cdbc', '#e6d8bc', '#415c4e'],
  ['#e8e9f2', '#c7bedc', '#edcbd2', '#574c6d'],
  ['#e7eef2', '#b6d0dc', '#d9dfcf', '#405c6c'],
  ['#f4ecde', '#e6cc98', '#dfbbac', '#6a553b'],
  ['#f1e6e7', '#deb9c3', '#d2c3dc', '#684951']
]

const fonts = [
  'Ceru Note Handwriting',
  'Ceru Note Ma Shan Zheng',
  'Ceru Note Liu Jian Mao Cao',
  'Ceru Note Long Cang',
  'lyricfont',
  'PingFangSC-Semibold',
  'Ceru Note ZCOOL Kuai Le',
  'Ceru Note ZCOOL Xiao Wei',
  'Ceru Note ZCOOL Qing Ke Huang You'
]

function hashSeed(seed: string) {
  let hash = 2166136261
  for (const char of seed) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619) >>> 0
  return hash
}

export function noteCoverLayout(seed: string) {
  return ['journal', 'letter', 'quote', 'postcard'][(hashSeed(seed) >>> 5) % 4]
}

/** Stable per-note seed: cards, details and later visits share the same artwork. */
export function noteCoverTheme(seed: string): Record<string, string> {
  const hash = hashSeed(seed)
  const [paper, wash, accent, ink] = palettes[hash % palettes.length]
  return {
    // Namespace the font seed so typography varies independently of layout and palette.
    '--note-font': `"${fonts[hashSeed(`font:${seed}`) % fonts.length]}"`,
    '--note-paper': paper,
    '--note-wash': wash,
    '--note-accent': accent,
    '--note-ink': ink,
    '--note-angle': `${110 + ((hash >>> 8) % 80)}deg`,
    '--note-x': `${15 + ((hash >>> 16) % 65)}%`,
    '--note-y': `${10 + ((hash >>> 24) % 60)}%`
  }
}
