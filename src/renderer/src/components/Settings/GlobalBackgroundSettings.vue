<script setup lang="ts">
import { computed } from 'vue'
import { storeToRefs } from 'pinia'
import { useSettingsStore } from '@renderer/store/Settings'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

const bgSettings = computed({
  get: () =>
    settings.value.globalBackground || {
      enable: false,
      type: 'none',
      url: '',
      opacity: 0.5,
      blur: 10,
      brightness: 0.8
    },
  set: (val) => {
    settingsStore.updateSettings({ globalBackground: val })
  }
})

const updateBg = (key: keyof typeof bgSettings.value, val: any) => {
  bgSettings.value = { ...bgSettings.value, [key]: val }
}

const updateMultipleBg = (updates: Partial<typeof bgSettings.value>) => {
  bgSettings.value = { ...bgSettings.value, ...updates }
}

const handleFileSelect = async () => {
  try {
    const filePaths = await window.electron.ipcRenderer.invoke('dialog:openFile', {
      properties: ['openFile'],
      filters: [
        {
          name: 'Media Files',
          extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'mp4', 'webm', 'ogg']
        },
        { name: 'Images', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Videos', extensions: ['mp4', 'webm', 'ogg'] },
        { name: 'All Files', extensions: ['*'] }
      ]
    })
    if (filePaths && filePaths.length > 0) {
      const path = filePaths[0]
      const ext = path.split('.').pop()?.toLowerCase()
      const isVideo = ['mp4', 'webm', 'ogg'].includes(ext || '')

      // Default to image if not explicitly a video
      const newType = isVideo ? 'video' : 'image'

      updateMultipleBg({
        type: newType,
        url: `file://${path.replace(/\\/g, '/')}`
      })
    }
  } catch (e) {
    console.error('Failed to select file:', e)
  }
}
</script>

<template>
  <div class="global-background-settings">
    <div class="setting-item">
      <div class="setting-info">
        <h4>启用全局背景</h4>
        <p>开启后可以自定义软件全局的背景（支持图片、视频、GIF）</p>
      </div>
      <t-switch :value="bgSettings.enable" @change="(v) => updateBg('enable', v)" />
    </div>

    <template v-if="bgSettings.enable">
      <t-divider />

      <div class="setting-item">
        <div class="setting-info">
          <h4>背景文件</h4>
          <p>选择您想要作为背景的文件（仅支持本地文件）</p>
        </div>
        <div class="action-area">
          <t-button @click="handleFileSelect">选择文件</t-button>
          <div v-if="bgSettings.url" class="file-path" :title="bgSettings.url">
            {{ bgSettings.url.replace('file://', '') }}
          </div>
        </div>
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>不透明度</h4>
          <p>调整背景图片/视频的不透明度 ({{ Math.round(bgSettings.opacity * 100) }}%)</p>
        </div>
        <t-slider
          :value="bgSettings.opacity"
          :min="0"
          :max="1"
          :step="0.01"
          style="width: 200px"
          @change="(v) => updateBg('opacity', v)"
        />
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>模糊度</h4>
          <p>调整背景的模糊程度 ({{ bgSettings.blur }}px)</p>
        </div>
        <t-slider
          :value="bgSettings.blur"
          :min="0"
          :max="50"
          :step="1"
          style="width: 200px"
          @change="(v) => updateBg('blur', v)"
        />
      </div>

      <div class="setting-item">
        <div class="setting-info">
          <h4>亮度</h4>
          <p>调整背景的亮度 ({{ Math.round(bgSettings.brightness * 100) }}%)</p>
        </div>
        <t-slider
          :value="bgSettings.brightness"
          :min="0"
          :max="2"
          :step="0.01"
          style="width: 200px"
          @change="(v) => updateBg('brightness', v)"
        />
      </div>
    </template>
  </div>
</template>

<style scoped lang="scss">
.global-background-settings {
  .setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 16px;

    .setting-info {
      h4 {
        margin: 0 0 4px;
        font-size: 14px;
        font-weight: 600;
        color: var(--td-text-color-primary);
      }
      p {
        margin: 0;
        font-size: 12px;
        color: var(--td-text-color-secondary);
      }
    }

    .action-area {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
      gap: 8px;

      .file-path {
        font-size: 12px;
        color: var(--td-text-color-secondary);
        max-width: 200px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    }
  }
}
</style>
