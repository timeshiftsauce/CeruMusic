<template>
  <div class="float-ball-settings">
    <div class="card-body">
      <div class="setting-item">
        <span class="setting-label">显示AI悬浮球</span>
        <t-switch v-model="showFloatBall" @change="handleFloatBallToggle" />
      </div>
      <div class="setting-description">
        <p>开启后，AI悬浮球将显示在应用界面上，您可以随时与AI助手交流</p>
        <p>关闭后，AI悬浮球将被隐藏，您可以随时在此处重新开启</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)

// 悬浮球显示状态
const showFloatBall = ref(settings.value.showFloatBall !== false)

// 处理悬浮球开关切换
const handleFloatBallToggle = (val: boolean) => {
  settingsStore.updateSettings({ showFloatBall: val })
}

// 监听设置变化
watch(
  () => settings.value.showFloatBall,
  (newValue) => {
    showFloatBall.value = newValue !== false
  }
)

onMounted(() => {
  // 确保初始值与存储中的值一致
  showFloatBall.value = settings.value.showFloatBall !== false
})
</script>

<style scoped>
.float-ball-settings {
  width: 100%;
}

.card-body {
  padding: 16px 0;
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.setting-label {
  font-size: 16px;
  font-weight: 500;
  color: var(--td-text-color-primary);
}

.setting-description {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--td-border-level-1-color);
}

.setting-description p {
  margin: 8px 0;
  font-size: 14px;
  color: var(--td-text-color-secondary);
}
</style>
