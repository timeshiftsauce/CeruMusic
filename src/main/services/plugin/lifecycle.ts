import type { BrowserWindow, NativeTheme, PowerMonitor } from 'electron'
import type { LifecycleName, LifecycleArgs } from '@shiqianjiang/ceru-plugin-sdk'

type Notify = <Name extends LifecycleName>(name: Name, ...args: LifecycleArgs<Name>) => void

export function createAppReadyGate(notify: () => void) {
  const received = new Set<'window' | 'plugins'>()
  return (part: 'window' | 'plugins') => {
    if (received.has(part)) return
    received.add(part)
    if (received.size === 2) notify()
  }
}

export function createQuitGate(collect: (signal: AbortSignal) => Promise<unknown>[], quit: () => void) {
  let phase: 'idle' | 'waiting' | 'finished' = 'idle'
  return (event: { preventDefault(): void }) => {
    if (phase === 'finished') return
    if (phase === 'waiting') { event.preventDefault(); return }
    const controller = new AbortController()
    const jobs = collect(controller.signal)
    if (!jobs.length) { phase = 'finished'; return }
    phase = 'waiting'
    event.preventDefault()
    const finish = () => {
      if (phase !== 'waiting') return
      phase = 'finished'
      clearTimeout(timer)
      controller.abort()
      quit()
    }
    const timer = setTimeout(finish, 3000)
    void Promise.allSettled(jobs).then(finish)
  }
}

export function createEnvironmentReporter(notify: Notify) {
  let previous: { online: boolean; locale: string } | undefined
  return (online: unknown, locale: unknown) => {
    if (typeof online !== 'boolean' || typeof locale !== 'string' || !locale.length || locale.length > 80)
      throw Error('无效的插件环境状态')
    const language = Intl.getCanonicalLocales(locale)[0]
    const last = previous
    previous = { online, locale: language }
    if (!last) return
    if (last.online !== online) notify(online ? 'onOnline' : 'onOffline')
    if (last.locale !== language) notify('onLocaleChange', language)
  }
}

export function bindWindowLifecycle(window: BrowserWindow, notify: Notify) {
  let visible = window.isVisible() && !window.isMinimized()
  const update = () => {
    const next = window.isVisible() && !window.isMinimized()
    if (next === visible) return
    visible = next
    notify(next ? 'onWindowShow' : 'onWindowHide')
  }
  window.on('show', update)
  window.on('hide', update)
  window.on('restore', update)
  window.on('minimize', update)
  window.on('focus', () => notify('onWindowFocus'))
  window.on('blur', () => notify('onWindowBlur'))
}

export function bindSystemLifecycle(power: PowerMonitor, theme: NativeTheme, notify: Notify) {
  const suspend = () => notify('onSuspend'), resume = () => notify('onResume')
  const lock = () => notify('onLock'), unlock = () => notify('onUnlock')
  let dark = theme.shouldUseDarkColors
  const updated = () => {
    if (dark === theme.shouldUseDarkColors) return
    dark = theme.shouldUseDarkColors
    notify('onThemeChange', dark ? 'dark' : 'light')
  }
  power.on('suspend', suspend)
  power.on('resume', resume)
  power.on('lock-screen', lock)
  power.on('unlock-screen', unlock)
  theme.on('updated', updated)
  return () => {
    power.off('suspend', suspend)
    power.off('resume', resume)
    power.off('lock-screen', lock)
    power.off('unlock-screen', unlock)
    theme.off('updated', updated)
  }
}
