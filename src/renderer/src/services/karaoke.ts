import { computed, ref } from 'vue'
import { desktopBridge } from './desktopBridge'
import { karaokePacks, packBytes, type PackId, type ModelDownload } from '@common/karaoke'

export const modelDownloads = ref<ModelDownload[]>(
  karaokePacks.map((pack) => ({
    id: pack.id,
    phase: 'absent',
    bytes: 0,
    message: '',
    createdAt: 0
  }))
)
const savedPack = localStorage.getItem('karaoke.resource')
export const selectedPack = ref(karaokePacks.find((p) => p.id === savedPack) ?? karaokePacks[0])
export const karaokeEnabled = ref(false)
export const karaokeBalance = ref(0)
export const karaokePitch = ref(0)
export const karaokeGains = ref<Record<string, number>>({})
export const karaokeMessage = ref('')
export const karaokePlaybackError = ref('')
export const karaokeAttempt = ref(0)

export function retryKaraokePlayback() {
  if (!karaokeEnabled.value) return
  karaokePlaybackError.value = ''
  karaokeAttempt.value++
}
export const currentDownload = computed(
  () => modelDownloads.value.find((d) => d.id === selectedPack.value.id)!
)
export function percent(state: ModelDownload) {
  return Math.floor((state.bytes * 100) / packBytes(karaokePacks.find((p) => p.id === state.id)!))
}
export function selectPack(id: PackId) {
  const pack = karaokePacks.find((p) => p.id === id)
  if (!pack || modelDownloads.value.find((p) => p.id === id)?.phase !== 'ready') return
  selectedPack.value = pack
  localStorage.setItem('karaoke.resource', id)
  karaokeGains.value = {}
}
let observers = 0
let unsubscribe: (() => void) | undefined
export function observeKaraokeModel() {
  if (!observers++) {
    const api = desktopBridge.api.karaoke
    const changed = new Set<PackId>()
    const update = (state: ModelDownload) => {
      modelDownloads.value = modelDownloads.value.map((item) =>
        item.id === state.id ? state : item
      )
      if (selectedPack.value.id === state.id && state.phase !== 'ready') setKaraokeEnabled(false)
      if (state.phase === 'absent' && state.id === selectedPack.value.id) {
        const alternative = modelDownloads.value.find((item) => item.phase === 'ready')
        if (alternative) selectPack(alternative.id)
      }
      if (state.phase === 'ready' && currentDownload.value.phase === 'absent') selectPack(state.id)
    }
    unsubscribe = api.subscribe((state) => {
      changed.add(state.id)
      update(state)
    })
    void api
      .status()
      .then((states) => {
        states.filter((s) => !changed.has(s.id)).forEach(update)
        const installed = modelDownloads.value.find((d) => d.phase === 'ready')
        if (installed && currentDownload.value.phase === 'absent') selectPack(installed.id)
      })
      .catch(() => {})
  }
  return () => {
    if (--observers === 0) unsubscribe?.()
  }
}
export function setKaraokeEnabled(on: boolean) {
  if (on && currentDownload.value.phase !== 'ready') return
  if (karaokeEnabled.value === on) return
  karaokeEnabled.value = on
  if (!on) {
    karaokeMessage.value = ''
    karaokePlaybackError.value = ''
    void desktopBridge.api.karaoke.release().catch(() => {})
  }
}
