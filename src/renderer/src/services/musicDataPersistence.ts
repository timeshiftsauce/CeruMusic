import { ref } from 'vue'
export const musicStartupReady = ref(false)
import { MUSIC_SHADOW_PREFIX } from '@common/musicDataMigration'
let enabled = false
export const canPersistMusicData = () => enabled
export const setMusicDataPersistence = (value: boolean) => {
  enabled = value
}
// Deferral never overwrites the legacy originals. New user actions use an overlay until repair.
export const getMusicStorage = (key: string) =>
  localStorage.getItem(MUSIC_SHADOW_PREFIX + key) ?? localStorage.getItem(key)
export const setMusicStorage = (key: string, value: string) => {
  if (!enabled) return
  localStorage.setItem(
    localStorage.getItem('ceru-music-data-version') === '2' ? key : MUSIC_SHADOW_PREFIX + key,
    value
  )
}
