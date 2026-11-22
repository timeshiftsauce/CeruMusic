export type VisibilityDecision = boolean | 'force-show' | 'force-hide'
type DisabledEntry = {state:'disabled';reason?:string}
type StoredDecision = VisibilityDecision | DisabledEntry | null
function disabledEntry(value: unknown): value is DisabledEntry {
  return !!value && typeof value === 'object' && 'state' in value && value.state === 'disabled' &&
    (!('reason' in value) || (typeof value.reason === 'string' && value.reason.length <= 160))
}
export function providerEntryState(condition: boolean | undefined, decision: unknown, combine?: 'all' | 'any') {
  if (decision === undefined) return {state:'pending'} as const
  if (disabledEntry(decision)) return mergeVisibility(condition,true,combine) ? decision : {state:'hidden'} as const
  return mergeVisibility(condition,decision,combine) ? {state:'available'} as const : {state:'hidden'} as const
}

export function mergeVisibility(condition: boolean | undefined, decision: unknown, combine?: 'all' | 'any'): boolean {
  if (decision === 'force-show') return true
  if (decision === 'force-hide' || typeof decision !== 'boolean') return false
  if (condition === undefined) return decision
  return combine === 'any' ? condition || decision : condition && decision
}

export class VisibilityDecisions {
  private entries = new Map<string, { signature: string; value?: StoredDecision }>()
  constructor(private changed: () => void) {}

  read(key: string, signature: string) {
    const entry = this.entries.get(key)
    return entry?.signature === signature ? entry.value : undefined
  }

  async evaluate(key: string, signature: string, run: () => Promise<unknown>) {
    if (this.entries.get(key)?.signature === signature) return
    const entry: { signature: string; value?: StoredDecision } = { signature }
    this.entries.set(key, entry)
    let value: unknown
    try { value = await run() } catch { value = undefined }
    if (this.entries.get(key) !== entry) return
    entry.value = typeof value === 'boolean' || value === 'force-show' || value === 'force-hide' || disabledEntry(value) ? value : null
    this.changed()
  }

  retain(keys: Set<string>) {
    for (const key of this.entries.keys()) if (!keys.has(key)) this.entries.delete(key)
  }
}
