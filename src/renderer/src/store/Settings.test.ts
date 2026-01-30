import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from './Settings'

describe('Settings Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())

    // Mock localStorage
    const localStorageMock = (function () {
      let store: Record<string, string> = {}
      return {
        getItem: jest.fn((key: string) => store[key] || null),
        setItem: jest.fn((key: string, value: string) => {
          store[key] = value.toString()
        }),
        clear: jest.fn(() => {
          store = {}
        }),
        removeItem: jest.fn((key: string) => {
          delete store[key]
        }),
        key: jest.fn(),
        length: 0
      }
    })()

    // Define globals for Node environment
    Object.defineProperty(global, 'localStorage', {
      value: localStorageMock,
      writable: true
    })

    Object.defineProperty(global, 'window', {
      value: {
        localStorage: localStorageMock
      },
      writable: true
    })
  })

  it('should initialize with default settings', () => {
    const store = useSettingsStore()
    expect(store.settings.closeToTray).toBe(true)
    expect(store.settings.hasConfiguredCloseBehavior).toBe(false)
    expect(store.settings.filenameTemplate).toBe('%t - %s')
  })

  it('should load settings from localStorage', () => {
    const savedSettings = {
      closeToTray: false,
      hasConfiguredCloseBehavior: true,
      filenameTemplate: 'custom'
    }
    localStorage.setItem('appSettings', JSON.stringify(savedSettings))

    const store = useSettingsStore()
    expect(store.settings.closeToTray).toBe(false)
    expect(store.settings.hasConfiguredCloseBehavior).toBe(true)
    expect(store.settings.filenameTemplate).toBe('custom')
  })

  it('should update closeToTray setting', () => {
    const store = useSettingsStore()

    // Default is true
    expect(store.settings.closeToTray).toBe(true)

    // Update setting
    store.updateSettings({
      closeToTray: false,
      hasConfiguredCloseBehavior: true
    })

    expect(store.settings.closeToTray).toBe(false)
    expect(store.settings.hasConfiguredCloseBehavior).toBe(true)
    expect(localStorage.setItem).toHaveBeenCalled()

    // Verify persistence
    const saved = JSON.parse(localStorage.getItem('appSettings') || '{}')
    expect(saved.closeToTray).toBe(false)
    expect(saved.hasConfiguredCloseBehavior).toBe(true)
  })

  it('should preserve other settings when updating', () => {
    const store = useSettingsStore()
    store.updateSettings({ filenameTemplate: 'new-template' })

    store.updateSettings({ closeToTray: false })

    expect(store.settings.filenameTemplate).toBe('new-template')
    expect(store.settings.closeToTray).toBe(false)
  })
})
