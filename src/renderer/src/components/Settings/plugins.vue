<template>
  <div class="page">
    <!-- <TitleBarControls title="插件管理" :show-back="true" class="header"></TitleBarControls> -->
    <div class="plugins-container">
      <div class="plugin-actions-hearder">
        <h2>插件管理</h2>

        <div class="plugin-actions" style="flex-direction: row">
          <t-button theme="primary" @click="plugTypeDialog = true">
            <template #icon><t-icon name="add" /></template> 添加插件
          </t-button>
          <t-dialog
            :visible="plugTypeDialog"
            :close-btn="true"
            confirm-btn="下一步"
            cancel-btn="取消"
            :on-confirm="showImportMethodDialog"
            :on-close="() => (plugTypeDialog = false)"
          >
            <template #header>请选择你的插件类别</template>
            <template #body>
              <p class="local-hint-container" style="margin-bottom: 15px">
                Tips: 如果插件提供者，有提供澜音插件格式，建议使用澜音格式插件导入奥
              </p>
              <t-radio-group v-model="type" variant="primary-filled" default-value="cr">
                <t-radio-button value="cr">澜音插件</t-radio-button>
                <t-radio-button value="lx">洛雪插件</t-radio-button>
              </t-radio-group>
            </template>
          </t-dialog>

          <!-- 导入方式选择对话框 -->
          <t-dialog
            :visible="importMethodDialog"
            :close-btn="true"
            confirm-btn="确定"
            cancel-btn="返回"
            :on-confirm="handleImport"
            :on-close="() => (importMethodDialog = false)"
            :on-cancel="backToTypeSelection"
          >
            <template #header>选择导入方式</template>
            <template #body>
              <div class="import-method-container">
                <t-radio-group
                  v-model="importMethod"
                  variant="primary-filled"
                  default-value="local"
                >
                  <t-radio-button value="local">本地导入</t-radio-button>
                  <t-radio-button value="online">在线导入</t-radio-button>
                </t-radio-group>

                <div v-if="importMethod === 'online'" class="online-input-container">
                  <t-input
                    v-model="onlineUrl"
                    placeholder="请输入插件下载地址"
                    size="large"
                    style="margin-top: 15px"
                  />
                  <p class="hint-text">支持 HTTP/HTTPS 链接，插件文件应为 .js 或 .zip 格式</p>
                </div>

                <div v-else class="local-hint-container">
                  Tips: 点击 "确定" 将从本地文件选择插件文件进行导入
                </div>
              </div>
            </template>
          </t-dialog>
          <t-button theme="default" @click="refreshPlugins">
            <template #icon><t-icon name="refresh" /></template> 刷新
          </t-button>
        </div>
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
const importMethodDialog = ref(false)
const type = ref<'lx' | 'cr'>('cr')
const importMethod = ref<'local' | 'online'>('local')
const onlineUrl = ref('')

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

// 显示导入方式选择对话框
function showImportMethodDialog() {
  plugTypeDialog.value = false
  importMethodDialog.value = true
}

// 返回到插件类型选择
function backToTypeSelection() {
  importMethodDialog.value = false
  plugTypeDialog.value = true
  onlineUrl.value = '' // 清空在线地址
}

// 处理导入操作
async function handleImport() {
  try {
    importMethodDialog.value = false
    let result: ApiResult

    if (importMethod.value === 'local') {
      // 本地导入：调用文件选择API
      result = (await window.api.plugins.selectAndAddPlugin(type.value)) as ApiResult
    } else {
      // 在线导入：调用在线下载API
      if (!onlineUrl.value.trim()) {
        MessagePlugin.warning('请输入插件下载地址')
        importMethodDialog.value = true
        return
      }

      // 验证URL格式
      try {
        new URL(onlineUrl.value)
      } catch {
        MessagePlugin.warning('请输入有效的URL地址')
        importMethodDialog.value = true
        return
      }

      result = (await window.api.plugins.downloadAndAddPlugin(
        onlineUrl.value,
        type.value
      )) as ApiResult
    }

    // 检查用户是否取消了操作
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

    // 重置状态
    onlineUrl.value = ''
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
  // height: 100%;
  // max-height: 100vh;
  background: var(--plugins-bg);
  color: var(--plugins-text-primary);
  overflow: hidden;

  h2 {
    font-weight: 600;
    color: var(--plugins-text-primary);
    margin: 0 0 16px 0;
  }
}

.header {
  -webkit-app-region: drag;
  display: flex;
  align-items: center;
  background-color: var(--plugins-header-bg);
  padding: 1.5rem;
  position: sticky;
  z-index: 1000;
  top: 0;
  left: 0;
  right: 0;
  border-bottom: 1px solid var(--plugins-border);
  flex-shrink: 0;
}

.plugins-container {
  flex: 1;
  padding: 24px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
  background: var(--plugins-bg);
}

.plugin-actions-hearder {
  margin-bottom: 24px;
  flex-shrink: 0;

  h2 {
    margin-bottom: 16px;
    font-size: 24px;
    font-weight: 600;
    color: var(--plugins-text-primary);
  }
}

.plugin-actions {
  display: flex;

  gap: 12px;
  margin-top: 16px;
}

.loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  background: var(--plugins-container-bg);
  border-radius: 12px;
  margin: 20px 0;
}

