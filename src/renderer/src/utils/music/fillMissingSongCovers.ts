type SongWithCover = {
  img?: string | null
}

type FillMissingSongCoversOptions<T extends SongWithCover> = {
  songs: T[]
  source: string
  offset?: number
  concurrency?: number
  fallback?: string
  isStale?: () => boolean
  fetchCover: (source: string, song: T) => Promise<string>
}

const DEFAULT_CONCURRENCY = 6

export const fillMissingSongCovers = async <T extends SongWithCover>({
  songs,
  source,
  offset = 0,
  concurrency = DEFAULT_CONCURRENCY,
  fallback,
  isStale,
  fetchCover
}: FillMissingSongCoversOptions<T>) => {
  if (isStale?.()) return

  const queue = songs.slice(Math.max(0, offset)).filter((song) => !song.img)
  if (queue.length === 0) return

  const workerCount = Math.min(Math.max(1, concurrency), queue.length)
  let cursor = 0

  const runWorker = async () => {
    while (cursor < queue.length) {
      if (isStale?.()) return

      const currentIndex = cursor
      cursor += 1
      const song = queue[currentIndex]

      try {
        const url = await fetchCover(source, song)
        if (isStale?.()) return

        if (url) {
          song.img = url
        } else if (fallback !== undefined && !song.img) {
          song.img = fallback
        }
      } catch {
        if (isStale?.()) return
        if (fallback !== undefined && !song.img) {
          song.img = fallback
        }
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()))
}
