<template>
  <div class="page">
    <!-- <TitleBarControls title="插件管理" :show-back="true" class="header"></TitleBarControls> -->
    <div class="plugins-container">
      <div class="plugin-actions-hearder">
        <div class="plugins-title-row">
          <div>
            <slot name="navigation"><h2>插件管理</h2></slot>
            <p class="plugins-subtitle">已安装 {{ listedPlugins.length }} 个插件</p>
          </div>
          <t-button theme="primary" @click="openInstallDialog">
            <template #icon><t-icon name="add" /></template> 添加插件
          </t-button>
        </div>

        <div class="plugin-toolbar">
          <t-input
            v-model="pluginSearch"
            clearable
            placeholder="搜索插件名称、作者或平台"
            class="plugin-search"
          >
            <template #prefix-icon><t-icon name="search" /></template>
          </t-input>
          <t-radio-group v-model="pluginFilter" variant="default-filled" size="small">
            <t-radio-button value="all">全部 {{ listedPlugins.length }}</t-radio-button>
            <t-radio-button value="enabled">运行中 {{ enabledPluginCount }}</t-radio-button>
            <t-radio-button value="disabled">未使用 {{ disabledPluginCount }}</t-radio-button>
          </t-radio-group>
          <t-button theme="default" variant="outline" :loading="loading" @click="refreshPlugins">
            <template #icon><t-icon name="refresh" /></template> 刷新
          </t-button>
        </div>

        <div class="plugin-import-dialog-anchor">
          <!-- 导入方式选择对话框 -->
          <t-dialog
            :visible="importMethodDialog"
            :close-btn="true"
            attach="body"
            confirm-btn="确定"
            cancel-btn="返回"
            :on-confirm="handleImport"
            :on-close="() => (importMethodDialog = false)"
            :on-cancel="backToTypeSelection"
          >
            <template #header>添加插件</template>
            <template #body>
              <div class="import-method-container">
                <div v-if="guestAdapters.length" class="guest-format-picker">
                  <label>插件格式</label>
                  <t-select v-model="importFormat" :options="importFormats" />
                </div>
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
                  <p class="hint-text">支持 HTTP/HTTPS 链接，插件文件为单个 .js 文件</p>
                </div>

                <div v-else class="local-hint-container">点击“确定”选择要导入的插件文件</div>
              </div>
            </template>
          </t-dialog>
        </div>
      </div>

      <div v-if="loading && !plugins.length" class="loading">
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

      <div v-else-if="listedPlugins.length === 0" class="empty-state">
        <t-icon name="app" style="font-size: 48px" />
        <p>暂无已安装的插件</p>
        <p class="hint">点击"添加插件"按钮来安装新插件</p>
      </div>

      <div v-else-if="filteredPlugins.length === 0" class="empty-state filtered-empty">
        <t-icon name="search-error" style="font-size: 40px" />
        <p>没有匹配的插件</p>
        <t-button theme="default" variant="outline" @click="clearPluginFilters()"
          >清除筛选</t-button
        >
      </div>

      <div v-else ref="listViewport" class="plugin-list" @scroll="rememberListScroll">
        <div
          v-for="plugin in filteredPlugins"
          :key="plugin.pluginId"
          class="plugin-item"
          :class="{ selected: plugin.enabled }"
        >
          <div
            class="plugin-mark"
            :class="{
              active: plugin.enabled,
              'is-adapter': plugin.manifest?.contributes?.guestAdapters?.length
            }"
            aria-hidden="true"
          >
            <svg
              v-if="!plugin.manifest?.contributes?.guestAdapters?.length"
              class="plugin-record"
              viewBox="0 0 80 80"
              fill="none"
            >
              <circle cx="40" cy="40" r="31" fill="currentColor" />
              <g stroke="white" stroke-opacity=".2">
                <circle cx="40" cy="40" r="26" />
                <circle cx="40" cy="40" r="22" />
                <circle cx="40" cy="40" r="18" />
                <path
                  d="M18 27a26 26 0 0 1 18-13M62 53a26 26 0 0 1-18 13"
                  stroke-width="2"
                  stroke-linecap="round"
                />
              </g>
              <circle cx="40" cy="40" r="11" fill="var(--td-brand-color, #ff527c)" />
              <circle cx="40" cy="40" r="3" fill="white" />
            </svg>
            <t-icon v-else name="extension" size="36px" />
          </div>
          <div class="plugin-info">
            <div class="plugin-heading">
              <span
                class="format-badge"
                :class="{ 'native-format': !plugin.guest }"
                :style="
                  plugin.formatBadge
                    ? {
                        backgroundColor: plugin.formatBadge.backgroundColor,
                        color: plugin.formatBadge.textColor
                      }
                    : undefined
                "
                >{{ plugin.formatBadge?.label || '澜音' }}</span
              >
              <h3>{{ plugin.pluginInfo.name }}</h3>
              <span class="version">{{ plugin.pluginInfo.version }}</span>
            </div>
            <p v-if="plugin.pluginInfo.description" class="description">
              {{ plugin.pluginInfo.description }}
            </p>
            <div class="plugin-details">
              <span class="author">{{ plugin.pluginInfo.author || '未署名作者' }}</span>
              <span v-if="plugin.parentPluginName" class="plugin-dependency"
                >依赖 {{ plugin.parentPluginName }}</span
              >
              <span v-if="isServicePlugin(plugin)">服务插件</span>
            </div>
            <div
              v-if="plugin.supportedSources && Object.keys(plugin.supportedSources).length > 0"
              class="plugin-sources"
            >
              <span v-for="source in plugin.supportedSources" :key="source.name" class="source-tag">
                {{ source.name }}
              </span>
            </div>
            <div v-if="plugin.loadError" class="plugin-load-error">
              <t-icon name="error-circle" /> {{ plugin.loadError }}
            </div>
          </div>
          <div class="plugin-actions">
            <t-button
              class="plugin-use-button"
              :theme="plugin.enabled ? 'default' : 'primary'"
              :variant="plugin.enabled ? 'outline' : 'base'"
              :loading="busyPluginId === plugin.pluginId"
              :disabled="Boolean(busyPluginId) && busyPluginId !== plugin.pluginId"
              @click="plugin.enabled ? closePlugin(plugin) : selectPlugin(plugin)"
              >{{ plugin.enabled ? '关闭' : '使用' }}</t-button
            >
            <t-button
              theme="default"
              variant="text"
              @click="
                plugin.guest
                  ? openGuestPermissions(plugin.parentPluginId!, plugin.guest)
                  : openPermissionsDialog(plugin)
              "
              >权限</t-button
            >
            <t-button
              v-if="plugin.enabled && getPluginConfiguration(plugin)"
              theme="default"
              variant="text"
              :title="getPluginConfiguration(plugin)?.title"
              @click="openPluginConfiguration(plugin)"
            >
              <template #icon><t-icon name="setting" /></template> 配置
            </t-button>
            <t-button
              v-if="plugin.enabled && isServicePlugin(plugin)"
              theme="primary"
              size="small"
              @click.stop="openImportDialog(plugin)"
            >
              <template #icon><t-icon name="download" /></template> 导入歌单
            </t-button>
            <t-dropdown trigger="click">
              <t-button theme="default" variant="text" shape="square" aria-label="更多插件操作">
                <template #icon><t-icon name="ellipsis" /></template>
              </t-button>
              <t-dropdown-menu>
                <t-dropdown-item
                  @click="
                    viewPluginLogs(plugin.parentPluginId || plugin.pluginId, plugin.pluginInfo.name)
                  "
                  >查看日志</t-dropdown-item
                >
                <t-dropdown-item
                  v-for="page in plugin.enabled
                    ? plugin.manifest?.contributes?.settingsPages || []
                    : []"
                  :key="page.id"
                  @click="openPluginSettings(plugin.pluginId, page.view)"
                  >{{ page.title }}</t-dropdown-item
                >
                <t-dropdown-item
                  v-if="plugin.enabled && isServicePlugin(plugin)"
                  @click="openConfigDialog(plugin)"
                  >插件配置</t-dropdown-item
                >
                <t-dropdown-item
                  theme="error"
                  @click="
                    plugin.guest
                      ? removeGuest(plugin.parentPluginId!, plugin.guest)
                      : uninstallPlugin(plugin.pluginId, plugin.pluginInfo.name)
                  "
                  >卸载插件</t-dropdown-item
                >
              </t-dropdown-menu>
            </t-dropdown>
          </div>
        </div>
      </div>

      <!-- 插件日志弹窗 -->
      <t-dialog
        v-model:visible="logDialogVisible"
        top="10vh"
        :close-btn="false"
        :footer="false"
        attach="body"
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
              <t-button
                size="small"
                variant="outline"
                theme="primary"
                ghost
                :disabled="logsLoading || logs.length === 0"
                @click.stop="exportLogs"
              >
                导出
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
                  v-for="entry in visibleLogs"
                  :key="entry.key"
                  class="log-entry"
                  :class="[
                    logLevelClass(entry.level),
                    {
                      'log-entry-group': entry.isGroup,
                      'log-entry-collapsed': entry.isGroup && collapsedGroups.has(entry.key)
                    }
                  ]"
                  :style="{ paddingLeft: entry.depth * 16 + 'px' }"
                  @click="entry.isGroup && toggleGroup(entry.key)"
                >
                  <span class="log-timestamp">{{ formatLogTime(entry.t) }}</span>
                  <span v-if="entry.isGroup" class="log-group-caret">
                    {{ collapsedGroups.has(entry.key) ? '▶' : '▼' }}
                  </span>
                  <span class="log-content">{{ entry.message }}</span>
                </div>
              </div>
            </div>
          </div>
        </template>
      </t-dialog>

      <!-- 服务插件配置对话框 -->
      <t-dialog
        v-model:visible="configDialogVisible"
        :close-btn="true"
        attach="body"
        width="500px"
        :on-confirm="savePluginConfig"
        confirm-btn="保存"
        cancel-btn="取消"
      >
        <template #header>{{ configPluginName }} - 配置</template>
        <template #body>
          <div class="config-form">
            <div v-for="field in configSchema" :key="field.key" class="config-field">
              <label class="config-label">
                {{ field.label }}
                <span v-if="field.required" class="required-mark">*</span>
              </label>
              <t-input
                v-if="field.type === 'text'"
                v-model="configValues[field.key]"
                :placeholder="field.placeholder || ''"
                size="medium"
              />
              <t-input
                v-else-if="field.type === 'password'"
                v-model="configValues[field.key]"
                type="password"
                :placeholder="field.placeholder || ''"
                size="medium"
              />
              <t-input-number
                v-else-if="field.type === 'number'"
                v-model="configValues[field.key]"
                :placeholder="field.placeholder || ''"
                size="medium"
                style="width: 100%"
              />
              <t-select
                v-else-if="field.type === 'select'"
                v-model="configValues[field.key]"
                :placeholder="field.placeholder || '请选择'"
                size="medium"
              >
                <t-option
                  v-for="opt in field.options"
                  :key="opt.value"
                  :value="opt.value"
                  :label="opt.label"
                />
              </t-select>
            </div>

            <div class="config-test">
              <t-button
                theme="default"
                size="small"
                :loading="configTesting"
                @click="testPluginConnection"
              >
                测试连接
              </t-button>
              <span
                v-if="configTestResult"
                class="test-result"
                :class="{ success: configTestResult.success, fail: !configTestResult.success }"
              >
                {{ configTestResult.message }}
              </span>
            </div>
          </div>
        </template>
      </t-dialog>

      <t-dialog
        v-model:visible="permissionsDialogVisible"
        :close-btn="true"
        attach="body"
        width="560px"
        :on-confirm="savePluginPermissionGrants"
        confirm-btn="保存授权"
        cancel-btn="取消"
      >
        <template #header>{{ permissionsPluginName }} - 权限管理</template>
        <template #body>
          <div v-if="permissionGroups.length" class="permission-list">
            <div v-for="group in permissionGroups" :key="group.id" class="permission-item">
              <div class="permission-copy">
                <span class="permission-title">{{ group.title }}</span>
                <p class="permission-reason">{{ group.description }}</p>
              </div>
              <t-switch
                :value="group.keys.every((key) => permissionSelection.includes(key))"
                @change="(value) => togglePermissionGroup(group.keys, Boolean(value))"
              />
            </div>
          </div>
          <t-empty v-else description="该插件没有声明权限" />
        </template>
      </t-dialog>

      <!-- 导入歌单 -->
      <ImportPlaylist
        v-model:visible="importDialogVisible"
        :plugin-id="importPluginId"
        :plugin-name="importPluginName"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onActivated, onDeactivated, nextTick, toRaw, computed } from 'vue'
