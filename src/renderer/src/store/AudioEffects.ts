import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface AudioEffectsState {
  bassBoost: {
    enabled: boolean
    gain: number // -12 to 12
  }
  surround: {
    enabled: boolean
    mode: 'off' | 'small' | 'medium' | 'large'
  }
  balance: {
    enabled: boolean
    value: number // -1 (Left) to 1 (Right)
  }
  /**
   * 响度均衡 (Loudness Normalization)
   * 仅作用于软件内部播放，不影响系统/游戏音量。
   */
  loudness: {
    enabled: boolean
    target: 'gentle' | 'standard' | 'strong'
  }
}

export const useAudioEffectsStore = defineStore(
  'audioEffects',
  () => {
    const bassBoost = ref({
      enabled: false,
      gain: 0
    })

    const surround = ref({
      enabled: false,
      mode: 'off' as const
    })

    const balance = ref({
      enabled: true,
      value: 0
    })

    // 默认关闭：响度均衡对游戏/竞技场景不一定友好,需要用户主动开启
    const loudness = ref<AudioEffectsState['loudness']>({
      enabled: false,
      target: 'standard'
    })

    const resetEffects = () => {
      bassBoost.value = { enabled: false, gain: 0 }
      surround.value = { enabled: false, mode: 'off' }
      balance.value = { enabled: true, value: 0 }
      loudness.value = { enabled: false, target: 'standard' }
    }

    return {
      bassBoost,
      surround,
      balance,
      loudness,
      resetEffects
    }
  },
  {
    persist: true
  }
)
