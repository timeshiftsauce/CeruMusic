<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface LyricOption {
  fontSize: number
  mainColor: string
  shadowColor: string
  x: number
  y: number
  width: number
  height: number
}

const loading = ref(false)
const saving = ref(false)
const option = ref<LyricOption>({
  fontSize: 30,
  mainColor: '#73BCFC',
  shadowColor: 'rgba(255, 255, 255, 0.5)',
  x: 0,
  y: 0,
  width: 800,
  height: 180
})

const shadowRgb = ref<{ r: number; g: number; b: number }>({ r: 255, g: 255, b: 255 })
const mainHex = ref<string>('#73BCFC')
const shadowColorStr = ref<string>('rgba(255, 255, 255, 0.5')

const parseColorToRgb = (input: string) => {
  const rgbaMatch = input?.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i)
  if (rgbaMatch) {
    return { r: Number(rgbaMatch[1]), g: Number(rgbaMatch[2]), b: Number(rgbaMatch[3]) }
  }
  const hexMatch = input?.match(/^#([0-9a-f]{6})$/i)
  if (hexMatch) {
    const hex = hexMatch[1]
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16)
    }
  }
  return { r: 255, g: 255, b: 255 }
}
const hexToRgb = (hex: string) => {
  const m = hex?.match(/^#([0-9a-f]{6})$/i)
  if (!m) return { r: 255, g: 255, b: 255 }
  const h = m[1]
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16)
  }
}
const rgbToHex = (r: number, g: number, b: number) =>
  `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
const buildShadowRgba = () =>
  `rgba(${shadowRgb.value.r}, ${shadowRgb.value.g}, ${shadowRgb.value.b}, 0.5)`

const onMainColorChange = (val: string) => {
  mainHex.value = val
  option.value.mainColor = val
}
const onShadowColorChange = (val: string) => {
  shadowColorStr.value = val
  option.value.shadowColor = val
}

const original = ref<LyricOption | null>(null)

const loadOption = async () => {
  loading.value = true
  try {
    const res = await window.electron.ipcRenderer.invoke('get-desktop-lyric-option')
    if (res) {
      option.value = { ...option.value, ...res }
      original.value = { ...option.value }
      mainHex.value = option.value.mainColor || '#73BCFC'
      shadowColorStr.value = option.value.shadowColor || 'rgba(255,255,255,0.5)'
      shadowRgb.value = parseColorToRgb(shadowColorStr.value)
    }
  } catch (e) {
    console.warn('加载桌面歌词配置失败:', e)
  } finally {
    loading.value = false
  }
}

const applyOption = () => {
  saving.value = true
  try {
    // 传入 callback=true 让桌面歌词窗口即时更新
    const payload = { ...option.value, shadowColor: shadowColorStr.value }
    window.electron.ipcRenderer.send('set-desktop-lyric-option', payload, true)
  } finally {
    setTimeout(() => (saving.value = false), 200)
  }
}

const resetOption = () => {
  if (!original.value) return
  option.value = { ...original.value }
  applyOption()
}

const toggleDesktopLyric = (enabled: boolean) => {
  window.electron.ipcRenderer.send('change-desktop-lyric', enabled)
}

onMounted(() => {
  loadOption()
})
</script>

<template>
  <div class="lyric-style">
    <div class="header">
      <h3>桌面歌词样式</h3>
      <p>自定义桌面歌词的字体大小、颜色与阴影效果，并可预览与即时应用。</p>
    </div>

    <div class="controls">
      <div class="row">
        <div class="field">
          <label>字体大小(px)</label>
          <t-input-number v-model="option.fontSize" :min="12" :max="96" :step="1" />
        </div>
        <div class="field">
          <label>主颜色</label>
          <t-color-picker
            v-model="mainHex"
            :color-modes="['monochrome']"
            format="HEX"
            @change="onMainColorChange"
          />
        </div>
        <div class="field">
          <label>阴影颜色</label>
          <t-color-picker
            v-model="shadowColorStr"
            :color-modes="['monochrome']"
            format="RGBA"
            :enable-alpha="true"
            @change="onShadowColorChange"
          />
        </div>
      </div>

      <div class="row">
        <div class="field">
          <label>宽度</label>
          <t-input-number v-model="option.width" :min="300" :max="1600" :step="10" />
        </div>
        <div class="field">
          <label>高度</label>
          <t-input-number v-model="option.height" :min="100" :max="600" :step="10" />
        </div>
      </div>

      <div class="actions">
        <t-button :loading="loading" theme="default" variant="outline" @click="loadOption"
          >刷新</t-button
        >
        <t-button :loading="saving" theme="primary" @click="applyOption">应用到桌面歌词</t-button>
        <t-button theme="default" @click="resetOption">还原</t-button>
        <t-switch @change="toggleDesktopLyric($event as boolean)">显示桌面歌词</t-switch>
      </div>
    </div>

    <div class="preview">
      <div
        class="preview-lyric"
        :style="{
          fontSize: option.fontSize + 'px',
          color: mainHex,
          textShadow: `0 0 6px ${shadowColorStr}`
        }"
      >
        这是桌面歌词预览
      </div>
    </div>
  </div>
</template>

<style scoped>
.lyric-style {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.header h3 {
  margin: 0 0 6px 0;
}
.controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}
.field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.color-input {
  width: 48px;
  height: 32px;
  padding: 0;
  border: 1px solid var(--td-border-level-1-color);
  border-radius: var(--td-radius-small);
  background: var(--td-bg-color-container);
}
.actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.preview {
  padding: 16px;
  border: 1px dashed var(--td-border-level-1-color);
  border-radius: var(--td-radius-medium);
  background: var(--settings-preview-bg);
}
.preview-lyric {
  text-align: center;
  font-weight: 700;
}
</style>
