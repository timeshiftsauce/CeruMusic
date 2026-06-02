import { defineConfig, presetAttributify, presetIcons, presetWind4 } from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
    presetAttributify(),
    presetIcons({
      scale: 1.2,
      warn: true
    })
  ],
  shortcuts: {
    'flex-center': 'flex items-center justify-center',
    'flex-between': 'flex items-center justify-between',
    'flex-col-center': 'flex flex-col items-center justify-center',
    'text-ellipsis': 'overflow-hidden text-ellipsis whitespace-nowrap',
    'absolute-center': 'absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2'
  },
  rules: [
    ['no-drag', { '-webkit-app-region': 'no-drag' }],
    ['drag', { '-webkit-app-region': 'drag' }]
  ],
  theme: {
    colors: {
      primary: {
        DEFAULT: 'var(--td-brand-color)',
        hover: 'var(--td-brand-color-hover)',
        active: 'var(--td-brand-color-active)',
        disabled: 'var(--td-brand-color-disabled)',
        light: 'var(--td-brand-color-light)',
        focus: 'var(--td-brand-color-focus)'
      },
      success: {
        DEFAULT: 'var(--td-success-color)',
        hover: 'var(--td-success-color-hover)',
        active: 'var(--td-success-color-active)'
      },
      warning: {
        DEFAULT: 'var(--td-warning-color)',
        hover: 'var(--td-warning-color-hover)',
        active: 'var(--td-warning-color-active)'
      },
      error: {
        DEFAULT: 'var(--td-error-color)',
        hover: 'var(--td-error-color-hover)',
        active: 'var(--td-error-color-active)'
      },
      text: {
        primary: 'var(--td-text-color-primary)',
        secondary: 'var(--td-text-color-secondary)',
        placeholder: 'var(--td-text-color-placeholder)',
        disabled: 'var(--td-text-color-disabled)',
        brand: 'var(--td-text-color-brand)'
      },
      bg: {
        page: 'var(--td-bg-color-page)',
        container: 'var(--td-bg-color-container)',
        'container-hover': 'var(--td-bg-color-container-hover)',
        component: 'var(--td-bg-color-component)'
      },
      border: {
        level1: 'var(--td-border-level-1-color)',
        level2: 'var(--td-border-level-2-color)'
      }
    }
  }
})
