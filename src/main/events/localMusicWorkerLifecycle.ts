type IdleLeaseManagerOptions = {
  idleMs: number
  onDispose: () => void
  setTimeoutFn?: typeof setTimeout
  clearTimeoutFn?: typeof clearTimeout
}

export const createIdleLeaseManager = ({
  idleMs,
  onDispose,
  setTimeoutFn = setTimeout,
  clearTimeoutFn = clearTimeout
}: IdleLeaseManagerOptions) => {
  let activeLeases = 0
  let idleTimer: ReturnType<typeof setTimeout> | null = null

  const clearIdleTimer = () => {
    if (idleTimer !== null) {
      clearTimeoutFn(idleTimer)
      idleTimer = null
    }
  }

  const scheduleDispose = () => {
    clearIdleTimer()
    idleTimer = setTimeoutFn(() => {
      idleTimer = null
      if (activeLeases === 0) {
        onDispose()
      }
    }, idleMs)
  }

  return {
    acquire: () => {
      activeLeases += 1
      clearIdleTimer()
      let released = false

      return () => {
        if (released) return
        released = true
        activeLeases = Math.max(0, activeLeases - 1)
        if (activeLeases === 0) {
          scheduleDispose()
        }
      }
    },
    getActiveLeases: () => activeLeases,
    hasPendingDispose: () => idleTimer !== null,
    forceDispose: () => {
      activeLeases = 0
      clearIdleTimer()
      onDispose()
    }
  }
}
