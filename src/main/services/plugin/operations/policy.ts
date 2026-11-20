import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { dirname } from 'node:path'
import { hookLabels } from '@common/pluginHookControls'
import type { HookName } from '@common/pluginHookControls'
export type PauseRecord = { pluginId: string; name: HookName }
export type HookPolicy = { paused: boolean; announce: boolean; suspended: PauseRecord[] }
function validRecord(row: any): row is PauseRecord {
  return (
    typeof row?.pluginId === 'string' &&
    /^[a-z0-9][a-z0-9._-]{0,127}$/i.test(row.pluginId) &&
    Object.hasOwn(hookLabels, row.name)
  )
}
export class PlaybackHookPolicy {
  private state: HookPolicy = { paused: false, announce: true, suspended: [] }
  private invalid = false
  constructor(private readonly path: string) {
    if (!existsSync(path)) return
    try {
      const data = JSON.parse(readFileSync(path, 'utf8'))
      if (
        typeof data.paused !== 'boolean' ||
        typeof data.announce !== 'boolean' ||
        !Array.isArray(data.suspended) ||
        !data.suspended.every(validRecord)
      )
        throw Error('Invalid policy')
      this.state = {
        paused: data.paused,
        announce: data.announce,
        suspended: data.suspended.map(({ pluginId, name }: PauseRecord) => ({ pluginId, name }))
      }
    } catch {
      this.invalid = true
      this.state.paused = true
    }
  }
  snapshot() {
    return { ...structuredClone(this.state), invalid: this.invalid }
  }
  blocked(pluginId: string, name: HookName) {
    return this.state.suspended.some((row) => row.pluginId === pluginId && row.name === name)
  }
  change(update: { paused?: boolean; announce?: boolean; entry?: PauseRecord; suspend?: boolean }) {
    if (this.invalid) throw Error('拦截设置文件无法读取；已暂停拦截并保留原文件')
    const next = structuredClone(this.state)
    for (const key of ['paused', 'announce'] as const)
      if (update[key] !== undefined) {
        if (typeof update[key] !== 'boolean') throw Error('无效的拦截设置')
        next[key] = update[key]!
      }
    if (update.entry !== undefined) {
      const entry = update.entry
      if (!validRecord(entry) || typeof update.suspend !== 'boolean') throw Error('无效的暂停项目')
      next.suspended = next.suspended.filter(
        (row) => row.name !== entry.name || row.pluginId !== entry.pluginId
      )
      if (update.suspend) next.suspended.push({ pluginId: entry.pluginId, name: entry.name })
    }
    const temporary = this.path + '.' + randomUUID() + '.tmp'
    mkdirSync(dirname(this.path), { recursive: true })
    try {
      writeFileSync(temporary, JSON.stringify(next), { flag: 'wx' })
      renameSync(temporary, this.path)
    } finally {
      rmSync(temporary, { force: true })
    }
    this.state = next
  }
}
