<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { storeToRefs } from 'pinia'
import {
  exportPlaylistToFile,
  copyPlaylistToClipboard,
  importPlaylistFromFile,
  importPlaylistFromClipboard,
  validateImportedPlaylist
} from '@renderer/utils/playlist/playlistExportImport'
import type { SongList } from '@renderer/types/audio'
import { CloudDownloadIcon, DeleteIcon, CloudUploadIcon } from 'tdesign-icons-vue-next'

const localUserStore = LocalUserDetailStore()
const { list } = storeToRefs(localUserStore)

// 对话框控制
const exportDialogVisible = ref(false)
const importDialogVisible = ref(false)

// 文件上传相关
const fileInputRef = ref<HTMLInputElement | null>(null)
const uploadedFile = ref<File | null>(null)

// 导出播放列表
const handleExportToFile = async () => {
  try {
    if (list.value.length === 0) {
      MessagePlugin.warning('播放列表为空，无法导出')
      return
    }

    const fileName = exportPlaylistToFile(list.value)
    MessagePlugin.success(`播放列表已成功导出为 ${fileName}`)
    exportDialogVisible.value = false
  } catch (error) {
    MessagePlugin.error(`导出失败: ${(error as Error).message}`)
  }
}

// 复制播放列表到剪贴板
const handleCopyToClipboard = async () => {
  try {
    if (list.value.length === 0) {
      MessagePlugin.warning('播放列表为空，无法复制')
      return
    }

    await copyPlaylistToClipboard(list.value)
    MessagePlugin.success('播放列表已复制到剪贴板')
    exportDialogVisible.value = false
  } catch (error) {
    MessagePlugin.error(`复制失败: ${(error as Error).message}`)
  }
}

// 触发文件选择
const triggerFileInput = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

// 处理文件选择
const handleFileChange = (event: Event) => {
  const input = event.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    uploadedFile.value = input.files[0]
  }
}

// 从文件导入播放列表
const handleImportFromFile = async () => {
  try {
    if (!uploadedFile.value) {
      MessagePlugin.warning('请先选择文件')
      return
    }

    const importedPlaylist = await importPlaylistFromFile(uploadedFile.value)

    if (!validateImportedPlaylist(importedPlaylist)) {
      console.log(importedPlaylist)
      throw new Error('导入的播放列表格式不正确')
    }

    // 合并播放列表，避免重复
    const mergedList = mergePlaylist(list.value, importedPlaylist)

    // 更新播放列表
    list.value = mergedList

    MessagePlugin.success(`成功导入 ${importedPlaylist.length} 首歌曲`)
    importDialogVisible.value = false
    uploadedFile.value = null
    if (fileInputRef.value) {
      fileInputRef.value.value = ''
    }
  } catch (error) {
    MessagePlugin.error(`导入失败: ${(error as Error).message}`)
  }
}

// 从剪贴板导入播放列表
const handleImportFromClipboard = async () => {
  try {
    const importedPlaylist = await importPlaylistFromClipboard()

    if (!validateImportedPlaylist(importedPlaylist)) {
      throw new Error('剪贴板中的播放列表格式不正确')
    }

    // 合并播放列表，避免重复
    const mergedList = mergePlaylist(list.value, importedPlaylist)

    // 更新播放列表
    list.value = mergedList

    MessagePlugin.success(`成功导入 ${importedPlaylist.length} 首歌曲`)
    importDialogVisible.value = false
  } catch (error) {
    MessagePlugin.error(`从剪贴板导入失败: ${(error as Error).message}`)
  }
}

// 合并播放列表，避免重复
const mergePlaylist = (currentList: SongList[], importedList: SongList[]): SongList[] => {
  const result = [...currentList]
  const existingIds = new Set(currentList.map((song) => song.songmid))

  for (const song of importedList) {
    if (!existingIds.has(song.songmid)) {
      result.push(song)
      existingIds.add(song.songmid)
    }
  }

  return result
}

// 清空播放列表
const handleClearPlaylist = () => {
  const confirm = DialogPlugin.confirm({
    header: '确认清空',
    body: '确定要清空播放列表吗？此操作不可恢复。',
    theme: 'warning',
    confirmBtn: {
      theme: 'danger',
      content: '清空'
    },
    cancelBtn: '取消',
    onConfirm: () => {
      list.value = []
      confirm.destroy()
      MessagePlugin.success('播放列表已清空')
    }
  })
}

