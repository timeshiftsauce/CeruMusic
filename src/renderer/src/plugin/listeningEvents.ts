interface TrackLabel {
  title: string
  artist: string
  source: string
}

type Publish = (event: string, value: unknown) => void

export function createListeningEvents(publish: Publish, now = () => performance.now()) {
  let session: { key: string; track: TrackLabel; playedMs: number; durationMs: number; started: boolean } | null = null
  let baseline: { time: number; position: number } | null = null
  let lastProgress = -Infinity

  function finish() {
    const previous = session
    session = null
    baseline = null
    if (!previous?.started) return
    const { track, playedMs, durationMs } = previous
    publish('track.finished', {
      track, playedMs: Math.round(playedMs),
      completed: playedMs > 240000 || (durationMs > 0 && playedMs > durationMs / 2)
    })
  }

  function select(key: string, track: TrackLabel) {
    if (session?.key === key) return
    finish()
    session = { key, track, playedMs: 0, durationMs: 0, started: false }
  }

  function sample(positionMs: number, durationMs: number, rate: number) {
    if (!session || !Number.isFinite(positionMs) || positionMs < 0) return
    const time = now()
    if (Number.isFinite(durationMs) && durationMs > 0) session.durationMs = Math.round(durationMs)
    const previous = baseline
    baseline = { time, position: positionMs }
    if (!previous || !Number.isFinite(rate) || rate <= 0) return
    const advance = positionMs - previous.position
    const elapsed = Math.max(0, time - previous.time)
    if (advance <= 0 || advance > elapsed * rate + 100) return
    session.playedMs += Math.min(advance / rate, elapsed)
    if (!session.started) {
      session.started = true
      publish('track.started', { track: session.track })
    }
    if (time - lastProgress >= 1000) {
      lastProgress = time
      publish('player.progress', { positionMs: Math.round(positionMs), durationMs: session.durationMs })
    }
  }

  return { select, sample, finish, interrupt: () => { baseline = null } }
}
