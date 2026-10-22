import { resolveSettingsCategory, settingsCategories } from './categories'
import { searchItems } from './searchIndex'

describe('设置分类兼容', () => {
  test.each(['appearance-lyric-font', 'appearance-desktop-lyric', 'appearance-mac-status-lyric'])(
    '原外观链接 %s 仍能打开歌词设置',
    (section) => expect(resolveSettingsCategory('appearance', section)).toBe('lyrics')
  )

  test.each([
    ['appearance', 'appearance-close-behavior'],
    ['playlist', 'playback-route-preload'],
    ['playlist', 'playback-smtc-hires']
  ])('原 %s 链接 %s 仍能打开系统设置', (category, section) => {
    expect(resolveSettingsCategory(category, section)).toBe('system')
  })

  test('未知分类不会令设置内容变为空白', () => {
    expect(resolveSettingsCategory('invalid')).toBeUndefined()
    expect(resolveSettingsCategory('playlist')).toBe('playlist')
  })

  test('搜索索引的分类有效，迁移锚点与新分类一致', () => {
    const keys: string[] = settingsCategories.map((category) => category.key)
    for (const item of searchItems) {
      expect(keys).toContain(item.category)
      expect(resolveSettingsCategory(item.category, item.id)).toBe(item.category)
    }
    expect(new Set(searchItems.map((item) => item.id)).size).toBe(searchItems.length)
  })
})
