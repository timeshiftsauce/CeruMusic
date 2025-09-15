<template>
  <div v-if="downloadState.isDownloading" class="update-progress-overlay">
    <div class="update-progress-modal">
      <div class="progress-header">
        <h3>正在下载更新</h3>
        <p v-if="downloadState.updateInfo">版本 {{ downloadState.updateInfo.name }}</p>
      </div>

      <div class="progress-content">
        <div class="progress-bar-container">
          <div class="progress-bar">
            <div
              class="progress-fill"
              :style="{ width: `${downloadState.progress.percent}%` }"
            ></div>
          </div>
          <div class="progress-text">{{ Math.round(downloadState.progress.percent) }}%</div>
        </div>

        <div class="progress-details">
          <div class="download-info">
            <span>已下载: {{ formatBytes(downloadState.progress.transferred) }}</span>
            <span>总大小: {{ formatBytes(downloadState.progress.total) }}</span>
          </div>
          <div v-if="downloadSpeed > 0" class="download-speed">
            下载速度: {{ formatBytes(downloadSpeed) }}/s
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from 'vue'
import { downloadState } from '../services/autoUpdateService'

const downloadSpeed = ref(0)
let lastTransferred = 0
let lastTime = 0
let speedInterval: NodeJS.Timeout | null = null

// 计算下载速度
const calculateSpeed = () => {
  const currentTime = Date.now()
  const currentTransferred = downloadState.progress.transferred

  if (lastTime > 0) {
    const timeDiff = (currentTime - lastTime) / 1000 // 秒
    const sizeDiff = currentTransferred - lastTransferred // 字节

    if (timeDiff > 0) {
      downloadSpeed.value = sizeDiff / timeDiff
    }
  }

  lastTransferred = currentTransferred
  lastTime = currentTime
}

// 监听下载进度变化
watch(
  () => downloadState.progress.transferred,
  () => {
    calculateSpeed()
  }
)

// 开始监听时重置速度计算
watch(
  () => downloadState.isDownloading,
  (isDownloading) => {
    if (isDownloading) {
      lastTransferred = 0
      lastTime = 0
      downloadSpeed.value = 0

      // 每秒更新一次速度显示
      speedInterval = setInterval(() => {
        if (!downloadState.isDownloading) {
          downloadSpeed.value = 0
        }
      }, 1000)
    } else {
      if (speedInterval) {
        clearInterval(speedInterval)
        speedInterval = null
      }
      downloadSpeed.value = 0
    }
  }
)

onUnmounted(() => {
  if (speedInterval) {
    clearInterval(speedInterval)
  }
})

// 格式化字节大小
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 B'

  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
}
</script>

<style scoped>
.update-progress-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
}

.update-progress-modal {
  background: white;
  border-radius: 8px;
  padding: 24px;
  min-width: 400px;
  max-width: 500px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
}

.progress-header {
  text-align: center;
  margin-bottom: 24px;
}

.progress-header h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  color: #333;
}

.progress-header p {
  margin: 0;
  color: #666;
  font-size: 14px;
}

.progress-content {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.progress-bar-container {
  display: flex;
  align-items: center;
  gap: 12px;
}

.progress-bar {
  flex: 1;
  height: 8px;
  background-color: #f0f0f0;
  border-radius: 4px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background: linear-gradient(90deg, var(--td-brand-color-5), var(--td-brand-color-3));
  border-radius: 4px;
  transition: width 0.3s ease;
}

.progress-text {
  font-weight: 600;
  color: var(--td-brand-color-6);
  min-width: 40px;
  text-align: right;
}

.progress-details {
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 14px;
  color: #666;
}

.download-info {
  display: flex;
  justify-content: space-between;
}

.download-speed {
  text-align: center;
  color: var(--td-brand-color-4);
  font-weight: 500;
}

/* 暗色主题适配 */
@media (prefers-color-scheme: dark) {
  .update-progress-modal {
    background: #2d2d2d;
    color: #fff;
  }

  .progress-header h3 {
    color: #fff;
  }

  .progress-header p {
    color: #ccc;
  }

  .progress-bar {
    background-color: #404040;
  }

  .progress-details {
    color: #ccc;
  }
}
</style>
