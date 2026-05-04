<template>
  <BaseDialog v-model:show="visible" title="分享歌单" width="520px">
    <div v-if="playlist" class="share-dialog">
      <div class="song-card" :class="phase">
        <div class="cover-wrap">
          <img :src="playlist.coverImgUrl || defaultCover" class="cover" alt="cover" />
          <div class="cover-shine"></div>
        </div>
        <div class="meta">
          <div class="name" :title="playlist.name">{{ playlist.name }}</div>
          <div class="singer">{{ playlist.description || '已同步到云端的本地歌单' }}</div>
          <div class="album">
            {{ songCount }} 首歌曲 · {{ allowWebPlayback ? '支持网页播放' : '仅 App 打开' }}
          </div>
        </div>
        <Transition name="badge-pop">
          <span v-if="phase !== 'idle'" :class="['phase-badge', phase]">
            <span class="badge-dot"></span>
            <span class="badge-text">{{ phaseBadgeText }}</span>
          </span>
        </Transition>
      </div>

      <div class="panel-host">
        <Transition name="panel-swap" mode="out-in">
          <div v-if="phase === 'idle'" key="form" class="form-area">
            <div class="toggle-row">
              <div class="toggle-main">
                <div class="toggle-title">允许网页在线播放</div>
                <div class="toggle-sub">
                  关闭后，分享页仍可打开歌单并在澜音中导入，但不会提供网页播放。
                </div>
              </div>
              <t-switch v-model="allowWebPlayback" />
            </div>

            <div class="form-row" :class="{ disabled: !allowWebPlayback }">
              <div class="form-label">
                <span>播放有效期</span>
                <Transition name="chip-swap" mode="out-in">
                  <span :key="ttlDays" class="ttl-chip">
                    <span class="dot"></span>
                    到期 <strong>{{ expiryText }}</strong>
                  </span>
                </Transition>
              </div>
              <div class="form-content">
                <t-slider
                  v-model="ttlDays"
                  :min="1"
                  :max="7"
                  :step="1"
                  :marks="ttlMarks"
                  :disabled="!allowWebPlayback"
                />
              </div>
            </div>

            <ShareConsentBar v-if="allowWebPlayback" v-model="consented" />
          </div>

          <div v-else key="steps" class="steps-area">
            <ol class="step-ladder">
              <li
                v-for="(s, i) in steps"
                :key="i"
                :class="['step', s.state, { last: i === steps.length - 1 }]"
              >
                <div class="marker">
                  <span class="dot">
                    <svg
                      v-if="s.state === 'done'"
                      class="icon-svg check"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path
                        d="M3.5 8 L6.8 11.3 L12.5 5.2"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                        stroke-linejoin="round"
                      />
                    </svg>
                    <svg
                      v-else-if="s.state === 'error'"
                      class="icon-svg cross"
                      viewBox="0 0 16 16"
                      aria-hidden="true"
                    >
                      <path
                        d="M5 5 L11 11 M11 5 L5 11"
                        fill="none"
                        stroke="currentColor"
                        stroke-width="2"
                        stroke-linecap="round"
                      />
                    </svg>
                    <span v-else-if="s.state === 'active'" class="spinner-dot"></span>
                  </span>
                </div>
                <div class="body">
                  <div class="title">
                    {{ s.title }}
                    <span v-if="s.state === 'active'" class="active-shimmer"></span>
                  </div>
                  <div class="sub-wrap">
                    <Transition name="sub" mode="out-in">
                      <div :key="s.sub" class="sub">{{ s.sub }}</div>
                    </Transition>
                  </div>
                </div>
              </li>
            </ol>

            <Transition name="status-fade">
              <div v-if="phase === 'success' || phase === 'error'" :class="['final-banner', phase]">
                <span class="banner-glyph">
                  <svg
                    v-if="phase === 'success'"
                    viewBox="0 0 16 16"
                    width="14"
                    height="14"
                    aria-hidden="true"
                  >
                    <path
                      d="M3.5 8 L6.8 11.3 L12.5 5.2"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                  <svg v-else viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
                    <path
                      d="M8 4 V9 M8 11.5 V12"
                      fill="none"
                      stroke="currentColor"
                      stroke-width="2"
                      stroke-linecap="round"
                    />
                  </svg>
                </span>
                <span class="banner-text">{{ statusText }}</span>
              </div>
            </Transition>

            <Transition name="status-fade">
              <div v-if="phase === 'success' && shareResult?.url" class="success-actions">
                <div class="poster-templates">
                  <button
                    v-for="t in availableTemplates"
                    :key="t.id"
                    type="button"
                    class="tpl-tab"
                    :class="{ active: posterTemplate === t.id }"
                    :title="t.description"
                    @click="pickTemplate(t.id as PlaylistPosterTemplate)"
                  >
                    {{ t.label }}
                  </button>
                </div>

                <div class="poster-preview" :class="{ loading: posterLoading }">
                  <img
                    v-if="posterDataUrl"
                    :src="posterDataUrl"
                    alt="share poster"
                    @click="openPosterPreview"
                  />
                  <div v-else class="poster-placeholder">
                    <span class="spinner-dot"></span>
                    <span class="poster-tip">正在生成海报…</span>
                  </div>
                </div>

                <div class="link-row">
                  <div class="link-text" :title="shareResult.url">{{ shareResult.url }}</div>
                  <t-button
                    theme="default"
                    variant="outline"
                    size="small"
                    class="link-copy-btn"
                    @click="copyShareUrl"
                  >
                    复制
                  </t-button>
                </div>
              </div>
            </Transition>
          </div>
        </Transition>
      </div>
    </div>

    <template #action>
      <t-button theme="default" :disabled="loading" @click="handleClose">
        {{ phase === 'success' ? '关闭' : '取消' }}
      </t-button>
      <template v-if="phase === 'success'">
        <t-button
          theme="default"
          variant="outline"
          :disabled="!shareResult?.url"
          @click="copyShareLink"
        >
          复制链接
        </t-button>
        <t-button
          theme="primary"
          :loading="posterSaving"
          :disabled="!posterDataUrl"
          @click="savePoster"
        >
          保存分享图
        </t-button>
      </template>
      <t-button
        v-else
        theme="primary"
        :loading="phase === 'loading'"
        :disabled="primaryBtnDisabled"
        @click="handlePrimaryClick"
      >
        {{ primaryBtnText }}
      </t-button>
    </template>
  </BaseDialog>

  <Teleport to="body">
    <Transition name="bd-fade">
      <div v-if="posterPreviewOpen" class="poster-zoom-overlay" @click="posterPreviewOpen = false">
        <img :src="posterDataUrl" alt="share poster" class="poster-zoom-img" @click.stop />
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import BaseDialog from '@renderer/components/BaseDialog.vue'
import shareAPI from '@renderer/api/share'
import defaultCover from '@renderer/assets/images/song.jpg'
import { sanitizeFileName } from '@renderer/utils/file'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import ShareConsentBar from './ShareConsentBar.vue'
import {
  renderSharePoster,
  downloadDataUrl,
  getAvailableTemplates,
  type PlaylistPosterTemplate
} from './posterRenderer'

