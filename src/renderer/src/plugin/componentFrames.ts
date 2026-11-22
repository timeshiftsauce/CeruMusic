import { nextTick } from 'vue'
import { frameHealth } from '@shiqianjiang/ceru-plugin-core/component-runtime'

type Status = 'warning' | 'recovered' | 'fallback'
type Subscription = {
  active(): boolean
  run(time: number): void
  layout(): void
  health(state: Status): void
  failed(error: unknown): void
  measure: ReturnType<typeof frameHealth>
}
const subscribers = new Set<Subscription>()
let frame = 0
let ticking = false
const visible = () => !document.hidden && document.hasFocus()
function schedule() {
  if (!frame && !ticking && visible() && [...subscribers].some(item => item.active()))
    frame = requestAnimationFrame(tick)
}
async function tick(time: number) {
  frame = 0
  ticking = true
  try {
    for (const item of [...subscribers]) {
      if (!subscribers.has(item) || !visible() || !item.active()) continue
      const began = performance.now()
      try {
        item.run(time)
        await nextTick()
        item.layout()
        const state = item.measure.sample(time, performance.now() - began)
        if (state) item.health(state)
      } catch (error) { item.failed(error) }
    }
  } finally { ticking = false; schedule() }
}
function activity() {
  if (!visible()) {
    cancelAnimationFrame(frame); frame = 0
    for (const item of subscribers) { const recovered = item.measure.reset(); if (recovered) item.health(recovered) }
  } else schedule()
}
/** One frame scheduler for every component region in this renderer. */
export function subscribeComponentFrames(options: Omit<Subscription, 'measure'>) {
  const subscription = { ...options, measure: frameHealth() }
  if (!subscribers.size) {
    window.addEventListener('focus', activity)
    window.addEventListener('blur', activity)
    document.addEventListener('visibilitychange', activity)
  }
  subscribers.add(subscription)
  schedule()
  return {
    wake: schedule,
    dispose() {
      subscribers.delete(subscription)
      if (!subscribers.size) {
        cancelAnimationFrame(frame); frame = 0
        window.removeEventListener('focus', activity)
        window.removeEventListener('blur', activity)
        document.removeEventListener('visibilitychange', activity)
      }
    }
  }
}
