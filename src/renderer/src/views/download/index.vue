<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { onMounted, onUnmounted, computed, ref, watch } from 'vue'
import {
  karaokePacks,
  modelPhaseLabel,
  packBytes,
  type ModelPhase,
  type PackId
} from '@common/karaoke'
import { modelDownloads, observeKaraokeModel } from '@renderer/services/karaoke'
import { MessagePlugin } from '@renderer/plugin/notifications'
import { useDownloadStore, DownloadStatus, type DownloadTask } from '../../store/download'
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
import { formatMusicInfo } from '@common/utils/format'

const store = useDownloadStore()
const maxConcurrent = ref(3)

const settingsStore = useSettingsStore()
const { settings } = storeToRefs(settingsStore)
const filenameTemplate = ref(settings.value.filenameTemplate || '%t - %s')

const updateConcurrent = (val: number) => {
  desktopBridge.api.download.setMaxConcurrent(val)
}

onMounted(async () => {
  store.init()
  maxConcurrent.value = await store.getMaxConcurrent()
})

const karaoke = desktopBridge.api.karaoke
onUnmounted(observeKaraokeModel())
const tabs = [
  { id: 'downloading', label: '进行中' },
  { id: 'completed', label: '已完成' },
  { id: 'failed', label: '失败/已取消' }
] as const
type Tab = (typeof tabs)[number]['id']
const activeTab = ref<Tab>('downloading')

watch(activeTab, (val) => {
  if (val === 'completed') store.validateFiles()
})

type TaskRow = Pick<
  DownloadTask,
  | 'id'
  | 'status'
  | 'priority'
  | 'createdAt'
  | 'progress'
  | 'speed'
  | 'downloadedSize'
  | 'totalSize'
  | 'error'
> & {
  title: string
  statusText?: string
  packId?: PackId
  filePath?: string
  isUpdate?: boolean
}

const modelStatus: Record<Exclude<ModelPhase, 'absent'>, DownloadStatus> = {
  probing: DownloadStatus.Queued,
  downloading: DownloadStatus.Downloading,
  paused: DownloadStatus.Paused,
  verifying: DownloadStatus.Downloading,
  ready: DownloadStatus.Completed,
  failed: DownloadStatus.Error,
  cancelled: DownloadStatus.Cancelled
}
const modelRows = computed(() =>
  karaokePacks.flatMap<TaskRow>((pack) => {
    const state = modelDownloads.value.find((item) => item.id === pack.id)
    if (!state || state.historyHidden || state.phase === 'absent') return []
    const totalSize = packBytes(pack)
    return [
      {
        id: 'karaoke:' + pack.id,
        packId: pack.id,
        title: '伴唱 · ' + pack.name,
        status: modelStatus[state.phase],
        statusText:
          state.phase === 'probing' || state.phase === 'verifying'
            ? modelPhaseLabel[state.phase]
            : undefined,
        createdAt: state.createdAt,
        progress: Math.min(100, (state.bytes / totalSize) * 100),
        speed: state.speed ?? 0,
        downloadedSize: state.bytes,
        totalSize,
        error: state.phase === 'failed' ? state.message : null
      }
    ]
  })
)
const taskGroups = computed(() => {
  const groups: Record<Tab, TaskRow[]> = { downloading: [], completed: [], failed: [] }
  const songs = store.tasks.map(
    (task): TaskRow => ({
      ...task,
      title: formatMusicInfo(filenameTemplate.value, { ...task.songInfo, quality: task.quality }),
      isUpdate: task.songInfo?.source === 'update'
    })
  )
  for (const task of [...songs, ...modelRows.value]) {
    const tab =
      task.status === DownloadStatus.Completed
        ? 'completed'
        : [DownloadStatus.Error, DownloadStatus.Cancelled].includes(task.status)
          ? 'failed'
          : 'downloading'
    groups[tab].push(task)
  }
  const order = {
    [DownloadStatus.Downloading]: 0,
    [DownloadStatus.Queued]: 1,
    [DownloadStatus.Paused]: 2
  }
  groups.downloading.sort(
    (a, b) =>
      (order[a.status] ?? 99) - (order[b.status] ?? 99) ||
      (a.status === DownloadStatus.Queued ? (a.priority ?? 0) - (b.priority ?? 0) : 0) ||
      a.createdAt - b.createdAt
  )
  groups.completed.sort((a, b) => b.createdAt - a.createdAt)
  groups.failed.sort((a, b) => b.createdAt - a.createdAt)
  return groups
})
const filteredTasks = computed(() => taskGroups.value[activeTab.value])

