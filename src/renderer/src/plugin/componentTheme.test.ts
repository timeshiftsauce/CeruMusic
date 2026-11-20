import { expect, jest, test } from '@jest/globals'
import { componentTheme, watchComponentTheme } from './componentTheme'

test('component pages share one observer and release it after the last view closes', () => {
  const root = { dataset: { theme: 'light' } }
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, 'document')
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver')
  const observe = jest.fn(),
    disconnect = jest.fn(),
    first = jest.fn(),
    second = jest.fn()
  let notify!: () => void
  Object.defineProperty(globalThis, 'document', {
    configurable: true,
    value: { documentElement: root }
  })
  Object.defineProperty(globalThis, 'MutationObserver', {
    configurable: true,
    value: class {
      constructor(callback: () => void) {
        notify = callback
      }
      observe = observe
      disconnect = disconnect
    }
  })
  const closeFirst = watchComponentTheme(first),
    closeSecond = watchComponentTheme(second)
  try {
    expect(componentTheme()).toBe('light')
    expect(observe).toHaveBeenCalledTimes(1)
    expect(observe).toHaveBeenCalledWith(root, {
      attributes: true,
      attributeFilter: ['data-theme']
    })
    root.dataset.theme = 'dark'
    notify()
    notify()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).toHaveBeenLastCalledWith('dark')
    closeFirst()
    expect(disconnect).not.toHaveBeenCalled()
    root.dataset.theme = 'unsupported'
    notify()
    expect(second).toHaveBeenLastCalledWith(null)
    expect(first).toHaveBeenCalledTimes(1)
    closeSecond()
    expect(disconnect).toHaveBeenCalledTimes(1)
  } finally {
    closeFirst()
    closeSecond()
    if (previousDocument) Object.defineProperty(globalThis, 'document', previousDocument)
    else Reflect.deleteProperty(globalThis, 'document')
    if (previousObserver) Object.defineProperty(globalThis, 'MutationObserver', previousObserver)
    else Reflect.deleteProperty(globalThis, 'MutationObserver')
  }
})
