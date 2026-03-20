export type Cleanup = () => void

export interface DisposableBag {
  add: (cleanup?: Cleanup | null) => Cleanup
  flush: () => void
  readonly size: number
}

const noop = () => {}

export function createDisposableBag(): DisposableBag {
  const cleanups = new Set<Cleanup>()

  return {
    add(cleanup?: Cleanup | null) {
      if (typeof cleanup !== 'function') {
        return noop
      }

      let active = true
      const wrapped = () => {
        if (!active) return
        active = false
        cleanups.delete(wrapped)
        cleanup()
      }

      cleanups.add(wrapped)
      return wrapped
    },

    flush() {
      const pending = Array.from(cleanups)
      cleanups.clear()

      let firstError: unknown = null
      for (const cleanup of pending) {
        try {
          cleanup()
        } catch (error) {
          if (firstError == null) {
            firstError = error
          }
        }
      }

      if (firstError != null) {
        throw firstError
      }
    },

    get size() {
      return cleanups.size
    }
  }
}
