<template>
  <div class="settings-page">
    <div class="settings-container">
      <h2>应用设置</h2>
      
      <!-- 其他设置项 -->
      <div class="settings-section">
        <h3>常规设置</h3>
        <!-- 这里可以添加其他设置项 -->
      </div>
      
      <!-- 自动更新设置 -->
      <UpdateSettings />
      
    </div>
  </div>
</template>

<script setup lang="ts">
import UpdateSettings from '../components/Settings/UpdateSettings.vue'
</script>

<style scoped>
.settings-page {
  padding: 20px;
  max-width: 800px;
  margin: 0 auto;
}

.settings-container h2 {
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.settings-section {
  margin-bottom: 32px;
  padding: 20px;
  background: var(--td-bg-color-container);
  border-radius: 8px;
  border: 1px solid var(--td-border-level-1-color);
}

.settings-section h3 {
  margin-bottom: 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}
</style>