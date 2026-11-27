<script setup lang="ts">
import { computed } from 'vue'
import { NInputNumber } from 'naive-ui'
import { SwapIcon } from 'tdesign-icons-vue-next'
import { useSettingsStore } from '@renderer/store/Settings'
import { playbackProviders } from '@renderer/utils/audio/playbackFallback'
import {
  fallbackPreferences,
  fallbackStrategyLabels,
  orderedIds,
  type FallbackPreferences,
  type FallbackStrategy
} from '@renderer/utils/audio/fallbackPreferences'
import FallbackOrder from './FallbackOrder.vue'

const store = useSettingsStore()
const value = computed(() => fallbackPreferences(store.settings.playbackFallback))
const update = (patch: Partial<FallbackPreferences>) =>
  store.updateSettings({ playbackFallback: { ...value.value, ...patch } })

const descriptions: Record<FallbackStrategy, string> = {
  plugin: '用其他插件解析同一平台的歌曲',
  source: '在其他平台查找匹配歌曲',
  quality: '按原插件支持的音质逐档尝试'
}
const strategies = computed(() =>
  value.value.order.map((id) => ({
    id,
    label: fallbackStrategyLabels[id],
    detail: descriptions[id],
    enabled: value.value.strategies[id]
  }))
)
function toggleStrategy(id: string, enabled: boolean) {
  update({ strategies: { ...value.value.strategies, [id]: enabled } })
}
const attemptControls = [
  { key: 'pluginAttempts', strategy: 'plugin', label: '跨插件尝试上限' },
  { key: 'sourceAttempts', strategy: 'source', label: '跨音源尝试上限' }
] as const

function updateAttempts(key: (typeof attemptControls)[number]['key'], input: number | null) {
  if (input === null || !Number.isSafeInteger(input) || input < 1) return
  update({ [key]: input })
}

const providers = computed(playbackProviders)
const platforms = computed(() => {
  const entries = new Map(providers.value.map(({ source, sourceName }) => [source, sourceName]))
  return orderedIds([...entries.keys()], value.value.platformOrder).map((id) => ({
    id,
    label: entries.get(id) ?? id
  }))
})
const plugins = computed(() => {
  const entries = new Map(providers.value.map(({ pluginId, pluginName }) => [pluginId, pluginName]))
  return orderedIds([...entries.keys()], value.value.pluginOrder).map((id) => ({
    id,
    label: entries.get(id) ?? id,
    detail: providers.value
      .filter(({ pluginId }) => pluginId === id)
      .map(({ sourceName }) => sourceName)
      .join(' · ')
  }))
})
// Keep preferences for temporarily disabled or uninstalled plugins and platforms.
function saveOrder(key: 'platformOrder' | 'pluginOrder', ids: string[]) {
  const active = new Set(ids)
  const remaining = [...ids]
  const saved = value.value[key].map((id) => (active.has(id) ? remaining.shift()! : id))
  update({ [key]: [...saved, ...remaining] })
}
</script>

