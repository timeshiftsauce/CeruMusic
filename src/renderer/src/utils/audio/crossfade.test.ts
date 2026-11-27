import { crossfadeManager, crossfadeState } from './crossfade'
import { waitForAudioReady } from './audioHelpers'
import { analyseMixTrack } from './automixAnalysis'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { getSongRealUrl } from '@renderer/utils/playlist/playlistManager'
import type { AudioEventType, SongList } from '@renderer/types/audio'

jest.mock('@renderer/store/ControlAudio', () => ({ ControlAudioStore: jest.fn() }))
jest.mock('@renderer/store', () => ({
  usePlaySettingStore: () => ({ getIsSeamlessTransition: true })
}))
jest.mock('@renderer/store/dlna', () => ({ useDlnaStore: () => ({ currentDevice: null }) }))
jest.mock('@renderer/store/LocalUserDetail', () => ({
  LocalUserDetailStore: () => ({ userInfo: {} })
}))
jest.mock('@renderer/store/GlobalPlayStatus', () => ({ useGlobalPlayStatusStore: jest.fn() }))
jest.mock('@renderer/utils/playlist/playlistManager', () => ({ getSongRealUrl: jest.fn() }))
jest.mock('@renderer/utils/listenTogether/state', () => ({ isLtInRoom: () => false }))
jest.mock('./audioHelpers', () => ({ waitForAudioReady: jest.fn() }))
jest.mock('./automixAnalysis', () => ({ analyseMixTrack: jest.fn().mockResolvedValue(null) }))
jest.mock('./playbackFallback', () => ({
  createPlaybackFallback: (song: SongList) => ({
    load: async (prepare: (url: string) => Promise<void>) => {
      const url = await jest
        .requireMock('@renderer/utils/playlist/playlistManager')
        .getSongRealUrl(song)
      await prepare(url)
      return { url }
    },
    playing: jest.fn()
  })
}))
jest.mock('./audioManager', () => {
  const param = {
    cancelScheduledValues: jest.fn(),
    setValueAtTime: jest.fn(),
    setValueCurveAtTime: jest.fn(),
    linearRampToValueAtTime: jest.fn()
  }
  return {
    getEnvelopeAnalyser: () => null,
    getOrCreateAudioSource: jest.fn(),
    getCrossfadeGain: () => ({ gain: param }),
    getCrossfadeBassGain: () => param,
    getContext: () => ({ currentTime: 0 }),
    resetCrossfadeNodes: jest.fn()
  }
})

