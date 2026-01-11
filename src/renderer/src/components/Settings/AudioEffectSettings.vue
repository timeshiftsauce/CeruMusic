<template>
  <div class="audio-effects-settings">
    <t-card title="高级音效处理 (Audio Effects)" :bordered="false">
      <template #actions>
        <t-button theme="default" variant="text" @click="resetAll">重置全部</t-button>
      </template>

      <div class="effects-grid">
        <!-- 1. Bass Boost -->
        <div class="effect-card">
          <div class="card-header">
            <div class="title">低音增强 (Bass Boost)</div>
            <t-switch v-model="bassBoost.enabled" />
          </div>
          <div class="card-content">
            <div class="control-group">
              <label>低频增益</label>
              <t-slider
                v-model="bassBoost.gain"
                :min="-12"
                :max="12"
                :step="0.5"
                :disabled="!bassBoost.enabled"
                :label="`${bassBoost.gain}dB`"
              />
            </div>
            <div class="presets">
              <t-radio-group
                v-model="bassPreset"
                variant="default-filled"
                :disabled="!bassBoost.enabled"
                @change="(val) => applyBassPreset(val as string)"
              >
                <t-radio-button value="light">轻度</t-radio-button>
                <t-radio-button value="medium">中度</t-radio-button>
                <t-radio-button value="heavy">重度</t-radio-button>
              </t-radio-group>
            </div>
          </div>
        </div>

        <!-- 2. Surround Sound -->
        <div class="effect-card">
          <div class="card-header">
            <div class="title">环绕音效 (Surround)</div>
            <t-switch v-model="surround.enabled" />
          </div>
          <div class="card-content">
            <div class="control-group">
              <label>环境模拟</label>
              <t-radio-group
                v-model="surround.mode"
                variant="default-filled"
                :disabled="!surround.enabled"
              >
                <t-radio-button value="off">关闭</t-radio-button>
                <t-radio-button value="small">小房间</t-radio-button>
                <t-radio-button value="medium">中厅堂</t-radio-button>
                <t-radio-button value="large">大教堂</t-radio-button>
              </t-radio-group>
            </div>
            <div class="info-text">模拟 5.1/7.1 虚拟声场与环境混响</div>
          </div>
        </div>

        <!-- 3. Channel Balance -->
        <div class="effect-card">
          <div class="card-header">
            <div class="title">声道平衡 (Balance)</div>
            <t-switch v-model="balance.enabled" />
          </div>
          <div class="card-content">
            <div class="control-group">
              <div class="balance-labels">
                <span>Left</span>
                <span>Right</span>
              </div>
              <t-slider
                v-model="balance.value"
                :min="-1"
                :max="1"
                :step="0.05"
                :disabled="!balance.enabled"
                :tooltip-format="(val) => formatBalance(val as number)"
              />
            </div>
            <div class="visual-balance">
              <div class="speaker left" :style="{ opacity: 1 - Math.max(0, balance.value) }">
                🔊 L
              </div>
              <div class="listener">😐</div>
              <div class="speaker right" :style="{ opacity: 1 - Math.max(0, -balance.value) }">
                🔊 R
              </div>
            </div>
            <div style="text-align: center; margin-top: 10px">
              <t-button
                size="small"
                variant="outline"
                :disabled="!balance.enabled"
                @click="balance.value = 0"
                >居中校准</t-button
              >
            </div>
          </div>
        </div>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useAudioEffectsStore } from '@renderer/store/AudioEffects'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import AudioManager from '@renderer/utils/audio/audioManager'

const store = useAudioEffectsStore()
const audioStore = ControlAudioStore()
const { bassBoost, surround, balance } = storeToRefs(store)

const bassPreset = ref('light')

const applyEffects = () => {
  const audio = audioStore.Audio.audio
  if (!audio) return

  // Bass Boost
  const targetBass = bassBoost.value.enabled ? bassBoost.value.gain : 0
  AudioManager.setBassBoost(audio, targetBass)

  // Surround
  const targetSurround = surround.value.enabled ? surround.value.mode : 'off'
  AudioManager.setSurroundMode(audio, targetSurround)

  // Balance
  const targetBalance = balance.value.enabled ? balance.value.value : 0
  AudioManager.setBalance(audio, targetBalance)
}

// Watchers
watch(
  [bassBoost, surround, balance],
  () => {
    applyEffects()
  },
  { deep: true }
)

// Also watch audio element change
watch(
  () => audioStore.Audio.audio,
  (newVal) => {
    if (newVal) applyEffects()
  }
)

const applyBassPreset = (val: string) => {
  if (!bassBoost.value.enabled) return
  switch (val) {
    case 'light':
      bassBoost.value.gain = 3
      break
    case 'medium':
      bassBoost.value.gain = 6
      break
    case 'heavy':
      bassBoost.value.gain = 9
      break
  }
}

const resetAll = () => {
  store.resetEffects()
}

const formatBalance = (val: number) => {
  if (val === 0) return 'Center'
  return val < 0
    ? `Left ${Math.abs(val * 100).toFixed(0)}%`
    : `Right ${Math.abs(val * 100).toFixed(0)}%`
}

onMounted(() => {
  applyEffects()
})
</script>

<style scoped>
.audio-effects-settings {
  padding: 20px 0;
}

.effects-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 20px;
  margin-top: 20px;
}

.effect-card {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  padding: 16px;
  transition: all 0.3s;
}

.effect-card:hover {
  border-color: var(--td-brand-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  border-bottom: 1px solid var(--td-component-stroke);
  padding-bottom: 8px;
}

.title {
  font-weight: 600;
  font-size: 16px;
}

.card-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.control-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.control-group label {
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.presets {
  display: flex;
  justify-content: center;
  margin-top: 8px;
}

.info-text {
  font-size: 12px;
  color: var(--td-text-color-disabled);
  text-align: center;
}

.balance-labels {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.visual-balance {
  display: flex;
  justify-content: space-around;
  align-items: center;
  margin-top: 10px;
  font-size: 20px;
  background: var(--td-bg-color-secondarycontainer);
  padding: 10px;
  border-radius: 8px;
}
</style>
