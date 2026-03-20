export const THEME_OPTIONS = [
  { name: 'default', label: '默认', color: '#2ba55b' },
  { name: 'pink', label: '粉色', color: '#fc5e7e' },
  { name: 'blue', label: '蓝色', color: '#57b4ff' },
  { name: 'cyan', label: '青色', color: '#3ac2b8' },
  { name: 'orange', label: '橙色', color: '#fb9458' }
] as const

export type ThemeName = (typeof THEME_OPTIONS)[number]['name']

const DEFAULT_THEME: ThemeName = 'default'

export interface ThemeState {
  themeName: ThemeName
  isDarkMode: boolean
}

export interface ThemeStateInput {
  theme?: string | null
  isDarkMode?: boolean | null
  systemDarkMode?: boolean
}

export function normalizeThemeName(theme?: string | null): ThemeName {
  if (!theme) return DEFAULT_THEME

  return THEME_OPTIONS.some((item) => item.name === theme) ? (theme as ThemeName) : DEFAULT_THEME
}

export function resolveThemeState(input: ThemeStateInput = {}): ThemeState {
  return {
    themeName: normalizeThemeName(input.theme),
    isDarkMode:
      typeof input.isDarkMode === 'boolean' ? input.isDarkMode : Boolean(input.systemDarkMode)
  }
}

export function buildThemeAttributes(state: ThemeState) {
  return {
    themeMode: state.themeName === DEFAULT_THEME ? null : state.themeName,
    dataTheme: state.isDarkMode ? 'dark' : 'light'
  }
}

export function applyThemeAttributes(
  documentElement: Pick<HTMLElement, 'setAttribute' | 'removeAttribute'>,
  state: ThemeState
) {
  const attrs = buildThemeAttributes(state)

  documentElement.removeAttribute('theme-mode')
  documentElement.removeAttribute('data-theme')

  if (attrs.themeMode) {
    documentElement.setAttribute('theme-mode', attrs.themeMode)
  }
  documentElement.setAttribute('data-theme', attrs.dataTheme)
}