import { PERMISSION_GROUPS, permissionGroup } from '@shiqianjiang/ceru-plugin-sdk/permissions'
import { pluginContributions } from '@renderer/services/pluginState'
import { refreshPluginContributions } from '@renderer/services/pluginState'
import type { GuestInfo } from '@shiqianjiang/ceru-plugin-sdk'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import ImportPlaylist from '@renderer/components/ServicePlugin/ImportPlaylist.vue'

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

interface PluginConfigField {
  key: string
  label: string
  type: 'text' | 'password' | 'number' | 'select'
  required?: boolean
  default?: any
  placeholder?: string
  options?: { label: string; value: any }[]
}

interface Plugin {
  manifest?: import('@shiqianjiang/ceru-plugin-sdk').PluginManifest
  pluginId: string
  pluginName: string
  pluginInfo: PluginInfo
  supportedSources: { [key: string]: PluginSource }
  pluginType?: 'music-source' | 'service'
  disabled?: boolean
  enabled?: boolean
  loadError?: string
  guest?: GuestInfo
  parentPluginId?: string
  parentPluginName?: string
  formatBadge?: { label: string; backgroundColor: string; textColor: string }
}

// 定义API返回结果的接口
interface ApiResult {
  error?: string
  pluginInfo?: PluginInfo
  [key: string]: any
}

