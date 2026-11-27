import { shallowRef } from 'vue'
import type { PlaybackTarget } from '@common/playbackAttempt'
import type { SongList } from '@renderer/types/audio'

type TraceStatus = 'resolving' | 'ready' | 'playing' | 'failed' | 'cancelled'
type StepType = 'info' | 'success' | 'error' | 'warning'

interface TraceStep {
  title: string
  detail?: string
  type: StepType
  elapsed: number
  target?: PlaybackTarget
}

export interface PlaybackTrace {
  id: number
  songName: string
  source: string
  status: TraceStatus
  target?: PlaybackTarget
  elapsed: number
  steps: TraceStep[]
  omitted: number
}

const MAX_TRACES = 12
const MAX_STEPS = 64
const history = shallowRef<PlaybackTrace[]>([])
export const playbackTraces = history as Readonly<typeof history>
let sequence = 0

/** Recent playback diagnostics are kept in memory. Store metadata only, never URLs or fault payloads. */
export function createPlaybackTrace(song: SongList, background: boolean) {
  const start = performance.now()
  const original: PlaybackTrace = {
    id: ++sequence,
    songName: song.name?.slice(0, 160),
    source: song.source,
    status: 'resolving',
    elapsed: 0,
    steps: [],
    omitted: 0
  }
  let trace = original
  let visible = false
  const replace = (changes: Partial<PlaybackTrace>) => {
    trace = { ...trace, ...changes }
    if (visible)
      history.value = history.value.map((entry) => (entry.id === trace.id ? trace : entry))
  }
  const publish = () => {
    if (visible) return
    visible = true
    history.value = [trace, ...history.value].slice(0, MAX_TRACES)
  }
  if (!background) publish()
  return {
    publish,
    status(status: TraceStatus, target?: PlaybackTarget) {
      replace({ status, target, elapsed: Math.round(performance.now() - start) })
    },
    step(title: string, type: StepType = 'info', target?: PlaybackTarget, detail?: string) {
      const elapsed = Math.round(performance.now() - start)
      const step = {
        title,
        type,
        target: target && {
          source: target.source.slice(0, 128),
          pluginId: target.pluginId?.slice(0, 128),
          quality: target.quality?.slice(0, 48)
        },
        detail,
        elapsed
      }
      const full = trace.steps.length >= MAX_STEPS
      // Keep the opening step and the most recent attempts if a long search fills the timeline.
      const steps = full ? [trace.steps[0], ...trace.steps.slice(2), step] : [...trace.steps, step]
      replace({ steps, elapsed, omitted: trace.omitted + Number(full) })
    }
  }
}
