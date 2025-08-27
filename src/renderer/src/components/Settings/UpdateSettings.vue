<template>
  <div class="update-settings">
    <div class="update-section">
      <h3>自动更新</h3>
      <div class="update-info">
        <p>当前版本: {{ currentVersion }}</p>
        <t-button 
          theme="primary" 
          :loading="isChecking" 
          @click="handleCheckUpdate"
        >
          {{ isChecking ? '检查中...' : '检查更新' }}
        </t-button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useAutoUpdate } from '../../composables/useAutoUpdate'
import { Button as TButton } from 'tdesign-vue-next'

const { checkForUpdates } = useAutoUpdate()

const currentVersion = ref('1.0.9') // 从package.json获取
const isChecking = ref(false)

const handleCheckUpdate = async () => {
  isChecking.value = true
  try {
    await checkForUpdates()
  } finally {
    // 延迟重置状态，给用户足够时间看到通知
    setTimeout(() => {
      isChecking.value = false
    }, 2000)
  }
}

onMounted(() => {
  // 可以在这里获取当前版本号
  // currentVersion.value = await window.api.getAppVersion()
})
</script>

<style scoped>
.update-settings {
  padding: 20px;
}

.update-section {
  margin-bottom: 24px;
}

.update-section h3 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.update-info {
  display: flex;
  align-items: center;
  gap: 16px;
}

.update-info p {
  margin: 0;
  color: var(--td-text-color-secondary);
}
</style>