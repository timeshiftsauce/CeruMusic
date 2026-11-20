import { createPinia, setActivePinia } from 'pinia'
import { effectScope } from 'vue'
import { LocalUserDetailStore } from './LocalUserDetail'
import { setMusicStorage } from '@renderer/services/musicDataPersistence'

jest.mock('./ControlAudio', () => ({ ControlAudioStore: () => ({ setVolume: jest.fn() }) }))
jest.mock('@renderer/services/musicDataPersistence', () => ({ getMusicStorage: jest.fn(), setMusicStorage: jest.fn() }))

test('source preferences outlive the page that initialized the store', () => {
  setActivePinia(createPinia())
  const store = LocalUserDetailStore(), page = effectScope()
  page.run(() => store.init())
  page.stop()
  const save = jest.mocked(setMusicStorage)
  save.mockClear()
  store.userInfo = { ...store.userInfo, selectSources:'catalog' }
  expect(JSON.parse(save.mock.lastCall![1]).selectSources).toBe('catalog')
  store.$dispose()
  save.mockClear()
  store.userInfo.selectSources = 'local'
  expect(save).not.toHaveBeenCalled()
})
