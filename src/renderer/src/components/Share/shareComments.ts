import { sameSong, normalizeMusicItem } from '@common/musicItem'
import type { ShareComment } from '@renderer/api/share'

/** Capture comments for the selected song, independent of the player's loading state. */
export async function collectShareComments(
  selected: any,
  current: { song?: any; comments?: unknown[] },
  request: (method: 'getHotComment', input: any) => Promise<any>
): Promise<ShareComment[]> {
  const song = normalizeMusicItem(selected)
  const cached = sameSong(song, current.song) ? normalizeComments(current.comments) : []
  if (cached.length) return cached
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const result = await Promise.race([
      request('getHotComment', { source: song.source, songInfo: song, page: 1, limit: 10 }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('热评读取超时')), 15000)
      })
    ])
    if (result?.error) throw new Error(String(result.error))
    if (!Array.isArray(result?.comments)) throw new Error('音源返回的热评格式无效')
    return normalizeComments(result.comments)
  } finally {
    clearTimeout(timer)
  }
}

function normalizeComments(values: unknown[] | undefined): ShareComment[] {
  if (!Array.isArray(values)) return []
  return values
    .flatMap((value: any) => {
      if (typeof value?.text !== 'string' || !value.text.trim()) return []
      const comment: ShareComment = {
        userName: String(value.userName || '匿名用户'),
        text: value.text
      }
      for (const key of ['avatar', 'timeStr', 'location'] as const) {
        if (typeof value[key] === 'string') comment[key] = value[key]
      }
      if (Number.isFinite(Number(value.likedCount)))
        comment.likedCount = Math.max(0, Number(value.likedCount))
      return [comment]
    })
    .slice(0, 10)
}
