import { computed, onBeforeUnmount, ref, watch, type InjectionKey, type Ref } from 'vue'
import { desktopBridge } from '@renderer/services/desktopBridge'

const durationMs = 12000
const line = (startTimeMs: number, text: string, isDuet = false) => {
  const characters = Array.from(text)
  const endTimeMs = startTimeMs + 3600
  const words = characters.map((character, index) => ({
    text: character,
    startTimeMs: startTimeMs + Math.round(3600 * index / characters.length),
    endTimeMs: startTimeMs + Math.round(3600 * (index + 1) / characters.length)
  }))
  return { startTimeMs, endTimeMs, text, words, isDuet, isBackground: false }
}
export const skinSamples = {
  words: { title: '晚风', label: '逐字', artists: ['林舟'], lines: [line(0, '晚风穿过窗'), line(4000, '灯影慢慢亮'), line(8000, '夜色落在肩上')] },
  duet: { title: '隔岸', label: '对唱', artists: ['林舟', '南音'], lines: [line(0, '你在河的那边'), line(4000, '我听见你的回答', true), line(8000, '水面泛起星光')] },
  empty: { title: '余晖', label: '无歌词', artists: ['南音'], lines: [] }
}

export function useSkinSimulator(visible: Ref<boolean>) {
  const enabled = ref(false), active = ref(false), playing = ref(false)
  const sample = ref<keyof typeof skinSamples>('words'), theme = ref<'dark' | 'light'>('dark')
  const time = ref(0), frameMs = ref(0)
  const fixture = computed(() => skinSamples[sample.value])
  const palette = computed(() => theme.value === 'dark'
    ? { accent: '#91c7af', foreground: '#f5f6f5', background: '#202524' }
    : { accent: '#487660', foreground: '#202524', background: '#f3f5f2' })
  const track = computed(() => ({ title: fixture.value.title, artists: fixture.value.artists, album: '皮肤预览', durationMs }))
  function seek(milliseconds: number) {
    if (Number.isFinite(milliseconds)) time.value = Math.min(durationMs, Math.max(0, Math.round(milliseconds)))
  }
  function togglePlay() {
    if (time.value >= durationMs) seek(0)
    playing.value = !playing.value
  }
  function close() { active.value = false; playing.value = false; time.value = 0; frameMs.value = 0 }
  watch(sample, () => seek(0))
  watch(visible, (shown, _, clean) => {
    if (!shown) { enabled.value = false; close(); return }
    let revision = 0
    async function refresh() {
      const current = ++revision
      const state = await desktopBridge.api.plugins.devState().catch(() => null)
      if (revision !== current) return
      enabled.value = state?.enabled === true
      if (!enabled.value) close()
    }
    const unsubscribe = desktopBridge.api.plugins.onDevReloaded(refresh)
    void refresh()
    clean(() => { revision++; unsubscribe() })
  }, { immediate: true })
  watch(active, (running, _, clean) => {
    if (!running) return
    let previous = 0, elapsed = 0, count = 0, handle = 0
    function tick(now: number) {
      if (previous) {
        const delta = now - previous
        elapsed += delta; count++
        if (elapsed >= 400) { frameMs.value = Math.round(10 * elapsed / count) / 10; count = 0; elapsed = 0 }
        if (playing.value) {
          time.value = Math.min(durationMs, time.value + delta)
          if (time.value >= durationMs) playing.value = false
        }
      }
      previous = now
      handle = requestAnimationFrame(tick)
    }
    function visibility() {
      cancelAnimationFrame(handle); previous = 0; count = 0; elapsed = 0
      if (!document.hidden) handle = requestAnimationFrame(tick)
    }
    visibility()
    document.addEventListener('visibilitychange', visibility)
    clean(() => { cancelAnimationFrame(handle); document.removeEventListener('visibilitychange', visibility) })
  })
  onBeforeUnmount(close)
  return { enabled, active, playing, sample, theme, time, frameMs, fixture, palette, track, durationMs, seek, togglePlay, close }
}
export const skinSimulatorKey: InjectionKey<ReturnType<typeof useSkinSimulator>> = Symbol('skin-simulator')
