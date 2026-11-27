import { getSongRealUrl } from '@renderer/utils/playlist/playlistManager'
import { desktopBridge } from '@renderer/services/desktopBridge'
import type { SongList } from '@renderer/types/audio'
import { createPlaybackFallback } from './playbackFallback'
import { fallbackPreferences, type FallbackPreferences } from './fallbackPreferences'
import { createPlaybackTrace, playbackTraces } from './playbackTrace'

let settings: Partial<FallbackPreferences>
jest.mock('@renderer/store/Settings', () => ({
  useSettingsStore: () => ({ settings: { playbackFallback: settings } })
}))
jest.mock('@renderer/store/LocalUserDetail', () => ({
  LocalUserDetailStore: () => ({ userInfo: {}, userSource: { quality: 'flac' } })
}))
jest.mock('@renderer/services/pluginState', () => ({
  activePluginContributions: {
    value: [
      {
        pluginId: 'a',
        descriptor: {
          name: 'A',
          providers: [
            { id: 'one', qualities: ['128k', '320k', 'flac'] },
            { id: 'two', qualities: ['flac'] }
          ]
        },
        providerMethods: { one: ['tracks.resolve'], two: ['tracks.resolve', 'tracks.search'] }
      },
      {
        pluginId: 'b',
        descriptor: {
          name: 'B',
          providers: [
            { id: 'one', qualities: ['flac'] },
            { id: 'two', qualities: ['flac'] },
            { id: 'three', qualities: ['flac'] },
            { id: 'four', qualities: ['flac'] },
            { id: 'mix', name: '聚合', qualities: ['flac'] }
          ]
        },
        providerMethods: {
          one: ['tracks.resolve'],
          two: ['tracks.resolve', 'tracks.search'],
          three: ['tracks.resolve', 'tracks.search'],
          four: ['tracks.resolve', 'tracks.search'],
          mix: ['tracks.resolve', 'tracks.search']
        }
      },
      ...['c', 'd', 'e'].map((pluginId) => ({
        pluginId,
        descriptor: { name: pluginId, providers: [{ id: 'one', qualities: ['flac'] }] },
        providerMethods: { one: ['tracks.resolve'] }
      }))
    ]
  }
}))
jest.mock('@renderer/services/desktopBridge', () => ({
  desktopBridge: { api: { music: { requestSdk: jest.fn() } } }
}))
jest.mock('@renderer/utils/playlist/playlistManager', () => ({ getSongRealUrl: jest.fn() }))

const song = {
  source: 'one',
  songmid: '1',
  name: 'Song',
  singer: 'Artist',
  interval: '03:00'
} as SongList
const resolveUrl = jest.mocked(getSongRealUrl)
const search = jest.mocked(desktopBridge.api.music.requestSdk)
const load = jest.fn().mockResolvedValue(undefined)

beforeEach(() => {
  settings = {}
  resolveUrl.mockReset()
  search.mockReset()
  load.mockClear()
})

function rejectOriginal(blockPlugin = false) {
  resolveUrl.mockImplementationOnce(async (_song, options) => {
    options?.report({ source: 'one', pluginId: 'a', quality: 'flac', blockPlugin })
    throw new Error('unavailable')
  })
}

it('keeps cross-plugin resolution available when the original plugin blocks its own retries', async () => {
  settings.order = ['quality', 'plugin', 'source']
  rejectOriginal(true)
  resolveUrl.mockResolvedValueOnce('alternate-url')
  const fallback = createPlaybackFallback(song, () => true)
  const result = await fallback.load(load)

  expect(result?.target.pluginId).toBe('b')
  expect(resolveUrl).toHaveBeenCalledTimes(2)
  expect(search).not.toHaveBeenCalled()
  expect(playbackTraces.value[0].steps).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        title: '插件拦截本轮同插件换源',
        target: expect.objectContaining({ pluginId: 'a' })
      })
    ])
  )
  expect(JSON.stringify(playbackTraces.value[0])).not.toContain('alternate-url')
})

