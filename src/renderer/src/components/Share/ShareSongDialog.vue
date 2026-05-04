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
                <span>有效期</span>
                <Transition name="chip-swap" mode="out-in">
                  <span :key="ttlDays" class="ttl-chip">
                    <span class="dot"></span>
                    到期 <strong>{{ expiryText }}</strong>
                  </span>
                </Transition>
              </div>
              <div class="form-content">
                <t-slider v-model="ttlDays" :min="1" :max="7" :step="1" :marks="ttlMarks" />
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
        <t-button theme="default" variant="outline" :disabled="!shareResult?.url" @click="copyShareLink">
          复制链接
        </t-button>
        <t-button theme="primary" :loading="posterSaving" :disabled="!posterDataUrl" @click="savePoster">
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
import { storeToRefs } from 'pinia'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import BaseDialog from '@renderer/components/BaseDialog.vue'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { useAuthStore } from '@renderer/store'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import shareAPI from '@renderer/api/share'
import defaultCover from '@renderer/assets/images/song.jpg'
import { sanitizeFileName } from '@renderer/utils/file'
import ShareConsentBar from './ShareConsentBar.vue'
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
const { player } = storeToRefs(globalPlayStatus)
const authStore = useAuthStore()
const localUserStore = LocalUserDetailStore()

const ttlDays = ref(3)
const ttlMarks = { 1: '1天', 3: '3天', 5: '5天', 7: '7天' }
const loading = ref(false)
const statusText = ref('')
const statusType = ref<'info' | 'error' | 'success'>('info')
const consented = ref(false)
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
  { title: '核对音源插件', sub: '检查后端是否已存在该插件', state: 'pending' },
  { title: '收集歌曲元数据', sub: '同步歌词、热评与封面信息', state: 'pending' },
  { title: '生成分享链接', sub: '上传至云端并生成可分享的链接', state: 'pending' }
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

// 到期时间预览
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
function resolvePluginId(): string | null {
  // 服务插件歌曲
  const servicePluginId = (songInfo.value as any)?._servicePluginId
  if (servicePluginId) return servicePluginId
  // 普通音源插件:从用户配置中拿当前选中插件
  const pluginId = (localUserStore.userInfo as any)?.pluginId
  if (pluginId) return pluginId
  return null
}

async function ensurePluginUploaded(
  pluginCode: string,
  md5: string,
  type: 'cr' | 'lx'
): Promise<boolean> {
  // 1) 先 precheck
  setStatus('正在检查音源插件...')
  setStep(0, 'active', '校验音源插件指纹...')
  const pre = await shareAPI.precheck({ pluginMd5: md5 })
  if (pre?.hasPlugin) return true

  // 2) 弹确认(zIndex 必须高于 BaseDialog 的 999999)
  return new Promise((resolve) => {
    setStep(0, 'active', '需要上传当前音源插件,等待确认...')
    const confirm = DialogPlugin.confirm({
      header: '需要上传当前音源插件',
      body: '为了让分享链接在网页上播放歌曲，需要将您当前使用的音源插件上传到澜音服务端（仅用于分享解析，不会公开）。是否继续？',
      confirmBtn: '继续上传',
      cancelBtn: '取消',
      zIndex: 1000010,
      onConfirm: async () => {
        try {
          setStatus('正在上传音源插件...')
          setStep(0, 'active', '正在上传插件到云端...')
          const r = await shareAPI.uploadPlugin({ pluginCode, md5, type })
          if (r?.ok) {
            confirm.destroy()
            resolve(true)
          } else {
            setStatus(r?.message || '上传插件失败', 'error')
            confirm.destroy()
            resolve(false)
          }
        } catch (e: any) {
          setStatus(e?.message || '上传插件失败', 'error')
          confirm.destroy()
          resolve(false)
        }
      },
      onCancel: () => {
        confirm.destroy()
        resolve(false)
      },
      onClose: () => {
        confirm.destroy()
        resolve(false)
      }
    })
  })
}

