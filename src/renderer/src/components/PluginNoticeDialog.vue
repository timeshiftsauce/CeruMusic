<template>
  <t-dialog
    v-model:visible="visible"
    :header="dialogTitle"
    :width="dialogWidth"
    :close-btn="true"
    :close-on-overlay-click="false"
    :destroy-on-close="true"
    placement="center"
    @close="handleClose"
  >
    <template #body>
      <div class="plugin-notice-content">
        <!-- 通知消息 -->
        <div class="notice-message">
          <p class="message-text">{{ notice?.message }}</p>

          <!-- 更新通知的额外信息 -->
          <div v-if="notice?.dialogType === 'update'" class="update-info">
            <div class="version-info">
              <span class="version-label">当前版本:</span>
              <span class="version-value">{{ notice?.currentVersion || 'Unknown' }}</span>
            </div>
            <div class="version-info">
              <span class="version-label">新版本:</span>
              <span class="version-value new-version">{{ notice?.newVersion || 'Unknown' }}</span>
            </div>
            <div v-if="notice?.pluginType" class="plugin-type">
              <span class="type-label">插件类型:</span>
              <t-tag :theme="notice.pluginType === 'cr' ? 'primary' : 'success'" size="small">
                {{ notice.pluginType === 'cr' ? 'CeruMusic' : 'LX Music' }}
              </t-tag>
            </div>
          </div>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="dialog-actions">
        <t-button
          v-for="action in notice?.actions || []"
          :key="action.type"
          :theme="action.primary ? 'primary' : 'default'"
          :loading="actionLoading === action.type"
          @click="handleAction(action.type)"
        >
          {{ action.text }}
        </t-button>
      </div>
    </template>
  </t-dialog>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'

interface DialogNotice {
  type: string
  data: any
  timestamp: number
  pluginName: string
  dialogType: 'update' | 'info' | 'error' | 'warning' | 'success'
  title: string
  message: string
  updateUrl?: string
  pluginType?: 'lx' | 'cr'
  currentVersion?: string
  newVersion?: string
  actions: Array<{
    text: string
    type: 'cancel' | 'update' | 'confirm'
    primary?: boolean
  }>
}

// 响应式数据
const visible = ref(false)
const notice = ref<DialogNotice | null>(null)
const actionLoading = ref<string | null>(null)
const noticeQueue = ref<DialogNotice[]>([]) // 通知队列

// 计算属性
const dialogWidth = computed(() => {
  return notice.value?.dialogType === 'update' ? '500px' : '400px'
})

// 对话框标题（包含队列信息）
const dialogTitle = computed(() => {
  const baseTitle = notice.value?.title || '插件通知'
  const queueLength = noticeQueue.value.length

  if (queueLength > 0) {
    return `${baseTitle} (还有 ${queueLength} 个通知)`
  }

  return baseTitle
})

// 显示通知对话框
const showNotice = (noticeData: DialogNotice) => {
  // 添加到队列
  noticeQueue.value.push(noticeData)
  console.log('[PluginNotice] 添加通知到队列:', noticeData, '队列长度:', noticeQueue.value.length)

  // 如果当前没有显示对话框，立即显示
  if (!visible.value) {
    showNextNotice()
  }
}

// 显示队列中的下一个通知
const showNextNotice = () => {
  if (noticeQueue.value.length === 0) {
    return
  }

  const nextNotice = noticeQueue.value.shift()
  if (nextNotice) {
    notice.value = nextNotice
    visible.value = true
    console.log(
      '[PluginNotice] 显示下一个通知:',
      nextNotice,
      '剩余队列长度:',
      noticeQueue.value.length
    )
  }
}

// 处理操作按钮点击
const handleAction = async (actionType: string) => {
  if (!notice.value) return

  actionLoading.value = actionType

  try {
    console.log('[PluginNotice] 处理操作:', actionType, notice.value)

    if (actionType === 'update' && notice.value.updateUrl) {
      window.open(notice.value.updateUrl)
      handleClose()
    } else if (actionType === 'cancel') {
      // 取消操作直接关闭
      handleClose()
    } else {
      // 其他操作直接关闭对话框
      handleClose()
    }
  } catch (error: any) {
    console.error('[PluginNotice] 处理操作失败:', error)
    MessagePlugin.error(`操作失败: ${error.message}`)
  } finally {
    actionLoading.value = null
  }
}

// 处理对话框关闭
const handleClose = () => {
  visible.value = false
  notice.value = null
  actionLoading.value = null

  // 延迟一点时间后显示下一个通知，避免对话框切换过快
  setTimeout(() => {
    showNextNotice()
  }, 300)
}

// 监听插件通知事件
const handlePluginNotice = (noticeData: DialogNotice) => {
  showNotice(noticeData)
}
let event: () => void
// 生命周期
onMounted(() => {
  // 监听来自主进程的插件通知
  event = window.api.pluginNotice.onPluginNotice(handlePluginNotice)
})
onUnmounted(() => {
  event()
  // 清空队列
  noticeQueue.value = []
})
// 暴露方法给父组件
defineExpose({
  showNotice,
  getQueueLength: () => noticeQueue.value.length,
  clearQueue: () => {
    noticeQueue.value = []
    console.log('[PluginNotice] 清空通知队列')
  }
})
</script>

<style scoped lang="scss">
.plugin-notice-content {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  padding: 16px 0;

  .notice-icon {
    flex-shrink: 0;

    .icon-update {
      color: #0052d9;
    }

    .icon-error {
      color: #e34d59;
    }

    .icon-warning {
      color: #ed7b2f;
    }

    .icon-success {
      color: #00a870;
    }

    .icon-info {
      color: #0052d9;
    }
  }

  .notice-message {
    flex: 1;

    .message-text {
      margin: 0 0 16px 0;
      font-size: 14px;
      line-height: 1.5;
      color: var(--td-text-color-primary);
    }

    .update-info {
      background: var(--td-bg-color-container);
      border-radius: 6px;
      padding: 20px;
      margin: 0 10px;
      border: 1px solid var(--td-border-level-1-color);

      .version-info {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 8px;

        &:last-child {
          margin-bottom: 0;
        }

        .version-label {
          font-size: 12px;
          color: var(--td-text-color-secondary);
        }

        .version-value {
          font-size: 12px;
          font-weight: 500;
          color: var(--td-text-color-primary);

          &.new-version {
            color: var(--td-brand-color);
          }
        }
      }

      .plugin-type {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-top: 8px;
        padding-top: 8px;
        border-top: 1px solid var(--td-border-level-2-color);

        .type-label {
          font-size: 12px;
          color: var(--td-text-color-secondary);
        }
      }
    }
  }
}

.dialog-actions {
  display: flex;
  gap: 8px;
  justify-content: flex-end;
}

// 响应式设计
@media (max-width: 768px) {
  .plugin-notice-content {
    flex-direction: column;
    text-align: center;

    .notice-icon {
      align-self: center;
    }
  }

  .dialog-actions {
    flex-direction: column-reverse;

    :deep(.t-button) {
      width: 100%;
    }
  }
}

// 深色主题适配
:deep(.t-dialog) {
  .t-dialog__header {
    border-bottom: 1px solid var(--td-border-level-1-color);
  }

  .t-dialog__footer {
    border-top: 1px solid var(--td-border-level-1-color);
  }
}
</style>
