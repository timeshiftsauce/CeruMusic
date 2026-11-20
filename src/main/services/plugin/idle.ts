export class IdleMonitor {
  private subscriptions = new Set<{ milliseconds: number; fired: boolean; notify: () => void }>()
  private timer?: ReturnType<typeof setInterval>
  constructor(private secondsIdle: () => number) {}

  subscribe(milliseconds: number, notify: () => void) {
    if (!Number.isSafeInteger(milliseconds) || milliseconds < 60000) throw Error('Invalid idle threshold')
    const subscription = { milliseconds, fired: false, notify }
    this.subscriptions.add(subscription)
    this.timer ??= setInterval(() => {
      const elapsed = this.secondsIdle() * 1000
      for (const item of this.subscriptions) {
        if (elapsed < item.milliseconds) item.fired = false
        else if (!item.fired) { item.fired = true; item.notify() }
      }
    }, 1000)
    return () => {
      this.subscriptions.delete(subscription)
      if (!this.subscriptions.size) { clearInterval(this.timer); this.timer = undefined }
    }
  }
}
