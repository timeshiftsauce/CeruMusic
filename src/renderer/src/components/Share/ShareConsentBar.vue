<template>
  <div class="consent-bar" :class="{ collapsed: stage === 'collapsed' }">
    <Transition name="consent-swap" mode="out-in">
      <!-- collapsed: 已记住，显示一行小条 -->
      <div v-if="stage === 'collapsed'" key="collapsed" class="consent-collapsed">
        <span class="consent-check">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
            <path
              d="M3.5 8 L6.8 11.3 L12.5 5.2"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </svg>
        </span>
        <span class="consent-collapsed-text">
          已于 <strong>{{ confirmedAtText }}</strong> 完成合规承诺
        </span>
        <button type="button" class="consent-link" @click="revoke">重新查看 / 撤回</button>
      </div>

      <!-- expanded: 三个 checkbox + 折叠详情 -->
      <div v-else key="expanded" class="consent-expanded">
        <div class="consent-header">
          <span class="consent-icon" aria-hidden="true">⚠</span>
          <span class="consent-title">分享前请逐条确认</span>
        </div>

        <div class="consent-checks">
          <t-checkbox v-model="check1">该插件及音源由我合法取得或已获得授权</t-checkbox>
          <t-checkbox v-model="check2">该插件不包含破解、绕过正版平台验证的代码</t-checkbox>
          <t-checkbox v-model="check3">我了解侵权风险由我个人承担</t-checkbox>
        </div>

        <button
          type="button"
          class="consent-toggle"
          :aria-expanded="detailsOpen"
          @click="detailsOpen = !detailsOpen"
        >
          <span class="consent-toggle-arrow" :class="{ open: detailsOpen }">▾</span>
          查看完整侵权风险与免责声明
        </button>

        <Transition name="consent-fold">
          <div v-if="detailsOpen" class="consent-details">
            <ul class="consent-points">
              <li>软件采用技术中立设计，仅做 302 重定向，不存储或传输音频内容。</li>
              <li>用户上传的插件由用户自主配置，软件方不审核插件内容合法性。</li>
              <li class="warning">
                禁止上传破解、绕过正版平台授权验证的插件，违者将永久封禁账号并配合权利人追责。
              </li>
              <li>因插件侵权产生的一切法律责任，由上传 / 分享该链接的用户独立承担。</li>
              <li>收到权利人合规通知后，软件方将依据避风港原则及时下架对应分享链接。</li>
            </ul>

            <div class="consent-section-title">分享是如何工作的</div>
            <ul class="consent-tech-points">
              <li>
                <strong>插件上传：</strong>
                <span>{{ techPluginUpload }}</span>
              </li>
              <li>
                <strong>元数据：</strong>
                <span>{{ techMetadata }}</span>
              </li>
              <li>
                <strong>音频播放：</strong>
                <span>{{ techAudio }}</span>
              </li>
              <li>
                <strong>歌单分享（默认）：</strong>
                <span>仅生成 </span>
                <code>cerumusic://</code>
                <span>{{ techPlaylistDefault }}</span>
              </li>
              <li>
                <strong>歌单分享（开启网页播放）：</strong>
                <span>{{ techPlaylistPlay }}</span>
              </li>
            </ul>

            <p class="consent-link-row">
              完整法律条款：
              <a href="#" @click.prevent="openLegalDoc">法律声明与免责条款 ↗</a>
            </p>
          </div>
        </Transition>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'

interface Props {
  modelValue: boolean
}
const props = defineProps<Props>()
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const CONSENT_VERSION = 1
const STORAGE_KEY = 'ceru_share_consent'
const LEGAL_DOC_URL =
  'https://ceru.docs.shiqianjiang.cn/#%E6%B3%95%E5%BE%8B%E5%A3%B0%E6%98%8E%E4%B8%8E%E5%85%8D%E8%B4%A3%E6%9D%A1%E6%AC%BE'

const techPluginUpload =
  '你当前使用的音源插件代码会被上传到澜音服务器，按 md5 全局去重保存。服务器对代码做静态危险代码扫描（拦截 fs / child_process / eval 等越权调用）并在隔离 Worker 中运行，但不审核插件本身的音乐版权合法性。'