// 获取播放列表统计信息
const playlistStats = ref({
  totalSongs: 0,
  totalDuration: 0,
  artists: new Set<string>()
})

// 计算播放列表统计信息
const updatePlaylistStats = () => {
  const stats = {
    totalSongs: list.value?.length || 0,
    totalDuration: 0,
    artists: new Set<string>()
  }

  if (list.value && list.value.length > 0) {
    list.value.forEach((song) => {
      // 处理新的 interval 字段格式
      if (typeof song.interval === 'string' && song.interval.includes(':')) {
        // 如果是 "05:41" 格式，转换为秒数
        const [minutes, seconds] = song.interval.split(':').map(Number)
        stats.totalDuration += minutes * 60 + seconds
      } else {
        // 如果是数字字符串，转换为秒数
        const duration = parseInt(song.interval)
        if (!isNaN(duration)) {
          stats.totalDuration += duration / 1000
        }
      }

      // 处理歌手信息
      if (song.singer) {
        // 如果歌手名包含分隔符，分割处理
        const singers = song.singer
          .split(/[\/、&]/)
          .map((s) => s.trim())
          .filter((s) => s)
        singers.forEach((singer) => stats.artists.add(singer))
      }
    })
  }

  playlistStats.value = stats
}

// 格式化时间
const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = Math.floor(seconds % 60)

  if (hours > 0) {
    return `${hours}小时${minutes}分钟`
  } else {
    return `${minutes}分钟${remainingSeconds}秒`
  }
}

// 监听播放列表变化
import { onMounted, watch } from 'vue'

onMounted(() => {
  updatePlaylistStats()
})

watch(
  () => list.value,
  () => {
    updatePlaylistStats()
  },
  { deep: true }
)
</script>