interface PlaylistItem {
  id: string
  name: string
  description: string
  coverImgUrl: string
  meta: Record<string, any>
}

interface Props {
  modelValue: boolean
  playlist?: PlaylistItem | null
  songCount?: number
}
const props = withDefaults(defineProps<Props>(), { playlist: null, songCount: 0 })
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const localUserStore = LocalUserDetailStore()
const ttlDays = ref(3)
const ttlMarks = { 1: '1天', 3: '3天', 5: '5天', 7: '7天' }
const allowWebPlayback = ref(true)
const loading = ref(false)
const statusText = ref('')
const statusType = ref<'info' | 'error' | 'success'>('info')
const consented = ref(false)
const shareResult = ref<{ id: string; url: string; template: string } | null>(null)

// 海报相关状态
const posterDataUrl = ref<string>('')
const posterLoading = ref(false)
const posterSaving = ref(false)
const posterPreviewOpen = ref(false)
const posterTemplate = ref<PlaylistPosterTemplate>('classic')

const availableTemplates = computed(() => getAvailableTemplates('playlist', false))

const playlist = computed(() => props.playlist)
const songCount = computed(() => props.songCount || 0)

type StepState = 'pending' | 'active' | 'done' | 'error'
interface Step {
  title: string
  sub: string
  state: StepState
}
const defaultSteps = (): Step[] => [
  { title: '核对云端歌单', sub: '确认歌单已上传并可用于分享', state: 'pending' },
  { title: '校验网页播放能力', sub: '按你的设置决定是否校验插件与在线播放', state: 'pending' },
  { title: '生成分享链接', sub: '创建歌单分享并生成可分享的链接', state: 'pending' }
]
const steps = ref<Step[]>(defaultSteps())

