import { startNotificationSync, type NotificationSocket } from './notificationConnection'

class FakeSocket implements NotificationSocket {
  connected = true
  listeners = new Map<string, (...args: any[]) => void>()
  on(event: string, listener: (...args: any[]) => void) {
    this.listeners.set(event, listener)
  }
  removeAllListeners() {
    this.listeners.clear()
  }
  disconnect() {
    this.connected = false
  }
  emit(event: string) {
    this.listeners.get(event)?.()
  }
}

describe('Notification realtime recovery', () => {
  let connection: ReturnType<typeof startNotificationSync>
  beforeEach(() => {
    jest.useFakeTimers()
    jest.spyOn(Math, 'random').mockReturnValue(0.5)
  })
  afterEach(() => {
    connection?.stop()
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('coalesces bursts, catches up on reconnect and has no 30 second poll', async () => {
    const first = new FakeSocket(),
      second = new FakeSocket()
    const connect = jest.fn().mockResolvedValueOnce(first).mockResolvedValue(second)
    const sync = jest.fn().mockResolvedValue(true)
    connection = startNotificationSync({ connect, sync, visible: () => true })
    await jest.advanceTimersByTimeAsync(500)
    expect(sync).toHaveBeenCalledTimes(1)
    for (let i = 0; i < 100; i++) first.emit('notifications:changed')
    await jest.advanceTimersByTimeAsync(500)
    expect(sync).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(30000)
    expect(sync).toHaveBeenCalledTimes(2)
    first.connected = false
    first.emit('disconnect')
    await jest.advanceTimersByTimeAsync(1500)
    expect(connect).toHaveBeenCalledTimes(2)
    expect(sync).toHaveBeenCalledTimes(3)
    await jest.advanceTimersByTimeAsync(600000)
    expect(sync).toHaveBeenCalledTimes(4) // Repairs a hint lost with Redis/network.
  })

  it('disposes a late connection after logout and never synchronizes the old account again', async () => {
    let resolve!: (socket: FakeSocket) => void
    const sync = jest.fn().mockResolvedValue(true)
    connection = startNotificationSync({
      connect: () =>
        new Promise((done) => {
          resolve = done
        }),
      sync,
      visible: () => true
    })
    connection.stop()
    const late = new FakeSocket()
    resolve(late)
    await jest.advanceTimersByTimeAsync(1200000)
    expect(late.connected).toBe(false)
    expect(late.listeners.size).toBe(0)
    expect(sync).not.toHaveBeenCalled()
  })

  it('retries failed catch-up and reruns if a notification arrived during the request', async () => {
    const socket = new FakeSocket()
    let resolve!: (success: boolean) => void
    const sync = jest
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done
          })
      )
      .mockResolvedValueOnce(false)
      .mockResolvedValue(true)
    connection = startNotificationSync({ connect: async () => socket, sync, visible: () => true })
    await jest.advanceTimersByTimeAsync(500)
    socket.emit('notifications:changed')
    resolve(true)
    await jest.advanceTimersByTimeAsync(500)
    expect(sync).toHaveBeenCalledTimes(2)
    await jest.advanceTimersByTimeAsync(5000)
    expect(sync).toHaveBeenCalledTimes(3)
  })

  it('defers hidden-window queries and catches up once on wake', async () => {
    let visible = false
    const socket = new FakeSocket(),
      sync = jest.fn().mockResolvedValue(true)
    connection = startNotificationSync({
      connect: async () => socket,
      sync,
      visible: () => visible
    })
    await jest.advanceTimersByTimeAsync(500)
    socket.emit('notifications:changed')
    await jest.advanceTimersByTimeAsync(60000)
    expect(sync).not.toHaveBeenCalled()
    visible = true
    connection.wake()
    connection.wake()
    await jest.advanceTimersByTimeAsync(500)
    expect(sync).toHaveBeenCalledTimes(1)
  })

  it('uses low-frequency fallback while unavailable and expedites catch-up when connectivity returns', async () => {
    const socket = new FakeSocket()
    const connect = jest.fn().mockRejectedValue(new Error('offline'))
    const sync = jest.fn().mockResolvedValue(true)
    connection = startNotificationSync({ connect, sync, visible: () => true })
    await jest.advanceTimersByTimeAsync(120500)
    expect(sync).toHaveBeenCalledTimes(2)
    expect(connect.mock.calls.length).toBeLessThan(10)
    sync.mockResolvedValue(false)
    connection.wake()
    await jest.advanceTimersByTimeAsync(500)
    expect(sync).toHaveBeenCalledTimes(3)
    // A recovery signal overrides the pending failed-query backoff.
    sync.mockResolvedValue(true)
    connect.mockResolvedValue(socket)
    connection.wake()
    await jest.advanceTimersByTimeAsync(500)
    expect(sync).toHaveBeenCalledTimes(4)
  })
})
