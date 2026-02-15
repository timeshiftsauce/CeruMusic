<script setup lang="ts">
import { ref, onMounted } from 'vue'

interface LyricOption {
  fontSize: number
  mainColor: string
  shadowColor: string
  fontWeight?: number | string
  position?: 'left' | 'center' | 'right' | 'both'
  alwaysShowPlayInfo?: boolean
  animation?: boolean
  showYrc?: boolean
  showTran?: boolean
  isDoubleLine?: boolean
  textBackgroundMask?: boolean
  backgroundMaskColor?: string
  fontFamily?: string
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
  fontWeight: 600,
  position: 'center',
  alwaysShowPlayInfo: false,
  animation: true,
  showYrc: true,
  showTran: false,
  isDoubleLine: true,
  textBackgroundMask: false,
  backgroundMaskColor: 'rgba(0,0,0,0.2)',
  fontFamily: 'PingFangSC-Semibold',
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
const backgroundMaskStr = ref<string>('rgba(0,0,0,0.2)')

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
      backgroundMaskStr.value = option.value.backgroundMaskColor || 'rgba(0,0,0,0.2)'
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
    const payload = {
      ...option.value,
      shadowColor: shadowColorStr.value,
      backgroundMaskColor: backgroundMaskStr.value
    }
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

const isOpen = ref<boolean>(false)
watch(isOpen, (val) => {
  window.electron?.ipcRenderer?.send?.('change-desktop-lyric', !!val)
})

onMounted(() => {
  loadOption()
  // 初始化打开状态并监听变化
  window.electron?.ipcRenderer
    ?.invoke?.('get-lyric-open-state')
    .then((open: boolean) => {
      isOpen.value = !!open
    })
    .catch(() => {})
  window.electron?.ipcRenderer?.on?.('desktop-lyric-open-change', (_event, open: boolean) => {
    isOpen.value = !!open
  })
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
            <label>字重</label>
            <t-select v-model="option.fontWeight">
              <t-option key="400" label="400 正常" value="400" />
              <t-option key="500" label="500 中等" value="500" />
              <t-option key="600" label="600 半粗" value="600" />
              <t-option key="700" label="700 粗" value="700" />
              <t-option key="800" label="800 特粗" value="800" />
            </t-select>
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
            <label>对齐方式</label>
            <t-select v-model="option.position">
              <t-option key="left" label="居左" value="left" />
              <t-option key="center" label="居中" value="center" />
              <t-option key="right" label="居右" value="right" />
              <t-option key="both" label="左右分布(双行)" value="both" />
            </t-select>
          </div>
          <div class="field">
            <label>文字背景遮罩</label>
            <t-switch v-model="option.textBackgroundMask" class="compact-switch" />
          </div>
          <div class="field">
            <label>背景遮罩颜色</label>
            <t-color-picker
              v-model="backgroundMaskStr"
              :color-modes="['monochrome']"
              format="RGBA"
              :enable-alpha="true"
            />
          </div>
        </div>

        <div class="row">
          <div class="field">
            <label>动画</label>
            <t-switch v-model="option.animation" class="compact-switch" />
          </div>
          <div class="field">
            <label>逐字歌词</label>
            <t-switch v-model="option.showYrc" class="compact-switch" />
          </div>
          <div class="field">
            <label>显示翻译</label>
            <t-switch v-model="option.showTran" class="compact-switch" />
          </div>
          <div class="field">
            <label>双行显示</label>
            <t-switch v-model="option.isDoubleLine" class="compact-switch" />
          </div>
          <div class="field">
            <label>总是显示歌曲信息</label>
            <t-switch v-model="option.alwaysShowPlayInfo" class="compact-switch" />
          </div>
        </div>

        <div class="actions">
          <t-button :loading="loading" theme="default" variant="outline" @click="loadOption"
            >刷新</t-button
          >
          <t-button :loading="saving" theme="primary" @click="applyOption">应用到桌面歌词</t-button>
          <t-button theme="default" @click="resetOption">还原</t-button>
          <t-switch v-model="isOpen">显示桌面歌词</t-switch>
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
  align-items: start;

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
.compact-switch {
  width: auto;
}
.preview {
  margin-top: 16px;
  padding: 30px;
  border: 1px dashed var(--td-border-level-1-color);
  border-radius: var(--td-radius-medium);
  background: var(--settings-preview-bg);
}
.preview-lyric {
  text-align: center;
  font-weight: 700;
}
</style>
