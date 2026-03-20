export interface PlayerControlTheme {
  foreground: string
  foregroundHover: string
  surface: string
  surfaceHover: string
  border: string
  timeForeground: string
}

// 播放栏按钮只保留图标吃主题色，按钮容器本身保持透明。
// 这里继续保留参数签名，避免调用方改动过大。
export const resolvePlayerControlTheme = (_isDarkTheme: boolean): PlayerControlTheme => {
  return {
    foreground: 'var(--td-brand-color)',
    foregroundHover: 'var(--td-brand-color-active)',
    surface: 'transparent',
    surfaceHover: 'transparent',
    border: 'transparent',
    timeForeground: 'var(--td-brand-color)'
  }
}