describe('seamless transition', () => {
  const nextSong = { source: 'local', songmid: 'next', name: 'Next' } as SongList
  const primary = { paused: false, ended: false, duration: 60, currentTime: 40, playbackRate: 1 }
  const secondary = {
    currentTime: 0,
    playbackRate: 1,
    play: jest.fn().mockResolvedValue(undefined),
    pause: jest.fn(),
    load: jest.fn(),
    removeAttribute: jest.fn()
  }
  const listeners = new Map<AudioEventType, () => void>()
  const store = {
    Audio: { audio: primary, duration: 60, volume: 80 },
    getPrimaryEl: () => primary,
    getSecondaryEl: () => secondary,
    setSecondaryUrl: jest.fn(),
    clearSecondarySrc: jest.fn(),
    swapPrimarySlot: jest.fn(),
    setDuration: jest.fn(),
    setCurrentTime: jest.fn(),
    subscribe: (event: AudioEventType, callback: () => void) => {
      listeners.set(event, callback)
      return () => listeners.delete(event)
    }
  }
  const prepared = { dispose: jest.fn() }
  const status = {
    prepareSong: jest.fn(),
    commitPrepared: jest.fn(),
    commitTransitionSong: jest.fn()
  }

  beforeEach(() => {
    jest.clearAllMocks()
    jest.useFakeTimers()
    primary.currentTime = 40
    jest
      .mocked(ControlAudioStore)
      .mockReturnValue(store as unknown as ReturnType<typeof ControlAudioStore>)
    jest
      .mocked(useGlobalPlayStatusStore)
      .mockReturnValue(status as unknown as ReturnType<typeof useGlobalPlayStatusStore>)
    jest.mocked(getSongRealUrl).mockResolvedValue('test-audio')
    jest.mocked(waitForAudioReady).mockResolvedValue(undefined)
    jest.mocked(analyseMixTrack).mockResolvedValue(null)
    status.prepareSong.mockResolvedValue(prepared)
    crossfadeManager.init(() => nextSong)
  })

  afterEach(() => {
    crossfadeManager.destroy()
    jest.useRealTimers()
  })

  function playIntoTail() {
    listeners.get('timeupdate')?.()
    expect(getSongRealUrl).toHaveBeenCalledTimes(1)
    primary.currentTime = 52
    listeners.get('timeupdate')?.()
  }

  it('uses the media clock to start even when the analyser is unavailable', async () => {
    listeners.get('timeupdate')?.()
    await jest.advanceTimersByTimeAsync(0)

    expect(waitForAudioReady).toHaveBeenCalledTimes(1)
    expect(secondary.play).not.toHaveBeenCalled()

    primary.currentTime = 52
    listeners.get('timeupdate')?.()
    await jest.advanceTimersByTimeAsync(0)

    expect(secondary.play).toHaveBeenCalledTimes(1)
    expect(store.swapPrimarySlot).toHaveBeenCalledTimes(1)
    expect(status.commitPrepared).toHaveBeenCalledWith(prepared)
    expect(crossfadeState.active).toBe(true)
  })

  it('starts metadata preparation while the next audio buffers and cancels it on ended', async () => {
    let ready!: () => void
    jest.mocked(waitForAudioReady).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          ready = resolve
        })
    )
    playIntoTail()
    await jest.advanceTimersByTimeAsync(0)

    expect(status.prepareSong).toHaveBeenCalledWith(nextSong, expect.any(AbortSignal))
    expect(secondary.play).not.toHaveBeenCalled()
    listeners.get('ended')?.()
    ready()
    await jest.advanceTimersByTimeAsync(0)

    expect(prepared.dispose).toHaveBeenCalledTimes(1)
    expect(store.swapPrimarySlot).not.toHaveBeenCalled()
    expect(crossfadeState.scheduled).toBe(false)
  })

  it('starts mixing while metadata is still pending and uses the actual media duration', async () => {
    let finishMetadata!: (value: typeof prepared) => void
    status.prepareSong.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishMetadata = resolve
        })
    )
    store.Audio.duration = 0
    try {
      playIntoTail()
      await jest.advanceTimersByTimeAsync(0)

      expect(secondary.play).toHaveBeenCalledTimes(1)
      expect(store.swapPrimarySlot).toHaveBeenCalledTimes(1)
      expect(status.commitPrepared).not.toHaveBeenCalled()
      const [song, metadata] = status.commitTransitionSong.mock.calls[0]
      expect(song).toBe(nextSong)
      finishMetadata(prepared)
      await expect(metadata).resolves.toBe(prepared)
    } finally {
      store.Audio.duration = 60
    }
  })

  it('preserves the matched rate through the slot swap and restores it after the fade', async () => {
    jest
      .mocked(analyseMixTrack)
      .mockImplementation(async (_url, _duration, segment) =>
        segment === 'tail' ? { period: 0.5, phase: 0.1 } : { period: 0.51, phase: 0.2 }
      )
    listeners.get('timeupdate')?.()
    await jest.advanceTimersByTimeAsync(0)
    primary.currentTime = 52
    listeners.get('timeupdate')?.()
    await jest.advanceTimersByTimeAsync(0)

    expect(secondary.playbackRate).toBeCloseTo(1.02)
    expect(secondary.currentTime).toBeCloseTo(0.098)
    expect(
      crossfadeManager.playbackRateFor(secondary as unknown as HTMLAudioElement, 1)
    ).toBeCloseTo(1.02)
    await jest.advanceTimersByTimeAsync(8000)
    expect(secondary.playbackRate).toBe(1)
  })
})
