<template>
  <div class="routing-panel">
    <div class="routing-intro">
      <div>
        <slot name="navigation"><h3>能力分配</h3></slot>
        <p>查看已启用插件提供的全部功能，并按能力选择实际使用的插件。</p>
      </div>
      <span class="routing-count">{{ enabledPlugins.length }} 个插件可用</span>
    </div>

    <div v-if="!rows.length && !uiGroups.length" class="routing-empty">
      启用插件后可查看其功能与界面服务。
    </div>
    <div v-else class="routing-layout">
      <aside class="routing-nav">
        <button
          v-for="group in groupedRows"
          :key="group.source"
          type="button"
          :class="{ active: activeSource === group.source }"
          :aria-pressed="activeSource === group.source"
          @click="selectSource(group.source)"
        >
          <span>{{ group.name }}</span
          ><small>{{ group.rows.length }}</small>
        </button>
        <button
          v-for="group in uiGroups"
          :key="group.key"
          type="button"
          :class="{ active: activeSource === group.key }"
          :aria-pressed="activeSource === group.key"
          @click="selectSource(group.key)"
        >
          <span>{{ group.name }}</span
          ><small>{{ group.rows.length }}</small>
        </button>
      </aside>
      <section class="routing-group">
        <div class="routing-group-title">
          <strong>{{ selectedUIGroup?.name || selectedGroup?.name }}</strong>
          <span>{{ selectedUIGroup?.rows.length ?? selectedGroup?.rows.length }} 项功能</span>
        </div>
        <div
          ref="rowsViewport"
          class="routing-rows"
          tabindex="0"
          aria-label="功能分配列表"
          @scroll="rememberRowsScroll"
        >
          <template v-if="!selectedUIGroup">
            <div v-for="row in selectedGroup?.rows || []" :key="row.key" class="routing-row">
              <div class="routing-copy">
                <span>{{ row.label }}</span
                ><small>{{ row.description }}</small>
              </div>
              <t-select
                v-if="row.selectable"
                :value="selection(row.key)"
                :options="options(row)"
                class="routing-select"
                @change="(value) => changeCapability(row, String(value || ''))"
              />
              <div v-else class="routing-provider">
                <span>{{ row.implementations.map((item) => item.manifest.name).join('、') }}</span>
                <small>已注册 · 当前未接入统一分配</small>
              </div>
            </div>
          </template>
          <template v-else>
            <div v-for="row in selectedUIGroup.rows" :key="row.key" class="routing-row">
              <div class="routing-copy">
                <span>{{ row.label }}</span
                ><small>{{ row.description }}</small>
              </div>
              <t-select
                v-if="row.selectable && row.implementations.length > 1"
                :value="uiSelection(row)"
                :options="uiOptions(row)"
                class="routing-select"
                @change="(value) => changeUI(row, String(value || ''))"
              />
              <div v-else class="routing-provider">
                <span>{{ row.implementations[0].manifest.name }}</span>
                <small>{{ row.status }}</small>
              </div>
            </div>
          </template>
        </div>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick, onActivated, onDeactivated } from 'vue'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import {
  activePluginContributions,
  selectCapabilityImplementation,
  selectUIImplementation
} from '@renderer/services/pluginState'
import { MessagePlugin } from 'tdesign-vue-next'
import { describePluginCapability } from '@renderer/utils/pluginCapabilityLabels'
import { isRoutablePluginCapability } from '@common/pluginCapabilities'
import { getPluginContributionGroups } from '@renderer/utils/pluginContributionCatalog'

const store = LocalUserDetailStore()
const enabledPlugins = activePluginContributions
const uiGroups = computed(() => getPluginContributionGroups(enabledPlugins.value))

interface Row {
  key: string
  source: string
  capability: string
  label: string
  description: string
  selectable: boolean
  implementations: any[]
}

const rows = computed<Row[]>(() => {
  const byKey = new Map<string, Row>()
  for (const plugin of enabledPlugins.value) {
    const providers = new Set<string>([
      ...(plugin.manifest.contributes?.providers ?? []).map((provider: any) => provider.id),
      ...Object.keys(plugin.providerMethods ?? {})
    ])
    for (const source of providers) {
      const capabilities = [
        ...(plugin.providerMethods?.[source] ?? []),
        ...(plugin.actionIds ?? [])
          .map((action: string) => `action:${action}`)
          .filter(isRoutablePluginCapability)
      ]
      for (const capability of capabilities) {
        const key = `${source}:${capability}`
        const { label, description } = describePluginCapability(capability, plugin.manifest)
        const row: Row = byKey.get(key) ?? {
          key,
          source,
          capability,
          label,
          description,
          selectable: isRoutablePluginCapability(capability),
          implementations: []
        }
        row.implementations.push(plugin)
        byKey.set(key, row)
      }
    }
  }
  return [...byKey.values()]
})

