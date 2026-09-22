import { setActivePinia, createPinia } from 'pinia'
import { createApp, nextTick } from 'vue'
import piniaPluginPersistedstate from 'pinia-plugin-persistedstate'
import { SEARCH_HISTORY_LIMIT, searchValue as useSearchStore } from './search'

/** 创建挂了持久化插件的 Pinia(不挂载任何 UI),让 persist 配置真正生效 */
const installSearchStore = () => {
  const pinia = createPinia().use(piniaPluginPersistedstate)
  createApp({}).use(pinia)
  setActivePinia(pinia)
  return useSearchStore()
}

describe('Search Store', () => {
  beforeEach(() => {
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

  it('records keywords newest-first with duplicates removed', () => {
    const store = installSearchStore()
    store.addHistory('周杰伦')
    store.addHistory('林俊杰')
    store.addHistory('周杰伦')

    expect(store.history).toEqual(['周杰伦', '林俊杰'])
  })

  it('trims keywords and ignores blanks', () => {
    const store = installSearchStore()
    store.addHistory('  稻香  ')
    store.addHistory('   ')
    store.addHistory('')

    expect(store.history).toEqual(['稻香'])
  })

  it(`keeps at most ${SEARCH_HISTORY_LIMIT} entries`, () => {
    const store = installSearchStore()
    for (let i = 0; i < SEARCH_HISTORY_LIMIT + 5; i += 1) {
      store.addHistory(`keyword-${i}`)
    }

    expect(store.history).toHaveLength(SEARCH_HISTORY_LIMIT)
    expect(store.history[0]).toBe(`keyword-${SEARCH_HISTORY_LIMIT + 4}`)
    expect(store.history).not.toContain('keyword-0')
  })

  it('clears all history', () => {
    const store = installSearchStore()
    store.addHistory('晴天')
    store.addHistory('七里香')
    store.clearHistory()

    expect(store.history).toEqual([])
  })

  it('persists history but not the transient query state', async () => {
    const store = installSearchStore()
    store.setValue('临时输入')
    store.setFocus(true)
    store.addHistory('夜曲')

    // 插件的 $subscribe 默认 flush:'pre',等一个 tick 后才会写盘
    await nextTick()

    // 只持久化 history,value/focus 不落盘
    expect(localStorage.getItem('ceru-search-history')).toBe(JSON.stringify({ history: ['夜曲'] }))

    const restarted = installSearchStore()
    expect(restarted.history).toEqual(['夜曲'])
    expect(restarted.value).toBe('')
    expect(restarted.focus).toBe(false)
  })
})
