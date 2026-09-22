export interface NotificationSocket {
  connected: boolean
  on(event: string, listener: (...args: any[]) => void): unknown
  removeAllListeners(): unknown
  disconnect(): unknown
}

/** One instance per login session. Reconnects get a fresh access token. */
export function startNotificationSync(options: {
  connect: () => Promise<NotificationSocket>
  sync: () => Promise<boolean>
  visible: () => boolean
}) {
  let stopped = false
  let socket: NotificationSocket | undefined
  let connecting = false
  let attempts = 0
  let syncing = false
  let dirty = false
  let syncFailures = 0
  let retry: ReturnType<typeof setTimeout> | undefined
  let batch: ReturnType<typeof setTimeout> | undefined
  let batchDue = 0
  let reconciliation: ReturnType<typeof setTimeout> | undefined

  function queueSync(delay = 500) {
    dirty = true
    if (stopped || syncing || !options.visible()) return
    if (batch) {
      if (batchDue <= Date.now() + delay) return
      // A reconnect/wake must not wait behind a long failed-request backoff.
      clearTimeout(batch)
    }
    batchDue = Date.now() + delay
    batch = setTimeout(async () => {
      batch = undefined
      if (stopped || !options.visible()) return
      dirty = false
      syncing = true
      let success = false
      try {
        success = await options.sync()
      } catch {
        // Offline HTTP failures must not affect music playback.
      } finally {
        syncing = false
        if (!stopped) {
          syncFailures = success ? 0 : syncFailures + 1
          if (!success || dirty)
            queueSync(success ? 500 : Math.min(5000 * 2 ** Math.min(syncFailures - 1, 5), 120000))
        }
      }
    }, delay)
  }

  function scheduleReconciliation() {
    clearTimeout(reconciliation)
    if (stopped) return
    // No database work on heartbeat. Rare lost hints are repaired by this
    // low-frequency query, also useful while a server upgrade is rolling out.
    const interval = socket?.connected ? 600000 : 120000
    reconciliation = setTimeout(
      () => {
        queueSync()
        scheduleReconciliation()
      },
      interval * (0.9 + Math.random() * 0.2)
    )
  }

  function scheduleReconnect() {
    if (stopped || retry) return
    const delay = Math.min(1000 * 2 ** Math.min(attempts++, 6), 60000)
    retry = setTimeout(
      () => {
        retry = undefined
        void connect()
      },
      delay * (0.8 + Math.random() * 0.4)
    )
  }

  async function connect() {
    if (stopped || connecting || socket?.connected) return
    connecting = true
    try {
      const connection = await options.connect()
      if (stopped) {
        connection.removeAllListeners()
        connection.disconnect()
        return
      }
      socket = connection
      const disconnected = () => {
        connection.removeAllListeners()
        connection.disconnect()
        if (socket === connection) socket = undefined
        scheduleReconciliation()
        scheduleReconnect()
      }
      connection.on('notifications:changed', () => queueSync())
      connection.on('disconnect', disconnected)
      if (!connection.connected) {
        disconnected()
        return
      }
      attempts = 0
      queueSync() // Always catch up from the database after reconnect.
      scheduleReconciliation()
    } catch {
      scheduleReconnect()
    } finally {
      connecting = false
    }
  }

  function wake() {
    if (stopped || !options.visible()) return
    if (!retry) void connect()
    if (dirty || !syncing) queueSync()
  }

  void connect()
  queueSync()
  scheduleReconciliation()
  return {
    wake,
    stop() {
      stopped = true
      clearTimeout(retry)
      clearTimeout(batch)
      clearTimeout(reconciliation)
      socket?.removeAllListeners()
      socket?.disconnect()
      socket = undefined
    }
  }
}
