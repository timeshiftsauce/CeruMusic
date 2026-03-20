import { createCoverAnalysisCache, resolvePlayerCoverSrc } from './playerCover'

describe('playerCover utils', () => {
  it('should keep remote cover urls as-is instead of forcing blob conversion', () => {
    expect(resolvePlayerCoverSrc('https://example.com/cover.jpg')).toBe(
      'https://example.com/cover.jpg'
    )
  })

  it('should reuse cached analysis results for the same cover source', async () => {
    const analyzer = jest.fn(async () => ({
      dominantColor: { r: 1, g: 2, b: 3 },
      useBlackText: true
    }))
    const cache = createCoverAnalysisCache(analyzer, 2)

    const first = await cache.get('https://example.com/cover.jpg')
    const second = await cache.get('https://example.com/cover.jpg')

    expect(first).toEqual(second)
    expect(analyzer).toHaveBeenCalledTimes(1)
  })

  it('should dedupe concurrent analysis requests for the same cover source', async () => {
    const analyzer = jest.fn<Promise<{ dominantColor: { r: number; g: number; b: number }; useBlackText: boolean }>, []>(
      () =>
        new Promise((resolve) =>
          setTimeout(
            () =>
              resolve({
                dominantColor: { r: 5, g: 6, b: 7 },
                useBlackText: false
              }),
            5
          )
        )
    )
    const cache = createCoverAnalysisCache(analyzer, 2)

    const [first, second] = await Promise.all([
      cache.get('https://example.com/cover.jpg'),
      cache.get('https://example.com/cover.jpg')
    ])

    expect(first).toEqual(second)
    expect(analyzer).toHaveBeenCalledTimes(1)
  })
})
