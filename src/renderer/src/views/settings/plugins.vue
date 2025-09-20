<template>
  <div class="page">
    <TitleBarControls title="插件管理" :show-back="true" class="header"></TitleBarControls>
    <div class="plugins-container">
      <h2>插件管理</h2>

      <div class="plugin-actions">
        <t-button theme="primary" @click="plugTypeDialog = true">
          <template #icon><t-icon name="add" /></template> 添加插件
        </t-button>
        <t-dialog
          :visible="plugTypeDialog"
          :close-btn="true"
          confirm-btn="确定"
          cancel-btn="取消"
          :on-confirm="addPlug"
          :on-close="() => (plugTypeDialog = false)"
        >
          <template #header>请选择你的插件类别</template>
          <template #body>
            <t-radio-group v-model="type" variant="primary-filled" default-value="cr">
              <t-radio-button value="cr">澜音插件</t-radio-button>
              <t-radio-button value="lx">洛雪插件</t-radio-button>
            </t-radio-group>
          </template>
        </t-dialog>
        <t-button theme="default" @click="refreshPlugins">
          <template #icon><t-icon name="refresh" /></template> 刷新
        </t-button>
      </div>

      <div v-if="loading" class="loading">
        <div class="spinner"></div>
        <span>加载中...</span>
      </div>

      <div v-else-if="error" class="error-state">
        <t-icon name="error-circle" style="font-size: 48px; color: #dc3545" />
        <p>加载插件时出错</p>
        <p class="error-message">{{ error }}</p>
        <t-button theme="default" @click="refreshPlugins">
          <template #icon><t-icon name="refresh" /></template> 重试
        </t-button>
      </div>

      <div v-else-if="plugins.length === 0" class="empty-state">
        <t-icon name="app" style="font-size: 48px" />
        <p>暂无已安装的插件</p>
        <p class="hint">点击"添加插件"按钮来安装新插件</p>
      </div>

      <div v-else class="plugin-list">
        <div
          v-for="plugin in plugins"
          :key="plugin.pluginId"
          class="plugin-item"
          :class="{ selected: isPluginSelected(plugin.pluginId) }"
        >
          <div class="plugin-info">
            <h3>
              {{ plugin.pluginInfo.name }}
              <span class="version">{{ plugin.pluginInfo.version }}</span>
              <span v-if="isPluginSelected(plugin.pluginId)" class="current-tag">当前使用</span>
            </h3>
            <p class="author">作者: {{ plugin.pluginInfo.author }}</p>
            <p class="description">{{ plugin.pluginInfo.description || '无描述' }}</p>
            <div
              v-if="plugin.supportedSources && Object.keys(plugin.supportedSources).length > 0"
              class="plugin-sources"
            >
              <span class="source-label">支持的音源:</span>
              <span v-for="source in plugin.supportedSources" :key="source.name" class="source-tag">
                {{ source.name }}
              </span>
            </div>
          </div>
          <div class="plugin-actions">
            <t-button
              theme="default"
              size="small"
              :disabled="loading"
              @click.stop="viewPluginLogs(plugin.pluginId, plugin.pluginInfo.name)"
            >
              <template #icon><t-icon name="view-list" /></template> 日志
            </t-button>
            <t-button
              v-if="!isPluginSelected(plugin.pluginId)"
              theme="primary"
              size="small"
              @click="selectPlugin(plugin)"
            >
              <template #icon><t-icon name="check" /></template> 使用
            </t-button>
            <t-button
              theme="danger"
              size="small"
              @click="uninstallPlugin(plugin.pluginId, plugin.pluginInfo.name)"
            >
              <template #icon><t-icon name="delete" /></template> 卸载
            </t-button>
          </div>
        </div>
      </div>

      <!-- 插件日志弹窗 -->
      <t-dialog
        v-model:visible="logDialogVisible"
        top="10vh"
        :close-btn="false"
        :footer="false"
        width="80%"
        :style="{ maxWidth: '900px', maxHeight: '80vh' }"
        class="log-dialog"
      >
        <template #header>
          <div class="log-dialog-header">
            <div class="log-title">
              <i class="iconfont icon-terminal"></i>
              {{ currentLogPluginName }} - 插件日志
            </div>
            <div class="log-actions">
              <t-button
                size="small"
                variant="outline"
                theme="default"
                ghost
                :disabled="logsLoading"
                @click.stop="refreshLogs"
              >
                刷新
              </t-button>
            </div>
            <div class="mac-controls">
              <div class="mac-button close" @click="logDialogVisible = false"></div>
              <div class="mac-button minimize"></div>
              <div class="mac-button maximize"></div>
            </div>
          </div>
        </template>
        <template #body>
          <div class="console-container">
            <div class="console-header">
              <div class="console-info">
                <span class="console-prompt">$</span>
                <span class="console-path">~/plugins/{{ currentLogPluginName }}</span>
                <span class="console-time">{{ formatTime(new Date()) }}</span>
              </div>
            </div>
            <div ref="logContentRef" class="console-content" :class="{ loading: logsLoading }">
              <div v-if="logsLoading" class="console-loading">
                <div class="loading-spinner"></div>
                <span>正在加载日志...</span>
              </div>
              <div v-else-if="logsError" class="console-error">
                <span class="error-icon">❌</span>
                <span>加载日志失败: {{ logsError }}</span>
              </div>
              <div v-else-if="logs.length === 0" class="console-empty">
                <span class="empty-icon">📝</span>
                <span>暂无日志记录</span>
              </div>
              <div v-else class="log-entries">
                <div
                  v-for="(log, index) in logs"
                  :key="index"
                  class="log-entry"
                  :class="getLogLevel(log)"
                >
                  <span class="log-timestamp">{{ formatLogTime(index) }}</span>
                  <span class="log-content">{{ log }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </t-dialog>
    </div>
  </div>
</template>

<script setup lang="ts">
import TitleBarControls from '@renderer/components/TitleBarControls.vue'
import { ref, onMounted, nextTick } from 'vue'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'

interface PluginSource {
  name: string
  type: string
  qualitys: string[]
}

interface PluginInfo {
  name: string
  version: string
  author: string
  description?: string
}

interface Plugin {
  pluginId: string
  pluginName: string
  pluginInfo: PluginInfo
  supportedSources: { [key: string]: PluginSource }
}

// 定义API返回结果的接口
interface ApiResult {
  error?: string
  pluginInfo?: PluginInfo
  [key: string]: any
}

const plugins = ref<Plugin[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const plugTypeDialog = ref(false)
const type = ref<'lx' | 'cr'>('cr')

// 日志相关状态
const logDialogVisible = ref(false)
const currentLogPluginId = ref('')
const currentLogPluginName = ref('')
const logs = ref<string[]>([])
const logsLoading = ref(false)
const logsError = ref<string | null>(null)
const logContentRef = ref<HTMLElement | null>(null)

// 获取store实例
const localUserStore = LocalUserDetailStore()

// 检查插件是否被选中
function isPluginSelected(pluginId: string): boolean {
  return localUserStore.userInfo.pluginId === pluginId
}

// 选择插件
function selectPlugin(plugin: Plugin) {
  try {
    // 确保store已初始化
    if (!localUserStore.initialization) {
      localUserStore.init()
    }

    const { pluginId, pluginInfo, supportedSources: sources } = plugin

    // 检查插件是否提供音源
    if (!sources || Object.keys(sources).length === 0) {
      MessagePlugin.warning(`插件 "${pluginInfo.name}" 没有提供可用的音源。`)
      // 即使没有音源，也可能需要选择该插件（如果插件有其他功能）
      // 这里我们只更新ID，清空音源相关信息
      localUserStore.userInfo.pluginId = pluginId
      localUserStore.userInfo.supportedSources = {}
      localUserStore.userInfo.selectSources = ''
      localUserStore.userInfo.selectQuality = ''
      MessagePlugin.success(`已选择插件: ${pluginInfo.name}`)
      return
    }

    // 转换supportedSources格式以匹配UserInfo类型，并添加 `type` 字段
    const supportedSourcesForStore = sources
    let selectSources: string
    // 获取第一个音源作为默认选择
    if (
      !(typeof localUserStore.userInfo.selectSources === 'string') ||
      !sources[localUserStore.userInfo.selectSources as unknown as string]
    ) {
      selectSources = Object.keys(sources)[0]
    } else {
      selectSources = localUserStore.userInfo.selectSources
    }
    let selectQuality: string
    if (
      !(typeof localUserStore.userInfo.selectQuality === 'string') ||
      !sources[localUserStore.userInfo.selectSources as unknown as string] ||
      !sources[localUserStore.userInfo.selectSources as unknown as string][
        localUserStore.userInfo.selectQuality as unknown as string
      ]
    ) {
      const qualitys = sources[selectSources].qualitys
      selectQuality = qualitys[qualitys.length - 1]
    } else {
      selectQuality = localUserStore.userInfo.selectQuality
    }

    // 更新userInfo
    localUserStore.userInfo.pluginId = pluginId
    localUserStore.userInfo.supportedSources = supportedSourcesForStore
    localUserStore.userInfo.selectSources = selectSources
    localUserStore.userInfo.selectQuality = selectQuality

    MessagePlugin.success(`已选择插件: ${pluginInfo.name}`)
  } catch (err: any) {
    console.error('选择插件失败:', err)
    MessagePlugin.error(`选择插件失败: ${err.message || '未知错误'}`)
  }
}

// 获取已安装的插件列表
async function getPlugins() {
  loading.value = true
  error.value = null

  try {
    const result = await window.api.plugins.loadAllPlugins()
    console.log(result)
    // 检查返回结果是否有错误
    if (result && typeof result === 'object' && 'error' in result) {
      console.error('获取插件列表失败:', result.error)
      error.value = `加载插件失败: ${result.error}`
      plugins.value = []
    } else if (Array.isArray(result)) {
      plugins.value = result
      console.log('插件列表加载完成', result)
    } else {
      // 处理意外的返回格式
      console.error('插件列表格式不正确:', result)
      plugins.value = []
      error.value = '插件数据格式不正确'
    }
  } catch (err: any) {
    console.error('获取插件列表失败:', err)
    error.value = err?.message || '未知错误'
    plugins.value = []
  } finally {
    loading.value = false
  }
}

async function addPlug() {
  try {
    // 调用主进程的文件选择和添加插件API
    plugTypeDialog.value = false
    console.log(type.value)
    const result = (await window.api.plugins.selectAndAddPlugin(type.value)) as ApiResult

    // 检查用户是否取消了文件选择
    if (result && result.canceled) {
      return
    }

    // 检查结果是否包含错误
    if (result && typeof result === 'object' && 'error' in result) {
      MessagePlugin.error(`安装插件失败: ${result.error}`)
      console.error('安装插件失败:', result.error)
    } else {
      // 安装成功才刷新插件列表
      await getPlugins()
      // 显示成功消息
      if (result && result.pluginInfo) {
        MessagePlugin.success(`插件 "${result.pluginInfo.name}" 安装成功！`)
      } else {
        MessagePlugin.success('插件安装成功！')
      }
    }
  } catch (err: any) {
    console.error('安装插件失败:', err)
    MessagePlugin.error(`安装插件失败: ${err.message || '未知错误'}`)
  }
}

// 卸载插件
async function uninstallPlugin(pluginId: string, pluginName: string) {
  try {
    // 使用TDesign对话框，替代confirm
    const dialog = DialogPlugin.confirm({
      header: '确认卸载',
      body: `确定要卸载插件 "${pluginName}" 吗？`,
      confirmBtn: '确认卸载',
      cancelBtn: '取消',
      onConfirm: async () => {
        // 用户确认后，开始卸载操作
        loading.value = true

        const result = (await window.api.plugins.uninstallPlugin(pluginId)) as ApiResult

        // 检查结果是否包含错误
        if (result && typeof result === 'object' && 'error' in result) {
          // 使用TDesign消息提示，替代alert
          MessagePlugin.error(`卸载插件失败: ${result.error}`)
          console.error('卸载插件失败:', result.error)
        } else {
          // 卸载成功才刷新插件列表
          await getPlugins()
          // 显示成功消息
          if (pluginId === localUserStore.userInfo.pluginId) {
            localUserStore.userInfo.pluginId = ''
            localUserStore.userInfo.supportedSources = {}
            localUserStore.userInfo.selectSources = ''
            localUserStore.userInfo.selectQuality = ''
          }
          MessagePlugin.success(`插件 "${pluginName}" 卸载成功！`)
        }
        dialog.destroy()
      }
    })
  } catch (err: any) {
    // 使用TDesign消息提示，替代alert
    console.error('卸载插件失败:', err)
    MessagePlugin.error(`卸载插件失败: ${err.message || '未知错误'}`)
  } finally {
    loading.value = false
  }
}

// 刷新插件列表
async function refreshPlugins() {
  await getPlugins()
}

// 查看插件日志
async function viewPluginLogs(pluginId: string, pluginName: string) {
  try {
    currentLogPluginId.value = pluginId
    currentLogPluginName.value = pluginName
    logDialogVisible.value = true
    await loadPluginLogs()
  } catch (err: any) {
    console.error('打开日志弹窗失败:', err)
    MessagePlugin.error(`打开日志弹窗失败: ${err.message || '未知错误'}`)
  }
}

// 加载插件日志
async function loadPluginLogs() {
  if (!currentLogPluginId.value) return

  logsLoading.value = true
  logsError.value = null

  try {
    const result = await window.api.plugins.getPluginLog(currentLogPluginId.value)
    console.log(result)
    if (result && Array.isArray(result)) {
      logs.value = result
      // 滚动到底部显示最新日志
      await nextTick()
      setTimeout(() => {
        if (logContentRef.value) {
          logContentRef.value.scrollTop = logContentRef.value.scrollHeight
        }
      }, 100)
    } else {
      logs.value = []
    }
  } catch (err: any) {
    console.error('加载插件日志失败:', err)
    logsError.value = err.message || '加载日志失败'
    logs.value = []
  } finally {
    logsLoading.value = false
  }
}

// 刷新日志
async function refreshLogs() {
  try {
    await loadPluginLogs()
  } catch (err: any) {
    console.error('刷新日志失败:', err)
    MessagePlugin.error(`刷新日志失败: ${err.message || '未知错误'}`)
  }
}

// 格式化时间
function formatTime(date: Date): string {
  return date.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 格式化日志时间
function formatLogTime(index: number): string {
  const now = new Date()
  const logTime = new Date(now.getTime() - (logs.value.length - index - 1) * 1000)
  return logTime.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

// 获取日志级别样式
function getLogLevel(log: string): string {
  const logLower = log.toLowerCase()
  if (logLower.includes('error') || logLower.includes('错误')) {
    return 'log-error'
  } else if (logLower.includes('warn') || logLower.includes('警告')) {
    return 'log-warn'
  } else if (logLower.includes('info') || logLower.includes('信息')) {
    return 'log-info'
  } else if (logLower.includes('debug') || logLower.includes('调试')) {
    return 'log-debug'
  }
  return 'log-default'
}

onMounted(async () => {
  // 确保store已初始化
  if (!localUserStore.initialization) {
    console.log('组件挂载时初始化store')
    localUserStore.init()
  }
  await getPlugins()
})
</script>

<style scoped lang="scss">
.page {
  display: flex;
  flex-direction: column;
  height: 100vh;
}
.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background-color: #fff;
  padding: 1.5rem;
  position: sticky;
  z-index: 1000;
  top: 0;
  left: 0;
  right: 0;
}

.plugins-container {
  flex: 1;
  padding: 20px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  min-height: 0;
}

.plugin-actions {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
}

.spinner {
  width: 30px;
  height: 30px;
  border: 3px solid rgba(0, 0, 0, 0.1);
  border-radius: 50%;
  border-top-color: var(--color-primary, #007bff);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 10px;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #666;
}

.error-message {
  color: #dc3545;
  margin-bottom: 15px;
  text-align: center;
  max-width: 80%;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 40px 0;
  color: #666;
}

.hint {
  font-size: 0.9em;
  color: #999;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 15px;
  flex: 1;
  overflow-y: auto;
  min-height: 0;
}

.plugin-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 15px;
  border-radius: 8px;
  background-color: var(--color-background-soft, #f8f9fa);
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
  transition: all 0.3s ease;
  border: 2px solid transparent;
}

.plugin-item.selected {
  background-color: #e8f5e8;
  border: 2px solid #28a745;
}

.plugin-info {
  flex: 1;
}

.plugin-info h3 {
  margin: 0 0 5px 0;
  font-size: 1.1em;
  display: flex;
  align-items: center;
  gap: 8px;
}

.version {
  font-size: 0.8em;
  color: #666;
  font-weight: normal;
}

.current-tag {
  background-color: var(--td-brand-color-5);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.75em;
  font-weight: normal;
}

.author {
  margin: 0 0 5px 0;
  font-size: 0.9em;
  color: #666;
}

.description {
  margin: 0 0 8px 0;
  font-size: 0.9em;
}

.plugin-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
  margin-top: 5px;
}

.source-label {
  font-size: 0.85em;
  color: #666;
}

.source-tag {
  background-color: var(--color-primary, #007bff);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 0.8em;
}

.plugin-actions {
  display: flex;
  gap: 8px;
}

/* 日志弹窗样式 */
:deep(.log-dialog) {
  height: 80vh;

  .t-dialog {
    background: #1e1e1e;
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
    overflow: hidden;
  }

  .t-dialog__header {
    background: #2d2d2d;
    border-bottom: 1px solid #404040;
    padding: 0;
    border-radius: 12px 12px 0 0;
    overflow: hidden;
  }

  .t-dialog__body {
    padding: 0;
    background: #1e1e1e;
    border-left: 2px solid #272727;
    border-right: 2px solid #272727;
    border-bottom: 2px solid #272727;
    border-radius: 0 0 12px 12px;
    // max-height: 600px;
    overflow: hidden;
  }
}

.log-dialog-header {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: linear-gradient(135deg, #2d2d2d 0%, #1e1e1e 100%);
  min-height: 48px;
  width: 100%;

  .log-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #ffffff;
    font-weight: 600;
    font-size: 14px;
    flex: 1;

    .iconfont {
      font-size: 16px;
      color: #00d4aa;
    }
  }

  .log-actions {
    display: flex;
    gap: 8px;
    margin-right: 12px;

    :deep(.t-button) {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid rgba(255, 255, 255, 0.2);
      color: #ffffff;
      font-size: 12px;
      padding: 4px 12px;
      height: auto;

      &:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        border-color: rgba(255, 255, 255, 0.3);
      }

      .t-icon {
        font-size: 12px;
      }
    }
  }

  .mac-controls {
    display: flex;
    gap: 8px;
    flex-direction: row-reverse;

    .mac-button {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      cursor: pointer;
      transition: all 0.2s ease;

      &.close {
        background: #ff5f57;

        &:hover {
          background: #ff3b30;
        }
      }

      &.minimize {
        background: #ffbd2e;

        &:hover {
          background: #ff9500;
        }
      }

      &.maximize {
        background: #28ca42;

        &:hover {
          background: #30d158;
        }
      }
    }
  }
}

.console-container {
  background: #1e1e1e;
  color: #ffffff;
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.4;
  height: calc(80vh - 64px - 48px);
  // max-height: 500px;
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.console-header {
  background: #2d2d2d;
  border-bottom: 1px solid #404040;
  padding: 8px 16px;
  flex-shrink: 0;

  .console-info {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;
    .console-prompt {
      color: var(--td-brand-color-5);
      font-weight: bold;
    }

    .console-path {
      color: #8a8a8a;
    }

    .console-time {
      color: #666666;
      margin-left: auto;
    }
  }
}

.console-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: #555555 #2d2d2d;
  padding: 16px;
  background: #1e1e1e;
  position: relative;

  &.loading {
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* 自定义滚动条 */
  &::-webkit-scrollbar {
    width: 8px;
  }

  &::-webkit-scrollbar-track {
    background: #2d2d2d;
  }

  &::-webkit-scrollbar-thumb {
    background: #555555;
    border-radius: 4px;

    &:hover {
      background: #666666;
    }
  }
}

.console-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: #8a8a8a;

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid #404040;
    border-top: 2px solid #00d4aa;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

.console-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: #ff6b6b;
  padding: 12px;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 6px;
  border-left: 4px solid #ff6b6b;

  .error-icon {
    font-size: 16px;
  }
}

.console-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: #8a8a8a;
  height: 200px;

  .empty-icon {
    font-size: 24px;
    opacity: 0.6;
  }
}

.log-entries {
  .log-entry {
    display: flex;
    margin-bottom: 4px;
    padding: 2px 0;
    border-radius: 3px;
    transition: background-color 0.2s ease;

    &:hover {
      background: rgba(255, 255, 255, 0.05);
    }

    .log-timestamp {
      color: #666666;
      font-size: 11px;
      width: 80px;
      text-align: center;
      flex-shrink: 0;
      margin-right: 12px;
      font-weight: 500;
    }

    .log-content {
      flex: 1;
      word-break: break-all;
      white-space: pre-wrap;
      user-select: text !important;
    }

    /* 不同日志级别的颜色 */
    &.log-error {
      .log-content {
        color: #ff6b6b;
      }

      .log-timestamp {
        color: #ff6b6b;
      }
    }

    &.log-warn {
      .log-content {
        color: #ffd93d;
      }

      .log-timestamp {
        color: #ffd93d;
      }
    }

    &.log-info {
      .log-content {
        color: #74b9ff;
      }

      .log-timestamp {
        color: #74b9ff;
      }
    }

    &.log-debug {
      .log-content {
        color: #a29bfe;
      }

      .log-timestamp {
        color: #a29bfe;
      }
    }

    &.log-default {
      .log-content {
        color: #ffffff;
      }
    }
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }

  100% {
    transform: rotate(360deg);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  :deep(.log-dialog) {
    .t-dialog {
      width: 95% !important;
      max-width: none !important;
      max-height: 90vh !important;
    }
  }

  .console-container {
    height: 50vh;
    max-height: 400px;
    min-height: 250px;
  }

  .log-dialog-header {
    flex-wrap: wrap;
    gap: 8px;
    padding: 8px 16px;

    .log-title {
      order: 1;
      flex: 1 1 100%;
      justify-content: center;
      margin-bottom: 4px;
    }

    .log-actions {
      order: 2;
      margin-right: 0;

      .t-button {
        padding: 2px 8px;
        font-size: 11px;
      }
    }

    .mac-controls {
      order: 3;
    }
  }

  .console-content {
    font-size: 12px;
  }

  .log-entries .log-entry {
    .log-timestamp {
      width: 60px;
      font-size: 10px;
    }
  }
}
</style>
