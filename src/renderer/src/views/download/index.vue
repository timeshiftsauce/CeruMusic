<script setup lang="ts">
import { onMounted, computed, ref, watch } from 'vue'
import { useDownloadStore, DownloadStatus } from '../../store/download'
import {
  PauseCircleIcon,
  PlayCircleIcon,
  CloseCircleIcon,
  RefreshIcon,
  FolderOpenIcon,
  DeleteIcon
} from 'tdesign-icons-vue-next'
import { useSettingsStore } from '@renderer/store/Settings'
import { storeToRefs } from 'pinia'


const store = useDownloadStore()
const maxConcurrent = ref(3)

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const filenameTemplate = ref(settings.value.filenameTemplate || '%t - %s')

const updateConcurrent = (val: number) => {
  window.api.download.setMaxConcurrent(val)
}

onMounted(async () => {
  store.init()
  maxConcurrent.value = await store.getMaxConcurrent()
})

const activeTab = ref('downloading')

watch(activeTab, (val) => {
  if (val === 'completed') {
    store.validateFiles()
  }
})

const filteredTasks = computed(() => {
  const tasks = store.tasks.filter((task) => {
    if (activeTab.value === 'downloading') {
      return [DownloadStatus.Downloading, DownloadStatus.Queued, DownloadStatus.Paused].includes(
        task.status
      )
    } else if (activeTab.value === 'completed') {
      return task.status === DownloadStatus.Completed
    } else if (activeTab.value === 'failed') {
      return [DownloadStatus.Error, DownloadStatus.Cancelled].includes(task.status)
    }
    return false
  })

  // Sort tasks
  return tasks.sort((a, b) => {
    // 1. Status Priority for Downloading tab
    if (activeTab.value === 'downloading') {
      const statusOrder = {
        [DownloadStatus.Downloading]: 0,
        [DownloadStatus.Queued]: 1,
        [DownloadStatus.Paused]: 2
      }
      const scoreA = statusOrder[a.status] ?? 99
      const scoreB = statusOrder[b.status] ?? 99
      if (scoreA !== scoreB) return scoreA - scoreB

      // For Queued tasks, sort by priority (descending) then createdAt (ascending - FIFO)
      // Assuming higher priority number means higher priority. If backend uses 0 as default and sorts (a-b), then smaller is first?
      // Let's check backend: this.queue.sort((a, b) => (this.tasks.get(a)?.priority ?? 0) - (this.tasks.get(b)?.priority ?? 0))
      // Backend sorts ascending by priority. So smaller priority value comes first in queue.
      if (a.status === DownloadStatus.Queued && b.status === DownloadStatus.Queued) {
        if (a.priority !== b.priority) return (a.priority || 0) - (b.priority || 0)
        return a.createdAt - b.createdAt
      }
    }

    // Default sort by creation time (oldest first) for other tabs
    return a.createdAt - b.createdAt
  })
})

const downloadingTasks = computed(() =>
  store.tasks.filter((t) =>
    [DownloadStatus.Downloading, DownloadStatus.Queued, DownloadStatus.Paused].includes(t.status)
  )
)
const completedTasks = computed(() =>
  store.tasks.filter((t) => t.status === DownloadStatus.Completed)
)
const failedTasks = computed(() =>
  store.tasks.filter((t) => [DownloadStatus.Error, DownloadStatus.Cancelled].includes(t.status))
)

const formatMusicInfo = (template: string, data: any) => {
  // 定义占位符映射
  const patterns = {
    '%t': 'name',
    '%s': 'singer',
    '%a': 'albumName',
    '%u': 'source',
    '%d': 'date'
  }

  // 一次性替换所有占位符
  let result = template

  // 使用正则匹配所有占位符
  result = result.replace(/%[tsaud]/g, (match: string) => {
    const key = patterns[match]
    return data[key] !== undefined ? data[key] : match
  })

  return result
}

