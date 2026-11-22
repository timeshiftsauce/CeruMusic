<template>
  <section aria-labelledby="plugin-safe-heading">
    <h3 id="plugin-safe-heading">运行保护</h3>
    <PluginSettingSwitch
      id="plugin-strict"
      label="严格模式"
      accessible-label="插件严格模式"
      description="开启后组件整页改为隔离运行，并隐藏插件槽位。"
      :checked="strictPluginViews"
      :disabled="strictBusy"
      @change="updateStrict"
    />
    <p v-for="id in pausedSlotPlugins" :key="id" role="status">
      已暂停 {{ id }} 的槽位：连续五次挂载超过 50ms。
    </p>
    <p v-if="strictError" role="alert">{{ strictError }}</p>
  </section>
  <section aria-labelledby="plugin-preview-heading">
    <h3 id="plugin-preview-heading">本地开发</h3>
    <PluginSettingSwitch
      id="plugin-dev"
      label="插件开发者模式"
      description="预览本地 JS 构建产物，保存文件后自动重载。"
      :checked="state.enabled"
      :disabled="busy || !loaded"
      @change="(value) => run(() => api.setDevMode(value))"
    />
    <div v-if="state.enabled" class="preview-files">
      <div class="preview-heading">
        <strong>预览文件 · {{ state.entries.length }}</strong
        ><t-button size="small" variant="outline" :disabled="busy" @click="run(api.addDevFile)"
          ><template #icon><t-icon name="add" /></template>添加本地 JS 文件</t-button
        >
      </div>
      <p class="preview-note">仅添加可信文件。同 ID 的已安装插件会暂停，移除预览后恢复。</p>
      <article v-for="entry in state.entries" :key="entry.path" class="preview-entry">
        <div class="preview-meta">
          <span class="version-tag">{{ entry.runtime ? 'v' + entry.runtime : '未加载' }}</span
          ><span class="file-label" :title="entry.path">{{ shortPath(entry.path) }}</span>
        </div>
        <details>
          <summary>完整路径</summary>
          <code>{{ entry.path }}</code>
        </details>
        <t-button
          size="small"
          variant="text"
          theme="default"
          :disabled="busy"
          :aria-label="'移除预览：' + shortPath(entry.path)"
          @click="run(() => api.removeDevFile(entry.path))"
          >移除预览</t-button
        >
        <p v-if="entry.error" role="alert">{{ entry.error }}</p>
      </article>
    </div>
    <p v-if="error" role="alert">{{ error }}</p>
  </section>
</template>
<script setup lang="ts">
import { desktopBridge } from '@renderer/services/desktopBridge'
import { ref, onMounted, onBeforeUnmount } from 'vue'
import {
  loadSlotPolicy,
  strictPluginViews,
  setStrictPluginViews,
  pausedSlotPlugins
} from '@renderer/services/pluginSlotPolicy'
import PluginSettingSwitch from './PluginSettingSwitch.vue'
const api = desktopBridge.api.plugins
const state = ref<Awaited<ReturnType<typeof api.devState>>>({ enabled: false, entries: [] }),
  busy = ref(false),
  loaded = ref(false),
  error = ref(''),
  strictError = ref(''),
  strictBusy = ref(true)
let off: (() => void) | undefined,
  revision = 0
const shortPath = (path: string) => path.split(/[\\/]/).filter(Boolean).slice(-3).join('/')
async function updateStrict(value: boolean) {
  strictBusy.value = true
  try {
    await setStrictPluginViews(value)
    strictError.value = ''
  } catch (reason) {
    strictError.value = String(reason)
  } finally {
    strictBusy.value = false
  }
}
async function refresh() {
  const current = ++revision
  try {
    const snapshot = await api.devState()
    if (current === revision) {
      state.value = snapshot
      loaded.value = true
      error.value = ''
    }
  } catch (reason) {
    if (current === revision) error.value = String(reason)
  }
}
async function run(work: typeof api.devState) {
  if (busy.value) return
  busy.value = true
  try {
    await work()
    await refresh()
  } catch (reason) {
    error.value = String(reason)
  } finally {
    busy.value = false
  }
}
onMounted(() => {
  void loadSlotPolicy().finally(() => {
    strictBusy.value = false
  })
  off = api.onDevReloaded(refresh)
  void refresh()
})
onBeforeUnmount(() => {
  ++revision
  off?.()
})
</script>
<style scoped>
.preview-files {
  border-radius: 9px;
  background: var(--td-bg-color-secondarycontainer);
  padding: 12px;
  margin-top: 4px;
}
.preview-heading,
.preview-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}
.preview-heading {
  justify-content: space-between;
  flex-wrap: wrap;
  font-size: 13px;
}
.preview-note {
  margin: 8px 0 2px;
  font-size: 12px;
  line-height: 18px;
  color: var(--td-text-color-secondary);
}
.preview-entry {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: 6px;
  border-top: 1px solid var(--td-component-stroke);
  padding-top: 10px;
  margin-top: 10px;
}
.preview-meta,
.preview-entry [role='alert'] {
  grid-column: 1 / -1;
}
.version-tag {
  flex: none;
  padding: 0 5px;
  border-radius: 4px;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  font-size: 11px;
  line-height: 19px;
}
.file-label {
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.preview-entry details {
  min-width: 0;
}
.preview-entry summary {
  cursor: pointer;
  font-size: 12px;
  line-height: 24px;
  color: var(--td-text-color-secondary);
}
.preview-entry code {
  display: block;
  user-select: text;
  overflow-wrap: anywhere;
  font-size: 12px;
  line-height: 18px;
}
</style>
