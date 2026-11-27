<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import {
  MicrophoneIcon,
  AdjustmentIcon,
  ChevronLeftIcon,
  RefreshIcon,
  CloseIcon
} from 'tdesign-icons-vue-next'
import { karaokePacks, modelPhaseLabel, packBytes, type PackId } from '@common/karaoke'
import { desktopBridge } from '@renderer/services/desktopBridge'
import {
  currentDownload,
  karaokeBalance,
  karaokeEnabled,
  karaokeGains,
  karaokeMessage,
  karaokePlaybackError,
  karaokePitch,
  modelDownloads,
  observeKaraokeModel,
  percent,
  retryKaraokePlayback,
  selectedPack,
  selectPack,
  setKaraokeEnabled
} from '@renderer/services/karaoke'

const props = defineProps<{
  show: boolean
  fullScreen: boolean
  rate: number
  anchor?: HTMLElement | null
  casting: boolean
}>()
const emit = defineEmits<{ close: []; downloads: []; rate: [number] }>()
const advanced = ref(false),
  confirmRemove = ref<PackId | null>(null)
const removingPack = ref<PackId | null>(null)
const panel = ref<HTMLElement>(),
  position = ref<Record<string, string>>({ left: '12px', bottom: '86px' })
const notice = ref('')
const installed = computed(() => currentDownload.value.phase === 'ready')
const busy = (phase: string) => ['probing', 'downloading', 'verifying'].includes(phase)
const progress = computed(() => percent(currentDownload.value))
const api = desktopBridge.api.karaoke
const stop = observeKaraokeModel()
function place() {
  if (!props.show || !panel.value) return
  const rect = props.anchor?.isConnected ? props.anchor.getBoundingClientRect() : null
  const gap = 12
  const topInset = props.fullScreen ? 76 : gap
  const anchored = rect && rect.width > 0 && rect.top > 100 && rect.bottom <= window.innerHeight
  const left = Math.max(
    gap,
    Math.min(window.innerWidth - panel.value.offsetWidth - gap, anchored ? rect.left : 20)
  )
  const bottom = anchored
    ? window.innerHeight - rect.top + 10
    : Math.min(86, window.innerHeight / 4)
  position.value = {
    left: `${left}px`,
    bottom: `${bottom}px`,
    maxHeight: `${window.innerHeight - bottom - topInset}px`
  }
}
function outside(e: PointerEvent) {
  if (
    props.show &&
    e.target instanceof Node &&
    !panel.value?.contains(e.target) &&
    !props.anchor?.contains(e.target)
  )
    emit('close')
}
async function action(fn: () => Promise<void>) {
  try {
    notice.value = ''
    await fn()
  } catch (e) {
    notice.value = String(e)
  }
}
function reset() {
  karaokeBalance.value = 0
  karaokePitch.value = 0
  karaokeGains.value = {}
  emit('rate', 1)
}
function setStemGain(name: string, event: Event) {
  karaokeGains.value[name] = (event.target as HTMLInputElement).valueAsNumber
  setKaraokeEnabled(true)
}
async function removePack(id: PackId) {
  if (removingPack.value) return
  confirmRemove.value = null
  removingPack.value = id
  try {
    await action(() => api.remove(id))
  } finally {
    removingPack.value = null
  }
}
function close() {
  emit('close')
  props.anchor?.focus({ preventScroll: true })
}
async function setAdvanced(value: boolean) {
  advanced.value = value
  confirmRemove.value = null
  await nextTick()
  if (!props.show) return
  place()
  panel.value?.focus({ preventScroll: true })
}
watch(
  () => props.show,
  async (open) => {
    if (!open) return
    advanced.value = false
    confirmRemove.value = null
    notice.value = ''
    await nextTick()
    place()
    panel.value?.focus({ preventScroll: true })
  }
)
onMounted(() => {
  window.addEventListener('resize', place)
  document.addEventListener('pointerdown', outside, true)
})
onUnmounted(() => {
  stop()
  window.removeEventListener('resize', place)
  document.removeEventListener('pointerdown', outside, true)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="karaoke-float">
      <section
        v-if="show"
        ref="panel"
        class="karaoke-panel"
        :class="{ glass: fullScreen, expanded: advanced }"
        :style="position"
        tabindex="-1"
        role="dialog"
        :aria-label="advanced ? '伴唱高级调节' : '伴唱模式'"
        @keydown.esc.stop="close"
      >
        <template v-if="!advanced">
          <div class="compact-row">
            <button
              class="mode"
              role="switch"
              :aria-checked="karaokeEnabled"
              aria-label="伴唱模式"
              :disabled="!installed || casting"
              @click="setKaraokeEnabled(!karaokeEnabled)"
            >
              <MicrophoneIcon size="19" />
              <span>伴唱（Beta）</span>
              <i :class="{ on: karaokeEnabled }" />
            </button>
            <div v-if="installed" class="quick-balance">
              <div class="balance-labels" aria-hidden="true">
                <span>人声</span><span>原声</span><span>伴奏</span>
              </div>
              <input
                v-model.number="karaokeBalance"
                type="range"
                min="-100"
                max="100"
                step="1"
                aria-label="声伴比例"
                :disabled="casting"
                @input="setKaraokeEnabled(true)"
              />
            </div>
            <button
              v-else-if="busy(currentDownload.phase)"
              class="download-action"
              @click="emit('downloads')"
            >
              {{ modelPhaseLabel[currentDownload.phase] }} · {{ progress }}%
            </button>
            <button
              v-else
              class="download-action"
              @click="action(() => api.download(selectedPack.id))"
            >
              {{
                currentDownload.phase === 'paused'
                  ? '继续下载'
                  : currentDownload.phase === 'failed'
                    ? '重试下载'
                    : '下载资源包'
              }}
              · {{ (packBytes(selectedPack) / 1e6).toFixed(1) }} MB
            </button>
            <button
              class="icon"
              title="高级调节与资源包"
              aria-label="高级调节与资源包"
              @click="setAdvanced(true)"
            >
              <AdjustmentIcon />
            </button>
          </div>
        </template>
        <template v-else>
          <header>
            <button class="icon" aria-label="返回简洁面板" @click="setAdvanced(false)">
              <ChevronLeftIcon />
            </button>
            <strong>高级调节</strong
            ><button class="reset" @click="reset"><RefreshIcon />重置</button>
            <button class="icon" aria-label="关闭" @click="close"><CloseIcon /></button>
          </header>
          <div class="advanced-body">
            <label class="field"
              ><b>声伴比例</b
              ><input
                v-model.number="karaokeBalance"
                type="range"
                min="-100"
                max="100"
                :disabled="!installed || casting"
                @input="setKaraokeEnabled(true)"
              />
              <small><span>人声</span><span>原声</span><span>伴奏</span></small></label
            >
            <label class="field"
              ><b
                >变速 <em>{{ rate }}×</em></b
              ><input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                :value="rate"
                @input="emit('rate', Number(($event.target as HTMLInputElement).value))"
              />
              <small><span>0.5×</span><span>2×</span></small></label
            >
            <label class="field"
              ><b
                >变调 <em>{{ karaokePitch > 0 ? '+' : '' }}{{ karaokePitch }} 半音</em></b
              >
              <input
                v-model.number="karaokePitch"
                type="range"
                min="-12"
                max="12"
                step="1"
                :disabled="!installed || casting"
                @input="setKaraokeEnabled(true)"
              />
              <small><span>−12</span><span>0</span><span>+12</span></small></label
            >
            <template v-if="installed">
              <h4>分轨音量</h4>
              <label v-for="name in selectedPack.stems" :key="name" class="stem">
                <span>{{ name }}</span
                ><input
                  type="range"
                  min="0"
                  max="100"
                  :aria-label="name + '音量'"
                  :value="karaokeGains[name] ?? 100"
                  :disabled="casting"
                  @input="setStemGain(name, $event)"
                />
                <em>{{ karaokeGains[name] ?? 100 }}%</em>
              </label>
            </template>
            <h4>资源包</h4>
            <div v-for="(pack, i) in karaokePacks" :key="pack.id" class="pack">
              <div>
                <b>{{ pack.name }}</b
                ><small
                  >{{ pack.stems.join(' · ') }} · {{ (packBytes(pack) / 1e6).toFixed(1) }} MB</small
                >
              </div>
              <template v-if="modelDownloads[i].phase === 'ready'">
                <button
                  :disabled="selectedPack.id === pack.id || removingPack === pack.id"
                  @click="selectPack(pack.id)"
                >
                  {{ selectedPack.id === pack.id ? '使用中' : '切换' }}
                </button>
                <button
                  v-if="confirmRemove !== pack.id"
                  :disabled="!!removingPack"
                  @click="confirmRemove = pack.id"
                >
                  {{ removingPack === pack.id ? '正在卸载' : '卸载' }}
                </button>
                <button v-else @click="removePack(pack.id)">确认卸载</button>
              </template>
              <button v-else-if="busy(modelDownloads[i].phase)" @click="emit('downloads')">
                {{ modelPhaseLabel[modelDownloads[i].phase] }} {{ percent(modelDownloads[i]) }}%
              </button>
              <button v-else @click="action(() => api.download(pack.id))">
                {{ modelDownloads[i].phase === 'paused' ? '继续' : '下载' }}
              </button>
            </div>
          </div>
        </template>
        <div v-if="karaokePlaybackError && !casting && !notice" class="panel-status">
          <p role="status" :title="karaokePlaybackError">暂播原声 · {{ karaokePlaybackError }}</p>
          <button @click="retryKaraokePlayback">重试</button>
        </div>
        <div
          v-else-if="notice || casting || karaokeMessage || currentDownload.phase === 'failed'"
          class="panel-status"
        >
          <p role="status">
            {{
              notice || (casting ? '伴唱仅用于本机播放' : karaokeMessage || currentDownload.message)
            }}
          </p>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.karaoke-panel {
  position: fixed;
  z-index: 10002;
  width: min(354px, calc(100vw - 24px));
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 16px;
  background: var(--td-bg-color-container, #fff);
  color: var(--td-text-color-primary, #24252a);
  color-scheme: light;
  backdrop-filter: blur(28px) saturate(130%);
  box-shadow: var(--td-shadow-2, 0 10px 36px #0002);
  outline: none;
  overflow-y: auto;
  --track: var(--td-bg-color-secondarycontainer, #f2f3f5);
  --border: var(--td-component-stroke, #e7e7e7);
  --muted: var(--td-text-color-secondary, #62656c);
  --accent: var(--td-brand-color, #368bab);
  --scroll-thumb: rgba(91, 91, 91, 0.3);
  --scroll-thumb-hover: rgba(91, 91, 91, 0.5);
}
:global(html[data-theme='dark'] .karaoke-panel) {
  color-scheme: dark;
  --scroll-thumb: rgba(255, 255, 255, 0.3);
  --scroll-thumb-hover: rgba(255, 255, 255, 0.5);
}
.karaoke-panel.glass {
  color-scheme: dark;
  color: #fff;
  background: rgba(10, 10, 13, 0.67);
  box-shadow: 0 10px 32px #0004;
  --border: rgba(255, 255, 255, 0.14);
  --track: rgba(255, 255, 255, 0.16);
  --muted: rgba(255, 255, 255, 0.78);
  --accent: #84d0e5;
  --scroll-thumb: rgba(255, 255, 255, 0.3);
  --scroll-thumb-hover: rgba(255, 255, 255, 0.5);
}
.karaoke-panel.expanded {
  width: min(380px, calc(100vw - 24px));
}
.compact-row,
header,
.mode,
.reset,
.pack,
.stem {
  display: flex;
  align-items: center;
  gap: 9px;
}
button {
  cursor: pointer;
  color: inherit;
  background: transparent;
  border: 0;
  font: inherit;
  border-radius: 8px;
  padding: 5px;
}
button:focus-visible,
input:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
button:hover:not(:disabled) {
  background: var(--track);
}
button:disabled {
  opacity: 0.5;
  cursor: default;
}
.mode {
  flex: none;
  gap: 3px;
  font-weight: 600;
  font-size: 12px;
  white-space: nowrap;
}
.mode i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  opacity: 0.32;
  align-self: flex-start;
}
.mode i.on {
  opacity: 1;
  background: var(--accent);
}
.quick-balance,
.download-action {
  flex: 1;
  min-width: 0;
}
.quick-balance {
  background: var(--track);
  border-radius: 10px;
  padding: 5px 10px 4px;
}
.balance-labels,
.field small {
  display: flex;
  justify-content: space-between;
  font-size: 11px;
}
input[type='range'] {
  width: 100%;
  accent-color: var(--accent);
  height: 14px;
  margin: 2px 0 0;
  cursor: pointer;
}
.balance-labels {
  gap: 4px;
  white-space: nowrap;
}
.icon {
  flex: 0 0 30px;
  display: grid;
  place-items: center;
  font-size: 18px;
  width: 30px;
  height: 30px;
}
.download-action {
  background: var(--track);
  font-size: 13px;
  padding: 8px;
}
header {
  padding-bottom: 8px;
}
header strong {
  flex: 1;
}
.reset,
.pack button {
  font-size: 12px;
}
.advanced-body {
  max-height: 470px;
  min-height: 0;
  overflow: auto;
  padding: 2px 8px 5px;
}
.karaoke-panel,
.advanced-body {
  scrollbar-width: thin;
  scrollbar-color: var(--scroll-thumb) transparent;
}
.karaoke-panel::-webkit-scrollbar,
.advanced-body::-webkit-scrollbar {
  width: 8px;
}
.karaoke-panel::-webkit-scrollbar-track,
.advanced-body::-webkit-scrollbar-track {
  background: transparent;
}
.karaoke-panel::-webkit-scrollbar-thumb,
.advanced-body::-webkit-scrollbar-thumb {
  background: var(--scroll-thumb);
  border-radius: 4px;
}
.karaoke-panel::-webkit-scrollbar-thumb:hover,
.advanced-body::-webkit-scrollbar-thumb:hover {
  background: var(--scroll-thumb-hover);
}
.field {
  display: block;
  margin: 12px 0 16px;
}
.field b,
.pack b {
  font-size: 13px;
}
.field input {
  display: block;
  margin: 5px 0 0;
}
em,
small {
  font-style: normal;
  font-weight: 400;
  color: var(--muted);
}
h4 {
  font-size: 13px;
  margin: 16px 0 8px;
}
.stem {
  margin: 7px 0;
  font-size: 12px;
}
.stem span,
.stem em {
  min-width: 34px;
}
.stem em {
  text-align: right;
}
.pack {
  padding: 7px 0;
  border-top: 1px solid var(--track);
  gap: 2px;
}
.pack div {
  flex: 1;
  min-width: 0;
}
.pack small {
  display: block;
  font-size: 10px;
  margin-top: 3px;
}
.panel-status {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 0 5px;
  font-size: 11px;
  color: var(--muted);
}
.panel-status p {
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.panel-status button {
  flex: none;
  color: var(--accent);
}
@media (max-width: 330px) {
  .compact-row {
    gap: 4px;
  }
  .quick-balance {
    padding-inline: 5px;
  }
}
.karaoke-float-enter-active,
.karaoke-float-leave-active {
  transition:
    opacity 0.14s,
    transform 0.14s;
}
.karaoke-float-enter-from,
.karaoke-float-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (prefers-reduced-motion: reduce) {
  .karaoke-float-enter-active,
  .karaoke-float-leave-active {
    transition: none;
  }
}
</style>
