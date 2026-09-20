/** A single FIFO for user-facing entry operations. A handler completes only after its UI does. */
export function createEntryQueue(onError: (error: unknown) => void = console.error) {
  const items: { key: string; run: () => Promise<void>; complete: () => void }[] = []
  const pending = new Map<string, Promise<void>>()
  let ready = false
  let running = false
  let disposed = false
  async function drain() {
    if (!ready || running || disposed) return
    running = true
    try {
      while (ready && !disposed && items.length) {
        const item = items.shift()!
        try {
          await item.run()
        } catch (error) {
          try {
            onError(error)
          } catch {
            /* Reporting must not stop the FIFO. */
          }
        } finally {
          pending.delete(item.key)
          item.complete()
        }
      }
    } finally {
      running = false
    }
  }
  return {
    enqueue(key: string, run: () => Promise<void>): Promise<void> {
      if (disposed) return Promise.resolve()
      const existing = pending.get(key)
      if (existing) return existing
      let complete!: () => void
      const result = new Promise<void>((resolve) => {
        complete = resolve
      })
      pending.set(key, result)
      items.push({ key, run, complete })
      void drain()
      return result
    },
    setReady(value: boolean) {
      ready = value
      void drain()
    },
    dispose() {
      disposed = true
      ready = false
      for (const item of items.splice(0)) {
        pending.delete(item.key)
        item.complete()
      }
    },
    get size() {
      return pending.size
    }
  }
}

export const appEntryQueue = createEntryQueue((error) => console.warn('入口处理失败:', error))
