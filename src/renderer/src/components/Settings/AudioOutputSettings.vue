<template>
  <div class="audio-output-settings" :class="{ 'embedded-mode': embedded }">
    <component
      :is="embedded ? 'div' : 't-card'"
      :bordered="!embedded"
      :title="embedded ? undefined : '音频输出设备'"
      class="output-card"
      :class="{ embedded: embedded }"
    >
      <div v-if="embedded" class="embedded-header">
        <span class="embedded-title"></span>
        <t-button variant="text" shape="circle" :loading="store.isLoading" @click="handleRefresh">
          <template #icon><RefreshIcon /></template>
        </t-button>
      </div>

      <template v-if="!embedded" #actions>
        <t-button variant="text" shape="circle" :loading="store.isLoading" @click="handleRefresh">
          <template #icon><RefreshIcon /></template>
        </t-button>
      </template>

      <div class="device-list">
        <t-radio-group
          v-model="store.currentDeviceId"
          class="device-radio-group"
          @change="handleDeviceChange"
        >
          <div
            v-for="device in store.sortedDevices"
            :key="device.deviceId"
            class="device-item"
            :class="{ active: store.currentDeviceId === device.deviceId }"
          >
            <t-radio :value="device.deviceId" class="device-radio">
              <div class="device-info">
                <span class="device-name">{{ device.label }}</span>
                <span v-if="device.deviceId === store.currentDeviceId" class="device-status">
                  <CheckCircleIcon class="status-icon" /> 当前使用
                </span>
              </div>
            </t-radio>
            <div v-if="device.deviceId === store.currentDeviceId" class="device-meta">
              <t-tooltip content="播放测试音">
                <t-button
                  variant="text"
                  shape="circle"
                  size="large"
                  @click.stop="store.playTestSound(device.deviceId)"
                >
                  <template #icon><PlayCircleIcon /></template>
                </t-button>
              </t-tooltip>
            </div>
          </div>
        </t-radio-group>

        <div v-if="store.error" class="error-msg">{{ store.error }}</div>
        <div v-if="store.devices.length === 0 && !store.isLoading" class="empty-msg">
          未检测到音频输出设备
        </div>
      </div>

      <t-divider />

      <div class="dlna-section">
        <div class="section-title">
          <span>DLNA 投屏设备</span>
          <t-button
            variant="text"
            shape="circle"
            :loading="dlnaStore.isSearching"
            @click="dlnaStore.startSearch"
          >
            <template #icon><RefreshIcon /></template>
          </t-button>
        </div>
        <div class="device-list dlna-device-list">
          <t-radio-group
            v-model="dlnaStore.currentDevice"
            class="device-radio-group"
            @change="handleDlnaDeviceChange"
          >
            <div
              v-for="device in dlnaStore.devices"
              :key="device.usn"
              class="device-item"
              :class="{ active: dlnaStore.currentDevice?.usn === device.usn }"
            >
              <t-radio :value="device" class="device-radio">
                <div class="device-info">
                  <span class="device-name">{{ device.name }}</span>
                  <span class="device-address">{{ device.address }}</span>
                </div>
              </t-radio>
              <div v-if="dlnaStore.currentDevice?.usn === device.usn" class="device-meta">
                <t-tooltip content="停止投屏">
                  <t-button variant="text" shape="circle" size="large" @click.stop="stopDlna">
                    <template #icon><PoweroffIcon /></template>
                  </t-button>
                </t-tooltip>
              </div>
            </div>
          </t-radio-group>
          <div v-if="dlnaStore.devices.length === 0 && !dlnaStore.isSearching" class="empty-msg">
            未检测到 DLNA 投屏设备
          </div>
        </div>
      </div>

      <t-divider />

      <div class="ab-switch-section">
        <div class="section-title">
          <span>A/B 对比模式</span>
          <t-tooltip content="快速切换两组不同的输出设备进行音质对比">
            <InfoCircleIcon class="info-icon" />
          </t-tooltip>
        </div>
        <div class="ab-controls">
          <div class="channel-config">
            <label>设备 A (主设备): </label>
            <t-select
              v-model="store.primaryDeviceId"
              placeholder="选择设备 A"
              class="device-select"
            >
              <t-option
                v-for="d in store.devices"
                :key="d.deviceId"
                :value="d.deviceId"
                :label="d.label"
              />
            </t-select>
          </div>
          <div class="channel-config">
            <label>设备 B (对比设备): </label>
            <t-select
              v-model="store.secondaryDeviceId"
              placeholder="选择设备 B"
              class="device-select"
            >
              <t-option
                v-for="d in store.devices"
                :key="d.deviceId"
                :value="d.deviceId"
                :label="d.label"
              />
            </t-select>
          </div>

          <div class="ab-action">
            <t-button block theme="primary" variant="outline" @click="store.toggleAB">
              切换 A/B (当前: {{ store.activeABChannel }})
              <template #suffix>Alt+O</template>
            </t-button>
          </div>
        </div>
      </div>
    </component>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import {
  RefreshIcon,
  CheckCircleIcon,
  InfoCircleIcon,
  PlayCircleIcon,
  PoweroffIcon
} from 'tdesign-icons-vue-next'
import { useAudioOutputStore } from '@renderer/store/audioOutput'
import { useDlnaStore } from '@renderer/store/dlna'
import { ControlAudioStore } from '@renderer/store/ControlAudio'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { MessagePlugin } from 'tdesign-vue-next'