it('keeps cross-platform search and resolution available outside the blocked plugin', async () => {
  settings = { strategies: { plugin: false, source: true, quality: true } }
  rejectOriginal(true)
  search.mockImplementation(async (_method, args) =>
    (args as { source: string }).source === 'two'
      ? { list: [{ ...song, source: 'two', songmid: '2' }] }
      : { list: [] }
  )
  resolveUrl.mockResolvedValueOnce('alternate-url')
  const result = await createPlaybackFallback(song, () => true).load(load)
  expect(result?.target).toMatchObject({ source: 'two', pluginId: 'b' })
  expect(search).not.toHaveBeenCalledWith('search', expect.objectContaining({ ownerId: 'a' }))
})

it('downgrades step by step and resumes with the next quality after a media failure', async () => {
  settings.order = ['quality', 'plugin', 'source']
  resolveUrl.mockImplementationOnce(async (_song, options) => {
    options?.report({ source: 'one', pluginId: 'a', quality: 'flac' })
    return 'flac-url'
  })
  resolveUrl.mockResolvedValueOnce('320-url').mockResolvedValueOnce('128-url')
  const fallback = createPlaybackFallback(song, () => true)
  const original = await fallback.load(load)
  expect(original?.target.quality).toBe('flac')
  fallback.failPlayback(original!, 'media')

  const next = await fallback.load(load)
  expect(next?.target.quality).toBe('320k')
  fallback.failPlayback(next!, 'start')
  expect((await fallback.load(load))?.target.quality).toBe('128k')
  expect(resolveUrl.mock.calls[1][1]?.skipCachedAudio).toBe(true)
  expect(search).not.toHaveBeenCalled()
})

it.each([false, true])(
  'combines the platform ranking toggle (%s) with the existing match score',
  async (preferPlatforms) => {
    settings = {
      order: ['source', 'plugin', 'quality'],
      preferPlatforms,
      platformOrder: ['three', 'two']
    }
    rejectOriginal()
    search.mockImplementation(async (_method, args) => ({
      list: [
        {
          ...song,
          source: (args as { source: string }).source,
          songmid: '2',
          interval: (args as { source: string }).source === 'two' ? '03:00' : '03:50'
        }
      ]
    }))
    resolveUrl.mockResolvedValueOnce('alternate-url')
    const result = await createPlaybackFallback(song, () => true).load(load)
    expect(result?.target.source).toBe(preferPlatforms ? 'three' : 'two')
  }
)

it('skips an unplayable song directly when the master switch is off', async () => {
  settings = { enabled: false, autoNext: false }
  rejectOriginal()
  const fallback = createPlaybackFallback(song, () => true)
  await expect(fallback.load(load)).resolves.toBeUndefined()
  expect(fallback.autoNext).toBe(true)
  expect(resolveUrl).toHaveBeenCalledTimes(1)
  expect(search).not.toHaveBeenCalled()
})

it('retains the order when a strategy is turned off and on again', () => {
  const before = fallbackPreferences({ order: ['quality', 'source', 'plugin'] })
  const off = fallbackPreferences({
    ...before,
    strategies: { ...before.strategies, quality: false }
  })
  const on = fallbackPreferences({ ...off, strategies: { ...off.strategies, quality: true } })
  expect(off.order).toEqual(before.order)
  expect(on).toEqual(before)
})

it('bounds playback history and timeline length', () => {
  for (let i = 0; i < 20; i++) {
    const trace = createPlaybackTrace(song, false)
    trace.step('开始播放')
    for (let n = 0; n < 80; n++) trace.step(String(n))
  }
  expect(playbackTraces.value).toHaveLength(12)
  const current = playbackTraces.value[0]
  expect(current.steps).toHaveLength(64)
  expect(current.omitted).toBe(17)
  expect(current.steps[0].title).toBe('开始播放')
  expect(current.steps.at(-1)?.title).toBe('79')
})