const techMetadata =
  '歌曲信息、歌词、热评保存于服务器，按你设置的有效期到期自动删除；过期后链接立即失效。'
const techAudio =
  '浏览器请求音频时，服务器临时运行你上传的插件解析出第三方平台直链，以 HTTP 302 重定向让浏览器直接连第三方 CDN——音频流不经过、不缓存、不存储于澜音服务器。能否成功播放、播放的是哪一段音频，完全取决于你提供的插件与第三方平台。'
const techPlaylistDefault =
  ' 协议的导入链接，访问者在澜音 App 中打开导入；不调用任何插件、不解析音频。'
const techPlaylistPlay = '每首歌每次播放都走与单曲分享一致的 302 重定向链路。'

interface ConsentRecord {
  version: number
  timestamp: string
}

const stage = ref<'expanded' | 'collapsed'>('expanded')
const check1 = ref(false)
const check2 = ref(false)
const check3 = ref(false)
const detailsOpen = ref(false)
const confirmedAt = ref<string>('')

const allChecked = computed(() => check1.value && check2.value && check3.value)

const confirmedAtText = computed(() => {
  if (!confirmedAt.value) return ''
  const d = new Date(confirmedAt.value)
  if (Number.isNaN(d.getTime())) return ''
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`
})

function readRecord(): ConsentRecord | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const obj = JSON.parse(raw)
    if (!obj || typeof obj !== 'object') return null
    if (obj.version !== CONSENT_VERSION) return null
    if (typeof obj.timestamp !== 'string') return null
    return obj as ConsentRecord
  } catch {
    return null
  }
}

function writeRecord(): void {
  const record: ConsentRecord = {
    version: CONSENT_VERSION,
    timestamp: new Date().toISOString()
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify(record))
  confirmedAt.value = record.timestamp
}

function clearRecord(): void {
  localStorage.removeItem(STORAGE_KEY)
  confirmedAt.value = ''
}

function revoke(): void {
  clearRecord()
  check1.value = false
  check2.value = false
  check3.value = false
  detailsOpen.value = false
  stage.value = 'expanded'
  if (props.modelValue) emit('update:modelValue', false)
}

function openLegalDoc(): void {
  window.open(LEGAL_DOC_URL)
}

onMounted(() => {
  const rec = readRecord()
  if (rec) {
    stage.value = 'collapsed'
    confirmedAt.value = rec.timestamp
    if (!props.modelValue) emit('update:modelValue', true)
  } else {
    stage.value = 'expanded'
    if (props.modelValue) emit('update:modelValue', false)
  }
})

watch(allChecked, (v) => {
  if (stage.value !== 'expanded') return
  if (v) {
    writeRecord()
    stage.value = 'collapsed'
    emit('update:modelValue', true)
  } else if (props.modelValue) {
    emit('update:modelValue', false)
  }
})
</script>

<style scoped lang="scss">
.consent-bar {
  border-radius: 12px;
  border: 1px solid var(--td-component-stroke, rgba(0, 0, 0, 0.08));
  background: var(--td-bg-color-container-hover, rgba(0, 0, 0, 0.04));
  padding: 12px 14px;
  transition:
    border-color 0.3s ease,
    background-color 0.3s ease,
    padding 0.3s ease;
}

.consent-bar.collapsed {
  padding: 8px 12px;
  border-color: rgba(76, 175, 80, 0.35);
  background: linear-gradient(135deg, rgba(76, 175, 80, 0.1), rgba(76, 175, 80, 0.04));
}

.consent-collapsed {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 12.5px;
  color: var(--td-text-color-secondary, rgba(0, 0, 0, 0.6));
}

.consent-collapsed-text {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  strong {
    color: #2e7d32;
    font-weight: 600;
    margin: 0 2px;
  }
}

.consent-check {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  background: #43a047;
  color: #fff;
  flex-shrink: 0;
}

.consent-link {
  appearance: none;
  border: none;
  background: transparent;
  padding: 2px 6px;
  font-size: 12px;
  color: var(--td-brand-color, #006eff);
  cursor: pointer;
  border-radius: 6px;
  transition: background-color 0.18s ease;
  flex-shrink: 0;

  &:hover {
    background: rgba(0, 110, 255, 0.08);
    text-decoration: underline;
  }
}

.consent-expanded {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.consent-header {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  font-weight: 600;
  color: var(--td-text-color-primary);
}

.consent-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 20px;
  height: 20px;
  border-radius: 50%;
  background: rgba(229, 57, 53, 0.14);
  color: #c62828;
  font-size: 12px;
}

.consent-checks {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding-left: 2px;

  :deep(.t-checkbox) {
    font-size: 12.5px;
    line-height: 1.55;
  }

  :deep(.t-checkbox__label) {
    font-size: 12.5px;
    color: var(--td-text-color-primary);
  }
}

.consent-toggle {
  appearance: none;
  border: none;
  background: transparent;
  padding: 4px 0;
  margin-top: 2px;
  font-size: 12px;
  color: var(--td-text-color-secondary, rgba(0, 0, 0, 0.6));
  cursor: pointer;
  text-align: left;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  align-self: flex-start;
  border-radius: 4px;
  transition: color 0.18s ease;

  &:hover {
    color: var(--td-brand-color, #006eff);
  }
}

.consent-toggle-arrow {
  display: inline-block;
  font-size: 10px;
  transition: transform 0.25s ease;

  &.open {
    transform: rotate(180deg);
  }
}

.consent-details {
  border-top: 1px dashed var(--td-component-stroke, rgba(0, 0, 0, 0.12));
  padding-top: 10px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--td-text-color-secondary, rgba(0, 0, 0, 0.6));
}

.consent-points {
  margin: 0;
  padding-left: 18px;

  li {
    margin-bottom: 4px;

    &:last-child {
      margin-bottom: 0;
    }

    &.warning {
      color: var(--td-error-color, #e53935);
      font-weight: 500;
    }
  }
}

.consent-section-title {
  margin: 12px 0 6px;
  font-size: 12.5px;
  font-weight: 600;
  color: var(--td-text-color-primary);
  letter-spacing: 0.3px;
}

.consent-tech-points {
  margin: 0;
  padding-left: 18px;

  li {
    margin-bottom: 6px;

    &:last-child {
      margin-bottom: 0;
    }

    strong {
      color: var(--td-text-color-primary);
      font-weight: 600;
      margin-right: 2px;
    }

    code {
      display: inline-block;
      padding: 0 4px;
      font-family:
        ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New',
        monospace;
      font-size: 11.5px;
      color: var(--td-brand-color, #006eff);
      background: rgba(0, 110, 255, 0.08);
      border-radius: 4px;
    }
  }
}

.consent-link-row {
  margin: 8px 0 0;
  font-size: 12px;

  a {
    color: var(--td-brand-color, #006eff);
    text-decoration: none;

    &:hover {
      text-decoration: underline;
    }
  }
}

.consent-swap-enter-active,
.consent-swap-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.consent-swap-enter-from {
  opacity: 0;
  transform: translateY(4px);
}
.consent-swap-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

.consent-fold-enter-active,
.consent-fold-leave-active {
  transition:
    opacity 0.22s ease,
    max-height 0.32s ease,
    padding-top 0.22s ease;
  overflow: hidden;
}
.consent-fold-enter-from,
.consent-fold-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
}
.consent-fold-enter-to,
.consent-fold-leave-from {
  opacity: 1;
  max-height: 720px;
}

@media (prefers-reduced-motion: reduce) {
  .consent-swap-enter-active,
  .consent-swap-leave-active,
  .consent-fold-enter-active,
  .consent-fold-leave-active {
    transition: opacity 0.16s ease;
  }
  .consent-swap-enter-from,
  .consent-swap-leave-to,
  .consent-fold-enter-from,
  .consent-fold-leave-to {
    transform: none;
  }
  .consent-toggle-arrow {
    transition: none;
  }
}
</style>