<template>
  <section id="music-fallback" class="fallback-settings">
    <header class="fallback-header">
      <span class="heading-icon"><SwapIcon aria-hidden="true" /></span>
      <div class="fallback-intro">
        <h3>自动换源</h3>
        <p>{{ value.enabled ? '播放失败时按设定的顺序寻找可用音源。' : '播放失败时直接跳过。' }}</p>
      </div>
      <n-switch
        :value="value.enabled"
        aria-label="自动换源"
        @update:value="update({ enabled: Boolean($event) })"
      />
    </header>

    <Transition name="fallback-expand">
      <div v-if="value.enabled" class="expand">
        <div class="advanced">
          <div class="fallback-grid">
            <section class="strategy-panel">
              <h4>策略执行顺序</h4>
              <p>从上往下尝试，关闭的策略保留原位置。</p>
              <FallbackOrder
                :items="strategies"
                @toggle="toggleStrategy"
                @reorder="update({ order: $event as FallbackStrategy[] })"
              />
              <div class="attempt-settings">
                <div v-for="control in attemptControls" :key="control.key" class="setting-row">
                  <span>{{ control.label }}</span>
                  <n-input-number
                    :input-props="{ 'aria-label': control.label }"
                    :value="value[control.key]"
                    :disabled="!value.strategies[control.strategy]"
                    :min="1"
                    :precision="0"
                    size="small"
                    @update:value="updateAttempts(control.key, $event)"
                  >
                    <template #suffix>次</template>
                  </n-input-number>
                </div>
                <p>每首歌只尝试符合条件的平台和插件。</p>
              </div>
              <div class="setting-row advance-row">
                <div>
                  <h4>播放失败自动下一首</h4>
                  <p>已尝试所有可用策略后跳过本曲。</p>
                </div>
                <n-switch
                  size="small"
                  :value="value.autoNext"
                  aria-label="播放失败自动下一首"
                  @update:value="update({ autoNext: Boolean($event) })"
                />
              </div>
            </section>

            <section class="priority-panel">
              <h4 class="priority-heading">换源优先级</h4>
              <div class="priority-item">
                <div class="setting-row">
                  <div>
                    <h5>平台优先级</h5>
                    <p>
                      {{
                        value.preferPlatforms
                          ? '先按平台顺序，再比较匹配分。'
                          : '当前按歌曲的匹配分排序。'
                      }}
                    </p>
                  </div>
                  <n-switch
                    size="small"
                    :value="value.preferPlatforms"
                    :disabled="!value.strategies.source"
                    aria-label="换源平台优先级"
                    @update:value="update({ preferPlatforms: Boolean($event) })"
                  />
                </div>
                <FallbackOrder
                  v-if="value.preferPlatforms && platforms.length"
                  :items="platforms"
                  :disabled="!value.strategies.source"
                  @reorder="saveOrder('platformOrder', $event)"
                />
              </div>
              <div class="priority-item">
                <h5>插件优先级</h5>
                <p>
                  {{
                    plugins.length ? '按顺序尝试支持目标平台的插件。' : '暂无支持播放解析的插件。'
                  }}
                </p>
                <FallbackOrder
                  v-if="plugins.length"
                  :items="plugins"
                  :disabled="!value.strategies.plugin && !value.strategies.source"
                  @reorder="saveOrder('pluginOrder', $event)"
                />
              </div>
            </section>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.fallback-settings {
  --fallback-line: var(--td-component-stroke);
  --fallback-muted: var(--td-text-color-secondary);
  --fallback-accent: var(--td-brand-color);
  padding: 18px;
  border: 1px solid var(--fallback-line);
  border-radius: 16px;
  background: var(--td-bg-color-container);
}
.fallback-header,
.setting-row {
  display: flex;
  align-items: center;
  gap: 12px;
}
.fallback-header {
  padding: 0 2px;
}
.fallback-intro {
  flex: 1;
  min-width: 0;
}
.heading-icon {
  display: grid;
  place-items: center;
  flex: 0 0 38px;
  height: 38px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--fallback-accent) 11%, transparent);
  color: var(--fallback-accent);
  font-size: 19px;
}
.setting-row {
  justify-content: space-between;
}
.fallback-settings :deep(.n-switch) {
  flex-shrink: 0;
}
h3,
h4,
h5,
p {
  margin: 0;
}
h3 {
  font-size: 16px;
  font-weight: 650;
}
h4,
h5 {
  font-size: 13px;
  font-weight: 650;
}
p {
  margin-top: 3px;
  color: var(--fallback-muted);
  font-size: 12px;
  line-height: 1.55;
}
.expand {
  display: grid;
  grid-template-rows: 1fr;
}
.advanced {
  min-height: 0;
  overflow: hidden;
}
.fallback-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
  gap: 20px;
  margin-top: 17px;
  padding-top: 16px;
  border-top: 1px solid var(--fallback-line);
}
.strategy-panel {
  min-width: 0;
  padding: 2px 0 0;
}
.attempt-settings {
  display: grid;
  gap: 7px;
  padding: 12px 0 2px;
}
.attempt-settings .setting-row {
  font-size: 12px;
}
.attempt-settings :deep(.n-input-number) {
  width: 110px;
  flex-shrink: 0;
}
.advance-row {
  margin-top: 11px;
  padding: 10px 0 2px;
  border-top: 1px solid var(--fallback-line);
}
.priority-panel {
  min-width: 0;
  align-self: start;
  padding: 12px 13px;
  border: 1px solid var(--fallback-line);
  border-radius: 12px;
  background: var(--td-bg-color-page);
}
.priority-heading {
  margin-bottom: 10px;
}
.priority-item + .priority-item {
  border-top: 1px solid var(--fallback-line);
  margin-top: 10px;
  padding-top: 10px;
}
.fallback-expand-enter-active,
.fallback-expand-leave-active {
  transition:
    grid-template-rows 240ms ease,
    opacity 180ms ease;
}
.fallback-expand-enter-from,
.fallback-expand-leave-to {
  grid-template-rows: 0fr;
  opacity: 0;
}
@container (max-width: 630px) {
  .fallback-grid {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }
}
@media (prefers-reduced-motion: reduce) {
  .fallback-expand-enter-active,
  .fallback-expand-leave-active {
    transition: none;
  }
}
</style>