defineProps<{
  embedded?: boolean
}>()

const store = useAudioOutputStore()
const dlnaStore = useDlnaStore()
const controlAudio = ControlAudioStore()
const globalPlayStatus = useGlobalPlayStatusStore()

const handleRefresh = () => {
  store.scanDevices()
}

const handleDeviceChange = (val: any) => {
  store.setDevice(val)
}

const handleDlnaDeviceChange = (val: any) => {
  if (val) {
    MessagePlugin.success(`已连接投屏设备: ${val.name}`)

    if (controlAudio.Audio?.url) {
      const url = controlAudio.Audio.url
      const title = globalPlayStatus.player?.songInfo?.name || 'CeruMusic'
      dlnaStore.play(url, title).then(() => {
        if (controlAudio.Audio.isPlay) {
          dlnaStore.resume()
        }
      })
    }
  }
}

const stopDlna = () => {
  dlnaStore.stop()
  dlnaStore.currentDevice = null
  MessagePlugin.success('已断开投屏设备')
}

// Keyboard shortcut listener
const handleKeydown = (e: KeyboardEvent) => {
  if (e.altKey && (e.key === 'o' || e.key === 'O')) {
    e.preventDefault()
    store.toggleAB()
  }
}

const handleGlobalToggle = () => {
  store.toggleAB()
}

onMounted(() => {
  store.init()
  window.addEventListener('keydown', handleKeydown)
  window.addEventListener('toggle-audio-ab-if-visible', handleGlobalToggle)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
  window.removeEventListener('toggle-audio-ab-if-visible', handleGlobalToggle)
})
</script>

<style scoped>
.audio-output-settings {
  padding: 0;
}

.output-card {
  border-radius: 8px;
}

.output-card.embedded {
  border: none;
  box-shadow: none;
}

.embedded-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--td-component-border);
}

.embedded-header h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 600;
}

.embedded-title {
  flex: 1;
}

.device-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
  max-height: 300px;
  overflow-y: auto;
  padding-right: 8px;
}

/* Custom scrollbar */
.device-list::-webkit-scrollbar {
  width: 6px;
}
.device-list::-webkit-scrollbar-thumb {
  background-color: var(--td-scrollbar-color);
  border-radius: 3px;
}

.device-radio-group {
  width: 100%;
}

.device-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 6px;
  border: 1px solid transparent;
  transition: all 0.2s;
  width: 100%;
  min-height: 50px;
}

.device-item:hover {
  background-color: var(--td-bg-color-secondarycontainer);
}

.device-item.active {
  background-color: var(--td-brand-color-light);
  border-color: var(--td-brand-color);
}

.device-radio {
  width: 100%;
}

.device-info {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
}

.device-name {
  font-weight: 500;
  flex: 1;
}

.device-status {
  font-size: 12px;
  color: var(--td-brand-color);
  display: flex;
  align-items: center;
  gap: 4px;
}

.device-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  align-items: flex-end;
  min-width: 120px;
}

.dlna-section {
  margin-top: 16px;
}

.dlna-device-list {
  max-height: 200px;
}

.device-address {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin-left: 8px;
}

.meta-tag {
  font-size: 10px;
  color: var(--td-text-color-secondary);
  background: var(--td-bg-color-component);
  padding: 2px 6px;
  border-radius: 4px;
}

.ab-switch-section {
  margin-top: 16px;
}

.section-title {
  font-weight: 600;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 6px;
}

.info-icon {
  color: var(--td-text-color-secondary);
  cursor: help;
}

.ab-controls {
  display: flex;
  flex-direction: column;
  gap: 12px;
  background: var(--td-bg-color-secondarycontainer);
  padding: 16px;
  border-radius: 8px;
}

.channel-config {
  display: flex;
  align-items: center;
  gap: 12px;
}

.channel-config label {
  width: 120px;
  font-size: 13px;
  color: var(--td-text-color-secondary);
}

.device-select {
  flex: 1;
}

.ab-action {
  margin-top: 8px;
}

.error-msg {
  color: var(--td-error-color);
  font-size: 12px;
  margin-top: 8px;
}

.empty-msg {
  text-align: center;
  color: var(--td-text-color-disabled);
  padding: 20px;
}
</style>