const formatSpeed = (speed: number) => {
  if (speed === 0) return '0 B/s'
  const units = ['B/s', 'KB/s', 'MB/s', 'GB/s']
  let s = speed
  let unitIndex = 0
  while (s >= 1024 && unitIndex < units.length - 1) {
    s /= 1024
    unitIndex++
  }
  return `${s.toFixed(2)} ${units[unitIndex]}`
}

const formatSize = (size: number) => {
  if (size === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  let s = size
  let unitIndex = 0
  while (s >= 1024 && unitIndex < units.length - 1) {
    s /= 1024
    unitIndex++
  }
  return `${s.toFixed(2)} ${units[unitIndex]}`
}

const getStatusColor = (status: DownloadStatus) => {
  switch (status) {
    case DownloadStatus.Downloading:
      return 'primary'
    case DownloadStatus.Completed:
      return 'success'
    case DownloadStatus.Error:
      return 'danger'
    case DownloadStatus.Paused:
      return 'warning'
    default:
      return 'default'
  }
}

const getStatusText = (status: DownloadStatus) => {
  switch (status) {
    case DownloadStatus.Queued:
      return '等待中'
    case DownloadStatus.Downloading:
      return '下载中'
    case DownloadStatus.Paused:
      return '已暂停'
    case DownloadStatus.Completed:
      return '完成'
    case DownloadStatus.Error:
      return '错误'
    case DownloadStatus.Cancelled:
      return '已取消'
    default:
      return status
  }
}
</script>

<template>
  <div class="download-manager">
    <div class="header">
      <h2>下载管理</h2>
      <div class="settings">
        <div v-if="activeTab === 'downloading'" class="batch-actions">
          <t-button theme="primary" variant="text" size="small" @click="store.resumeAllTasks()">
            <template #icon><PlayCircleIcon /></template>
            全部开始
          </t-button>
          <t-button theme="warning" variant="text" size="small" @click="store.pauseAllTasks()">
            <template #icon><PauseCircleIcon /></template>
            全部暂停
          </t-button>
          <div class="divider"></div>
        </div>

        <t-button
          v-if="filteredTasks.length > 0"
          theme="default"
          variant="outline"
          size="small"
          @click="
            () => {
              if (activeTab === 'downloading') store.clearTasks('queue')
              else if (activeTab === 'completed') store.clearTasks('completed')
              else if (activeTab === 'failed') store.clearTasks('failed')
            }
          "
        >
          {{ activeTab === 'downloading' ? '清空队列' : '清空记录' }}
        </t-button>
        <div class="divider"></div>
        <span>同时下载数：</span>
        <t-input-number
          v-model="maxConcurrent"
          :min="1"
          :max="5"
          style="width: 100px"
          @change="(value) => updateConcurrent(Number(value))"
        />
      </div>
    </div>

    <t-tabs v-model="activeTab" class="tabs">
      <t-tab-panel
        value="downloading"
        :label="downloadingTasks.length ? `进行中(${downloadingTasks.length})` : '进行中'"
        :destroy-on-hide="false"
      />
      <t-tab-panel
        value="completed"
        :label="completedTasks.length ? `已完成(${completedTasks.length})` : '已完成'"
        :destroy-on-hide="false"
      />
      <t-tab-panel
        value="failed"
        :label="failedTasks.length ? `失败/已取消(${failedTasks.length})` : '失败/已取消'"
        :destroy-on-hide="false"
      />
    </t-tabs>

    <div class="task-list">
      <div v-if="filteredTasks.length === 0" class="empty-state">
        <t-icon name="download" size="48px" />
        <p>暂无任务</p>
      </div>

      <div v-else class="tasks">
        <div v-for="task in filteredTasks" :key="task.id" class="task-item">
          <div class="task-info">
            <div class="task-name">{{ formatMusicInfo(filenameTemplate, task.songInfo) }}</div>
            <div class="task-meta">
              <t-tag :theme="getStatusColor(task.status)" variant="light" size="small">
                {{ getStatusText(task.status) }}
              </t-tag>
              <span v-if="task.status === DownloadStatus.Downloading" class="speed">
                {{ formatSpeed(task.speed) }}
              </span>
              <span class="size">
                {{ formatSize(task.downloadedSize) }} / {{ formatSize(task.totalSize) }}
              </span>
            </div>
          </div>

          <div class="task-progress">
            <t-progress
              :percentage="Math.round(task.progress)"
              :status="
                task.status === DownloadStatus.Error
                  ? 'error'
                  : task.status === DownloadStatus.Completed
                    ? 'success'
                    : 'active'
              "
            />
            <div v-if="task.error" class="error-msg">{{ task.error }}</div>
          </div>

          <div class="task-actions">
            <t-button
              v-if="
                task.status === DownloadStatus.Downloading || task.status === DownloadStatus.Queued
              "
              shape="circle"
              variant="text"
              @click="store.pauseTask(task.id)"
            >
              <template #icon><PauseCircleIcon /></template>
            </t-button>

            <t-button
              v-if="task.status === DownloadStatus.Paused"
              shape="circle"
              variant="text"
              @click="store.resumeTask(task.id)"
            >
              <template #icon><PlayCircleIcon /></template>
            </t-button>

            <t-button
              v-if="task.status === DownloadStatus.Error"
              shape="circle"
              variant="text"
              @click="store.retryTask(task.id)"
            >
              <template #icon><RefreshIcon /></template>
            </t-button>

            <t-button
              v-if="
                task.status !== DownloadStatus.Completed && task.status !== DownloadStatus.Cancelled
              "
              shape="circle"
              variant="text"
              theme="danger"
              @click="store.cancelTask(task.id)"
            >
              <template #icon><CloseCircleIcon /></template>
            </t-button>

            <t-button
              v-if="task.status === DownloadStatus.Completed"
              shape="circle"
              variant="text"
              @click="store.openFileLocation(task.filePath)"
            >
              <template #icon><FolderOpenIcon /></template>
            </t-button>

            <t-button
              v-if="
                task.status === DownloadStatus.Completed ||
                task.status === DownloadStatus.Cancelled ||
                task.status === DownloadStatus.Error
              "
              shape="circle"
              variant="text"
              theme="danger"
              @click="store.deleteTask(task.id)"
            >
              <template #icon><DeleteIcon /></template>
            </t-button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.download-manager {
  padding: 20px;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--td-text-color-primary);
}

