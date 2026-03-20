import { resolvePlayerControlTheme } from './playerControlTheme'

describe('resolvePlayerControlTheme', () => {
  test('在浅色主题下返回仅图标跟随品牌色的按钮颜色', () => {
    expect(resolvePlayerControlTheme(false)).toEqual({
      foreground: 'var(--td-brand-color)',
      foregroundHover: 'var(--td-brand-color-active)',
      surface: 'transparent',
      surfaceHover: 'transparent',
      border: 'transparent',
      timeForeground: 'var(--td-brand-color)'
    })
  })

  test('在深色主题下也返回仅图标跟随品牌色的按钮颜色', () => {
    expect(resolvePlayerControlTheme(true)).toEqual({
      foreground: 'var(--td-brand-color)',
      foregroundHover: 'var(--td-brand-color-active)',
      surface: 'transparent',
      surfaceHover: 'transparent',
      border: 'transparent',
      timeForeground: 'var(--td-brand-color)'
    })
  })
})
