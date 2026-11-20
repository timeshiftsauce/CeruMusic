import { componentTheme } from './componentTheme'

// Only public appearance tokens cross the isolated document boundary.
export function surfaceThemeTokens() {
  const style = getComputedStyle(document.documentElement)
  const tokens: Record<string, string> = {}
  for (const name of Array.from(style)) {
    if (/^--(?:td|ceru)-[\w-]+$/.test(name)) tokens[name] = style.getPropertyValue(name).trim()
  }
  return { mode: componentTheme(), tokens }
}

export function watchSurfaceTheme(notify: () => void) {
  let previous = JSON.stringify(surfaceThemeTokens())
  let pending = 0
  const observer = new MutationObserver(() => {
    if (pending) return
    pending = requestAnimationFrame(() => {
      pending = 0
      const current = JSON.stringify(surfaceThemeTokens())
      if (current !== previous) { previous = current; notify() }
    })
  })
  observer.observe(document.documentElement, { attributes: true })
  observer.observe(document.head, { subtree: true, childList: true, characterData: true, attributes: true })
  return () => { observer.disconnect(); cancelAnimationFrame(pending) }
}