const plugins = ref<Plugin[]>(
  pluginContributions.value.map(({ pluginId, manifest, enabled }) => ({
    enabled,
    pluginId,
    pluginName: manifest.name,
    pluginInfo: {
      name: manifest.name,
      version: manifest.version,
      author: manifest.author || '',
      description: manifest.description
    },
    manifest,
    supportedSources: Object.fromEntries(
      (manifest.contributes?.providers || []).map((provider: any) => [
        provider.id,
        { name: provider.name, qualitys: provider.qualities || [] }
      ])
    )
  }))
)
const loading = ref(!plugins.value.length)
const listViewport = ref<HTMLElement>()
let listScrollTop = 0
let listActive = true
function rememberListScroll() {
  if (listActive) listScrollTop = listViewport.value?.scrollTop ?? 0
}
onDeactivated(() => {
  listActive = false
})
onActivated(async () => {
  listActive = false
  await nextTick()
  if (listViewport.value) listViewport.value.scrollTop = listScrollTop
  listActive = true
})
const busyPluginId = ref('')
const pluginSearch = ref('')
const pluginFilter = ref<'all' | 'enabled' | 'disabled'>('all')
function clearPluginFilters() {
  pluginSearch.value = ''
  pluginFilter.value = 'all'
}
const enabledPluginCount = computed(
  () => listedPlugins.value.filter((plugin) => plugin.enabled).length
)
const disabledPluginCount = computed(() => listedPlugins.value.length - enabledPluginCount.value)
const filteredPlugins = computed(() => {
  const query = pluginSearch.value.trim().toLowerCase()
  return listedPlugins.value.filter((plugin) => {
    if (pluginFilter.value === 'enabled' && !plugin.enabled) return false
    if (pluginFilter.value === 'disabled' && plugin.enabled) return false
    if (!query) return true
    const text = [
      plugin.pluginInfo.name,
      plugin.pluginInfo.author,
      plugin.pluginInfo.description,
      ...Object.values(plugin.supportedSources || {}).map((source: any) => source.name)
    ]
      .join(' ')
      .toLowerCase()
    return text.includes(query)
  })
})
const error = ref<string | null>(null)
const importMethodDialog = ref(false)
const type = ref<'lx' | 'cr'>('cr')
const importFormat = ref('ceru')
const guestLists = ref<Record<string, GuestInfo[]>>({})
const listedPlugins = computed<Plugin[]>(() =>
  plugins.value.flatMap((parent) => [
    parent,
    ...(guestLists.value[parent.pluginId] || []).map((guest) => ({
      pluginId: `${parent.pluginId}:guest:${guest.id}`,
      pluginName: guest.name,
      pluginInfo: {
        name: guest.name,
        version: guest.version,
        author: guest.author || '',
        description: '提供歌曲播放地址，搜索、歌单和歌词由兼容环境提供。'
      },
      guest,
      parentPluginId: parent.pluginId,
      parentPluginName: parent.pluginInfo.name,
      formatBadge: guestFormatBadge(parent, guest),
      enabled: Boolean(parent.enabled && guest.selected && guest.state !== 'error'),
      loadError: guest.error,
      supportedSources: Object.fromEntries(
        guest.providers.map((provider) => [
          provider.id,
          {
            name: provider.name,
            type: 'music',
            qualitys: provider.qualities
          }
        ])
      )
    }))
  ])
)
function guestFormatBadge(plugin: Plugin, guest: GuestInfo) {
  const adapter = plugin.manifest?.contributes?.guestAdapters?.find(
    (item) => item.id === guest.adapterId
  )
  return (
    adapter?.badge ?? {
      label: adapter?.format || '子插件',
      backgroundColor: '#64748b',
      textColor: '#ffffff'
    }
  )
}
const guestAdapters = computed(() =>
  pluginContributions.value
    .filter((item) => item.enabled)
    .flatMap(({ pluginId, manifest }) =>
      (manifest.contributes?.guestAdapters || []).map((adapter: any) => ({
        pluginId,
        adapterId: adapter.id,
        label: adapter.title || adapter.format,
        value: pluginId + ':' + adapter.id
      }))
    )
)
const importFormats = computed(() => [
  { label: '澜音插件（v2）', value: 'ceru' },
  ...guestAdapters.value.map((item) => ({ label: item.label, value: item.value }))
])
const permissionsGuestId = ref<string | null>(null)
const importMethod = ref<'local' | 'online'>('local')
const onlineUrl = ref('')