const groupedRows = computed(() => {
  const result = new Map<string, { source: string; name: string; rows: Row[] }>()
  for (const row of rows.value) {
    const provider = row.implementations[0]?.manifest.contributes?.providers?.find(
      (item: any) => item.id === row.source
    )
    const group: { source: string; name: string; rows: Row[] } = result.get(row.source) ?? {
      source: row.source,
      name: provider?.name || row.source,
      rows: []
    }
    group.rows.push(row)
    result.set(row.source, group)
  }
  return [...result.values()]
})
const activeSource = ref('')
const rowsViewport = ref<HTMLElement>()
const sourceScroll = new Map<string, number>()
let rowsActive = true
function rememberRowsScroll() {
  if (rowsActive) sourceScroll.set(activeSource.value, rowsViewport.value?.scrollTop ?? 0)
}
onDeactivated(() => {
  rowsActive = false
})
onActivated(async () => {
  rowsActive = false
  await nextTick()
  if (rowsViewport.value) rowsViewport.value.scrollTop = sourceScroll.get(activeSource.value) ?? 0
  rowsActive = true
})
async function selectSource(source: string) {
  if (source === activeSource.value) return
  sourceScroll.set(activeSource.value, rowsViewport.value?.scrollTop ?? 0)
  rowsActive = false
  activeSource.value = source
  await nextTick()
  if (rowsViewport.value) rowsViewport.value.scrollTop = sourceScroll.get(source) ?? 0
  rowsActive = true
}
watch(
  [groupedRows, uiGroups],
  ([groups, interfaces]) => {
    if (
      !groups.some((group) => group.source === activeSource.value) &&
      !interfaces.some((group) => group.key === activeSource.value)
    )
      activeSource.value = groups[0]?.source || interfaces[0]?.key || ''
  },
  { immediate: true }
)
const selectedGroup = computed(() =>
  groupedRows.value.find((group) => group.source === activeSource.value)
)
const selectedUIGroup = computed(() =>
  uiGroups.value.find((group) => group.key === activeSource.value)
)

const options = (row: Row) => {
  const sourceOwnerId = store.userInfo.sourcePluginMap?.[row.source]
  const sourceOwner = enabledPlugins.value.find(
    (item) =>
      item.pluginId === sourceOwnerId &&
      item.manifest.contributes?.providers?.some((provider: any) => provider.id === row.source)
  )
  const automatic = sourceOwner
    ? (row.implementations.find((item) => item.pluginId === sourceOwner.pluginId) ??
      row.implementations[0])
    : row.implementations[0]
  return [
    { label: `自动（${automatic?.manifest.name || '当前音源未提供'}）`, value: '' },
    ...row.implementations.map((item) => ({ label: item.manifest.name, value: item.pluginId }))
  ]
}
const selection = (key: string) => store.userInfo.capabilityPluginMap?.[key] || ''
async function changeCapability(row: Row, pluginId: string) {
  try {
    await selectCapabilityImplementation(row.source, row.capability, pluginId || null)
  } catch (error: any) {
    MessagePlugin.error(error?.message || '切换能力实现失败')
  }
}

const uiOptions = (row: any) => [
  { label: `自动（${row.implementations[0].manifest.name}）`, value: '' },
  ...row.implementations.map((item: any) => ({ label: item.manifest.name, value: item.pluginId }))
]
const uiSelection = (row: any) => store.userInfo.uiPluginMap?.[row.key] || ''
function changeUI(row: any, pluginId: string) {
  selectUIImplementation(row.key, pluginId || null)
}
</script>

<style scoped lang="scss">
.routing-panel {
  height: 100%;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 30px 28px 24px;
  max-width: 1120px;
  margin-inline: auto;
}
.routing-group,
.routing-empty {
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
}
.routing-intro {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 2px 10px;
  h3,
  p {
    margin: 0;
  }
  p {
    margin-top: 6px;
    color: var(--td-text-color-secondary);
    font-size: 13px;
  }
}
.routing-empty {
  padding: 32px;
  text-align: center;
  color: var(--td-text-color-secondary);
}
.routing-layout {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
.routing-nav {
  align-content: start;
  overflow-y: auto;
  min-height: 0;
  overscroll-behavior: contain;
  display: grid;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  background: var(--td-bg-color-container);
  button {
    display: flex;
    justify-content: space-between;
    align-items: center;
    min-height: 38px;
    padding: 0 10px;
    border: 0;
    border-radius: 6px;
    color: var(--td-text-color-secondary);
    background: transparent;
    cursor: pointer;
    &.active {
      color: var(--td-brand-color-7);
      background: var(--td-brand-color-1);
      font-weight: 600;
    }
    small {
      color: var(--td-text-color-placeholder);
    }
  }
}
.routing-group {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-height: 0;
}
.routing-count {
  font-size: 12px;
  color: var(--td-text-color-secondary);
  white-space: nowrap;
  margin-left: 12px;
}
.routing-rows {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.routing-group-title {
  flex-shrink: 0;
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 13px 16px;
  border-bottom: 1px solid var(--td-component-stroke);
  span {
    color: var(--td-text-color-placeholder);
    font-size: 12px;
  }
}
.routing-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) minmax(220px, 320px);
  align-items: center;
  gap: 20px;
  min-height: 64px;
  padding: 10px 16px;
  & + & {
    border-top: 1px solid var(--td-component-stroke);
  }
}
.routing-copy {
  display: flex;
  flex-direction: column;
  gap: 3px;
  small {
    color: var(--td-text-color-secondary);
  }
}
.routing-select {
  width: 100%;
}
.routing-provider {
  display: flex;
  flex-direction: column;
  gap: 3px;
  padding: 0 10px;
  small {
    color: var(--td-text-color-placeholder);
  }
}
@media (max-width: 720px) {
  .routing-panel {
    padding: 22px 16px 16px;
  }
  .routing-layout {
    grid-template-columns: 1fr;
    grid-template-rows: auto minmax(0, 1fr);
  }
  .routing-nav {
    display: flex;
    overflow-x: auto;
    overflow-y: hidden;
    button {
      flex-shrink: 0;
      gap: 12px;
    }
  }
  .routing-row {
    grid-template-columns: 1fr;
    gap: 8px;
  }
}
</style>
