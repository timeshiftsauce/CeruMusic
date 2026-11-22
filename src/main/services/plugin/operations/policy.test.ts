import { mkdtempSync, readFileSync, rmSync, writeFileSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test, expect } from '@jest/globals'
import { PlaybackHookPolicy } from './policy'
test('pause, manual resume, shutdown and damaged settings preserve the expected policy', () => {
  const temp = realpathSync(tmpdir()),
    dir = mkdtempSync(join(temp, 'ceru-hook-policy-')),
    path = join(dir, 'hooks-paused.json'),
    entry = { pluginId: 'demo.hooks', name: 'player.play' as const }
  try {
    const first = new PlaybackHookPolicy(path)
    first.change({ paused: true, announce: false, entry, suspend: true })
    const cold = new PlaybackHookPolicy(path)
    expect(cold.snapshot()).toMatchObject({ paused: true, suspended: [entry], announce: false })
    expect(cold.blocked(entry.pluginId, entry.name)).toBe(true)
    cold.change({ paused: false, entry, suspend: false })
    expect(new PlaybackHookPolicy(path).snapshot().suspended).toEqual([])
    writeFileSync(path, 'broken policy')
    const damaged = new PlaybackHookPolicy(path)
    expect(damaged.snapshot()).toMatchObject({ invalid: true, paused: true })
    expect(() => damaged.change({ paused: false })).toThrow()
    expect(readFileSync(path, 'utf8')).toBe('broken policy')
  } finally {
    expect(dirname(realpathSync(dir))).toBe(temp)
    rmSync(dir, { recursive: true, force: true })
  }
})