.header {
  margin-bottom: 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  h2 {
    border-left: 8px solid var(--td-brand-color-3);
    padding-left: 12px;
    border-radius: 8px;
    line-height: 1.5em;
    color: var(--td-text-color-primary);
    margin-bottom: 0.5rem;
    font-size: 1.875rem;
    font-weight: 600;
  }
}

.settings {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  .batch-actions {
    display: flex;
    justify-content: center;
    align-items: center;
  }
}

.divider {
  width: 1px;
  height: 16px;
  background-color: var(--td-border-level-1-color);
  margin: 0 8px;
}

.tabs {
  margin-bottom: 16px;
  flex-shrink: 0;
}

.task-list {
  flex: 1;
  overflow-y: auto;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 300px;
  color: var(--td-text-color-secondary);
}

.task-item {
  background: var(--td-bg-color-container);
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 12px;
  display: flex;
  align-items: center;
  gap: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);
}

.task-info {
  width: 400px;
  flex-shrink: 0;
}

.task-name {
  font-weight: 500;
  margin-bottom: 8px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.task-meta {
  display: flex;
  gap: 8px;
  font-size: 12px;
  color: var(--td-text-color-secondary);
  align-items: center;
}

.task-progress {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.error-msg {
  color: var(--td-error-color);
  font-size: 12px;
  margin-top: 4px;
}

.task-actions {
  display: flex;
  gap: 4px;
}
</style>
