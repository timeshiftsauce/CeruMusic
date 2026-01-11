<template>
  <div class="lyric-font-settings">
    <t-card title="歌词字体设置" hover-shadow>
      <div class="setting-item">
        <div class="label">选择字体</div>
        <div class="control">
          <t-select
            v-model="lyricFontFamily"
            :options="fontOptions"
            placeholder="请选择字体"
            filterable
            @change="handleFontChange"
          />
        </div>
      </div>
      <div class="setting-item">
        <div class="label">预览</div>
        <div class="preview-box" :style="{ fontFamily: lyricFontFamily }">
          这是一段歌词预览 Text Preview 123
        </div>
      </div>
    </t-card>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'
import { MessagePlugin } from 'tdesign-vue-next'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

// Local state for v-model to sync with settings store
const lyricFontFamily = computed({
  get: () => settings.value.lyricFontFamily || 'PingFangSC-Semibold',
  set: (val) => {
    settingsStore.updateSettings({ lyricFontFamily: val })
  }
})

const fontList = ref<string[]>([])

const fontOptions = computed(() => {
  return fontList.value.map((font) => {
    let label = font
    if (font === 'lyricfont') {
      label = '阿里巴巴圆润体 (lyricfont)'
    } else if (font === 'PingFangSC-Semibold') {
      label = '苹方-简 中粗体 (PingFangSC-Semibold)'
    }
    return {
      label: label,
      value: font
    }
  })
})

const handleFontChange = () => {
  // Automatically saved by the setter of the computed property
  MessagePlugin.success('字体设置已更新')
}

onMounted(async () => {
  try {
    const fonts = await window.electron.ipcRenderer.invoke('get-font-list')
    fontList.value = fonts
  } catch (e) {
    console.error('Failed to get font list', e)
    fontList.value = ['PingFangSC-Semibold', 'lyricfont']
  }
})
</script>

<style scoped>
.lyric-font-settings {
  /* margin-bottom: 24px; */
}
.setting-item {
  margin-bottom: 20px;
}
.label {
  font-size: 14px;
  color: var(--td-text-color-secondary);
  margin-bottom: 8px;
}
.preview-box {
  padding: 20px;
  border: 1px solid var(--td-component-border);
  border-radius: var(--td-radius-default);
  background-color: var(--td-bg-color-container);
  font-size: 24px;
  text-align: center;
  min-height: 80px;
  display: flex;
  align-items: center;
  justify-content: center;
}
</style>
