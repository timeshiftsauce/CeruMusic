import { expect, jest, test } from '@jest/globals'
import { EventEmitter } from 'node:events'
import type { BrowserWindow, NativeTheme, PowerMonitor } from 'electron'
import { bindWindowLifecycle, bindSystemLifecycle, createQuitGate, createEnvironmentReporter, createAppReadyGate } from './lifecycle'

test('readiness waits for both startup conditions in either order and fires once', () => {
  for (const [first, second] of [['window','plugins'],['plugins','window']] as const) {
    const notify = jest.fn(), mark = createAppReadyGate(notify)
    mark(first); mark(first)
    expect(notify).not.toHaveBeenCalled()
    mark(second); mark(first); mark(second)
    expect(notify).toHaveBeenCalledTimes(1)
  }
})

test('environment reports only connectivity and canonical document language changes', () => {
  const events: unknown[][] = []
  const report = createEnvironmentReporter((name, ...args) => { events.push([name,...args]) })
  report(true,'zh-cn')
  report(true,'zh-CN')
  expect(events).toEqual([])
  expect(() => report(false,'not_valid')).toThrow()
  expect(() => report('false','de')).toThrow()
  report(false,'DE-de')
  report(false,'de-DE')
  report(true,'de-DE')
  expect(events).toEqual([['onOffline'],['onLocaleChange','de-DE'],['onOnline']])
})

test('shutdown without listeners is synchronous; duplicate quit shares one deadline', async () => {
  const event = { preventDefault: jest.fn() }, quit = jest.fn()
  createQuitGate(() => [], quit)(event)
  expect(event.preventDefault).not.toHaveBeenCalled()
  jest.useFakeTimers()
  try {
    let cancelled = false
    const collect = jest.fn((signal: AbortSignal) => {
      signal.addEventListener('abort', () => { cancelled = true })
      return [Promise.reject(Error('worker stopped')), new Promise(() => {})]
    })
    const handle = createQuitGate(collect, quit)
    handle(event)
    await jest.advanceTimersByTimeAsync(2900)
    handle(event)
    expect(quit).not.toHaveBeenCalled()
    await jest.advanceTimersByTimeAsync(100)
    expect(cancelled).toBe(true)
    handle(event)
    expect(collect).toHaveBeenCalledTimes(1)
    expect(quit).toHaveBeenCalledTimes(1)
    expect(event.preventDefault).toHaveBeenCalledTimes(2)
  } finally { jest.useRealTimers() }
})

test('visibility follows effective window state; system listeners deduplicate theme and release', () => {
  const events: unknown[][] = []
  const notify = (name:string, ...args:unknown[]) => { events.push([name,...args]) }
  let visible = false, minimized = false
  const window = Object.assign(new EventEmitter(), {isVisible:()=>visible,isMinimized:()=>minimized})
  bindWindowLifecycle(window as unknown as BrowserWindow,notify)
  visible = true; window.emit('show'); window.emit('restore'); window.emit('focus')
  minimized = true; window.emit('minimize'); window.emit('hide'); window.emit('blur')
  expect(events.splice(0)).toEqual([['onWindowShow'],['onWindowFocus'],['onWindowHide'],['onWindowBlur']])
  const power = new EventEmitter(), theme = Object.assign(new EventEmitter(), {shouldUseDarkColors:false})
  const off = bindSystemLifecycle(power as PowerMonitor,theme as NativeTheme,notify)
  for (const event of ['suspend','resume','lock-screen','unlock-screen']) power.emit(event)
  theme.emit('updated'); theme.shouldUseDarkColors = true; theme.emit('updated'); theme.emit('updated')
  off(); power.emit('suspend'); theme.shouldUseDarkColors=false; theme.emit('updated')
  expect(events).toEqual([['onSuspend'],['onResume'],['onLock'],['onUnlock'],['onThemeChange','dark']])
})
