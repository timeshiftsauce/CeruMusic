type Theme = 'dark' | 'light' | null
const listeners = new Set<(theme: Theme) => void>()
let observer: MutationObserver | undefined

export function componentTheme(): Theme {
  const value = document.documentElement.dataset.theme
  return value === 'dark' || value === 'light' ? value : null
}

export function watchComponentTheme(listener: (theme: Theme) => void) {
  listeners.add(listener)
  if (!observer) {
    let previous = componentTheme()
    observer = new MutationObserver(() => {
      const theme = componentTheme()
      if (theme === previous) return
      previous = theme
      for (const notify of listeners) notify(theme)
    })
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  }
  return () => {
    listeners.delete(listener)
    if (!listeners.size) {
      observer?.disconnect()
      observer = undefined
    }
  }
}