// 日志相关状态
const logDialogVisible = ref(false)
const currentLogPluginId = ref('')
const currentLogPluginName = ref('')
/** 原始日志行（NDJSON 字符串或旧版纯文本）。 */
const logs = ref<string[]>([])
const logsLoading = ref(false)
const logsError = ref<string | null>(null)
const logContentRef = ref<HTMLElement | null>(null)

/** 后端写入的日志级别。 */
type PluginLogLevel = 'log' | 'info' | 'warn' | 'error' | 'debug' | 'group' | 'groupEnd'

/** 解析后的日志条目（前端渲染单元）。 */
interface ParsedLogEntry {
  /** epoch ms；旧格式行没有真实时间时为 null。 */
  t: number | null
  /** 真实级别。 */
  level: PluginLogLevel
  /** 消息文本。 */
  message: string
  /** group 嵌套深度（>=0）。groupEnd 自身不显示。 */
  depth: number
  /** 标记当前条目是否为分组头（可点击折叠）。 */
  isGroup: boolean
  /** 仅 group 项使用：对应 groupEnd 在原数组中的索引（用于跳过被折叠的条目）。 */
  groupEndIndex?: number
  /** 渲染稳定 key — 索引足以保证局部刷新。 */
  key: number
}

/** 已折叠的 group 头索引集合。 */
const collapsedGroups = ref<Set<number>>(new Set())

// 服务插件配置相关
const configDialogVisible = ref(false)
const configPluginId = ref('')
const configPluginName = ref('')
const configSchema = ref<PluginConfigField[]>([])
const configValues = ref<Record<string, any>>({})
const configSaving = ref(false)
const configTesting = ref(false)
const configTestResult = ref<{ success: boolean; message: string } | null>(null)
const permissionsDialogVisible = ref(false)
const permissionsPluginId = ref('')
const permissionsPluginName = ref('')
const permissionItems = ref<{ key: string; name?: string; reason?: string }[]>([])
const permissionSelection = ref<string[]>([])
const permissionGroups = computed(() => {
  const groups = new Map<
    string,
    { id: string; title: string; description: string; keys: string[] }
  >()
  for (const item of permissionItems.value) {
    const id = permissionGroup(item.name as any) || item.key
    const group = groups.get(id) || {
      id,
      title: PERMISSION_GROUPS[id]?.title || '插件扩展能力',
      description: '',
      keys: [] as string[]
    }
    group.keys.push(item.key)
    if (!group.description) group.description = item.reason || ''
    groups.set(id, group)
  }
  return [...groups.values()]
})
function togglePermissionGroup(keys: string[], allowed: boolean) {
  permissionSelection.value = allowed
    ? [...new Set([...permissionSelection.value, ...keys])]
    : permissionSelection.value.filter((key) => !keys.includes(key))
}

// 导入歌单相关
const importDialogVisible = ref(false)
const importPluginId = ref('')
const importPluginName = ref('')

// 获取store实例
const localUserStore = LocalUserDetailStore()
const openPluginSettings = (pluginId: string, view: string) =>
  window.api.plugins.openSurface(pluginId, view)

function getPluginConfiguration(plugin: Plugin): { title: string; view: string } | undefined {
  const manifest = plugin.manifest
  const configuration = (
    manifest?.contributes?.settingsPages?.[0] ??
    manifest?.contributes?.commands?.find((command: any) =>
      manifest.modules?.surfaces?.some(
        (surface: any) => surface.id === command.view
      )
    )
  )
  return configuration?.view ? { title: configuration.title, view: configuration.view } : undefined
}
function openPluginConfiguration(plugin: Plugin) {
  const configuration = getPluginConfiguration(plugin)
  if (configuration) return openPluginSettings(plugin.pluginId, configuration.view)
  return undefined
}

// 检查插件是否被选中
// 选择插件
function syncAfterPluginChange() {
  // Updating the inventory and routing is background work, not part of the
  // clicked button's runtime transition (another plugin may be awaiting permission).
  void getPlugins()
  void refreshPluginContributions(true).catch((error) => {
    console.warn('刷新插件贡献失败:', error)
    MessagePlugin.warning('插件状态已改变，部分界面刷新失败，请点击刷新重试')
  })
}

async function selectPlugin(plugin: Plugin) {
  if (plugin.guest) return useGuest(plugin.parentPluginId!, plugin.guest.id, plugin.pluginId)
  if (busyPluginId.value) return
  busyPluginId.value = plugin.pluginId
  try {
    const activation = await window.api.plugins.setActive(plugin.pluginId)
    if (activation?.error) throw new Error(activation.error)
    plugin.enabled = true
    plugin.disabled = false
    if (!localUserStore.initialization) localUserStore.init()
    localUserStore.userInfo.pluginId = plugin.pluginId
    localUserStore.userInfo.pluginName = plugin.pluginInfo.name
    // Using a plugin selects its implementation of each existing source, not a new source.
    const sources = (plugin.manifest?.contributes?.providers ?? []).map(provider => provider.id)
    await Promise.all(sources.map(source => window.api.plugins.setProviderOwner(source, plugin.pluginId)))
    localUserStore.userInfo.sourcePluginMap = {
      ...(localUserStore.userInfo.sourcePluginMap ?? {}),
      ...Object.fromEntries(sources.map(source => [source, plugin.pluginId]))
    }
    syncAfterPluginChange()
    MessagePlugin.success(`已使用 ${plugin.pluginInfo.name}`)
    if (activation?.viewError) MessagePlugin.warning(`插件已启用，配置页打开失败：${activation.viewError}`)
  } catch (error: any) {
    MessagePlugin.error(error.message || '启动插件失败')
  } finally {
    busyPluginId.value = ''
  }
}

