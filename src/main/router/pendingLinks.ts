import type { QueuedDeepLink } from '../../common/types/deepLink'

let sequence = 0
const pending: QueuedDeepLink[] = []
export function enqueueDeepLink(kind: QueuedDeepLink['kind'], value: string): QueuedDeepLink {
  const existing = pending.find((item) => item.kind === kind && item.value === value)
  if (existing) return existing
  const item = { sequence: ++sequence, kind, value }
  pending.push(item)
  return item
}
export function getPendingDeepLinks(): QueuedDeepLink[] {
  return pending.map((item) => ({ ...item }))
}
export function acknowledgeDeepLink(id: number) {
  const index = pending.findIndex((item) => item.sequence === id)
  if (index >= 0) pending.splice(index, 1)
}
