import { matchText } from './search'

describe('Search Utils', () => {
  describe('matchText', () => {
    it('should return false for empty inputs', () => {
      expect(matchText('', 'test')).toBe(false)
      expect(matchText('test', '')).toBe(false)
    })

    it('should match exact substring case-insensitive', () => {
      expect(matchText('Settings', 'set')).toBe(true)
      expect(matchText('Settings', 'SET')).toBe(true)
      expect(matchText('Settings', 'ings')).toBe(true)
      expect(matchText('设置', '设')).toBe(true)
    })

    it('should not match unmatched strings', () => {
      expect(matchText('Settings', 'foo')).toBe(false)
      expect(matchText('设置', 'foo')).toBe(false)
    })

    it('should match simple fuzzy initials (basic)', () => {
      // "tb" matches "TitleBar"
      expect(matchText('TitleBar', 'tb')).toBe(true)
      // "st" matches "Settings"
      expect(matchText('Settings', 'st')).toBe(true)

      // Should not match if characters are not in order
      expect(matchText('TitleBar', 'bt')).toBe(false)
    })
  })
})