.spinner {
  width: 32px;
  height: 32px;
  border: 3px solid var(--plugins-border);
  border-radius: 50%;
  border-top-color: var(--plugins-loading-spinner);
  animation: spin 1s ease-in-out infinite;
  margin-bottom: 16px;
}

.loading span {
  color: var(--plugins-text-secondary);
  font-size: 14px;
}

.error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 60px 0;
  color: var(--plugins-text-secondary);
  background: var(--plugins-container-bg);
  border-radius: 12px;
  margin: 20px 0;
}

.error-state p {
  color: var(--plugins-text-primary);
  font-size: 16px;
  margin: 8px 0;
}

.error-message {
  color: var(--plugins-error-color);
  margin-bottom: 20px;
  text-align: center;
  max-width: 80%;
  font-size: 14px;
  line-height: 1.5;
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
  padding: 60px 0;
  color: var(--plugins-text-secondary);
  background: var(--plugins-container-bg);
  border-radius: 12px;
  margin: 20px 0;
}

.empty-state p {
  color: var(--plugins-text-primary);
  font-size: 16px;
  margin: 8px 0;
}

.hint {
  font-size: 14px;
  color: var(--plugins-text-muted);
  line-height: 1.5;
}

.plugin-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
  flex: 1;
  // overflow-y: auto;
  // overflow-x: hidden;
  min-height: 0;
  max-height: 100%;

  /* 自定义滚动条 */
  &::-webkit-scrollbar {
    width: 6px;
  }

  &::-webkit-scrollbar-track {
    background: var(--plugins-bg);
    border-radius: 3px;
  }

  &::-webkit-scrollbar-thumb {
    background: var(--plugins-border);
    border-radius: 3px;

    &:hover {
      background: var(--plugins-text-muted);
    }
  }
}

.plugin-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 20px;
  border-radius: 12px;
  background-color: var(--plugins-card-bg);
  box-shadow: var(--plugins-card-shadow);
  transition: all 0.3s ease;
  border: 2px solid transparent;
  position: relative;

  // &:hover {
  //   box-shadow: var(--plugins-card-shadow-hover);
  //   transform: translateY(-2px);
  // }
}

.plugin-item.selected {
  background-color: var(--plugins-card-selected-bg);
  border: 2px solid var(--plugins-card-selected-border);

  // &::before {
  //   content: '';
  //   position: absolute;
  //   top: 0;
  //   left: 0;
  //   right: 0;
  //   height: 3px;
  //   background: linear-gradient(90deg, var(--plugins-card-selected-border), var(--td-brand-color));
  //   border-radius: 12px 12px 0 0;
  // }
}

.plugin-info {
  flex: 1;
  margin-right: 20px;
}

.plugin-info h3 {
  margin: 0 0 8px 0;
  font-size: 18px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 12px;
  color: var(--plugins-text-primary);
  line-height: 1.4;
}

.version {
  font-size: 12px;
  color: var(--plugins-text-muted);
  font-weight: 500;
  background: var(--plugins-border);
  padding: 2px 8px;
  border-radius: 6px;
}

.current-tag {
  background: linear-gradient(135deg, var(--td-brand-color-5), var(--td-brand-color-6));
  color: white;
  padding: 4px 12px;
  border-radius: 16px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 2px 4px rgba(0, 167, 77, 0.2);
}

.author {
  margin: 0 0 8px 0;
  font-size: 14px;
  color: var(--plugins-text-secondary);
}

.description {
  margin: 0 0 12px 0;
  font-size: 14px;
  color: var(--plugins-text-secondary);
  line-height: 1.5;
  max-width: 500px;
}

.plugin-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  margin-top: 8px;
}

.source-label {
  font-size: 13px;
  color: var(--plugins-text-muted);
  font-weight: 500;
}

.source-tag {
  background: linear-gradient(135deg, var(--td-brand-color-4), var(--td-brand-color-5));
  color: white;
  padding: 4px 10px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 500;
  box-shadow: 0 1px 3px rgba(0, 167, 77, 0.2);
}

.plugin-actions {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 120px;
}

/* 日志弹窗样式 */
:deep(.log-dialog) {
  height: 80vh;

  .t-dialog {
    background: var(--plugins-console-bg);
    border-radius: 12px;
    box-shadow: var(--plugins-dialog-shadow, 0 20px 60px rgba(0, 0, 0, 0.4));
    overflow: hidden;
    border: 1px solid var(--plugins-console-border);
  }

  .t-dialog__header {
    background: var(--plugins-console-header-bg);
    border-bottom: 1px solid var(--plugins-console-border);
    padding: 0;
    border-radius: 12px 12px 0 0;
    overflow: hidden;
  }

  .t-dialog__body {
    padding: 0;
    background: var(--plugins-console-bg);
    border-left: 2px solid var(--plugins-console-border);
    border-right: 2px solid var(--plugins-console-border);
    border-bottom: 2px solid var(--plugins-console-border);
    border-radius: 0 0 12px 12px;
    overflow: hidden;
  }
}

