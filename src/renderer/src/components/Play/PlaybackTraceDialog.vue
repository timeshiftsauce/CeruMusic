<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { NPopover } from 'naive-ui'
import { CheckIcon, CloseIcon, ChevronDownIcon, MusicIcon, TimeIcon } from 'tdesign-icons-vue-next'
import type { PlaybackTarget } from '@common/playbackAttempt'
import { getQualityDisplayName } from '@common/utils/quality'
import { playbackProviders } from '@renderer/utils/audio/playbackFallback'
import { playbackTraces } from '@renderer/utils/audio/playbackTrace'

const props = defineProps<{
  fullScreen: boolean
  activeSong?: string
  cover?: string
  accent?: string
}>()
const show = defineModel<boolean>('show', { required: true })
const selected = ref<number>()
const showHistory = ref(false)
const historyTrigger = ref<HTMLButtonElement>()
const trace = computed(
  () => playbackTraces.value.find(({ id }) => id === selected.value) ?? playbackTraces.value[0]
)
watch(show, (open) => {
  showHistory.value = false
  if (open) selected.value = undefined
})

function closeHistory() {
  if (!showHistory.value) return
  showHistory.value = false
  historyTrigger.value?.focus()
}

function selectHistory(id: number) {
  // The latest record continues to follow playback until an older record is selected.
  selected.value = id === playbackTraces.value[0]?.id ? undefined : id
  closeHistory()
}

const status = {
  resolving: '正在解析',
  ready: '音频就绪',
  playing: '已开始播放',
  failed: '播放失败',
  cancelled: '已取消'
}
const providers = computed(playbackProviders)
const platformName = (source: string) =>
  providers.value.find((provider) => provider.source === source)?.sourceName ??
  (source === 'local' ? '本地音乐' : source)
const pluginName = (id: string) =>
  providers.value.find((provider) => provider.pluginId === id)?.pluginName ?? id
const seconds = (ms: number) => (ms / 1000).toFixed(ms ? 2 : 0) + ' s'

const hasCover = computed(() => props.cover && trace.value?.songName === props.activeSong)
const output = computed(() => {
  const item = trace.value
  if (!item) return []
  const source = platformName(item.source)
  const destination = item.target?.source && platformName(item.target.source)
  const route = destination && destination !== source ? [source, destination].join(' → ') : source
  return [...new Set([route, ...targetLabels(item.target, false)].filter(Boolean))]
})
function targetLabels(target?: PlaybackTarget, includeSource = true) {
  if (!target) return []
  const source = target.source && platformName(target.source)
  const plugin = target.pluginId && pluginName(target.pluginId)
  return [
    ...new Set(
      [
        includeSource && source,
        plugin !== source && plugin,
        target.quality && getQualityDisplayName(target.quality)
      ].filter((label): label is string => Boolean(label))
    )
  ]
}
const steps = computed(
  () =>
    trace.value?.steps.map((step, index, all) => {
      const labels = targetLabels(step.target)
      const previous = targetLabels(all[index - 1]?.target)
      return { ...step, labels: labels.filter((label) => !previous.includes(label)) }
    }) ?? []
)
</script>

<template>
  <n-modal v-model:show="show" :z-index="10010" :close-on-esc="!showHistory" @esc="closeHistory">
    <section
      class="playback-trace"
      :class="{ 'on-player': fullScreen }"
      :style="fullScreen && accent ? { '--playback-tint': accent } : undefined"
      role="dialog"
      aria-modal="true"
      aria-labelledby="playback-trace-title"
    >
      <header class="trace-header">
        <h2 id="playback-trace-title">歌曲来源链路</h2>
        <button
          class="close-button"
          type="button"
          aria-label="关闭歌曲来源链路"
          @click="show = false"
        >
          <CloseIcon />
        </button>
      </header>

      <template v-if="trace">
        <div class="trace-hero">
          <div class="trace-art">
            <img v-if="hasCover" :src="cover" alt="" />
            <MusicIcon v-else aria-hidden="true" />
          </div>
          <div class="track-info">
            <h3 :title="trace.songName">{{ trace.songName || '未知歌曲' }}</h3>
            <p v-if="output.length">{{ output.join(' · ') }}</p>
          </div>
          <div class="track-result">
            <span class="status" :data-status="trace.status">{{ status[trace.status] }}</span>
            <span class="duration"
              ><TimeIcon aria-hidden="true" />{{ seconds(trace.elapsed) }}</span
            >
          </div>
        </div>

        <div class="trace-toolbar">
          <h3>播放步骤</h3>
          <n-popover
            v-model:show="showHistory"
            trigger="click"
            placement="bottom-end"
            :show-arrow="false"
            :to="false"
            raw
          >
            <template #trigger>
              <button
                ref="historyTrigger"
                type="button"
                class="history-trigger"
                :aria-expanded="showHistory"
                aria-controls="playback-history"
              >
                <TimeIcon aria-hidden="true" />
                播放记录
                <span class="history-count">{{ playbackTraces.length }}</span>
                <ChevronDownIcon class="history-chevron" aria-hidden="true" />
              </button>
            </template>
            <div id="playback-history" class="history-menu" role="group" aria-label="播放记录">
              <ul class="history-list">
                <li v-for="(entry, index) in playbackTraces" :key="entry.id">
                  <button
                    type="button"
                    class="history-entry"
                    :aria-current="trace.id === entry.id ? 'true' : undefined"
                    @click="selectHistory(entry.id)"
                  >
                    <MusicIcon class="history-art" aria-hidden="true" />
                    <span class="history-entry-copy">
                      <span class="history-title" :title="entry.songName">{{
                        entry.songName || '未知歌曲'
                      }}</span>
                      <span class="history-meta" :data-status="entry.status">
                        {{ status[entry.status] }}<template v-if="index === 0"> · 最新</template>
                      </span>
                    </span>
                    <CheckIcon
                      v-if="trace.id === entry.id"
                      class="history-check"
                      aria-hidden="true"
                    />
                  </button>
                </li>
              </ul>
            </div>
          </n-popover>
        </div>
        <div class="trace-scroll" tabindex="0" role="region" aria-label="播放步骤">
          <ol class="trace-steps">
            <li v-for="(step, index) in steps" :key="index" :data-type="step.type">
              <div class="step-heading">
                <strong>{{ step.title }}</strong>
                <span>+{{ seconds(step.elapsed) }}</span>
              </div>
              <p v-if="step.detail">{{ step.detail }}</p>
              <div v-if="step.labels.length" class="step-labels">
                <span v-for="label in step.labels" :key="label">{{ label }}</span>
              </div>
              <p v-if="index === 0 && trace.omitted">已折叠 {{ trace.omitted }} 个较早步骤</p>
            </li>
          </ol>
        </div>
      </template>
      <n-empty v-else class="trace-empty" description="暂无播放记录" />
    </section>
  </n-modal>
