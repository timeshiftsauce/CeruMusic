import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface EqualizerPreset {
  name: string
  gains: number[]
}

export const useEqualizerStore = defineStore(
  'equalizer',
  () => {
    const enabled = ref(false)
    const currentPreset = ref('Flat')
    // 10 bands gains
    const gains = ref<number[]>(new Array(10).fill(0))

    const presets = ref<EqualizerPreset[]>([
      { name: 'Flat', gains: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] },
      { name: 'Pop', gains: [4, 3, 2, 0, -2, -2, 0, 2, 3, 4] },
      { name: 'Rock', gains: [5, 4, 3, 1, -1, -1, 1, 3, 4, 5] },
      { name: 'Jazz', gains: [3, 2, 1, 2, -2, -2, 0, 2, 3, 4] },
      { name: 'Classical', gains: [4, 3, 2, 1, -1, -1, 0, 2, 3, 4] },
      { name: 'Bass Boost', gains: [6, 5, 4, 2, 0, 0, 0, 0, 0, 0] },
      { name: 'Vocal Boost', gains: [-2, -2, -1, 1, 4, 4, 2, 1, 0, -1] },
      { name: 'Treble Boost', gains: [0, 0, 0, 0, 0, 1, 3, 5, 6, 7] }
    ])

    const logs = ref<string[]>([])

    function addLog(message: string) {
      const timestamp = new Date().toISOString()
      logs.value.unshift(`[${timestamp}] ${message}`)
      if (logs.value.length > 100) logs.value.pop()
    }

    return {
      enabled,
      currentPreset,
      gains,
      presets,
      logs,
      addLog
    }
  },
  {
    persist: true
  }
)