it('skips aggregate and foreign search results, and continues with the next real platform', async () => {
  settings = {
    order: ['source'],
    preferPlatforms: true,
    platformOrder: ['mix', 'two', 'three', 'four']
  }
  settings.strategies = { source: true, plugin: false, quality: false }
  rejectOriginal()
  search.mockImplementation(async (_method, args) => {
    const platform = (args as { source: string }).source
    if (platform === 'two')
      return {
        list: [
          {
            ...song,
            source: 'two',
            pluginResource: {
              providerId: 'one',
              scope: 'provider',
              kind: 'track',
              id: '1'
            }
          }
        ]
      }
    return { list: [{ ...song, source: platform, songmid: platform }] }
  })
  resolveUrl.mockRejectedValueOnce(new Error('resolve failed')).mockResolvedValueOnce('four-url')
  const result = await createPlaybackFallback(song, () => true).load(load)

  expect(result?.target.source).toBe('four')
  expect(resolveUrl.mock.calls.slice(1).map(([, options]) => options?.target?.source)).toEqual([
    'three',
    'four'
  ])
  expect(search).not.toHaveBeenCalledWith('search', expect.objectContaining({ source: 'mix' }))
})

it('only spends one cross-source attempt per platform, and skips searches after reaching the cap', async () => {
  settings = {
    preferPlatforms: true,
    platformOrder: ['two', 'three', 'four'],
    sourceAttempts: 2,
    strategies: { plugin: false, source: true, quality: false }
  }
  rejectOriginal()
  search.mockImplementation(async (_method, args) => {
    const platform = (args as { source: string }).source
    return {
      list: ['a', 'b'].map((suffix) => ({ ...song, source: platform, songmid: platform + suffix }))
    }
  })
  resolveUrl.mockRejectedValue(new Error('resolve failed'))
  await expect(createPlaybackFallback(song, () => true).load(load)).resolves.toBeUndefined()
  expect(resolveUrl.mock.calls.slice(1).map(([, options]) => options?.target?.source)).toEqual([
    'two',
    'three'
  ])
  expect(search).not.toHaveBeenCalledWith('search', expect.objectContaining({ source: 'four' }))
})

it.each([
  [undefined, ['b', 'c', 'd']],
  [2, ['b', 'c']],
  [6, ['b', 'c', 'd', 'e']]
] as const)(
  'tries no more available plugins than the configured cap %s',
  async (pluginAttempts, expected) => {
    settings = { pluginAttempts, strategies: { plugin: true, source: false, quality: false } }
    rejectOriginal()
    resolveUrl.mockRejectedValue(new Error('resolve failed'))
    await createPlaybackFallback(song, () => true).load(load)
    expect(resolveUrl.mock.calls.slice(1).map(([, options]) => options?.target?.pluginId)).toEqual(
      expected
    )
  }
)

it('skips cross-plugin resolution for a private track even if other plugins serve the same platform', async () => {
  settings.strategies = { plugin: true, source: false, quality: false }
  rejectOriginal()
  await createPlaybackFallback(
    {
      ...song,
      pluginResource: {
        providerId: 'one',
        kind: 'track',
        id: '1',
        pluginId: 'a',
        connectionId: 'account'
      }
    },
    () => true
  ).load(load)
  expect(resolveUrl).toHaveBeenCalledTimes(1)
  expect(search).not.toHaveBeenCalled()
})

it('tries a title-only query when the title and artist query has no matches', async () => {
  settings = { preferPlatforms: true, strategies: { plugin: false, source: true, quality: false } }
  rejectOriginal()
  search.mockResolvedValueOnce({ list: [] }).mockResolvedValueOnce({
    list: [{ ...song, name: '反方向的钟', singer: '周杰伦', source: 'two' }]
  })
  resolveUrl.mockResolvedValueOnce('correct-song')
  const result = await createPlaybackFallback(
    { ...song, name: '反方向的钟（杰伦）', singer: '周杰伦' },
    () => true
  ).load(load)
  expect(result?.target.source).toBe('two')
  expect(search.mock.calls.map(([, args]) => args.keyword)).toEqual([
    '反方向的钟 周杰伦',
    '反方向的钟'
  ])
})
