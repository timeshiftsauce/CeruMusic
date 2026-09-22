import { setActivePinia, createPinia } from 'pinia'
import { createApp } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
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

  const wallpaper = {
    enable: true,
    type: 'image' as const,
    url: 'file:///G:/wallpaper.jpg',
    opacity: 0.7,
    blur: 0,
    brightness: 1
  }

  const restartStore = () => {
    const pinia = createPinia().use(piniaPluginPersistedstate)
    // Install the real persistence plugin without mounting any UI.
    createApp({}).use(pinia)
    setActivePinia(pinia)
    return useSettingsStore()
  }

  it('restores the current wallpaper instead of a stale Pinia snapshot', () => {
    localStorage.setItem('appSettings', JSON.stringify({ globalBackground: wallpaper }))
    localStorage.setItem(
      'settings',
      JSON.stringify({ settings: { globalBackground: { ...wallpaper, enable: false, url: '' } } })
    )

    const store = restartStore()
    expect(store.settings.globalBackground).toEqual(wallpaper)
    store.updateSettings({ theme: 'blue', isDarkMode: true, followSystemTheme: true })
    expect(restartStore().settings.globalBackground).toEqual(wallpaper)
    expect(restartStore().settings.theme).toBe('blue')
  })

  it('saves wallpaper changes immediately before a restart', () => {
    const store = restartStore()
    store.updateSettings({ globalBackground: wallpaper })
    store.settings.globalBackground!.opacity = 0
    store.settings.globalBackground!.url = 'file:///G:/changed.jpg'

    expect(restartStore().settings.globalBackground).toEqual({
      ...wallpaper,
      opacity: 0,
      url: 'file:///G:/changed.jpg'
    })
  })

  it.each([null, '{broken'])('falls back to legacy settings when canonical data is %s', (saved) => {
    if (saved !== null) localStorage.setItem('appSettings', saved)
    localStorage.setItem('settings', JSON.stringify({ settings: { globalBackground: wallpaper } }))
    const error = jest.spyOn(console, 'error').mockImplementation(() => {})
    try {
      expect(restartStore().settings.globalBackground).toEqual(wallpaper)
    } finally {
      error.mockRestore()
    }
  })

  it('fills missing wallpaper options without losing zero values', () => {
    localStorage.setItem(
      'appSettings',
      JSON.stringify({
        globalBackground: { enable: true, type: 'video', url: 'file:///G:/a.mp4', opacity: 0 }
      })
    )
    expect(restartStore().settings.globalBackground).toEqual({
      enable: true,
      type: 'video',
      url: 'file:///G:/a.mp4',
      opacity: 0,
      blur: 10,
      brightness: 0.8
    })
  })
})
