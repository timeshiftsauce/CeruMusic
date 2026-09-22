<template>
  <BaseDialog v-model:show="visible" title="分享歌曲" width="480px">
    <div v-if="songInfo" class="share-dialog">
      <!-- 歌曲信息卡片 -->
      <div class="song-card" :class="phase">
        <div class="cover-wrap">
          <img :src="songInfo.img || defaultCover" class="cover" alt="cover" />
          <div class="cover-shine"></div>
        </div>
        <div class="meta">
          <div class="name" :title="songInfo.name">{{ songInfo.name }}</div>
          <div class="singer" :title="songInfo.singer">{{ songInfo.singer }}</div>
          <div v-if="songInfo.albumName" class="album" :title="songInfo.albumName">
            {{ songInfo.albumName }}
          </div>
        </div>
        <!-- 当前阶段右上角小徽章 -->
        <Transition name="badge-pop">
          <span v-if="phase !== 'idle'" :class="['phase-badge', phase]">
            <span class="badge-dot"></span>
            <span class="badge-text">{{ phaseBadgeText }}</span>
          </span>
        </Transition>
      </div>

      <!-- 主面板:idle 显示设置;loading/success/error 显示步骤 -->
      <div class="panel-host">
        <Transition name="panel-swap" mode="out-in">
          <div v-if="phase === 'idle'" key="form" class="form-area">
            <div class="form-row">
              <div class="form-label">
                <span>分享有效期</span>
                <span class="ttl-chip">{{ ttlDays }} 天 · 到期 {{ expiryText }}</span>
              </div>
              <div class="form-content">
                <t-slider
                  v-model="ttlDays"
                  :min="1"
                  :max="7"
                  :step="1"
                  :marks="ttlMarks"
                  :label="'${value} 天'"
                />
              </div>
            </div>
            <ShareConsentBar v-model="consented" />
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

            <!-- 成功后展示海报预览 + 链接 -->
            <Transition name="status-fade">
              <div v-if="phase === 'success' && shareResult?.url" class="success-actions">
                <div class="poster-templates">
                  <button
                    v-for="t in availableTemplates"
                    :key="t.id"
                    type="button"
                    class="tpl-tab"
                    :class="{
                      active: posterTemplate === t.id,
                      disabled: t.id === 'lyric' && !hasLyric
                    }"
                    :disabled="t.id === 'lyric' && !hasLyric"
                    :title="t.description"
                    @click="pickTemplate(t.id as SongPosterTemplate)"
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
import { ref, computed, watch, toRaw } from 'vue'
import { normalizeMusicItem, sameSong } from '@common/musicItem'
import { collectShareComments } from './shareComments'
import { storeToRefs } from 'pinia'
import { MessagePlugin } from 'tdesign-vue-next'
import BaseDialog from '@renderer/components/BaseDialog.vue'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import shareAPI from '@renderer/api/share'
import { useAuthStore } from '@renderer/store'
import ShareConsentBar from './ShareConsentBar.vue'
import { ensureShareResolverUploaded } from './uploadShareResolver'
import defaultCover from '@renderer/assets/images/song.jpg'
import { sanitizeFileName } from '@renderer/utils/file'
import {
  renderSharePoster,
  downloadDataUrl,
  getAvailableTemplates,
  parseLrcToLines,
  type SongPosterTemplate
} from './posterRenderer'

interface Props {
  modelValue: boolean
  song?: any | null
}
const props = withDefaults(defineProps<Props>(), { song: null })
const emit = defineEmits<{ (e: 'update:modelValue', v: boolean): void }>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v)
})

