<script setup lang="ts">
import PlaybackFallbackSettings from '@renderer/components/Settings/PlaybackFallbackSettings.vue'
import { getQualityDisplayName } from '@common/utils/quality'
import { canPersistMusicData } from '@renderer/services/musicDataPersistence'
import { ref, computed, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { CheckIcon, MusicIcon, TreeRoundDotIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from '@renderer/plugin/notifications'
import fonts from '@renderer/assets/icon_font/icons'
import SourceDisabledHint from '@renderer/components/SourceDisabledHint.vue'
import {
  sourcePickerEntries,
  providerImplementations,
  chooseSourceEntry
} from '@renderer/services/pluginState'

const emit = defineEmits(['switch-category'])

const userStore = LocalUserDetailStore()
const { userInfo } = storeToRefs(userStore)

// Computeds
const hasPluginData = computed(() => {
  return !!(
    userInfo.value.pluginId &&
    userInfo.value.supportedSources &&
    Object.keys(userInfo.value.supportedSources).length > 0
  )
})

const currentPluginName = computed(() => {
  if (!hasPluginData.value) return ''
  return userInfo.value.pluginName || userInfo.value.pluginId || '未知插件'
})

const currentSourceQualities = computed(() => {
  if (!hasPluginData.value || !userInfo.value.selectSources) return []
  const selectedSource = userInfo.value.supportedSources?.[userInfo.value.selectSources]
  return selectedSource?.qualitys || []
})
const currentProviderOptions = computed(() =>
  sourcePickerEntries.value.some(
    (entry) => entry.source === userInfo.value.selectSources && entry.split
  )
    ? []
    : providerImplementations.value
        .filter((item) => item.providerId === userInfo.value.selectSources)
        .map((item) => ({ label: item.pluginName, value: item.pluginId }))
)
const currentProviderPlugin = computed({
  get: () => userInfo.value.sourcePluginMap?.[userInfo.value.selectSources || ''] || '',
  set: (pluginId: string) => {
    if (userInfo.value.selectSources)
      void chooseSourceEntry(userInfo.value.selectSources, pluginId).catch((error) =>
        MessagePlugin.error(error?.message || '切换音源插件失败，已保留原选择')
      )
  }
})

const globalQualityOptions = computed(() => {
  const sources = userInfo.value.supportedSources || {}
  const keys = Object.keys(sources)
  if (keys.length === 0) return []
  const arrays = keys.map((k) => sources[k].qualitys || [])
  const set = new Set(arrays[0])
  for (let i = 1; i < arrays.length; i++) {
    for (const q of Array.from(set)) {
      if (!arrays[i].includes(q)) set.delete(q)
    }
  }
  return Array.from(set)
})

const globalQualitySelected = ref<string>('')

watch(
  () => globalQualityOptions.value,
  (opts) => {
    if (!opts || opts.length === 0) {
      globalQualitySelected.value = ''
      return
    }
    if (!opts.includes(globalQualitySelected.value)) {
      globalQualitySelected.value = opts[opts.length - 1]
    }
  },
  { immediate: true }
)

const applyGlobalQuality = (q: string) => {
  if (!q) return
  if (!userInfo.value.sourceQualityMap) userInfo.value.sourceQualityMap = {}
  const sources = userInfo.value.supportedSources || {}
  Object.keys(sources).forEach((key) => {
    const arr = sources[key].qualitys || []
    if (arr.includes(q)) userInfo.value.sourceQualityMap![key] = q
  })
  const currentKey = userInfo.value.selectSources as string
  const arr = sources[currentKey]?.qualitys || []
  if (arr.includes(q)) userInfo.value.selectQuality = q
}

const activeQuality = computed(() => {
  const selected = userInfo.value.selectQuality || ''
  return currentSourceQualities.value.includes(selected)
    ? selected
    : currentSourceQualities.value.at(-1)
})

const setQuality = (quality: string) => {
  const source = userInfo.value.selectSources
  if (!source || !currentSourceQualities.value.includes(quality)) return
  userInfo.value.selectQuality = quality
  userInfo.value.sourceQualityMap = { ...userInfo.value.sourceQualityMap, [source]: quality }
}

const sources = computed(() =>
  sourcePickerEntries.value.filter((entry) => entry.source !== 'local')
)

const goPlugin = () => {
  emit('switch-category', 'plugins')
}
</script>

<template>
  <div class="source-settings">
    <div v-if="hasPluginData" class="source-overview">
      <section id="music-source" class="source-panel">
        <header class="panel-header">
          <div class="panel-title">
            <MusicIcon aria-hidden="true" />
            <h3>音乐源选择</h3>
          </div>
          <button class="plugin-link" type="button" @click="goPlugin" :title="currentPluginName">
            {{ currentPluginName }}
          </button>
        </header>

        <div class="source-cards">
          <SourceDisabledHint
            v-for="source in sources"
            :key="source.key"
            :reason="source.reason"
            v-slot="{ events }"
          >
            <button
              type="button"
              v-on="events"
              class="source-card"
              :class="{ selected: source.selected }"
              :aria-description="source.reason"
              :aria-disabled="source.disabled || undefined"
              :aria-pressed="source.selected"
              :disabled="!canPersistMusicData()"
              @click="chooseSourceEntry(source.source, source.owner)"
            >
              <span class="source-icon" aria-hidden="true">
                <img v-if="source.iconUrl" :src="source.iconUrl" alt="" />
                <component v-else-if="fonts[source.source]" :is="fonts[source.source]" />
                <MusicIcon v-else />
              </span>
              <span class="source-name">{{ source.name }}</span>
              <CheckIcon v-if="source.selected" class="selected-icon" aria-hidden="true" />
            </button>
          </SourceDisabledHint>
          <p v-if="!sources.length" class="panel-note">暂无可选择的在线音源。</p>
        </div>

        <div v-if="currentProviderOptions.length > 1" class="panel-setting">
          <span>平台实现</span>
          <t-select
            v-model="currentProviderPlugin"
            :options="currentProviderOptions"
            aria-label="平台实现"
            size="small"
          />
        </div>
      </section>

      <section id="music-quality" class="source-panel quality-panel">
        <header class="panel-header">
          <div class="panel-title"><h3>默认音质</h3></div>
        </header>
        <div
          v-if="currentSourceQualities.length"
          class="quality-choices"
          role="group"
          aria-label="默认音质"
        >
          <button
            v-for="quality in currentSourceQualities"
            :key="quality"
            type="button"
            :class="{ selected: activeQuality === quality }"
            :aria-pressed="activeQuality === quality"
            @click="setQuality(quality)"
          >
            {{ getQualityDisplayName(quality) }}
          </button>
        </div>
        <p v-else class="panel-note">所选音源没有提供可配置的音质。</p>
        <div v-if="globalQualityOptions.length" class="panel-setting">
          <span>统一设置所有音源</span>
          <t-select
            v-model="globalQualitySelected"
            size="small"
            aria-label="统一设置所有音源"
            @change="(v) => applyGlobalQuality(v as string)"
          >
            <t-option
              v-for="q in globalQualityOptions"
              :key="q"
              :value="q"
              :label="getQualityDisplayName(q)"
            />
          </t-select>
        </div>
      </section>
    </div>

    <section v-else id="music-source" class="source-panel empty-panel">
      <span class="empty-icon"><TreeRoundDotIcon aria-hidden="true" /></span>
      <div>
        <h3>音乐源选择</h3>
        <p>安装音源插件后即可选择平台和音质。</p>
      </div>
      <t-button theme="primary" variant="outline" @click="goPlugin">插件管理</t-button>
    </section>

    <PlaybackFallbackSettings />
  </div>
</template>

<style scoped>
.source-settings {
  --source-line: var(--td-component-stroke);
  --source-primary: var(--td-text-color-primary);
  --source-muted: var(--td-text-color-secondary);
  --source-accent: var(--td-brand-color);
  --source-highlight: color-mix(in srgb, var(--source-accent) 9%, var(--td-bg-color-container));
  container-type: inline-size;
  display: grid;
  gap: 18px;
}
.source-overview {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr);
  gap: 16px;
}
.source-panel {
  min-width: 0;
  padding: 18px;
  border: 1px solid var(--source-line);
  border-radius: 16px;
  background: var(--td-bg-color-container);
}
.panel-header,
.panel-title {
  display: flex;
  align-items: center;
  gap: 8px;
}
.panel-header {
  justify-content: space-between;
  margin-bottom: 13px;
  min-height: 26px;
}
.panel-title svg {
  color: var(--source-accent);
  font-size: 17px;
}
.source-panel h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 650;
}
.panel-note,
.empty-panel p {
  margin: 4px 0 0;
  color: var(--source-muted);
  font-size: 12px;
}
.plugin-link {
  max-width: 58%;
  padding: 4px 8px;
  border: 0;
  border-radius: 6px;
  background: var(--td-bg-color-container-hover);
  color: var(--source-muted);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  font-size: 11px;
  cursor: pointer;
}
.plugin-link:hover {
  color: var(--source-accent);
}
.source-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(138px, 100%), 1fr));
  gap: 7px;
}
.source-card,
.quality-choices button {
  border: 1px solid var(--source-line);
  background: transparent;
  color: var(--source-primary);
  cursor: pointer;
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease;
}
.source-card {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 9px;
  min-height: 40px;
  padding: 6px 8px;
  text-align: left;
}
.source-card:hover,
.quality-choices button:hover {
  background: var(--td-bg-color-container-hover);
}
.source-card.selected,
.quality-choices button.selected {
  border-color: color-mix(in srgb, var(--source-accent) 42%, var(--source-line));
  background: var(--source-highlight);
  color: var(--source-accent);
}
.source-card[aria-disabled='true'],
.source-card:disabled {
  opacity: 0.56;
  cursor: not-allowed;
}
.source-icon {
  width: 24px;
  height: 24px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 6px;
  background: var(--td-bg-color-container-hover);
  font-size: 15px;
}
.source-icon img {
  width: 16px;
  height: 16px;
  object-fit: contain;
}
.source-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
}
.selected-icon {
  flex: 0 0 auto;
}
.panel-setting {
  display: grid;
  grid-template-columns: minmax(90px, 1fr) minmax(105px, 1fr);
  align-items: center;
  gap: 8px;
  margin-top: 14px;
  padding-top: 13px;
  border-top: 1px solid var(--source-line);
  color: var(--source-muted);
  font-size: 12px;
}
.quality-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.quality-choices button {
  border-radius: 7px;
  padding: 5px 9px;
  font-size: 12px;
}
.empty-panel {
  display: flex;
  align-items: center;
  gap: 13px;
}
.empty-panel > div {
  flex: 1;
  min-width: 0;
}
.empty-icon {
  display: grid;
  place-items: center;
  flex: 0 0 40px;
  height: 40px;
  border-radius: 11px;
  color: var(--source-accent);
  background: var(--source-highlight);
  font-size: 19px;
}
@container (max-width: 630px) {
  .source-overview {
    grid-template-columns: minmax(0, 1fr);
  }
}
@media (prefers-reduced-motion: reduce) {
  .source-card,
  .quality-choices button {
    transition: none;
  }
}
</style>