function setStep(idx: number, state: StepState, sub?: string) {
  const s = steps.value[idx]
  if (!s) return
  s.state = state
  if (sub !== undefined) s.sub = sub
}
function resetSteps() {
  steps.value = defaultSteps()
}

const phase = computed<'idle' | 'loading' | 'success' | 'error'>(() => {
  if (loading.value) return 'loading'
  if (statusType.value === 'success' && statusText.value) return 'success'
  if (statusType.value === 'error' && statusText.value) return 'error'
  return 'idle'
})

const phaseBadgeText = computed(() => {
  switch (phase.value) {
    case 'loading':
      return '生成中'
    case 'success':
      return '已就绪'
    case 'error':
      return '已中断'
    default:
      return ''
  }
})

const primaryBtnText = computed(() => {
  switch (phase.value) {
    case 'loading':
      return '生成中…'
    case 'success':
      return '打开链接'
    case 'error':
      return '重试'
    default:
      return '生成分享'
  }
})

const primaryBtnDisabled = computed(() => {
  if (loading.value) return true
  if (phase.value === 'success') return !shareResult.value?.url
  if (!playlist.value?.meta?.cloudId) return true
  if (allowWebPlayback.value && !consented.value) return true
  return false
})

const expiryText = computed(() => {
  const d = new Date(Date.now() + ttlDays.value * 24 * 60 * 60 * 1000)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`
})

watch(visible, (v) => {
  if (v) {
    statusText.value = ''
    statusType.value = 'info'
    shareResult.value = null
    allowWebPlayback.value = true
    ttlDays.value = 3
    posterDataUrl.value = ''
    posterPreviewOpen.value = false
    posterTemplate.value = 'classic'
    resetSteps()
  }
})

function setStatus(text: string, type: 'info' | 'error' | 'success' = 'info') {
  statusText.value = text
  statusType.value = type
}

function handleClose() {
  if (loading.value) return
  visible.value = false
}

function resolvePluginId(): string | null {
  const pluginId = (localUserStore.userInfo as any)?.pluginId || localUserStore.userSource.pluginId
  return pluginId || null
}

function handlePrimaryClick() {
  if (phase.value === 'success') {
    const url = shareResult.value?.url
    if (url) window.open(url)
    return
  }
  if (phase.value === 'error') {
    statusText.value = ''
    statusType.value = 'info'
    shareResult.value = null
    posterDataUrl.value = ''
    resetSteps()
  }
  doShare()
}

/** 复制纯链接（顶部链接行的小按钮） */
async function copyShareUrl() {
  const url = shareResult.value?.url
  if (!url) return
  try {
    await navigator.clipboard.writeText(url)
    MessagePlugin.success('链接已复制')
  } catch {
    MessagePlugin.warning(`复制失败，请手动复制：${url}`)
  }
}

/** 复制完整分享文案（底部主按钮：复制链接） */
async function copyShareLink() {
  const tpl = shareResult.value?.template || shareResult.value?.url
  if (!tpl) return
  try {
    await navigator.clipboard.writeText(tpl)
    MessagePlugin.success('分享文案已复制到剪贴板')
  } catch {
    MessagePlugin.warning(`复制失败，请手动复制：${shareResult.value?.url || ''}`)
  }
}

function openPosterPreview() {
  if (posterDataUrl.value) posterPreviewOpen.value = true
}

async function savePoster() {
  if (!posterDataUrl.value) {
    MessagePlugin.warning('海报尚未生成')
    return
  }
  try {
    posterSaving.value = true
    const safeName = sanitizeFileName(playlist.value?.name || 'playlist')
    downloadDataUrl(posterDataUrl.value, `${safeName}-分享.png`)
    MessagePlugin.success('已保存分享图')
  } catch (e: any) {
    MessagePlugin.error(e?.message || '保存失败')
  } finally {
    posterSaving.value = false
  }
}

async function buildPoster(result: { url: string }) {
  posterLoading.value = true
  posterDataUrl.value = ''
  try {
    const dataUrl = await renderSharePoster({
      type: 'playlist',
      template: posterTemplate.value,
      title: playlist.value?.name || '未命名歌单',
      subtitle: playlist.value?.description || '已同步到云端的本地歌单',
      cover: playlist.value?.coverImgUrl || defaultCover,
      shareUrl: result.url,
      songCount: songCount.value,
      expiryText: allowWebPlayback.value ? expiryText.value : undefined
    })
    posterDataUrl.value = dataUrl
  } catch (e) {
    console.warn('生成分享海报失败', e)
  } finally {
    posterLoading.value = false
  }
}

watch(posterTemplate, () => {
  if (phase.value === 'success' && shareResult.value?.url) {
    void buildPoster({ url: shareResult.value.url })
  }
})

function pickTemplate(id: PlaylistPosterTemplate) {
  posterTemplate.value = id
}

async function doShare() {
  if (!playlist.value?.meta?.cloudId) {
    MessagePlugin.warning('请先上传到云端后再分享')
    return
  }

  loading.value = true
  setStatus('准备分享...')
  resetSteps()

  try {
    setStep(0, 'active', '正在确认云端歌单信息...')
    setStep(0, 'done', '云端歌单可用于分享')

    let pluginMd5: string | undefined
    let quality: string | undefined
    if (allowWebPlayback.value) {
      setStep(1, 'active', '正在检查音源插件...')
      const pluginId = resolvePluginId()
      if (!pluginId) {
        throw new Error('未找到当前音源插件，请先配置音源后再开启网页播放')
      }
      const codeRes = await window.api.share.getPluginCodeAndMd5(pluginId)
      if ('error' in codeRes) {
        throw new Error(codeRes.error)
      }
      pluginMd5 = codeRes.md5
      quality = (localUserStore.userSource?.quality as string) || '128k'
      const pre = await shareAPI.precheck({ pluginMd5 })
      if (!pre?.hasPlugin) {
        const uploadRes = await shareAPI.uploadPlugin({
          pluginCode: codeRes.code,
          md5: codeRes.md5,
          type: codeRes.type
        })
        if (!uploadRes?.ok) {
          throw new Error(uploadRes?.message || '上传插件失败')
        }
      }
      setStep(1, 'done', '网页播放校验通过')
    } else {
      setStep(1, 'done', '已关闭网页播放，仅生成歌单分享页')
    }

    setStep(2, 'active', '正在创建歌单分享...')
    const result = await shareAPI.createPlaylist({
      cloudPlaylistId: playlist.value.meta.cloudId,
      allowWebPlayback: allowWebPlayback.value,
      ttlDays: allowWebPlayback.value ? ttlDays.value : undefined,
      pluginMd5,
      quality
    })

    if (!result?.template || !result?.url) {
      setStep(2, 'error', '链接生成失败')
      throw new Error('生成分享失败，请稍后再试')
    }

    setStep(2, 'done', '分享链接已生成')
    shareResult.value = result
    setStatus('分享成功！', 'success')

    // 异步生成海报，不阻塞成功状态
    void buildPoster(result)
  } catch (e: any) {
    console.error('分享歌单失败', e)
    const activeIdx = steps.value.findIndex((s) => s.state === 'active')
    if (activeIdx >= 0) setStep(activeIdx, 'error', e?.message || '分享失败')
    setStatus(e?.message || '分享失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@use './share-dialog-common.scss' as common;
@include common.share-dialog-styles;

.toggle-row {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 14px;
  border-radius: 12px;
  background: var(--td-bg-color-container-hover, rgba(0, 0, 0, 0.04));
  border: 1px solid var(--td-component-stroke, rgba(0, 0, 0, 0.06));
}
.toggle-main {
  flex: 1;
  min-width: 0;
}
.toggle-title {
  font-size: 14px;
  font-weight: 600;
}
.toggle-sub {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  opacity: 0.68;
}
.form-row.disabled {
  opacity: 0.55;
}
</style>
