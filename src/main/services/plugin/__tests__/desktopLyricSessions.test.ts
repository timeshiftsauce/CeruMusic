import { expect, jest, test } from '@jest/globals'
import { DesktopLyricSessions } from '../desktopLyricSessions'

const first = { pluginId: 'first', surfaceId: 'lyric', sessionId: 'first-session' }
const second = { pluginId: 'second', surfaceId: 'lyric', sessionId: 'second-session' }

test('only the current desktop lyric session can be addressed', async () => {
  const close = jest.fn(async (_session: typeof first) => {})
  const sessions = new DesktopLyricSessions(close)
  await sessions.mount(async () => first)
  expect(sessions.owns('first', 'lyric', 'first-session')).toBe(true)
  expect(sessions.owns('second', 'lyric', 'first-session')).toBe(false)
  expect(sessions.owns('first', 'panel', 'first-session')).toBe(false)
  expect(sessions.owns('first', 'lyric', 'main-window-session')).toBe(false)
  await sessions.mount(async () => second)
  expect(sessions.owns('first', 'lyric', 'first-session')).toBe(false)
  await sessions.dispose()
  await sessions.dispose()
  expect(close.mock.calls).toEqual([[first], [second]])
})

test('an in-flight mount cannot survive a window reload or close', async () => {
  const close = jest.fn(async (_session: typeof first) => {})
  const sessions = new DesktopLyricSessions(close)
  let finish!: (value: typeof first) => void
  const pending = sessions.mount(() => new Promise<typeof first>(resolve => { finish = resolve }))
  await Promise.resolve()
  await Promise.resolve()
  await sessions.dispose()
  finish(first)
  await expect(pending).rejects.toThrow('桌面歌词视图已关闭')
  expect(close).toHaveBeenCalledWith(first)
  expect(sessions.owns('first', 'lyric', 'first-session')).toBe(false)
})
