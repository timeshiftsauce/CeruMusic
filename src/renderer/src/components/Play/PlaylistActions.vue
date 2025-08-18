<script setup lang="ts">
import { ref } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import {
  exportPlaylistToFile,
  copyPlaylistToClipboard,
  importPlaylistFromFile,
  importPlaylistFromClipboard,
  validateImportedPlaylist
} from '@renderer/utils/playlistExportImport'
import { CloudDownloadIcon } from 'tdesign-icons-vue-next'
import type { SongList } from '@renderer/types/audio'
import { storeToRefs } from 'pinia'

const localUserStore = LocalUserDetailStore()
const { list } = storeToRefs(localUserStore)

// 对话框控制
const exportDialogVisible = ref(false)
const importDialogVisible = ref(false)
const clearDialogVisible = ref(false)

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
  const existingIds = new Set(currentList.map((song) => song.id))

  for (const song of importedList) {
    if (!existingIds.has(song.id)) {
      result.push(song)
      existingIds.add(song.id)
    }
  }

  return result
}

// 清空播放列表
const handleClearPlaylist = () => {
  DialogPlugin.confirm({
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
      MessagePlugin.success('播放列表已清空')
      clearDialogVisible.value = false
    }
  })
}
</script>

<template>
  <div class="playlist-actions">
    <!-- 操作按钮 -->
    <div class="action-buttons">
      <t-button theme="primary" variant="outline" @click="exportDialogVisible = true">
        <CloudDownloadIcon />
        导出播放列表
      </t-button>

      <t-button theme="primary" variant="outline" @click="importDialogVisible = true">
        导入播放列表
      </t-button>

      <t-button theme="danger" variant="outline" @click="handleClearPlaylist">
        清空播放列表
      </t-button>
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
              <template #avatar>
                <t-icon name="file" size="large" />
              </template>
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
      width="500px"
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
              <template #avatar>
                <t-icon name="file" size="large" />
              </template>

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
              <template #avatar>
                <t-icon name="paste" size="large" />
              </template>

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
.playlist-actions {
  padding: 16px;
}

.action-buttons {
  display: flex;
  gap: 12px;
  margin-bottom: 16px;
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
