import {
  buildThemeAttributes,
  normalizeThemeName,
  resolveThemeState
} from './themeState'

describe('themeState', () => {
  it('should fallback to default theme for invalid values', () => {
    expect(normalizeThemeName('orange')).toBe('orange')
    expect(normalizeThemeName('unknown')).toBe('default')
    expect(normalizeThemeName(null)).toBe('default')
  })

  it('should use system preference when dark mode is not explicitly stored', () => {
    expect(resolveThemeState({ theme: 'pink', systemDarkMode: true })).toEqual({
      themeName: 'pink',
      isDarkMode: true
    })
  })

  it('should keep explicit dark mode over system preference', () => {
    expect(
      resolveThemeState({
        theme: 'blue',
        isDarkMode: false,
        systemDarkMode: true
      })
    ).toEqual({
      themeName: 'blue',
      isDarkMode: false
    })
  })

  it('should build theme attributes for document application', () => {
    expect(
      buildThemeAttributes({
        themeName: 'default',
        isDarkMode: false
      })
    ).toEqual({
      themeMode: null,
      dataTheme: 'light'
    })

    expect(
      buildThemeAttributes({
        themeName: 'cyan',
        isDarkMode: true
      })
    ).toEqual({
      themeMode: 'cyan',
      dataTheme: 'dark'
    })
  })
})
