import { shouldKeepAliveAtRoot } from './rootCachePolicy'

describe('root cache policy', () => {
  it('should keep home root route alive when matched chain contains home', () => {
    expect(
      shouldKeepAliveAtRoot({
        matched: [{ name: 'home' }, { name: 'find' }]
      } as any)
    ).toBe(true)
  })

  it('should not keep non-home routes alive at root', () => {
    expect(
      shouldKeepAliveAtRoot({
        matched: [{ name: 'settings' }]
      } as any)
    ).toBe(false)
    expect(
      shouldKeepAliveAtRoot({
        matched: [{ name: 'welcome' }]
      } as any)
    ).toBe(false)
  })
})