// 获取已安装的插件列表
let inventoryRequest = 0
async function getPlugins() {
  const request = ++inventoryRequest
  loading.value = !plugins.value.length
  error.value = null

  try {
    const result = await window.api.plugins.loadAllPlugins()
    if (request !== inventoryRequest) return
    console.log(result)
    // 检查返回结果是否有错误
    if (result && typeof result === 'object' && 'error' in result) {
      console.error('获取插件列表失败:', result.error)
      error.value = `加载插件失败: ${result.error}`
      plugins.value = []
    } else if (Array.isArray(result)) {
      const records = await Promise.all(
        result.map(
          async (plugin: Plugin) =>
            [
              plugin.pluginId,
              plugin.manifest?.contributes?.guestAdapters?.length
                ? await window.api.plugins.guestList(plugin.pluginId)
                : []
            ] as const
        )
      )
      if (request !== inventoryRequest) return
      guestLists.value = Object.fromEntries(records)
      plugins.value = result
      console.log('插件列表加载完成', result)
    } else {
      // 处理意外的返回格式
      console.error('插件列表格式不正确:', result)
      plugins.value = []
      error.value = '插件数据格式不正确'
    }
  } catch (err: any) {
    if (request !== inventoryRequest) return
    console.error('获取插件列表失败:', err)
    error.value = err?.message || '未知错误'
    plugins.value = []
  } finally {
    if (request === inventoryRequest) loading.value = false
  }
}

async function openPermissionsDialog(plugin: Plugin) {
  permissionsGuestId.value = null
  permissionsPluginId.value = plugin.pluginId
  permissionsPluginName.value = plugin.pluginInfo.name
  try {
    const [manifestResult, grantedResult] = await Promise.all([
      window.api.plugins.getManifest(plugin.pluginId),
      window.api.plugins.getPermissions(plugin.pluginId)
    ])
    permissionItems.value = manifestResult?.data?.permissions || []
    permissionSelection.value = grantedResult?.data || []
    permissionsDialogVisible.value = true
  } catch (err: any) {
    MessagePlugin.error(`读取插件权限失败: ${err.message || '未知错误'}`)
  }
}

async function useGuest(pluginId: string, guestId: string | null, rowId: string) {
  if (busyPluginId.value) return
  busyPluginId.value = rowId
  try {
    await window.api.plugins.guestSelect(pluginId, guestId)
    if (guestId) localUserStore.userInfo.pluginId = pluginId
    for (const guest of guestLists.value[pluginId] ?? []) guest.selected = guest.id === guestId
    if (guestId) {
      const parent = plugins.value.find((item) => item.pluginId === pluginId)
      if (parent) parent.enabled = true
    }
    syncAfterPluginChange()
    MessagePlugin.success(guestId ? '已使用插件' : '已关闭插件')
  } catch (error: any) {
    MessagePlugin.error(error.message || '切换失败')
  } finally {
    busyPluginId.value = ''
  }
}
async function openGuestPermissions(pluginId: string, guest: GuestInfo) {
  try {
    permissionsPluginId.value = pluginId
    permissionsGuestId.value = guest.id
    permissionsPluginName.value = guest.name
    permissionItems.value = [
      {
        key: 'network',
        name: 'network.request',
        reason: '允许此子插件请求在线音乐服务并解析播放地址'
      },
      {
        key: 'network.private',
        name: 'network.private',
        reason: '允许此子插件访问本机或局域网接口'
      }
    ]
    permissionSelection.value = await window.api.plugins.guestPermissions(pluginId, guest.id)
    permissionsDialogVisible.value = true
  } catch (error: any) {
    MessagePlugin.error(error.message || '读取权限失败')
  }
}
function removeGuest(pluginId: string, guest: GuestInfo) {
  const confirmation = DialogPlugin.confirm({
    header: '移除子插件',
    body: `确定移除“${guest.name}”及其授权记录吗？`,
    onConfirm: async () => {
      try {
        await window.api.plugins.guestRemove(pluginId, guest.id)
        confirmation.destroy()
        await getPlugins()
        await refreshPluginContributions(true)
        MessagePlugin.success('已移除')
      } catch (error: any) {
        MessagePlugin.error(error.message || '移除失败')
      }
    },
    onClose: () => confirmation.destroy(),
    onCancel: () => confirmation.destroy()
  })
}

async function savePluginPermissionGrants() {
  try {
    if (permissionsGuestId.value) {
      await window.api.plugins.guestSetPermissions(
        permissionsPluginId.value,
        permissionsGuestId.value,
        [...permissionSelection.value]
      )
      permissionsDialogVisible.value = false
      MessagePlugin.success('子插件权限已保存')
      await getPlugins()
      return
    }
    const result = await window.api.plugins.savePermissions(permissionsPluginId.value, [
      ...permissionSelection.value
    ])
    if (result?.error) throw new Error(result.error)
    permissionsDialogVisible.value = false
    MessagePlugin.success('插件权限已保存')
  } catch (err: any) {
    MessagePlugin.error(`保存插件权限失败: ${err.message || '未知错误'}`)
  }
}

// 显示导入方式选择对话框
function showImportMethodDialog() {
  if (!importFormats.value.some((item) => item.value === importFormat.value))
    importFormat.value = 'ceru'
  importMethodDialog.value = true
}

function openInstallDialog() {
  showImportMethodDialog()
}

async function closePlugin(plugin: Plugin) {
  if (plugin.guest) return useGuest(plugin.parentPluginId!, null, plugin.pluginId)
  if (busyPluginId.value) return
  busyPluginId.value = plugin.pluginId
  try {
    const result = await window.api.plugins.setEnabled(plugin.pluginId, false)
    if (result?.error) throw new Error(result.error)
    plugin.enabled = false
    plugin.disabled = true
    if (localUserStore.userInfo.pluginId === plugin.pluginId) localUserStore.userInfo.pluginId = ''
    syncAfterPluginChange()
    MessagePlugin.success(`已关闭 ${plugin.pluginInfo.name}`)
  } catch (error: any) {
    MessagePlugin.error(error.message || '关闭插件失败')
  } finally {
    busyPluginId.value = ''
  }
}

// 返回到插件类型选择
function backToTypeSelection() {
  importMethodDialog.value = false
  onlineUrl.value = '' // 清空在线地址
}