.log-dialog-header {
  display: flex;
  align-items: center;
  padding: 12px 20px;
  background: var(
    --plugins-dialog-header-bg,
    linear-gradient(135deg, var(--plugins-console-header-bg) 0%, var(--plugins-console-bg) 100%)
  );
  min-height: 48px;
  width: 100%;

  .log-title {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--plugins-console-text);
    font-weight: 600;
    font-size: 14px;
    flex: 1;

    .iconfont {
      font-size: 16px;
      color: var(--plugins-console-prompt);
    }
  }

  .log-actions {
    display: flex;
    gap: 8px;
    margin-right: 12px;

    :deep(.t-button) {
      background: rgba(255, 255, 255, 0.1);
      border: 1px solid var(--plugins-console-border);
      color: var(--plugins-console-text);
      font-size: 12px;
      padding: 4px 12px;
      height: auto;

      &:hover {
        background: rgba(255, 255, 255, 0.2) !important;
        border-color: var(--plugins-console-prompt);
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
        background: var(--plugins-mac-close);

        &:hover {
          background: #ff3b30;
        }
      }

      &.minimize {
        background: var(--plugins-mac-minimize);

        &:hover {
          background: #ff9500;
        }
      }

      &.maximize {
        background: var(--plugins-mac-maximize);

        &:hover {
          background: #30d158;
        }
      }
    }
  }
}

.console-container {
  background: var(--plugins-console-bg);
  color: var(--plugins-console-text);
  font-family: 'SF Mono', 'Monaco', 'Inconsolata', 'Fira Code', 'Consolas', monospace;
  font-size: 13px;
  line-height: 1.4;
  height: calc(80vh - 64px - 48px);
  min-height: 300px;
  display: flex;
  flex-direction: column;
}

.console-header {
  background: var(--plugins-console-header-bg);
  border-bottom: 1px solid var(--plugins-console-border);
  padding: 8px 16px;
  flex-shrink: 0;

  .console-info {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 12px;

    .console-prompt {
      color: var(--plugins-console-prompt);
      font-weight: bold;
    }

    .console-path {
      color: var(--plugins-console-path);
    }

    .console-time {
      color: var(--plugins-console-time);
      margin-left: auto;
    }
  }
}

.console-content {
  flex: 1;
  overflow-y: auto;
  scrollbar-color: var(--plugins-console-scrollbar-thumb) var(--plugins-console-scrollbar-track);
  padding: 16px;
  background: var(--plugins-console-bg);
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
    background: var(--plugins-console-scrollbar-track);
  }

  &::-webkit-scrollbar-thumb {
    background: var(--plugins-console-scrollbar-thumb);
    border-radius: 4px;

    &:hover {
      background: var(--plugins-console-scrollbar-thumb-hover);
    }
  }
}

.console-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 12px;
  color: var(--plugins-console-path);

  .loading-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--plugins-console-border);
    border-top: 2px solid var(--plugins-console-prompt);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }
}

.console-error {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--plugins-log-error);
  padding: 12px;
  background: rgba(255, 107, 107, 0.1);
  border-radius: 6px;
  border-left: 4px solid var(--plugins-log-error);

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
  color: var(--plugins-console-path);
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
      color: var(--plugins-console-time);
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
        color: var(--plugins-log-error);
      }

      .log-timestamp {
        color: var(--plugins-log-error);
      }
    }

    &.log-warn {
      .log-content {
        color: var(--plugins-log-warn);
      }

      .log-timestamp {
        color: var(--plugins-log-warn);
      }
    }

    &.log-info {
      .log-content {
        color: var(--plugins-log-info);
      }

      .log-timestamp {
        color: var(--plugins-log-info);
      }
    }

    &.log-debug {
      .log-content {
        color: var(--plugins-log-debug);
      }

      .log-timestamp {
        color: var(--plugins-log-debug);
      }
    }

    &.log-default {
      .log-content {
        color: var(--plugins-console-text);
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

/* 导入方式选择样式 */
.import-method-container {
  padding: 16px 0;
}

.online-input-container {
  margin-top: 16px;
}

.hint-text {
  font-size: 13px;
  color: var(--plugins-text-muted);
  margin-top: 8px;
  line-height: 1.5;
}

.local-hint-container {
  margin-top: 16px;
  padding: 12px;
  background: var(--plugins-border);
  border-radius: 8px;
}

/* 响应式设计 */
@media (max-width: 768px) {
  .plugins-container {
    padding: 16px;
  }

  .plugin-item {
    flex-direction: column;
    align-items: stretch;
    gap: 16px;

    .plugin-info {
      margin-right: 0;
    }

    .plugin-actions {
      flex-direction: row;
      justify-content: flex-end;
      min-width: auto;
    }
  }

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
