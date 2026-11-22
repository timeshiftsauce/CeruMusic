<template>
  <details class="activity" @toggle="onToggle">
    <summary>{{ pluginId ? '此插件的拦截活动' : '拦截活动记录' }}</summary>
    <div class="activity-toolbar">
      <span>本次运行 · 每个插件最多 100 条</span
      ><t-button variant="text" size="small" :disabled="busy" @click="refresh">刷新记录</t-button>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-else-if="busy" role="status">读取中…</p>
    <p v-else-if="!entries.length">暂无改写或取消记录。</p>
    <ul v-else>
      <li v-for="(entry, index) in entries" :key="index">
        <strong
          >{{ entry.action === 'cancel' ? '取消' : '改写' }}{{ hookLabels[entry.name] }}</strong
        ><time :datetime="new Date(entry.time).toISOString()">{{
          new Date(entry.time).toLocaleTimeString()
        }}</time
        ><small
          >{{ pluginId ? '' : entry.pluginId + ' · ' }}来源：{{ sourceLabel[entry.source] }}</small
        >
        <t-tooltip
          :content="summaryLines(entry).join('\n')"
          :overlay-inner-style="{ whiteSpace: 'pre-line', maxWidth: '360px' }"
        >
          <span class="activity-change" tabindex="0" :aria-label="summaryLines(entry).join('；')"
            >{{ summaryLines(entry)[0]
            }}<span v-if="summaryLines(entry).length > 1">
              · 另 {{ summaryLines(entry).length - 1 }} 项</span
            ></span
          >
        </t-tooltip>
      </li>
    </ul>
  </details>
</template>
<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { hookLabels, hookChangeLabels } from '@common/pluginHookControls'
import { ref } from 'vue'
import type { HookControls, HookActivity } from '@common/pluginHookControls'
const valueLabels: Record<string, string> = {
  next: '下一首',
  end: '队列末尾',
  sequence: '顺序播放',
  random: '随机播放',
  single: '单曲循环',
  user: '用户切歌',
  ended: '播放结束',
  error: '错误',
  lossless: '无损',
  hires: '高解析度',
  '128k': '128k',
  '192k': '192k',
  '320k': '320k',
  cmpl: 'CMPL',
  cpl: 'CPL',
  crlyric: 'CRLyric',
  info: '信息',
  success: '成功',
  warning: '警告',
  welcome: '欢迎页',
  home: '首页',
  find: '发现',
  songlist: '歌单',
  local: '本地音乐',
  recent: '最近播放',
  search: '搜索',
  recognize: '听歌识曲',
  list: '列表',
  download: '下载',
  'local-tag-editor': '本地标签编辑',
  profile: '个人页',
  community: '社区',
  settings: '设置',
  'plugin-page': '插件页面'
}
function summaryLines(entry: HookActivity): string[] {
  if (entry.action === 'cancel') return ['已阻止本次操作']
  const changes = entry.summary?.changes ?? []
  if (!changes.length)
    return [
      entry.summary?.target === 'result'
        ? '返回结果已更改（内容已隐藏）'
        : '操作参数已更改（内容已隐藏）'
    ]
  const value = (input: string | number | boolean | undefined) =>
    typeof input === 'boolean'
      ? input
        ? '是'
        : '否'
      : typeof input === 'string'
        ? (valueLabels[input] ?? '已隐藏')
        : String(input ?? '—')
  return changes.map((change) =>
    change.redacted
      ? `${hookChangeLabels[change.field]}已更改（内容已隐藏）`
      : `${hookChangeLabels[change.field]}：${value(change.before)} → ${value(change.after)}`
  )
}
const props = defineProps<{ pluginId?: string }>()
const entries = ref<HookControls['activity']>([]),
  busy = ref(false),
  error = ref('')
const sourceLabel = { plugin: '插件', system: '系统', ui: '用户操作' }
let revision = 0
async function refresh() {
  const current = ++revision
  busy.value = true
  error.value = ''
  try {
    const { activity } = await desktopBridge.api.plugins.hookControls()
    if (current === revision)
      entries.value = props.pluginId
        ? activity.filter((item) => item.pluginId === props.pluginId)
        : activity
  } catch (reason) {
    if (current === revision) error.value = String(reason)
  } finally {
    if (current === revision) busy.value = false
  }
}
function onToggle(event: Event) {
  if ((event.currentTarget as HTMLDetailsElement).open) void refresh()
  else {
    ++revision
    entries.value = []
    busy.value = false
  }
}
</script>
<style scoped>
.activity {
  padding: 9px 12px;
  border-radius: 8px;
  background: var(--td-bg-color-secondarycontainer);
  margin-top: 10px;
  font-size: 13px;
  line-height: 20px;
  overflow-wrap: anywhere;
}
.activity summary {
  cursor: pointer;
}
.activity-toolbar,
.activity li {
  display: flex;
  gap: 6px;
  align-items: center;
  justify-content: space-between;
}
.activity-toolbar,
.activity p,
.activity ul {
  color: var(--td-text-color-secondary);
  font-size: 12px;
  margin: 6px 0 0;
}
.activity p[role='alert'] {
  color: var(--td-error-color);
}
.activity ul {
  list-style: none;
  padding: 0;
  max-height: 10rem;
  overflow: auto;
}
.activity li {
  flex-wrap: wrap;
  gap: 0 8px;
  padding-block: 6px;
  border-top: 1px solid var(--td-component-stroke);
}
.activity strong {
  color: var(--td-text-color-primary);
  font-weight: 500;
}
.activity small {
  width: 100%;
  font-size: 12px;
}
.activity-change {
  display: block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--td-text-color-secondary);
  cursor: help;
}
.activity-change:focus-visible {
  outline: 2px solid var(--td-brand-color);
  outline-offset: 2px;
  border-radius: 3px;
}
</style>
