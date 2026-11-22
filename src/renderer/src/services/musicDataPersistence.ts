import { ref } from 'vue'
export const musicStartupReady = ref(false)
import { MUSIC_SHADOW_PREFIX } from '@common/musicDataMigration'
const enabled = ref(false)
export const canPersistMusicData = () => enabled.value
export const setMusicDataPersistence = (value: boolean) => {
  enabled.value = value
}
// Deferral never overwrites the legacy originals. New user actions use an overlay until repair.
export const getMusicStorage = (key: string) =>
  localStorage.getItem(MUSIC_SHADOW_PREFIX + key) ?? localStorage.getItem(key)
export const setMusicStorage = (key: string, value: string) => {
  if (!enabled.value) return
  localStorage.setItem(
    localStorage.getItem('ceru-music-data-version') === '2' ? key : MUSIC_SHADOW_PREFIX + key,
    value
  )
}