<template>
  <div class="playlist-settings">
    <div class="playlist-stats-card">
      <t-card title="播放列表统计" hover-shadow>
        <div class="stats-content">
          <div class="stat-item">
            <t-icon name="play" />
            <div class="stat-info">
              <div class="stat-label">歌曲数量</div>
              <div class="stat-value">{{ playlistStats.totalSongs }} 首</div>
            </div>
          </div>

          <div class="stat-item">
            <t-icon name="time" />
            <div class="stat-info">
              <div class="stat-label">总时长</div>
              <div class="stat-value">{{ formatDuration(playlistStats.totalDuration) }}</div>
            </div>
          </div>

          <div class="stat-item">
            <t-icon name="user-circle" />
            <div class="stat-info">
              <div class="stat-label">艺术家</div>
              <div class="stat-value">{{ playlistStats.artists.size }} 位</div>
            </div>
          </div>
        </div>
      </t-card>
    </div>

    <div class="playlist-actions-card">
      <t-card title="播放列表管理" hover-shadow>
        <div class="action-buttons">
          <t-button theme="primary" @click="exportDialogVisible = true">
            <template #icon>
              <CloudDownloadIcon />
            </template>
            导出播放列表
          </t-button>

          <t-button theme="primary" @click="importDialogVisible = true">
            <template #icon>
              <CloudUploadIcon />
            </template>
            导入播放列表
          </t-button>

          <t-button theme="danger" @click="handleClearPlaylist">
            <template #icon>
              <DeleteIcon />
            </template>
            清空播放列表
          </t-button>
        </div>

        <div class="feature-description">
          <h4>功能说明</h4>
          <ul>
            <li>
              <strong>导出播放列表：</strong>
              将当前播放列表导出为加密文件或复制到剪贴板，方便备份和分享。
            </li>
            <li>
              <strong>导入播放列表：</strong> 从加密文件或剪贴板导入播放列表，支持与现有列表合并。
            </li>
            <li><strong>清空播放列表：</strong> 一键清空当前播放列表，操作前会有确认提示。</li>
          </ul>
        </div>
      </t-card>
    </div>

    <!-- 导出对话框 -->
    <t-dialog
      v-model:visible="exportDialogVisible"
      header="导出播放列表"
      :on-close="() => (exportDialogVisible = false)"
      width="500px"
      attach="body"
    >
      <template #body>
        <div class="dialog-content">
          <p class="dialog-description">请选择导出方式：</p>

          <div class="export-options">
            <t-card
              title="导出为文件"
              description="将播放列表导出为加密文件，可用于备份或分享"
              class="export-option-card"
              @click="handleExportToFile"
            >
            </t-card>

            <t-card
              title="复制到剪贴板"
              description="将加密的播放列表数据复制到剪贴板，方便快速分享"
              class="export-option-card"
              @click="handleCopyToClipboard"
            >
              <template #avatar>
                <t-icon name="copy" size="large" />
              </template>
            </t-card>
          </div>
        </div>
      </template>

      <template #footer>
        <t-button theme="default" @click="exportDialogVisible = false">取消</t-button>
      </template>
    </t-dialog>

    <!-- 导入对话框 -->
    <t-dialog
      v-model:visible="importDialogVisible"
      header="导入播放列表"
      :on-close="() => (importDialogVisible = false)"
      width="700px"
      attach="body"
    >
      <template #body>
        <div class="dialog-content">
          <p class="dialog-description">请选择导入方式：</p>

          <div class="import-options">
            <t-card
              title="从文件导入"
              description="从.cpl格式的加密文件中导入播放列表"
              class="import-option-card"
            >
              <template #footer>
                <div class="file-upload-area">
                  <input
                    ref="fileInputRef"
                    type="file"
                    accept=".cpl"
                    style="display: none"
                    @change="handleFileChange"
                  />

                  <t-button theme="primary" variant="outline" @click="triggerFileInput">
                    选择文件
                  </t-button>

                  <span v-if="uploadedFile" class="file-name">
                    已选择: {{ uploadedFile.name }}
                  </span>

                  <t-button theme="primary" :disabled="!uploadedFile" @click="handleImportFromFile">
                    导入
                  </t-button>
                </div>
              </template>
            </t-card>

            <t-card
              title="从剪贴板导入"
              description="从剪贴板中导入加密的播放列表数据"
              class="import-option-card"
            >
              <template #footer>
                <t-button theme="primary" @click="handleImportFromClipboard">
                  从剪贴板导入
                </t-button>
              </template>
            </t-card>
          </div>
        </div>
      </template>

      <template #footer>
        <t-button theme="default" @click="importDialogVisible = false">取消</t-button>
      </template>
    </t-dialog>
  </div>
</template>

<style lang="scss" scoped>
.playlist-settings {
  margin-bottom: 2rem;
}

.playlist-stats-card,
.playlist-actions-card {
  margin-bottom: 1.5rem;
}

.stats-content {
  display: flex;
  flex-wrap: wrap;
  gap: 24px;
  margin-top: 8px;
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 12px;

  .t-icon {
    font-size: 24px;
    color: var(--td-brand-color);
  }

  .stat-info {
    .stat-label {
      font-size: 14px;
      color: var(--td-text-color-secondary);
      margin-bottom: 4px;
    }

    .stat-value {
      font-size: 18px;
      font-weight: 600;
      color: var(--td-text-color-primary);
    }
  }
}

.action-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-bottom: 24px;
}

.feature-description {
  background-color: var(--td-bg-color-container-hover);
  padding: 16px;
  border-radius: 8px;

  h4 {
    font-size: 16px;
    margin-top: 0;
    margin-bottom: 12px;
    color: var(--td-text-color-primary);
  }

  ul {
    margin: 0;
    padding-left: 20px;

    li {
      margin-bottom: 8px;
      color: var(--td-text-color-secondary);

      &:last-child {
        margin-bottom: 0;
      }

      strong {
        color: var(--td-text-color-primary);
      }
    }
  }
}

.dialog-content {
  padding: 16px 0;
}

.dialog-description {
  margin-bottom: 16px;
  font-size: 14px;
  color: var(--td-text-color-secondary);
}

.export-options,
.import-options {
  display: flex;
  gap: 16px;

  @media (max-width: 500px) {
    flex-direction: column;
  }
}

.export-option-card,
.import-option-card {
  flex: 1;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    transform: translateY(-4px);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.1);
  }
}

.file-upload-area {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: center;
}

.file-name {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  margin: 8px 0;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