const globalPlayStatus = useGlobalPlayStatusStore()
const localUserStore = LocalUserDetailStore()
const ttlDays = ref(3)
const authStore = useAuthStore()
const consented = ref(false)
const expiryText = computed(() => {
  const date = new Date(Date.now() + ttlDays.value * 86400000)
  return `${date.getMonth() + 1}月${date.getDate()}日 ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
})
const ttlMarks = { 1: '1天', 3: '3天', 5: '5天', 7: '7天' }
const { player } = storeToRefs(globalPlayStatus)

const loading = ref(false)
const statusText = ref('')
const statusType = ref<'info' | 'error' | 'success'>('info')
// 成功生成的分享结果（用于「打开链接 / 再次复制」按钮）
const shareResult = ref<{ id: string; url: string; template: string } | null>(null)

// 海报相关状态
const posterDataUrl = ref<string>('')
const posterLoading = ref(false)
const posterSaving = ref(false)
const posterPreviewOpen = ref(false)
const posterTemplate = ref<SongPosterTemplate>('classic')
const lyricLrc = ref<string>('')

const hasLyric = computed(() => parseLrcToLines(lyricLrc.value).length > 0)
const availableTemplates = computed(() => getAvailableTemplates('song', hasLyric.value))

// 当前分享的歌曲(优先 props.song,回退到当前播放)
const songInfo = computed(() => {
  if (props.song) return props.song
  return player.value.songInfo
})

// ============ 步骤状态机 ============
type StepState = 'pending' | 'active' | 'done' | 'error'
interface Step {
  title: string
  sub: string
  state: StepState
}
const defaultSteps = (): Step[] => [
  { title: '准备播放解析模块', sub: '导出并上传当前音源的播放解析能力', state: 'pending' },
  { title: '收集歌曲元数据', sub: '同步歌词、热评与封面信息', state: 'pending' },
  { title: '生成分享链接', sub: '创建可在网页播放的歌曲链接', state: 'pending' }
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

// 阶段:idle / loading / success / error
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
  if (!songInfo.value) return true
  if (songInfo.value.source === 'local') return true
  if (!consented.value) return true
  return false
})

watch(visible, (v) => {
  if (v) {
    statusText.value = ''
    statusType.value = 'info'
    shareResult.value = null
    posterDataUrl.value = ''
    posterPreviewOpen.value = false
    posterTemplate.value = 'classic'
    lyricLrc.value = ''
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

function handlePrimaryClick() {
  if (phase.value === 'success') {
    const url = shareResult.value?.url
    if (url) window.open(url)
    return
  }
  if (phase.value === 'error') {
    // 重置后重试
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

/** 放大查看海报 */
function openPosterPreview() {
  if (posterDataUrl.value) posterPreviewOpen.value = true
}

/** 保存分享图到本地 */
async function savePoster() {
  if (!posterDataUrl.value) {
    MessagePlugin.warning('海报尚未生成')
    return
  }
  try {
    posterSaving.value = true
    const safeName = sanitizeFileName(songInfo.value?.name || 'share')
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
      type: 'song',
      template: posterTemplate.value,
      title: songInfo.value?.name || '未知歌曲',
      subtitle: songInfo.value?.singer || '未知歌手',
      album: songInfo.value?.albumName,
      cover: songInfo.value?.img || defaultCover,
      shareUrl: result.url,
      expiryText: expiryText.value,
      lyricText: lyricLrc.value
    })
    posterDataUrl.value = dataUrl
  } catch (e) {
    console.warn('生成分享海报失败', e)
  } finally {
    posterLoading.value = false
  }
}

// 切换模板时重新渲染
watch(posterTemplate, () => {
  if (phase.value === 'success' && shareResult.value?.url) {
    void buildPoster({ url: shareResult.value.url })
  }
})

function pickTemplate(id: SongPosterTemplate) {
  if (id === 'lyric' && !hasLyric.value) return
  posterTemplate.value = id
}

/** 找到当前歌曲所用的插件 ID */
async function doShare() {
  if (!consented.value) {
    MessagePlugin.warning('请先完成分享协议确认')
    return
  }
  if (!authStore.isAuthenticated) {
    MessagePlugin.warning('请先登录后再分享')
    return
  }
  if (!songInfo.value || songInfo.value.source === 'local') {
    MessagePlugin.warning('请选择插件提供的歌曲')
    return
  }
  loading.value = true
  resetSteps()
  try {
    const selectedSong = JSON.parse(JSON.stringify(toRaw(songInfo.value)))
    setStep(0, 'active', '导出当前音源的播放解析模块...')
    const resolver = await window.api.share.exportResolver(selectedSong.source, selectedSong)
    const song = normalizeMusicItem({ ...selectedSong, ...resolver.musicInfo })
    const preferred =
      localUserStore.userInfo.sourceQualityMap?.[song.source] ||
      localUserStore.userInfo.selectQuality
    const quality =
      preferred && resolver.qualities.includes(preferred) ? preferred : resolver.qualities[0]
    const uploaded = await ensureShareResolverUploaded(resolver, (message) =>
      setStep(0, 'active', message)
    )
    if (!uploaded) {
      resetSteps()
      setStatus('')
      return
    }
    setStep(0, 'done', '服务器播放解析模块已就绪')
    setStep(1, 'active', '读取歌词与热门评论...')
    const current = player.value.songInfo
    let commentWarning = ''
    const commentsPromise = collectShareComments(
      song,
      {
        song: current,
        comments: player.value.comments.hotList
      },
      (method, input) => window.api.music.requestSdk(method, input)
    ).catch((error) => {
      console.warn('分享热评读取失败:', error)
      commentWarning = '热评读取失败，本次分享未包含热评'
      return []
    })
    let crlyric = sameSong(current, song) ? player.value.lyrics.crlyric : undefined
    if (!crlyric) {
      try {
        crlyric = (
          await window.api.music.requestSdk('getLyric', { source: song.source, songInfo: song })
        )?.crlyric
      } catch {}
    }
    if (crlyric) {
      try {
        const exported = await window.api.music.requestSdk('exportLyrics', {
          source: song.source,
          document: JSON.parse(JSON.stringify(crlyric)),
          format: 'lrc'
        })
        lyricLrc.value = exported.text
      } catch {
        /* Optional lyrics must not prevent a playable share. */
      }
    }
    const hotComments = await commentsPromise
    setStep(1, 'done', commentWarning || `元数据已就绪，已收集 ${hotComments.length} 条热评`)
    setStep(2, 'active', '创建网页分享链接...')
    const result = await shareAPI.create({
      pluginMd5: resolver.md5,
      source: song.source,
      quality,
      ttlDays: ttlDays.value,
      song: {
        ...song,
        songmid: song.songmid ?? song.hash ?? song.id,
        name: song.name,
        singer: song.singer,
        source: song.source
      },
      lyric: lyricLrc.value ? { lrc: lyricLrc.value, format: 'lrc' } : undefined,
      hotComments
    })
    setStep(2, 'done', '分享链接已生成')
    shareResult.value = result
    setStatus('分享成功，打开链接即可在网页播放', 'success')
    if (commentWarning) MessagePlugin.warning(commentWarning)
    void buildPoster(result)
  } catch (error: any) {
    const index = steps.value.findIndex((step) => step.state === 'active')
    if (index >= 0) setStep(index, 'error', error.message)
    setStatus(error.message || '分享失败', 'error')
  } finally {
    loading.value = false
  }
}
</script>

<style lang="scss" scoped>
@use './share-dialog-common.scss' as common;
@include common.share-dialog-styles;
</style>
