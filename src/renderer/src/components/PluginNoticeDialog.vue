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
import { ref, computed, onMounted, onUnmounted, toRaw } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { appEntryQueue } from '@renderer/services/entryQueue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { refreshPluginContributions } from '@renderer/services/pluginState'

const localUserStore = LocalUserDetailStore()

interface DialogNotice {
  type: string
  data: any
  timestamp: number
  pluginName: string
  pluginId?: string
  guestId?: string
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
const noticeQueue = ref<DialogNotice[]>([])
let finishQueuedNotice: (() => void) | undefined
let noticeSequence = 0
let noticesMounted = true
const seenUpdates = new Set<string>()

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
  if (noticeData.dialogType === 'update') {
    const key = JSON.stringify([
      noticeData.pluginId,
      noticeData.guestId,
      noticeData.newVersion || noticeData.updateUrl
    ])
    if (seenUpdates.has(key)) return
    seenUpdates.add(key)
  }
  // 添加到队列
  noticeQueue.value.push(noticeData)
  console.log('[PluginNotice] 添加通知到队列:', noticeData, '队列长度:', noticeQueue.value.length)

  void appEntryQueue.enqueue(`plugin-notice:${++noticeSequence}`, async () => {
    if (!noticesMounted || !noticeQueue.value.includes(noticeData)) return
    noticeQueue.value = noticeQueue.value.filter((item) => toRaw(item) !== noticeData)
    await new Promise<void>((resolve) => {
      finishQueuedNotice = resolve
      notice.value = noticeData
      visible.value = true
    })
  })
}

// 处理操作按钮点击
const handleAction = async (actionType: string) => {
  if (!notice.value) return

  actionLoading.value = actionType

  try {
    console.log('[PluginNotice] 处理操作:', actionType, notice.value)

    if (actionType === 'update' && notice.value.updateUrl) {
      // 尝试内部更新
      try {
        if (!notice.value.pluginId) throw new Error('更新缺少目标插件')
        const result: any = notice.value.guestId
          ? await window.api.plugins.guestUpdate(
              notice.value.pluginId,
              notice.value.guestId,
              notice.value.updateUrl
            )
          : await window.api.plugins.updateFromUrl(notice.value.pluginId, notice.value.updateUrl)

        if (result && typeof result === 'object' && 'error' in result) {
          throw new Error(result.error)
        }

        await refreshPluginContributions(true)
        MessagePlugin.success(`插件 "${notice.value.pluginName}" 更新成功！`)
        handleClose()
      } catch (err: any) {
        console.error('[PluginNotice] 内部更新失败:', err)
        // 内部更新失败，提示用户是否打开浏览器手动安装
        DialogPlugin.confirm({
          header: '自动更新失败',
          body: `插件内部更新失败（${err.message}），是否打开浏览器手动下载安装？`,
          confirmBtn: '打开浏览器',
          cancelBtn: '取消',
          onConfirm: () => {
            window.open(notice.value!.updateUrl)
            handleClose()
          },
          onCancel: () => {
            handleClose()
          }
        })
      }
    } else if (actionType === 'cancel') {
      // 取消操作直接关闭
      handleClose()
    } else if (actionType === 'confirm' && notice.value.updateUrl) {
      try {
        const result = await window.api.plugins.downloadAndAddPlugin(
          notice.value!.updateUrl!,
          notice.value!.pluginType || 'cr'
        )
        if (result && typeof result === 'object' && 'error' in result) {
          throw new Error(result.error)
        }
        const pluginId = result.pluginId
        const pluginInfo = result.pluginInfo || {}
        const sources = result.supportedSources || {}
        let selectSources = Object.keys(sources)[0] || ''
        if (
          typeof localUserStore.userInfo.selectSources === 'string' &&
          sources[localUserStore.userInfo.selectSources]
        ) {
          selectSources = localUserStore.userInfo.selectSources
        }
        let selectQuality = ''
        if (selectSources && sources[selectSources]?.qualitys?.length) {
          const qualitys = sources[selectSources].qualitys
          selectQuality = qualitys[qualitys.length - 1]
        }
        localUserStore.userInfo.pluginId = pluginId
        localUserStore.userInfo.pluginName = pluginInfo.name || ''
        localUserStore.userInfo.supportedSources = sources
        localUserStore.userInfo.selectSources = selectSources
        localUserStore.userInfo.selectQuality = selectQuality
        MessagePlugin.success(`插件 "${pluginInfo.name || '已安装插件'}" 安装成功并已设为当前使用`)
        handleClose()
      } catch (e: any) {
        MessagePlugin.error(`安装插件失败: ${e.message || '未知错误'}`)
      }
    } else {
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

  const finish = finishQueuedNotice
  finishQueuedNotice = undefined
  setTimeout(() => finish?.(), 200)
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
  noticesMounted = false
  finishQueuedNotice?.()
  finishQueuedNotice = undefined
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
