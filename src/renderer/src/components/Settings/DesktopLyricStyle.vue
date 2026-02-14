<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface LyricOption {
  fontSize: number
  mainColor: string
  shadowColor: string
  singleLine: boolean
  showTranslation: boolean
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
  singleLine: false,
  showTranslation: true,
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

const setDisplayMode = (singleLine: boolean) => {
  option.value.singleLine = singleLine
}

onMounted(() => {
  loadOption()
})
</script>

<template>
  <div class="lyric-style">
    <t-card title="桌面歌词样式" hover-shadow>
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
          <div class="field">
            <label>显示模式</label>
            <div class="mode-toggle">
              <t-button
                size="small"
                :theme="option.singleLine ? 'default' : 'primary'"
                variant="outline"
                @click="setDisplayMode(false)"
                >双行交错</t-button
              >
              <t-button
                size="small"
                :theme="option.singleLine ? 'primary' : 'default'"
                variant="outline"
                @click="setDisplayMode(true)"
                >单行</t-button
              >
            </div>
          </div>
          <div class="field">
            <label>翻译</label>
            <t-switch v-model="option.showTranslation">显示翻译</t-switch>
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
        <div class="preview-label">预览</div>
        <div class="preview-box" :class="{ 'is-single': option.singleLine }">
          <div class="preview-group current">
            <div
              class="preview-row current"
              :style="{
                fontSize: `${Math.max(16, Math.min(option.fontSize, 42))}px`,
                color: mainHex,
                textShadow: `0 0 6px ${shadowColorStr}`
              }"
            >
              {{ option.singleLine ? '这是桌面歌词单行预览' : '当前歌词预览' }}
            </div>
            <div
              v-if="option.showTranslation"
              class="preview-row tran"
              :style="{
                fontSize: `${Math.max(14, Math.min(option.fontSize - 6, 30))}px`,
                color: mainHex,
                opacity: 0.75,
                textShadow: `0 0 6px ${shadowColorStr}`
              }"
            >
              当前翻译预览
            </div>
          </div>
          <div v-if="!option.singleLine" class="preview-group upnext">
            <div
              class="preview-row upnext"
              :style="{
                fontSize: `${Math.max(14, Math.min(option.fontSize - 2, 36))}px`,
                color: mainHex,
                textShadow: `0 0 6px ${shadowColorStr}`
              }"
            >
              下一句预览
            </div>
            <div
              v-if="option.showTranslation"
              class="preview-row tran"
              :style="{
                fontSize: `${Math.max(12, Math.min(option.fontSize - 8, 26))}px`,
                color: mainHex,
                opacity: 0.6,
                textShadow: `0 0 6px ${shadowColorStr}`
              }"
            >
              下一句翻译预览
            </div>
          </div>
        </div>
      </div>
    </t-card>
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
.mode-toggle {
  display: inline-flex;
  align-items: center;
  gap: 8px;
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
  margin-top: 16px;
}
.preview-label {
  font-size: 14px;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
}
.preview-box {
  padding: 20px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  background-color: var(--td-bg-color-container);
  min-height: 110px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 10px;
  overflow: hidden;
}
.preview-box.is-single {
  justify-content: center;
  align-items: center;
}
.preview-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  max-width: 100%;
}
.preview-group.current {
  align-items: flex-start;
}
.preview-group.upnext {
  align-items: flex-end;
}
.preview-row {
  font-weight: 700;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-row.current {
  text-align: left;
}
.preview-row.upnext {
  text-align: right;
  opacity: 0.62;
}
.preview-row.tran {
  font-weight: 500;
}
.preview-box.is-single .preview-row.current {
  text-align: center;
}
.preview-box.is-single .preview-group.current {
  align-items: center;
}
.preview-box.is-single .preview-row.tran {
  text-align: center;
}
</style>