// 处理导入操作
async function handleImport() {
  try {
    importMethodDialog.value = false
    let result: ApiResult
    if (importFormat.value !== 'ceru') {
      const adapter = guestAdapters.value.find((item) => item.value === importFormat.value)
      if (!adapter) throw new Error('请先安装对应的兼容环境')
      if (importMethod.value === 'online' && !onlineUrl.value.trim())
        throw new Error('请输入插件下载地址')
      const guest = await window.api.plugins.guestImport(
        adapter.pluginId,
        adapter.adapterId,
        importMethod.value === 'online' ? onlineUrl.value.trim() : undefined
      )
      if (guest) {
        await getPlugins()
        await refreshPluginContributions(true)
        MessagePlugin.success(`已导入 ${guest.name}`)
      }
      onlineUrl.value = ''
      return
    }

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
        MessagePlugin.success(`插件 "${result.pluginInfo.name}" 安装成功，请在列表中点击使用`)
      } else {
        MessagePlugin.success('插件安装成功，请在列表中点击使用')
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
            localUserStore.userInfo.pluginName = ''
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
    if (result && Array.isArray(result)) {
      logs.value = result
      // 换插件/刷新时清掉旧的折叠状态，避免索引串扰
      collapsedGroups.value = new Set()
      // 滚动到底部显示最新日志
      await nextTick()
      setTimeout(() => {
        if (logContentRef.value) {
          logContentRef.value.scrollTop = logContentRef.value.scrollHeight
        }
      }, 100)
    } else {
      logs.value = []
      collapsedGroups.value = new Set()
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

// 导出日志为可读 .log 文本
function exportLogs() {
  try {
    if (logs.value.length === 0) {
      MessagePlugin.warning('没有可导出的日志')
      return
    }

    // 以解析后的结构化条目为准，生成人可读的纯文本
    // 格式：[YYYY-MM-DD HH:mm:ss.SSS] [LEVEL] <缩进>message
    const lines = parsedLogs.value.map((entry) => {
      const ts = entry.t
        ? new Date(entry.t).toISOString().replace('T', ' ').replace('Z', '')
        : '----------  --:--:--.---'
      const lvl = entry.level.toUpperCase().padEnd(8, ' ')
      const indent = '  '.repeat(entry.depth)
      const prefix = entry.isGroup ? '▼ ' : ''
      return `[${ts}] [${lvl}] ${indent}${prefix}${entry.message}`
    })

    const header =
      `# Ceru Music Plugin Log\n` +
      `# Plugin: ${currentLogPluginName.value} (${currentLogPluginId.value})\n` +
      `# Exported: ${new Date().toISOString()}\n` +
      `# Entries: ${parsedLogs.value.length}\n` +
      `# ----------------------------------------\n`
    const content = header + lines.join('\n') + '\n'

    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)

    const safeName = (currentLogPluginName.value || currentLogPluginId.value || 'plugin')
      .replace(/[\\/:*?"<>|]/g, '_')
      .slice(0, 60)
    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const filename = `${safeName}_${stamp}.log`

    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)

    MessagePlugin.success(`已导出 ${parsedLogs.value.length} 条日志`)
  } catch (err: any) {
    console.error('导出日志失败:', err)
    MessagePlugin.error(`导出日志失败: ${err.message || '未知错误'}`)
  }
}

// ==================== 服务插件方法 ====================

// 打开配置对话框
async function openConfigDialog(plugin: Plugin) {
  configPluginId.value = plugin.pluginId
  configPluginName.value = plugin.pluginInfo.name
  configTestResult.value = null

  try {
    // 获取配置 schema
    const schemaRes = await window.api.plugins.getConfigSchema(plugin.pluginId)
    configSchema.value = schemaRes?.data || []

    // 获取已保存的配置
    const configRes = await window.api.plugins.getConfig(plugin.pluginId)
    const savedConfig = configRes?.data || {}

    // 用 schema 默认值填充
    const values: Record<string, any> = {}
    for (const field of configSchema.value) {
      values[field.key] = savedConfig[field.key] ?? field.default ?? ''
    }
    configValues.value = values

    configDialogVisible.value = true
  } catch (err: any) {
    MessagePlugin.error(`获取插件配置失败: ${err.message}`)
  }
}

// 保存配置
async function savePluginConfig() {
  configSaving.value = true
  try {
    // 验证必填字段
    for (const field of configSchema.value) {
      if (field.required && !configValues.value[field.key]) {
        MessagePlugin.warning(`请填写 ${field.label}`)
        configSaving.value = false
        return
      }
    }

    // toRaw + JSON round-trip 去除 Vue Proxy，避免 IPC structuredClone 报错
    const plainConfig = JSON.parse(JSON.stringify(toRaw(configValues.value)))
    await window.api.plugins.saveConfig(configPluginId.value, plainConfig)
    MessagePlugin.success('配置已保存')
    configDialogVisible.value = false
  } catch (err: any) {
    MessagePlugin.error(`保存配置失败: ${err.message}`)
  } finally {
    configSaving.value = false
  }
}

// 测试连接
async function testPluginConnection() {
  configTesting.value = true
  configTestResult.value = null

  try {
    // 先保存当前配置
    const plainConfig = JSON.parse(JSON.stringify(toRaw(configValues.value)))
    await window.api.plugins.saveConfig(configPluginId.value, plainConfig)

    const result = await window.api.plugins.testConnection(configPluginId.value)
    configTestResult.value = result
    if (result?.success) {
      MessagePlugin.success(result.message || '连接成功')
    } else {
      MessagePlugin.error(result?.message || '连接失败')
    }
  } catch (err: any) {
    configTestResult.value = { success: false, message: err.message }
    MessagePlugin.error(`测试连接失败: ${err.message}`)
  } finally {
    configTesting.value = false
  }
}

// 打开导入歌单
function openImportDialog(plugin: Plugin) {
  importPluginId.value = plugin.pluginId
  importPluginName.value = plugin.pluginInfo.name
  importDialogVisible.value = true
}

// 检查插件是否是服务插件
function isServicePlugin(plugin: Plugin): boolean {
  return plugin.pluginType === 'service'
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

// 格式化日志时间（基于真实时间戳；旧格式行没时间戳时返回 '--:--:--'）
function formatLogTime(ts: number | null): string {
  if (ts == null) return '--:--:--'
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return '--:--:--'
  return d.toLocaleTimeString('zh-CN', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
}

/**
 * 解析单行日志。
 *   - 优先按 NDJSON 解析（{t,l,m}）
 *   - 兼容旧格式 "level message"（level ∈ log/info/warn/error/start/end）
 *   - 都不匹配时整行作为 log 级别消息
 */
function parseLogLine(raw: string): { t: number | null; level: PluginLogLevel; message: string } {
  const trimmed = raw.trimStart()
  if (trimmed.startsWith('{')) {
    try {
      const obj = JSON.parse(trimmed)
      if (obj && typeof obj === 'object' && typeof obj.l === 'string') {
        const lvl = obj.l as PluginLogLevel
        const validLevels: PluginLogLevel[] = [
          'log',
          'info',
          'warn',
          'error',
          'debug',
          'group',
          'groupEnd'
        ]
        if (validLevels.includes(lvl)) {
          return {
            t: typeof obj.t === 'number' ? obj.t : null,
            level: lvl,
            message: typeof obj.m === 'string' ? obj.m : ''
          }
        }
      }
    } catch {
      /* 不是合法 JSON，继续走 fallback */
    }
  }
  // 旧格式 fallback：以第一个空格切分
  const spaceIdx = raw.indexOf(' ')
  if (spaceIdx > 0) {
    const head = raw.slice(0, spaceIdx)
    const rest = raw.slice(spaceIdx + 1)
    switch (head) {
      case 'log':
      case 'info':
      case 'warn':
      case 'error':
      case 'debug':
        return { t: null, level: head, message: rest }
      case 'start':
        return { t: null, level: 'group', message: rest }
      case 'end':
        return { t: null, level: 'groupEnd', message: rest }
    }
  }
  return { t: null, level: 'log', message: raw }
}

/** 把原始行数组解析成带 depth / 折叠索引的渲染条目数组。 */
const parsedLogs = computed<ParsedLogEntry[]>(() => {
  const out: ParsedLogEntry[] = []
  // 用栈记录当前所处的 group 头索引，用于配对 groupEnd → 标记 groupEndIndex
  const groupStack: number[] = []
  let depth = 0
  for (let i = 0; i < logs.value.length; i++) {
    const parsed = parseLogLine(logs.value[i])
    if (parsed.level === 'group') {
      const entry: ParsedLogEntry = {
        t: parsed.t,
        level: 'group',
        message: parsed.message,
        depth,
        isGroup: true,
        key: i
      }
      out.push(entry)
      groupStack.push(out.length - 1)
      depth++
    } else if (parsed.level === 'groupEnd') {
      // 关闭最近一个 group；如果栈空说明是孤儿 groupEnd，直接忽略
      const headIdx = groupStack.pop()
      if (headIdx !== undefined) {
        out[headIdx].groupEndIndex = i
        depth = Math.max(0, depth - 1)
      }
      // groupEnd 本身不输出可见行（行为对齐 console.group 语义）
    } else {
      out.push({
        t: parsed.t,
        level: parsed.level,
        message: parsed.message,
        depth,
        isGroup: false,
        key: i
      })
    }
  }
  return out
})

/** 真实日志级别 → CSS class */
function logLevelClass(level: PluginLogLevel): string {
  switch (level) {
    case 'error':
      return 'log-error'
    case 'warn':
      return 'log-warn'
    case 'info':
      return 'log-info'
    case 'debug':
      return 'log-debug'
    case 'group':
      return 'log-group'
    default:
      return 'log-default'
  }
}

/** 计算折叠后实际展示的条目（被折叠 group 内部的行不渲染）。 */
const visibleLogs = computed<ParsedLogEntry[]>(() => {
  if (collapsedGroups.value.size === 0) return parsedLogs.value
  const result: ParsedLogEntry[] = []
  // skipUntilDepth：在折叠时，跳过深度 > 该值的所有后续条目，直到深度回到 <= 该值
  let skipUntilDepth = -1
  for (const entry of parsedLogs.value) {
    if (skipUntilDepth >= 0) {
      if (entry.depth <= skipUntilDepth) {
        skipUntilDepth = -1
      } else {
        continue
      }
    }
    result.push(entry)
    if (entry.isGroup && collapsedGroups.value.has(entry.key)) {
      skipUntilDepth = entry.depth
    }
  }
  return result
})

function toggleGroup(key: number) {
  const next = new Set(collapsedGroups.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedGroups.value = next
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
.guest-format-picker {
  display: grid;
  gap: 8px;
  margin-bottom: 20px;
}
.guest-list {
  margin-top: 16px;
  display: grid;
  gap: 8px;
}
.guest-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 10px;
}
.guest-row p {
  margin: 4px 0 0;
  font-size: 12px;
  color: var(--td-text-color-secondary);
}
.guest-buttons {
  display: flex;
  gap: 6px;
  flex-shrink: 0;
}
.permission-list {
  display: grid;
  gap: 12px;
  padding: 4px 0 12px;
}
.permission-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 24px;
  border: 1px solid var(--td-component-stroke);
  border-radius: 12px;
  padding: 16px 18px;
}
.permission-copy {
  flex: 1;
  min-width: 0;
}
.permission-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}
.permission-reason {
  margin: 6px 0 0;
  font-size: 13px;
  color: var(--td-text-color-secondary);
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.page {
  height: 100%;
  min-height: 0;
  overflow: hidden;
  color: var(--td-text-color-primary, #20232b);
  min-width: 0;
}
.plugins-container {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  padding: 30px 28px;
  max-width: 1120px;
  margin-inline: auto;
}
.plugin-actions-hearder {
  flex-shrink: 0;
  margin-bottom: 24px;
}
.plugins-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 2px;
}
.plugins-title-row h2 {
  margin: 0;
  font-size: 26px;
  line-height: 36px;
  font-weight: 600;
  letter-spacing: -0.6px;
}
.plugins-title-row > :deep(.t-button) {
  height: 38px;
  padding-inline: 18px;
  border-radius: 9px;
  box-shadow: 0 4px 12px color-mix(in srgb, var(--td-brand-color) 20%, transparent);
}
.plugins-subtitle {
  margin: 5px 0 0;
  font-size: 13px;
  color: var(--td-text-color-secondary, #737985);
}
.plugin-toolbar {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-top: 24px;
  padding: 10px;
  background: var(--td-bg-color-container, #fff);
  border: 1px solid color-mix(in srgb, var(--td-component-stroke) 70%, transparent);
  border-radius: 12px;
  box-shadow: 0 2px 6px rgb(28 33 46 / 3%);
}
.plugin-search {
  flex: 1;
  max-width: 360px;
  min-width: 160px;
}
.plugin-search :deep(.t-input) {
  border-color: transparent;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 7px;
}
.plugin-search :deep(.t-input--focused) {
  border-color: var(--td-brand-color);
}
.plugin-toolbar :deep(.t-radio-group) {
  border-radius: 7px;
}
.plugin-toolbar > :last-child {
  margin-left: auto;
}
.plugin-import-dialog-anchor {
  height: 0;
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
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
  align-content: start;
  padding: 2px 12px 24px 2px;
  display: grid;
  gap: 18px;
  padding-bottom: 12px;
}
.plugin-item {
  display: grid;
  grid-template-columns: 80px minmax(0, 1fr) auto;
  align-items: start;
  gap: 22px;
  padding: 26px;
  border: 1px solid color-mix(in srgb, var(--td-component-stroke, #eaecf0) 80%, transparent);
  border-radius: 16px;
  background: var(--td-bg-color-container, #fff);
  box-shadow:
    0 2px 3px rgb(28 33 46 / 2%),
    0 10px 28px rgb(28 33 46 / 4%);
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease;
}
.plugin-item.selected {
  border-color: color-mix(in srgb, var(--td-brand-color) 24%, var(--td-component-stroke));
  box-shadow:
    0 2px 3px rgb(28 33 46 / 2%),
    0 10px 28px color-mix(in srgb, var(--td-brand-color) 7%, transparent);
}
.plugin-mark {
  display: grid;
  place-items: center;
  width: 80px;
  height: 80px;
  border-radius: 20px;
  color: #3d4051;
  background: linear-gradient(
    145deg,
    var(--td-bg-color-container),
    var(--td-bg-color-secondarycontainer)
  );
  border: 1px solid color-mix(in srgb, var(--td-component-stroke) 60%, transparent);
  box-shadow:
    inset 0 1px 0 rgb(255 255 255 / 45%),
    0 5px 12px rgb(28 33 46 / 5%);
}
.plugin-record {
  width: 72px;
  height: 72px;
  filter: drop-shadow(0 3px 2px rgb(28 33 46 / 18%));
}
.plugin-mark.is-adapter {
  color: var(--td-brand-color);
  background: linear-gradient(145deg, var(--td-bg-color-container), var(--td-brand-color-light));
}
.plugin-info {
  min-width: 0;
}
.plugin-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 1px;
}
.plugin-heading h3 {
  margin: 0;
  font-size: 18px;
  line-height: 26px;
  font-weight: 600;
  letter-spacing: -0.2px;
  overflow-wrap: anywhere;
}
.format-badge {
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  padding: 2px 9px;
  border-radius: 999px;
  font-size: 11px;
  font-weight: 600;
  line-height: 18px;
  white-space: nowrap;
}
.native-format {
  background-color: #2563eb;
  color: #ffffff;
}
.guest-heading {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.version {
  font-size: 11px;
  color: var(--td-text-color-secondary);
  white-space: nowrap;
  border: 1px solid var(--td-component-stroke);
  padding: 0 6px;
  border-radius: 5px;
  line-height: 18px;
}
.description {
  margin: 9px 0 8px;
  max-width: 64ch;
  color: var(--td-text-color-secondary);
  font-size: 13px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.plugin-details {
  display: flex;
  gap: 16px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
  line-height: 20px;
}
.plugin-sources {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
  margin-top: 18px;
  padding-top: 15px;
  border-top: 1px solid color-mix(in srgb, var(--td-component-stroke) 65%, transparent);
}
.source-tag {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  line-height: 24px;
  padding: 0 9px;
  border: 1px solid color-mix(in srgb, var(--td-component-stroke) 70%, transparent);
  border-radius: 6px;
  background: var(--td-bg-color-container-hover, #f7f8fa);
}
.current-tag {
  margin-left: 8px;
  color: var(--td-brand-color);
  font-size: 12px;
}
.plugin-load-error {
  margin-top: 10px;
  color: var(--td-error-color);
  font-size: 12px;
  line-height: 1.6;
}
.plugin-actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 4px;
  padding-top: 1px;
}
.plugin-actions :deep(.t-button) {
  border-radius: 7px;
}
.plugin-use-button {
  min-width: 76px;
  margin-right: 8px;
}
.plugin-use-button:deep(.t-button--theme-primary) {
  box-shadow: 0 3px 8px color-mix(in srgb, var(--td-brand-color) 18%, transparent);
}
@media (max-width: 860px) {
  .plugins-container {
    padding: 22px 16px;
  }
  .plugin-toolbar {
    flex-wrap: wrap;
    gap: 12px;
  }
  .plugin-search {
    flex-basis: 100%;
    max-width: none;
  }
  .plugin-item {
    grid-template-columns: 60px minmax(0, 1fr);
    gap: 16px;
    padding: 22px;
  }
  .plugin-mark {
    width: 60px;
    height: 60px;
    border-radius: 16px;
  }
  .plugin-record {
    width: 56px;
    height: 56px;
  }
  .plugin-actions {
    grid-column: 2;
    padding-top: 2px;
  }
  .guest-row {
    flex-wrap: wrap;
  }
}
@media (prefers-reduced-motion: reduce) {
  .plugin-item {
    transition: none;
  }
}

.config-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  padding: 8px 0;
}

.config-field {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.config-label {
  font-size: 14px;
  font-weight: 500;
  color: var(--plugins-text-primary);

  .required-mark {
    color: #e34d59;
    margin-left: 2px;
  }
}

.config-test {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 8px;
  padding-top: 12px;
  border-top: 1px solid var(--plugins-border);

  .test-result {
    font-size: 13px;
    &.success {
      color: #2ba471;
    }
    &.fail {
      color: #e34d59;
    }
  }
}

/* Moved to global style */

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

    /* group 头：可点击折叠 */
    &.log-entry-group {
      cursor: pointer;
      font-weight: 600;

      .log-group-caret {
        display: inline-block;
        width: 14px;
        margin-right: 4px;
        text-align: center;
        font-size: 10px;
        color: var(--plugins-console-text);
        flex-shrink: 0;
      }

      &:hover {
        background: rgba(255, 255, 255, 0.08);
      }
    }

    &.log-entry-collapsed {
      opacity: 0.85;
    }

    &.log-group {
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
</style>

<style lang="scss">
/* 日志弹窗样式 - 全局样式以支持 attach="body" */
.log-dialog {
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
</style>
