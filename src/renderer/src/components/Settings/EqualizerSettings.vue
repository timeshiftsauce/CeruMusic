<template>
  <div class="equalizer-settings">
    <t-card title="全局均衡器 (Professional EQ)" :bordered="false">
      <template #actions>
        <t-space>
          <t-switch v-model="enabled" :label="['开启', '关闭']" />
          <t-button theme="default" variant="text" @click="resetToCurrentPreset">重置</t-button>
        </t-space>
      </template>

      <div class="eq-content">
        <!-- Visualizer -->
        <div class="visualizer-container">
          <canvas ref="canvasRef" height="200"></canvas>
        </div>

        <!-- Preset Selector -->
        <div class="controls-row">
          <t-space align="center">
            <t-select
              v-model="currentPresetName"
              placeholder="选择预设"
              class="preset-select"
              @change="(val) => handlePresetChange(val as string)"
            >
              <t-option
                v-for="preset in presets"
                :key="preset.name"
                :label="preset.name"
                :value="preset.name"
              />
            </t-select>

            <!-- 保存当前值到预设 - 只对自定义预设显示 -->
            <t-button
              v-if="canDeleteCurrentPreset"
              theme="primary"
              variant="text"
              size="small"
              @click="saveCurrentToPreset"
            >
              <template #icon><SaveIcon /></template>
              保存当前值
            </t-button>

            <!-- 删除预设按钮 - 只对自定义预设显示 -->
            <t-button
              v-if="canDeleteCurrentPreset"
              theme="danger"
              variant="text"
              size="small"
              @click="confirmDeletePreset"
            >
              <template #icon><DeleteIcon /></template>
              删除
            </t-button>
          </t-space>

          <t-space>
            <t-button theme="primary" variant="outline" @click="savePresetDialogVisible = true"
              >保存预设</t-button
            >
            <t-button theme="default" variant="outline" @click="exportConfig">导出配置</t-button>
            <t-button theme="default" variant="outline" @click="triggerImport">导入配置</t-button>
            <input
              ref="fileInputRef"
              type="file"
              accept=".json"
              style="display: none"
              @change="handleFileImport"
            />
          </t-space>
        </div>

        <!-- Sliders -->
        <div class="sliders-container">
          <div v-for="(freq, index) in frequencies" :key="index" class="slider-group">
            <div class="slider-wrapper">
              <t-slider
                v-model="gains[index]"
                :min="-12"
                :max="12"
                :step="0.1"
                layout="vertical"
                :show-tooltip="true"
                :disabled="!enabled"
                @change="(val) => onGainChange(index, val as number)"
              />
            </div>
            <span class="freq-label">{{ formatFreq(freq) }}</span>
            <span class="gain-label">{{ gains[index].toFixed(1) }}dB</span>
          </div>
        </div>
      </div>
    </t-card>

    <t-dialog
      v-model:visible="savePresetDialogVisible"
      header="保存为新预设"
      @confirm="saveNewPreset"
    >
      <t-input v-model="newPresetName" placeholder="输入预设名称" />
    </t-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useEqualizerStore } from '@renderer/store/Equalizer'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import AudioManager from '@renderer/utils/audio/audioManager'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { DeleteIcon, SaveIcon } from 'tdesign-icons-vue-next'

// 内置预设列表 - 这些预设不能被删除
const BUILTIN_PRESETS = ['Flat', 'Pop', 'Rock', 'Jazz', 'Classical', 'Bass Boost', 'Vocal Boost', 'Treble Boost']

const eqStore = useEqualizerStore()
const audioStore = ControlAudioStore()
const { enabled, currentPreset, gains, presets } = storeToRefs(eqStore)
const audio = computed(() => audioStore.Audio.audio)

const frequencies = AudioManager.EQ_FREQUENCIES
const canvasRef = ref<HTMLCanvasElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const savePresetDialogVisible = ref(false)
const newPresetName = ref('')

let animationId: number
let analyser: AnalyserNode | null = null

// Format frequency for display
const formatFreq = (freq: number) => {
  return freq >= 1000 ? `${freq / 1000}k` : `${freq}`
}

// Current preset name wrapper to handle custom changes
const currentPresetName = computed({
  get: () => currentPreset.value,
  set: (val) => {
    currentPreset.value = val
  }
})

// 判断当前预设是否可以删除（非内置预设）
const canDeleteCurrentPreset = computed(() => {
  return !BUILTIN_PRESETS.includes(currentPreset.value)
})

