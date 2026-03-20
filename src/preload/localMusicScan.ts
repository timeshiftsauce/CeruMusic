export type LocalMusicScanSummary = {
  success: boolean
  count: number
}

export const normalizeLocalMusicScanResult = (input: unknown): LocalMusicScanSummary => {
  if (Array.isArray(input)) {
    return { success: true, count: input.length }
  }

  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      return normalizeLocalMusicScanResult(parsed)
    } catch {
      return { success: false, count: 0 }
    }
  }

  if (input && typeof input === 'object') {
    const summary = input as { success?: unknown; count?: unknown }
    if (typeof summary.success === 'boolean' || typeof summary.count === 'number') {
      return {
        success: summary.success !== false,
        count: typeof summary.count === 'number' ? summary.count : 0
      }
    }
  }

  return { success: false, count: 0 }
}