</template>

<style scoped>
.playback-trace {
  --trace-bg: var(--td-bg-color-container);
  --history-bg: var(--td-bg-color-container);
  --trace-text: var(--td-text-color-primary);
  --trace-muted: var(--td-text-color-secondary);
  --trace-border: color-mix(in srgb, var(--trace-text) 12%, transparent);
  --trace-fill: color-mix(in srgb, var(--trace-text) 6%, transparent);
  --trace-success: #168957;
  --trace-warning: #aa610f;
  --trace-error: #cc4852;
  width: min(610px, calc(100vw - 32px));
  max-height: calc(100vh - 48px);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--trace-border);
  border-radius: 24px;
  background: var(--trace-bg);
  color: var(--trace-text);
  box-shadow: 0 26px 74px rgb(0 0 0 / 24%);
}
.playback-trace.on-player {
  --trace-text: #fff;
  --history-bg: color-mix(in srgb, var(--playback-tint, #323b51) 24%, #191b23);
  --trace-muted: rgb(255 255 255 / 72%);
  --trace-border: rgb(255 255 255 / 14%);
  --trace-fill: rgb(255 255 255 / 8%);
  --trace-success: #a2ecc3;
  --trace-warning: #f7cc97;
  --trace-error: #ffb1b8;
  --trace-bg: linear-gradient(
    145deg,
    color-mix(in srgb, var(--playback-tint, #323b51) 25%, rgb(16 17 22 / 87%)),
    rgb(10 12 18 / 84%) 75%
  );
  backdrop-filter: blur(24px) saturate(145%);
  box-shadow:
    0 28px 86px rgb(0 0 0 / 45%),
    inset 0 1px rgb(255 255 255 / 8%);
  color-scheme: dark;
}
:global(html[data-theme='dark']) .playback-trace {
  --trace-success: #a2ecc3;
  --trace-warning: #f7cc97;
  --trace-error: #ffb1b8;
  color-scheme: dark;
}
.trace-header,
.trace-toolbar,
.step-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.trace-header {
  padding: 17px 23px 13px 26px;
}
.trace-header h2,
.track-info h3,
.trace-toolbar h3 {
  margin: 0;
  font-weight: 650;
}
.trace-header h2 {
  font-size: 16px;
}
.close-button {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border: 0;
  border-radius: 50%;
  font-size: 17px;
  background: var(--trace-fill);
  color: var(--trace-text);
  cursor: pointer;
  transition: background 160ms ease;
}
.close-button:hover {
  background: var(--trace-border);
}
.trace-hero {
  display: flex;
  align-items: center;
  gap: 15px;
  margin: 0 22px;
  padding: 15px;
  border: 1px solid var(--trace-border);
  border-radius: 16px;
  background: var(--trace-fill);
}
.trace-art {
  width: 54px;
  height: 54px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  overflow: hidden;
  border-radius: 11px;
  background: var(--trace-fill);
  font-size: 25px;
}
.trace-art img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.track-info {
  min-width: 0;
  flex: 1;
}
.track-info h3 {
  font-size: clamp(16px, 2.7vw, 22px);
  line-height: 1.3;
}
.track-info h3,
.track-info p {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.track-info p {
  margin: 5px 0 0;
  color: var(--trace-muted);
  font-size: 12px;
}
.track-result {
  display: grid;
  justify-items: end;
  gap: 7px;
  flex: 0 0 auto;
}
.status {
  padding: 3px 7px;
  border-radius: 6px;
  background: var(--trace-fill);
  font-size: 11px;
}
.status[data-status='playing'] {
  color: var(--trace-success);
}
.status[data-status='failed'] {
  color: var(--trace-error);
}
.duration {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--trace-muted);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.trace-toolbar {
  margin: 18px 26px 0;
  padding-bottom: 8px;
  border-bottom: 1px solid var(--trace-border);
}
.trace-toolbar h3 {
  font-size: 13px;
}
.history-trigger {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border: 1px solid var(--trace-border);
  border-radius: 8px;
  color: var(--trace-text);
  background: var(--trace-fill);
  font-size: 12px;
  cursor: pointer;
}
.history-trigger:hover,
.history-trigger[aria-expanded='true'] {
  background: var(--trace-border);
}
.history-count {
  min-width: 16px;
  padding-inline: 3px;
  border-radius: 5px;
  color: var(--trace-muted);
  background: var(--trace-fill);
  font-size: 10px;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
.history-chevron {
  transition: transform 160ms ease;
}
.history-trigger[aria-expanded='true'] .history-chevron {
  transform: rotate(180deg);
}
.history-menu {
  box-sizing: border-box;
  width: min(272px, calc(100vw - 54px));
  border: 1px solid var(--trace-border);
  border-radius: 13px;
  padding: 5px;
  color: var(--trace-text);
  background: var(--history-bg);
  box-shadow: 0 12px 30px rgb(0 0 0 / 22%);
}
.history-list {
  max-height: min(246px, 35vh);
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--trace-border) transparent;
  list-style: none;
  padding: 0;
  margin: 0;
}
.history-entry {
  display: flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  min-height: 42px;
  border: 0;
  padding: 5px 7px;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.history-entry:hover,
.history-entry[aria-current='true'] {
  background: var(--trace-fill);
}
.history-entry:focus-visible {
  outline-offset: -2px;
}
.history-art {
  flex: 0 0 auto;
  width: 26px;
  height: 26px;
  padding: 6px;
  border-radius: 7px;
  color: var(--trace-muted);
  background: var(--trace-fill);
}
.history-entry-copy {
  flex: 1;
  min-width: 0;
  display: grid;
  gap: 2px;
}
.history-title {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-size: 12px;
}
.history-meta {
  color: var(--trace-muted);
  font-size: 11px;
}
.history-meta[data-status='failed'] {
  color: var(--trace-error);
}
.history-check {
  flex: 0 0 auto;
  color: var(--trace-success);
}
@media (prefers-reduced-motion: reduce) {
  .history-chevron {
    transition: none;
  }
}
.trace-scroll {
  min-height: 0;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--trace-border) transparent;
}
.trace-steps {
  margin: 0;
  padding: 13px 26px 23px 33px;
  list-style: none;
}
.trace-steps li {
  position: relative;
  padding: 0 0 15px 17px;
  border-left: 1px solid var(--trace-border);
  --step-dot: var(--trace-muted);
}
.trace-steps li:last-child {
  padding-bottom: 0;
  border-color: transparent;
}
.trace-steps li::before {
  content: '';
  position: absolute;
  top: 6px;
  left: -4px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--step-dot);
}
.trace-steps li[data-type='success'] {
  --step-dot: var(--trace-success);
}
.trace-steps li[data-type='warning'] {
  --step-dot: var(--trace-warning);
}
.trace-steps li[data-type='error'] {
  --step-dot: var(--trace-error);
}
.step-heading {
  align-items: baseline;
  font-size: 13px;
}
.step-heading strong {
  font-weight: 600;
}
.step-heading span {
  flex: 0 0 auto;
  color: var(--trace-muted);
  font-size: 11px;
  font-variant-numeric: tabular-nums;
}
.trace-steps p {
  margin: 4px 0 0;
  color: var(--trace-muted);
  font-size: 12px;
}
.step-labels {
  margin-top: 5px;
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
}
.step-labels span {
  background: var(--trace-fill);
  color: var(--trace-muted);
  border-radius: 5px;
  padding: 2px 6px;
  font-size: 11px;
  overflow-wrap: anywhere;
}
.trace-empty {
  padding: 28px 24px 48px;
}
.on-player .trace-empty :deep(.n-empty__description),
.on-player .trace-empty :deep(.n-empty__icon) {
  color: var(--trace-muted);
}
@media (max-width: 460px) {
  .trace-hero {
    gap: 9px;
    margin-inline: 14px;
    padding: 11px;
  }
  .trace-art {
    width: 42px;
    height: 42px;
  }
  .trace-header,
  .trace-toolbar {
    padding-inline: 16px;
  }
  .trace-toolbar {
    margin-inline: 0;
  }
  .trace-steps {
    padding-inline: 22px 16px;
  }
}
</style>