// 删除预设确认
const confirmDeletePreset = () => {
  if (!canDeleteCurrentPreset.value) {
    MessagePlugin.warning('内置预设不能删除')
    return
  }

  const dialog = DialogPlugin.confirm({
    header: '删除预设',
    body: `确定要删除预设 "${currentPreset.value}" 吗？`,
    confirmBtn: {
      theme: 'danger',
      content: '删除'
    },
    onConfirm: () => {
      deleteCurrentPreset()
      dialog.destroy()
    }
  })
}

// 删除当前预设
const deleteCurrentPreset = () => {
  const presetName = currentPreset.value
  const index = presets.value.findIndex((p) => p.name === presetName)

  if (index === -1) {
    MessagePlugin.error('预设不存在')
    return
  }

  // 删除预设
  presets.value.splice(index, 1)

  // 切换到 Flat 预设
  currentPreset.value = 'Flat'
  handlePresetChange('Flat')

  MessagePlugin.success(`预设 "${presetName}" 已删除`)
  eqStore.addLog(`Deleted preset: ${presetName}`)
}

// 保存当前增益值到当前自定义预设
const saveCurrentToPreset = () => {
  const presetName = currentPreset.value

  // 只有自定义预设才能保存
  if (BUILTIN_PRESETS.includes(presetName)) {
    MessagePlugin.warning('内置预设不能修改，请创建新预设')
    return
  }

  const preset = presets.value.find((p) => p.name === presetName)
  if (!preset) {
    MessagePlugin.error('预设不存在')
    return
  }

  // 更新预设的增益值
  preset.gains = [...gains.value]

  MessagePlugin.success(`已保存当前值到预设 "${presetName}"`)
  eqStore.addLog(`Updated preset "${presetName}" with current gains: ${gains.value.map(g => g.toFixed(1)).join(', ')}`)
}

// Apply gains to AudioManager
const applyGains = () => {
  if (!audio.value) return

  const targetGains = enabled.value ? gains.value : new Array(10).fill(0)

  targetGains.forEach((gain, index) => {
    AudioManager.setEqualizerBand(audio.value!, index, gain)
  })
}

// Watchers
watch(
  [gains, enabled],
  () => {
    applyGains()
    // If gains change and don't match preset, set preset to 'Custom'
    // Simplified logic here
  },
  { deep: true }
)

watch(audio, (newAudio) => {
  if (newAudio) {
    setupVisualizer()
    applyGains()
  }
})

// Preset handling
const handlePresetChange = (val: string) => {
  const preset = presets.value.find((p) => p.name === val)
  if (preset) {
    gains.value = [...preset.gains]
    eqStore.addLog(`Applied preset: ${val}`)
  }
}

const onGainChange = (index: number, val: number) => {
  // If we change a slider, we might drift from the preset.
  // For now just let it be.
  eqStore.addLog(`Adjusted band ${frequencies[index]}Hz to ${val}dB`)
}

// 重置功能：
// - 内置预设：恢复到该预设的原始值
// - 自定义预设：恢复到创建时基于的源预设值
const resetToCurrentPreset = () => {
  const presetName = currentPreset.value

  // 判断是否是内置预设
  if (BUILTIN_PRESETS.includes(presetName)) {
    // 内置预设：恢复到该预设的原始值
    const preset = presets.value.find((p) => p.name === presetName)
    if (preset) {
      gains.value = [...preset.gains]
      MessagePlugin.success(`已重置到 "${presetName}" 预设的原始值`)
      eqStore.addLog(`Reset to preset original values: ${presetName}`)
    }
  } else {
    // 自定义预设：恢复到创建时基于的源预设值
    const preset = presets.value.find((p) => p.name === presetName)
    if (preset && preset.basePreset) {
      // 有记录源预设，恢复到源预设的值
      const basePreset = presets.value.find((p) => p.name === preset.basePreset)
      if (basePreset) {
        gains.value = [...basePreset.gains]
        MessagePlugin.success(`已重置到源预设 "${preset.basePreset}" 的值`)
        eqStore.addLog(`Reset custom preset "${presetName}" to base preset "${preset.basePreset}"`)
      }
    } else {
      // 没有记录源预设（兼容旧数据），恢复到 Flat
      handlePresetChange('Flat')
      MessagePlugin.success('已重置到 Flat (000)')
      eqStore.addLog(`Reset custom preset "${presetName}" to Flat`)
    }
  }
}