async function runAction(action: () => Promise<unknown>) {
  try {
    await action()
  } catch (error) {
    MessagePlugin.error(error instanceof Error ? error.message : String(error))
  }
}
function runBatch(resume: boolean) {
  const ids = taskGroups.value.downloading.flatMap((task) => (task.packId ? [task.packId] : []))
  return runAction(() =>
    Promise.all([
      resume ? store.resumeAllTasks() : store.pauseAllTasks(),
      ...ids.map((id) => (resume ? karaoke.download(id) : karaoke.pause(id)))
    ])
  )
}
function clearCurrentTab() {
  const tab = activeTab.value
  const ids = filteredTasks.value.flatMap((task) => (task.packId ? [task.packId] : []))
  return runAction(() =>
    Promise.all([
      store.clearTasks(tab === 'downloading' ? 'queue' : tab),
      ...ids.map((id) => (tab === 'downloading' ? karaoke.cancel(id, false) : karaoke.forget(id)))
    ])
  )
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

// 立即安装（仅针对应用更新任务）
const installUpdate = () => {
  try {
    desktopBridge.api.autoUpdater.quitAndInstall()
  } catch (e) {
    console.error('安装更新失败', e)
  }
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
          <t-button theme="primary" variant="text" size="small" @click="runBatch(true)">
            <template #icon><PlayCircleIcon /></template>
            全部开始
          </t-button>
          <t-button theme="warning" variant="text" size="small" @click="runBatch(false)">
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
          @click="clearCurrentTab"
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
        v-for="{ id, label } in tabs"
        :key="id"
        :value="id"
        :label="taskGroups[id].length ? `${label}(${taskGroups[id].length})` : label"
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
            <div class="task-name">{{ task.title }}</div>
            <div class="task-meta">
              <t-tag :theme="getStatusColor(task.status)" variant="light" size="small">
                {{ task.statusText ?? getStatusText(task.status) }}
              </t-tag>
              <t-tag v-if="task.isUpdate" theme="warning" variant="light-outline" size="small">
                应用更新
              </t-tag>
              <span
                v-if="task.status === DownloadStatus.Downloading && !task.statusText"
                class="speed"
              >
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
              title="暂停"
              aria-label="暂停"
              @click="
                runAction(() =>
                  task.packId ? karaoke.pause(task.packId) : store.pauseTask(task.id)
                )
              "
            >
              <template #icon><PauseCircleIcon /></template>
            </t-button>

            <t-button
              v-if="task.status === DownloadStatus.Paused"
              shape="circle"
              variant="text"
              title="继续"
              aria-label="继续"
              @click="
                runAction(() =>
                  task.packId ? karaoke.download(task.packId) : store.resumeTask(task.id)
                )
              "
            >
              <template #icon><PlayCircleIcon /></template>
            </t-button>

            <t-button
              v-if="task.status === DownloadStatus.Error"
              shape="circle"
              variant="text"
              title="重试"
              aria-label="重试"
              @click="
                runAction(() =>
                  task.packId ? karaoke.download(task.packId) : store.retryTask(task.id)
                )
              "
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
              title="取消下载"
              aria-label="取消下载"
              @click="
                runAction(() =>
                  task.packId ? karaoke.cancel(task.packId) : store.cancelTask(task.id)
                )
              "
            >
              <template #icon><CloseCircleIcon /></template>
            </t-button>

            <t-button
              v-if="task.status === DownloadStatus.Completed"
              shape="circle"
              variant="text"
              title="打开文件位置"
              aria-label="打开文件位置"
              @click="
                runAction(() =>
                  task.packId
                    ? karaoke.openLocation(task.packId)
                    : store.openFileLocation(task.filePath ?? '')
                )
              "
            >
              <template #icon><FolderOpenIcon /></template>
            </t-button>

            <!-- 应用更新：立即安装按钮 -->
            <t-button
              v-if="task.status === DownloadStatus.Completed && task.isUpdate"
              size="small"
              theme="primary"
              variant="outline"
              @click="installUpdate"
            >
              立即安装
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
              title="删除记录"
              aria-label="删除记录"
              @click="
                runAction(() =>
                  task.packId ? karaoke.forget(task.packId) : store.deleteTask(task.id)
                )
              "
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