async function doShare() {
  if (!authStore.isAuthenticated) {
    MessagePlugin.warning('请先登录后再分享')
    return
  }
  if (!songInfo.value) return
  if (songInfo.value.source === 'local') {
    MessagePlugin.warning('本地歌曲暂不支持分享')
    return
  }

  loading.value = true
  setStatus('准备分享...')
  resetSteps()
  setStep(0, 'active', '读取当前音源插件...')

  try {
    // 1) 获取插件源码 + md5
    const pluginId = resolvePluginId()
    if (!pluginId) {
      setStep(0, 'error', '未找到当前音源插件')
      setStatus('未找到当前音源插件，请先选择音源后重试', 'error')
      loading.value = false
      return
    }
    setStatus('读取插件指纹...')
    setStep(0, 'active', '解析插件指纹...')
    const codeRes = await window.api.share.getPluginCodeAndMd5(pluginId)
    if ('error' in codeRes) {
      setStep(0, 'error', codeRes.error)
      setStatus(codeRes.error, 'error')
      loading.value = false
      return
    }
    const { code, md5, type } = codeRes

    // 2) 确保后端有插件
    const ok = await ensurePluginUploaded(code, md5, type)
    if (!ok) {
      if (statusType.value !== 'error') {
        setStep(0, 'error', '已取消上传')
        setStatus('已取消分享', 'info')
      } else {
        setStep(0, 'error', statusText.value || '插件上传失败')
      }
      loading.value = false
      return
    }
    setStep(0, 'done', '插件已就绪')

    // 3) 准备 hotComments + lyric:
    //    - 若分享目标 === 当前播放歌曲 → 直接用 store 已有数据
    //    - 否则 → 通过音源 SDK 主动拉取(避免拿错别的歌的内容)
    const playing = player.value.songInfo as any
    const isSameAsPlaying =
      !!playing &&
      String(playing.songmid || '') === String(songInfo.value.songmid || '') &&
      String(playing.source || '') === String(songInfo.value.source || '')

    let hotComments: any[] = []
    let lyric: any = {}

    setStep(1, 'active', isSameAsPlaying ? '使用当前播放器缓存数据' : '正在拉取歌词与热评...')

    if (isSameAsPlaying) {
      hotComments = (player.value.comments?.hotList || []).slice(0, 10).map((c: any) => ({
        userName: c.userName,
        avatar: c.avatar,
        text: c.text,
        likedCount: c.likedCount || 0,
        timeStr: c.timeStr,
        location: c.location
      }))

      const rawLyric = (player.value.lyrics as any)?.raw || {}
      lyric = {
        lrc: rawLyric.lrc,
        yrc: rawLyric.yrc,
        qrc: rawLyric.qrc,
        ttml: rawLyric.ttml,
        trans: rawLyric.trans,
        format: rawLyric.format
      }
      lyricLrc.value = rawLyric.lrc || ''
    } else {
      // 主动 SDK 拉取
      setStatus('正在获取歌词与评论...')
      const src = songInfo.value.source
      // 脱响应式以让 IPC 结构化克隆通过
      const cleanSong = toRaw(songInfo.value)

      setStep(1, 'active', '正在拉取歌词与热评...')
      const [lyricRes, cmtRes] = await Promise.allSettled([
        window.api.music.requestSdk('getLyric', {
          source: src,
          songInfo: cleanSong,
          grepLyricInfo: false,
          useStrictMode: false
        }),
        window.api.music.requestSdk('getHotComment', {
          source: src,
          songInfo: cleanSong,
          page: 1,
          limit: 10
        })
      ])

      // 歌词处理
      if (lyricRes.status === 'fulfilled') {
        const lyricData: any = lyricRes.value
        if (lyricData && !lyricData.error) {
          const cr = lyricData.crlyric || lyricData.cr_lyric || null
          const std = lyricData.lyric || lyricData.lrc || null
          const trans = lyricData.tlyric || null
          let format: string | undefined
          if (cr) {
            format = src === 'tx' ? 'qrc' : 'yrc'
          } else if (std) {
            format = 'lrc'
          }
          lyric = {
            lrc: std || undefined,
            yrc: src === 'wy' ? cr || undefined : undefined,
            qrc: src === 'tx' ? cr || undefined : undefined,
            ...(cr && src !== 'wy' && src !== 'tx' ? { yrc: cr } : {}),
            trans: trans || undefined,
            format
          }
          lyricLrc.value = std || ''
          if (!std && !cr) {
            setStatus('该歌曲未找到歌词,继续分享...', 'info')
          }
        } else if (lyricData?.error) {
          setStatus(`歌词获取失败:${lyricData.error},继续分享...`, 'info')
        }
      } else {
        console.warn('share: getLyric failed', lyricRes.reason)
        setStatus(`歌词获取失败:${lyricRes.reason?.message || lyricRes.reason},继续分享...`, 'info')
      }

      // 热评处理
      if (cmtRes.status === 'fulfilled') {
        const cmt: any = cmtRes.value
        if (cmt?.comments?.length) {
          hotComments = cmt.comments.slice(0, 10).map((c: any) => ({
            userName: c.userName,
            avatar: c.avatar,
            text: c.text,
            likedCount: c.likedCount || 0,
            timeStr: c.timeStr,
            location: c.location
          }))
        }
      } else {
        console.warn('share: getHotComment failed', cmtRes.reason)
        setStatus(`热评获取失败:${cmtRes.reason?.message || cmtRes.reason},继续分享...`, 'info')
      }
    }
    setStep(
      1,
      'done',
      hotComments.length > 0 ? `已收集 ${hotComments.length} 条热评` : '元数据收集完成'
    )

    setStatus('正在生成分享链接...')
    setStep(2, 'active', '上传至云端...')
    const result = await shareAPI.create({
      pluginMd5: md5,
      source: songInfo.value.source,
      ttlDays: ttlDays.value,
      song: {
        songmid: songInfo.value.songmid,
        hash: songInfo.value.hash,
        name: songInfo.value.name,
        singer: songInfo.value.singer,
        albumName: songInfo.value.albumName,
        albumId: songInfo.value.albumId,
        source: songInfo.value.source,
        interval: songInfo.value.interval,
        img: songInfo.value.img,
        types: songInfo.value.types,
        _types: songInfo.value._types
      },
      lyric,
      hotComments
    })

    if (!result?.template || !result?.url) {
      setStep(2, 'error', '链接生成失败')
      setStatus('生成分享失败，请稍后再试', 'error')
      loading.value = false
      return
    }

    setStep(2, 'done', '分享链接已生成')
    shareResult.value = result
    setStatus('分享成功！', 'success')

    // 异步生成海报，不阻塞成功状态
    void buildPoster(result)
  } catch (e: any) {
    console.error('分享失败', e)
    // 找到当前 active 的 step,标记为 error
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
</style>