const saveNewPreset = () => {
  if (!newPresetName.value) return

  // 记录当前选中的预设作为源预设
  const basePresetName = currentPreset.value

  presets.value.push({
    name: newPresetName.value,
    gains: [...gains.value],
    basePreset: basePresetName // 记录基于哪个预设创建的
  })
  currentPreset.value = newPresetName.value
  savePresetDialogVisible.value = false
  newPresetName.value = ''
  MessagePlugin.success('预设保存成功')
  eqStore.addLog(`Saved new preset based on "${basePresetName}": ${newPresetName.value}`)
}

// Import/Export
const exportConfig = () => {
  const data = JSON.stringify(
    {
      presets: presets.value,
      currentPreset: currentPreset.value,
      gains: gains.value,
      enabled: enabled.value
    },
    null,
    2
  )

  const blob = new Blob([data], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'ceru-music-eq-config.json'
  a.click()
  URL.revokeObjectURL(url)
  eqStore.addLog('Exported configuration')
}

const triggerImport = () => {
  fileInputRef.value?.click()
}

const handleFileImport = async (event: Event) => {
  const input = event.target as HTMLInputElement
  if (!input.files?.length) return

  const file = input.files[0]
  try {
    const text = await file.text()
    const data = JSON.parse(text)

    if (data.presets) presets.value = data.presets
    if (data.enabled !== undefined) enabled.value = data.enabled
    if (data.gains) gains.value = data.gains
    if (data.currentPreset) currentPreset.value = data.currentPreset

    MessagePlugin.success('配置导入成功')
    eqStore.addLog('Imported configuration')
  } catch (e) {
    MessagePlugin.error('导入失败，文件格式错误')
  }
  input.value = ''
}

// Visualizer
const setupVisualizer = () => {
  if (!audio.value || !canvasRef.value) return

  // Update canvas size to match container
  resizeCanvas()

  // Use a unique ID for EQ visualizer
  analyser = AudioManager.createAnalyser(audio.value, 'eq-visualizer', 256)
  if (!analyser) return

  const ctx = canvasRef.value.getContext('2d')
  if (!ctx) return

  const bufferLength = analyser.frequencyBinCount
  const dataArray = new Uint8Array(bufferLength)

  const draw = () => {
    if (!analyser || !ctx || !canvasRef.value) return
    animationId = requestAnimationFrame(draw)

    analyser.getByteFrequencyData(dataArray)

    const width = canvasRef.value.width
    const height = canvasRef.value.height

    ctx.fillStyle = 'rgba(30, 30, 30, 0.2)' // Fade effect
    ctx.fillRect(0, 0, width, height)

    const barWidth = (width / bufferLength) * 2.5
    let barHeight
    let x = 0

    for (let i = 0; i < bufferLength; i++) {
      barHeight = dataArray[i] / 2

      const gradient = ctx.createLinearGradient(0, height, 0, 0)
      gradient.addColorStop(0, '#00f260')
      gradient.addColorStop(1, '#0575e6')

      ctx.fillStyle = gradient
      ctx.fillRect(x, height - barHeight, barWidth, barHeight)

      x += barWidth + 1
    }
  }

  draw()
}

// Resize canvas to match container width
const resizeCanvas = () => {
  if (!canvasRef.value) return

  const container = canvasRef.value.parentElement
  if (!container) return

  const rect = container.getBoundingClientRect()
  canvasRef.value.width = Math.floor(rect.width)
}

onMounted(() => {
  if (audio.value) {
    setupVisualizer()
    applyGains()
  }

  // Add window resize listener
  window.addEventListener('resize', resizeCanvas)
})

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  AudioManager.removeAnalyser('eq-visualizer')

  // Remove window resize listener
  window.removeEventListener('resize', resizeCanvas)
})
</script>

<style scoped>
.equalizer-settings {
  padding: 20px;
}

.eq-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.visualizer-container {
  width: 100%;
  background: #111;
  border-radius: 8px;
  overflow: hidden;
}

.visualizer-container canvas {
  width: 100%;
  height: auto;
  display: block;
}

.controls-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.preset-select {
  width: 200px;
}

.sliders-container {
  display: flex;
  justify-content: space-between;
  height: 250px;
  padding: 20px 0;
}

.slider-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex: 1;
}

.slider-wrapper {
  height: 180px;
  display: flex;
  justify-content: center;
}

.freq-label {
  margin-top: 10px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}

.gain-label {
  margin-top: 4px;
  font-size: 10px;
  color: var(--td-text-color-disabled);
}
</style>
