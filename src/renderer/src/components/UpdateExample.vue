<template>
  <div class="update-example">
    <div class="update-section">
      <h3>自动更新</h3>
      <div class="update-info">
        <p>当前版本: {{ currentVersion }}</p>
        <t-button theme="primary" :loading="isChecking" @click="handleCheckUpdate">
          {{ isChecking ? '检查中...' : '检查更新' }}
        </t-button>

        <!-- 测试按钮 -->
        <t-button theme="default" @click="testProgress"> 测试进度显示 </t-button>
      </div>

      <!-- 显示当前下载状态 -->
      <div class="debug-info">
        <p>下载状态: {{ downloadState.isDownloading ? '下载中' : '未下载' }}</p>
        <p>进度: {{ Math.round(downloadState.progress.percent) }}%</p>
        <p>已下载: {{ formatBytes(downloadState.progress.transferred) }}</p>
        <p>总大小: {{ formatBytes(downloadState.progress.total) }}</p>
      </div>
    </div>

    <!-- 自定义进度组件 -->
    <UpdateProgress />
  </div>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { useAutoUpdate } from '../composables/useAutoUpdate'
import UpdateProgress from './UpdateProgress.vue'
import { downloadState } from '../services/autoUpdateService'

const { checkForUpdates } = useAutoUpdate()

const currentVersion = ref('1.0.8') // 从 package.json 获取
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

// 测试进度显示
const testProgress = () => {
  console.log('开始测试进度显示')

  // 模拟下载开始
  downloadState.isDownloading = true
  downloadState.updateInfo = {
    url: 'https://example.com/test.zip',
    name: '1.0.9',
    notes: '测试更新',
    pub_date: new Date().toISOString()
  }
  downloadState.progress = {
    percent: 0,
    transferred: 0,
    total: 10 * 1024 * 1024 // 10MB
  }

  // 模拟进度更新
  let progress = 0
  const interval = setInterval(() => {
    progress += Math.random() * 10
    if (progress >= 100) {
      progress = 100
      clearInterval(interval)

      // 3秒后停止下载状态
      setTimeout(() => {
        downloadState.isDownloading = false
      }, 3000)
    }

    downloadState.progress = {
      percent: progress,
      transferred: (downloadState.progress.total * progress) / 100,
      total: downloadState.progress.total
    }
  }, 200)
}

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
.update-example {
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

.debug-info {
  margin-top: 16px;
  padding: 12px;
  background-color: #f5f5f5;
  border-radius: 4px;
  font-size: 12px;
}

.debug-info p {
  margin: 4px 0;
  color: #666;
}
</style>
