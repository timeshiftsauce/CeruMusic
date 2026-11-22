import { beforeAll, afterAll, expect, jest, test } from '@jest/globals'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { summarizeHookChange, setupHookPolicy, getHookControls } from './bus'

const mockReports = (
  jest.requireMock('@shiqianjiang/ceru-plugin-core/operations') as {
    reports: ((...args: any[]) => void)[]
  }
).reports
jest.mock('../uiBridge', () => ({ publishHookNames: jest.fn() }))
jest.mock('@shiqianjiang/ceru-plugin-core/operations', () => {
  const reports: ((...args: any[]) => void)[] = []
  const actual = process.getBuiltinModule('module').createRequire(__filename)(
    '@shiqianjiang/ceru-plugin-core/operations'
  )
  class Engine {
    constructor(...args: any[]) {
      reports.push(args[6])
    }
    names() {
      return []
    }
    setPaused() {}
  }
  class Playback extends Engine {
    constructor(...args: any[]) {
      super(undefined, undefined, ...args)
    }
  }
  return { ...actual, OperationEngine: Engine, OperationBus: Playback, reports }
})
let directory: string
beforeAll(() => {
  directory = mkdtempSync(join(tmpdir(), 'ceru-hook-summary-'))
  setupHookPolicy(join(directory, 'policy.json'))
})
afterAll(() => rmSync(directory, { recursive: true, force: true }))

test('reports bounded numeric, boolean and enum changes', () => {
  expect(
    summarizeHookChange('rewrite', 'player.seek', {
      target: 'input',
      before: { positionMs: -1 },
      after: { positionMs: 1e30 }
    }).changes
  ).toEqual([{ field: 'positionMs', before: 0, after: 86400000 }])
  expect(
    summarizeHookChange('rewrite', 'player.setVolume', {
      target: 'input',
      before: { volume: 0.3 },
      after: { volume: 0.8 }
    }).changes
  ).toEqual([{ field: 'volume', before: 0.3, after: 0.8 }])
  expect(
    summarizeHookChange('rewrite', 'track.like', {
      target: 'input',
      before: { liked: false },
      after: { liked: true }
    }).changes
  ).toEqual([{ field: 'liked', before: false, after: true }])
  expect(
    summarizeHookChange('rewrite', 'queue.add', {
      target: 'input',
      before: { tracks: [1, 2], position: 'end' },
      after: { tracks: [1], position: 'next' }
    }).changes
  ).toEqual([
    { field: 'count', before: 2, after: 1 },
    { field: 'position', before: 'end', after: 'next' }
  ])
})

test('same-size reorder and replacement reveal no titles, private refs, credentials or paths', () => {
  const first = {
    ref: { id: 'private-id', connectionId: 'secret-connection' },
    title: 'C:\\private\\song.mp3',
    metadata: { authorization: 'Bearer password' }
  }
  const second = { ref: { id: 'another-private-id' }, title: 'private title' }
  const summary = summarizeHookChange('rewrite', 'queue.shuffle', {
    target: 'input',
    before: { items: [first, second] },
    after: { items: [second, first] }
  })
  expect(summary.changes).toEqual([{ field: 'order', redacted: true }])
  expect(JSON.stringify(summary)).not.toMatch(/private|connection|Bearer|password|mp3/)
})

test.each([
  ['search.query', { query: 'private search' }, { query: '<script>secret</script>' }, 'query'],
  ['download.filename', { name: '/private/one' }, { name: 'C:\\secret\\file' }, 'name'],
  [
    'playlist.import',
    { value: 'https://user:pass@test/?token=private' },
    { value: 'token-secret' },
    'value'
  ],
  ['notification.show', { body: 'password' }, { body: 'secret' }, 'body'],
  [
    'link.open',
    { url: 'https://user:pass@test/?token=private' },
    { url: 'https://secret.test' },
    'url'
  ]
] as const)('redacts %s text entirely', (name, before, after, field) => {
  expect(summarizeHookChange('rewrite', name, { target: 'input', before, after }).changes).toEqual([
    { field, redacted: true }
  ])
})

test('route summaries omit all parameter keys/values and only show fixed page names', () => {
  expect(
    summarizeHookChange('rewrite', 'router.navigate', {
      target: 'input',
      before: { to: { name: 'home', params: { secret: 'token' }, query: { path: '/private' } } },
      after: {
        to: { name: 'settings', params: { password: 'another' }, query: { credential: 'secret' } }
      }
    }).changes
  ).toEqual([
    { field: 'route', before: 'home', after: 'settings' },
    { field: 'params', redacted: true },
    { field: 'queryParams', redacted: true }
  ])
})

test('lyrics/result hooks report counts and presence changes without any text or share URL', () => {
  expect(
    summarizeHookChange('rewrite', 'lyrics.transform', {
      target: 'result',
      before: { lines: [{ text: 'private lyrics' }] },
      after: { lines: [{ text: 'secret' }, { text: 'private translation' }] }
    })
  ).toEqual({
    target: 'result',
    changes: [
      { field: 'lyric', redacted: true },
      { field: 'lines', before: 1, after: 2 }
    ]
  })
  expect(
    summarizeHookChange('rewrite', 'share.create', {
      target: 'result',
      before: null,
      after: { url: 'https://secret.test/?token=private', id: 'credential' }
    })
  ).toEqual({ target: 'result', changes: [{ field: 'result', redacted: true }] })
})

test('unknown enum values and nonfinite numbers cannot enter summaries', () => {
  expect(
    summarizeHookChange('rewrite', 'player.resolve', {
      target: 'input',
      before: { quality: '320k' },
      after: { quality: 'secret-token' }
    }).changes
  ).toEqual([{ field: 'quality', redacted: true }])
  expect(
    summarizeHookChange('rewrite', 'player.seek', {
      target: 'input',
      before: { positionMs: NaN },
      after: { positionMs: Infinity }
    }).changes
  ).toEqual([{ field: 'positionMs', redacted: true }])
  expect(summarizeHookChange('rewrite', 'player.pause')).toEqual({ target: 'input', changes: [] })
  expect(
    summarizeHookChange('cancel', 'account.switch', {
      target: 'input',
      before: { password: 'secret' },
      after: null
    })
  ).toEqual({ target: 'cancel', changes: [] })
})

test('history retains only detached sanitized summaries and the last 100 records per plugin', () => {
  const change = {
    target: 'input',
    before: { volume: 0.2, secret: 'password' },
    after: { volume: 0.4, secret: 'token' }
  }
  for (let index = 0; index < 105; index++)
    mockReports[0](
      'fixture.hooks',
      'player.setVolume',
      'rewrite',
      { kind: 'ui', location: '/private/path' },
      change
    )
  change.after.volume = 0.9
  const activity = getHookControls().activity.filter((row) => row.pluginId === 'fixture.hooks')
  expect(activity).toHaveLength(100)
  expect(activity[0].summary?.changes).toEqual([{ field: 'volume', before: 0.2, after: 0.4 }])
  expect(JSON.stringify(activity)).not.toMatch(/password|token|private|location|secret/)
})
