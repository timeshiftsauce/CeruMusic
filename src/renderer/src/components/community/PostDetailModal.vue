<script setup lang="ts">
import { songKey } from '@common/musicItem'
/**
 * 帖子详情弹窗 —— 小红书风格全屏 modal
 *
 * 布局:
 *  - 左侧 60%: 图片轮播(无图时显示渐变文本块)
 *  - 右侧 40%: 作者头像/昵称 -> 正文 -> 附件(歌单/单曲) -> 评论列表 -> 评论输入 + 操作栏
 *  - 底部操作栏: 点赞 / 评论数 / 举报(仅他人帖子)
 *  - 右上角: ⋯ 二级菜单(自己的帖子: 编辑/删除;他人帖子: 举报) + 关闭
 *
 * 数据:
 *  - 进入时:GET /community/posts/:id + GET /community/posts/:id/comments
 *  - 点赞/评论后本地乐观更新计数,失败回滚
 *  - 作者编辑:复用 PostCreateDialog(editPost 模式),保存走 PATCH /community/posts/:id
 */
import { ref, computed, onMounted, onUnmounted, toRaw, watch } from 'vue'
import { useRouter } from 'vue-router'
import { MessagePlugin, DialogPlugin } from 'tdesign-vue-next'
import gsap from 'gsap'
import {
  CloseIcon,
  HeartIcon,
  HeartFilledIcon,
  ChatIcon,
  ErrorCircleIcon,
  DeleteIcon,
  EditIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayCircleIcon,
  AddIcon
} from 'tdesign-icons-vue-next'
import { communityAPI, type CommunityPost, type CommunityComment } from '@renderer/api/community'
import { useAuthStore } from '@renderer/store/Auth'
import { ossAvatar, ossDetail } from '@renderer/utils/ossImage'
import { showSupportNotice } from '@renderer/utils/communitySupport'
import songListAPI from '@renderer/api/songList'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import { usePostAttachmentCover } from './usePostAttachmentCover'
import TextNoteCover from './TextNoteCover.vue'
import PostCreateDialog from './PostCreateDialog.vue'

/** 无归属地 / 解析失败时统一展示的文案 */
const IP_LOCATION_FALLBACK = '澜星'

const props = defineProps<{
  postId: string
  initialReplyTo?: { commentId: string; username: string }
  /**
   * 列表里已有的完整 post 数据 —— modal mount 瞬间立即显示,
   * 之后 loadPost() 异步刷新最新点赞/评论数。
   */
  initialPost?: CommunityPost | null
  navigationDirection?: -1 | 0 | 1
  exitDirection?: -1 | 0 | 1
  pairedTransition?: boolean
  getAdjacentPost?: (direction: -1 | 1) => Promise<CommunityPost | null>
  getPostAt?: (index: number) => Promise<CommunityPost | null>
  postIndex?: number
  /**
   * 一镜到底动画的源矩形 —— 点击卡片时记录的卡片视口位置/尺寸,
   * GSAP FLIP 用它把 modal 容器"压缩"到卡片位置作为打开起点。
   */
  origin?: { x: number; y: number; w: number; h: number } | null
}>()

const authStore = useAuthStore()

function requireLogin(): boolean {
  if (authStore.isAuthenticated) return true
  MessagePlugin.warning('未登录，请先登录')
  return false
}

const emit = defineEmits<{
  close: []
  updated: [post: CommunityPost]
  removed: [id: string]
  navigate: [post: CommunityPost, direction: -1 | 1]
  departed: [id: string]
}>()

/* ============================================================
 *  一镜到底动画 —— GSAP timeline 编排
 *
 *  打开(450ms):
 *    1. mask: opacity 0->1                                    (power2.out)
 *    2. modal 容器: FLIP 从 origin 矩形展开到中央 + opacity   (expo.out)
 *       · 整个 modal 内的子元素被一起缩放,视觉 = 卡片放大成 dialog
 *    两条 tween 同步起落
 *
 *  关闭反向:
 *    · modal 缩回 origin + 渐隐 + mask 渐隐
 *    · onComplete 后 emit 'close',父组件卸载 modal
 *
 *  没有 origin 时退化为中心 scale 0.92->1。
 * ============================================================ */
const maskEl = ref<HTMLElement | null>(null)
const modalEl = ref<HTMLElement | null>(null)
const closing = ref(false)
const switching = ref(false)
const navigationHint = ref('')
const SLIDE_DURATION = 0.48
let motion: gsap.core.Timeline | null = null
let disposed = false
let opening = true
let hintTimer: ReturnType<typeof setTimeout> | undefined
let wheelTotal = 0
let lastWheelAt = performance.now()
const WHEEL_DISTANCE = 80
const imageDirection = ref<1 | -1>(1)
const imageTransition = computed(() =>
  imageDirection.value > 0 ? 'image-slide-next' : 'image-slide-prev'
)
/** 首图不播翻页滑入动画 —— 它是预加载完成后异步插入的,若走 Transition 会看起来像自动翻页;
 * 只有用户主动切图(箭头 / 滚轮 / 圆点)才启用 image-slide 过渡 */
const imageSwitchAnimated = ref(false)
const commentsSection = ref<HTMLElement | null>(null)

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function showNavigationHint(text: string) {
  clearTimeout(hintTimer)
  navigationHint.value = text
  hintTimer = setTimeout(() => (navigationHint.value = ''), 1800)
}

async function onWheel(event: WheelEvent) {
  const target = event.target as HTMLElement
  const isImageArea = Boolean(target.closest('.left'))
  const isContentArea = Boolean(target.closest('.content-area'))
  const isInsideModal = Boolean(target.closest('.post-modal'))
  const canNavigate =
    !isInsideModal || isImageArea || Boolean(target.closest('.author, .action-bar'))
  if (
    event.ctrlKey ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
    !canNavigate ||
    isContentArea
  ) {
    wheelTotal = 0
    return
  }

  // 遮罩空白、图片、标题栏和操作栏可翻页；正文保留原生滚动。
  // 图片区滚动切图、其余可翻页区域切笔记，具体分发见下方判断。
  event.preventDefault()
  const now = performance.now()
  if (now - lastWheelAt > 100) {
    wheelTotal = 0
  }
  lastWheelAt = now
  if (
    opening ||
    closing.value ||
    switching.value ||
    reportVisible.value ||
    showEdit.value ||
    submittingComment.value ||
    document.activeElement?.matches('input, textarea, [contenteditable="true"]')
  ) {
    // 划入/划出期间的距离不排队；结束后继续滚动即可重新累计。
    wheelTotal = 0
    return
  }

  const delta =
    event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? window.innerHeight : 1)
  if (Math.sign(delta) !== Math.sign(wheelTotal)) wheelTotal = 0
  wheelTotal += delta
  if (Math.abs(wheelTotal) < WHEEL_DISTANCE) return
  const direction = wheelTotal > 0 ? 1 : -1
  // 单个大幅滚动只触发一篇，不把余量带到下一篇。
  wheelTotal = 0
  // 多图笔记：仅当指针悬停在左侧图片预览区时才切换图片；
  // 遮罩空白、标题栏、操作栏等其他可翻页区域一律切换到上一篇/下一篇笔记。
  if (isImageArea && post.value?.images.length && post.value.images.length > 1) {
    if (direction > 0) nextImage()
    else prevImage()
    return
  }
  if (props.getAdjacentPost) await navigatePost(direction, () => props.getAdjacentPost!(direction))
}

async function navigateTo(index: number) {
  if (!props.getPostAt || index === props.postIndex) return
  const direction = index > (props.postIndex ?? 0) ? 1 : -1
  wheelTotal = 0
  await navigatePost(direction, () => props.getPostAt!(index))
}

defineExpose({ navigateTo, postId: props.postId })

async function navigatePost(direction: -1 | 1, resolvePost: () => Promise<CommunityPost | null>) {
  if (opening || closing.value || switching.value || disposed || props.exitDirection) return
  switching.value = true
  try {
    const nextPost = await resolvePost()
    if (disposed || closing.value) return
    if (!nextPost) {
      showNavigationHint(direction === 1 ? '暂时没有更多笔记了' : '已经是第一篇笔记了')
      switching.value = false
      return
    }
    // 保留当前实例到划出结束，下一篇立即挂载，两篇同时移动。
    emit('navigate', nextPost, direction)
  } catch {
    if (!disposed && !closing.value) {
      switching.value = false
      showNavigationHint('加载失败，请稍后重试')
    }
  }
}

const OPEN_DUR = 0.45
const CLOSE_DUR = 0.34

watch(
  () => props.exitDirection,
  (direction) => {
    const modal = modalEl.value
    if (!direction || !modal || disposed) return
    motion?.kill()
    motion = gsap.timeline({ onComplete: () => emit('departed', props.postId) })
    motion.to(modal, {
      y: reduceMotion() ? 0 : -direction * (modal.clientHeight + 24),
      opacity: reduceMotion() ? 0 : 0.25,
      duration: reduceMotion() ? 0 : SLIDE_DURATION,
      ease: 'power2.inOut'
    })
  },
  { flush: 'post' }
)

/** 计算把 modal 容器压到 origin 矩形所需的 transform 起点参数 */
function computeFlipStart(): {
  x: number
  y: number
  scaleX: number
  scaleY: number
} {
  const modal = modalEl.value
  if (!modal || !props.origin) return { x: 0, y: 0, scaleX: 0.92, scaleY: 0.92 }
  // 清残留 transform 拿 layout 真值
  gsap.set(modal, { clearProps: 'transform,transformOrigin' })
  const r = modal.getBoundingClientRect()
  const o = props.origin
  return {
    x: o.x + o.w / 2 - (r.left + r.width / 2),
    y: o.y + o.h / 2 - (r.top + r.height / 2),
    scaleX: o.w / r.width,
    scaleY: o.h / r.height
  }
}

function playOpen() {
  const modal = modalEl.value
  const mask = maskEl.value
  if (!modal || !mask) return
  motion?.kill()
  if (props.navigationDirection) {
    gsap.set(mask, { opacity: 1 })
    motion = gsap.timeline({
      onComplete: () => {
        opening = false
      }
    })
    motion.fromTo(
      modal,
      {
        y: reduceMotion() ? 0 : props.navigationDirection * (modal.clientHeight + 24),
        opacity: reduceMotion() ? 0 : 0.55
      },
      { y: 0, opacity: 1, duration: reduceMotion() ? 0 : SLIDE_DURATION, ease: 'power2.inOut' }
    )
    return
  }
  const start = computeFlipStart()
  gsap.set(mask, { opacity: 0 })
  gsap.set(modal, {
    x: start.x,
    y: start.y,
    scaleX: start.scaleX,
    scaleY: start.scaleY,
    opacity: 0,
    transformOrigin: '50% 50%',
    force3D: true
  })
  const tl = (motion = gsap.timeline({
    onComplete: () => {
      opening = false
    }
  }))
  tl.to(mask, { opacity: 1, duration: reduceMotion() ? 0 : OPEN_DUR, ease: 'power2.out' }, 0)
  tl.to(
    modal,
    {
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      opacity: 1,
      duration: reduceMotion() ? 0 : OPEN_DUR,
      ease: 'expo.out'
    },
    0
  )
}

function close(useFlip = true) {
  if (closing.value || disposed) return
  closing.value = true
  motion?.kill()
  const modal = modalEl.value
  const mask = maskEl.value
  if (!modal || !mask) {
    emit('close')
    return
  }
  const shouldFlip = useFlip && !!props.origin
  const target = shouldFlip ? computeFlipStart() : { x: 0, y: 0, scaleX: 0.94, scaleY: 0.94 }
  const tl = (motion = gsap.timeline({ onComplete: () => emit('close') }))
  tl.to(mask, { opacity: 0, duration: reduceMotion() ? 0 : CLOSE_DUR, ease: 'power2.in' }, 0)
  tl.to(
    modal,
    {
      x: target.x,
      y: target.y,
      scaleX: target.scaleX,
      scaleY: target.scaleY,
      opacity: shouldFlip ? 1 : 0,
      duration: reduceMotion() ? 0 : CLOSE_DUR,
      ease: 'power2.in'
    },
    0
  )
}

const router = useRouter()

const post = ref<CommunityPost | null>(props.initialPost ?? null)
const comments = ref<CommunityComment[]>([])
const commentsLoading = ref(true)
const commentInput = ref('')
const submittingComment = ref(false)
const imageIdx = ref(0)
/** 已有列表快照时保留内容，只对尚未获取的数据显示骨架。 */
const loading = ref(!props.initialPost)
/** 已预加载完成、当前实际展示的大图 URL —— 先预加载再换图，避免切换时闪白 */
const shownImage = ref('')
const failedImage = ref('')
const loadedAvatar = ref('')
const failedAvatar = ref('')
const loadedAttachmentCover = ref('')

/** 当前登录用户 id —— Logto sub,与社区列表页 currentUserId 同一来源 */
const myUserId = computed(() => authStore.user?.sub || '')

const isAuthor = computed(() => !!myUserId.value && post.value?.userId === myUserId.value)

/** 评论是否属于当前用户 —— 决定是否显示删除入口 */
function isOwnComment(c: CommunityComment): boolean {
  return !!myUserId.value && c.userId === myUserId.value
}

/** 评论是否为帖子作者本人 —— 昵称旁展示"作者"标记 */
function isPostAuthor(c: CommunityComment): boolean {
  return !!post.value?.userId && c.userId === post.value.userId
}

const { cover: attCoverUrl, onCoverError } = usePostAttachmentCover(() => post.value)
const currentImage = computed(() => {
  const item = post.value?.images?.[imageIdx.value]
  if (!item) return attCoverUrl.value
  return typeof item === 'string' ? item : item.url
})
const hasImages = computed(() => !!currentImage.value)

/**
 * 大图切换前先预加载 —— 预加载完成后才更新 shownImage。
 * 旧图（含模糊背景）保持可见直到新图就绪，过渡期间不会出现空白/骨架闪烁。
 */
let imageToken = 0
watch(
  currentImage,
  (url) => {
    if (!url) {
      shownImage.value = ''
      return
    }
    const token = ++imageToken
    const probe = new Image()
    probe.onload = () => {
      if (token === imageToken) shownImage.value = url
    }
    probe.onerror = () => {
      if (token !== imageToken) return
      failedImage.value = url
      // 无图笔记用附件封面充当大图时，沿用附件封面的失败回退链
      if (!post.value?.images?.length) onCoverError(url)
    }
    probe.src = ossDetail(url)
  },
  { immediate: true }
)

function onImageError(event: Event) {
  const { imageUrl, coverUrl: url } = (event.target as HTMLImageElement).dataset
  if (imageUrl) failedImage.value = imageUrl
  if (url) onCoverError(url)
}

const initial = computed(() => (post.value?.username || '?').slice(0, 1).toUpperCase())

onMounted(async () => {
  // GSAP timeline 在 mount 后立即播放(此时 modal DOM 已就绪,可量 rect)
  playOpen()
  await Promise.all([loadPost(), loadComments()])
})

onUnmounted(() => {
  disposed = true
  motion?.kill()
  clearTimeout(hintTimer)
  commentsObserver?.disconnect()
  commentsObserver = null
})

async function loadPost() {
  /* 已有 initialPost 时不显示 loading,后台静默刷新最新数据;
   * 没有 initialPost 时才走完整 loading 流程 */
  const hadInitial = !!post.value
  if (!hadInitial) loading.value = true
  try {
    const fresh = await communityAPI.getPost(props.postId)
    if (disposed) return
    post.value = fresh
  } catch (e: any) {
    if (disposed) return
    if (!hadInitial) {
      MessagePlugin.error(e?.message || '帖子加载失败')
      close()
    }
    // 有 initialPost 时刷新失败不致命,继续用旧数据
  } finally {
    loading.value = false
  }
}

/** 评论分页:分页单位是「一级评论」,回复随根评论一并返回(后端约定) */
const COMMENTS_PAGE_SIZE = 50
const commentsPage = ref(1)
const commentsRootTotal = ref(0)
const commentsHasMore = ref(false)
const commentsLoadingMore = ref(false)
const commentsSentinel = ref<HTMLElement | null>(null)
let commentsObserver: IntersectionObserver | null = null

async function loadComments() {
  commentsLoading.value = true
  const postId = props.postId
  try {
    const res = await communityAPI.listComments(postId, 1, COMMENTS_PAGE_SIZE)
    if (disposed || postId !== props.postId) return
    comments.value = res.items
    commentsPage.value = res.page || 1
    commentsRootTotal.value = res.rootTotal ?? 0
    commentsHasMore.value = res.hasMore ?? false
  } catch (e: any) {
    if (disposed) return
    MessagePlugin.error(e?.message || '评论加载失败')
  } finally {
    commentsLoading.value = false
  }
}

/** 滚到底自动翻页(哨兵 + IntersectionObserver,换成别的滚动容器也不用改) */
async function loadMoreComments() {
  if (disposed || commentsLoadingMore.value || !commentsHasMore.value) return
  commentsLoadingMore.value = true
  const next = commentsPage.value + 1
  const postId = props.postId
  try {
    const res = await communityAPI.listComments(postId, next, COMMENTS_PAGE_SIZE)
    // 翻页途中切到了别的笔记 → 这份响应已经过期,直接丢掉
    if (disposed || postId !== props.postId) return
    /* 服务端是 offset 分页:翻页期间若有人发了新评论,下一页会和上一页重叠
     * (新评论把后面的一级评论往后挤了一位)—— 按 id 去重后再追加 */
    const seen = new Set(comments.value.map((c) => c.id))
    comments.value = [...comments.value, ...res.items.filter((c) => !seen.has(c.id))]
    commentsPage.value = res.page || next
    commentsRootTotal.value = res.rootTotal ?? commentsRootTotal.value
    commentsHasMore.value = res.hasMore ?? false
  } catch (e: any) {
    if (disposed) return
    MessagePlugin.error(e?.message || '加载更多评论失败')
  } finally {
    commentsLoadingMore.value = false
  }
}

/** 拿到哨兵节点后接管滚动触发(卸载时断开,避免重复观察) */
watch(commentsSentinel, (el) => {
  commentsObserver?.disconnect()
  commentsObserver = null
  if (!el) return
  commentsObserver = new IntersectionObserver(
    (entries) => {
      if (entries.some((entry) => entry.isIntersecting)) void loadMoreComments()
    },
    // 提前 200px 触发,滚动到底不会看见等待
    { rootMargin: '200px' }
  )
  commentsObserver.observe(el)
})

function prevImage() {
  if (!post.value) return
  imageDirection.value = -1
  imageSwitchAnimated.value = true
  imageIdx.value = (imageIdx.value - 1 + post.value.images.length) % post.value.images.length
}
function nextImage() {
  if (!post.value) return
  imageDirection.value = 1
  imageSwitchAnimated.value = true
  imageIdx.value = (imageIdx.value + 1) % post.value.images.length
}
function selectImage(index: number) {
  if (!post.value || index === imageIdx.value) return
  imageDirection.value = index > imageIdx.value ? 1 : -1
  imageSwitchAnimated.value = true
  imageIdx.value = index
}

function scrollToComments() {
  commentsSection.value?.scrollIntoView({
    behavior: reduceMotion() ? 'auto' : 'smooth',
    block: 'start'
  })
}

async function onLike() {
  if (!post.value) return
  if (!requireLogin()) return
  /* 同评论点赞,做并发去抖 + 服务端真值校准,避免双击产生负数 */
  if (likingPostIds.has(props.postId)) return
  likingPostIds.add(props.postId)
  const wasLiked = post.value.liked
  post.value.liked = !wasLiked
  post.value.likeCount += wasLiked ? -1 : 1
  try {
    const res = await communityAPI.toggleLike(props.postId)
    if (res.liked !== post.value.liked) {
      post.value.liked = res.liked
      post.value.likeCount += res.liked ? 1 : -1
    }
    emit('updated', { ...post.value })
  } catch (e: any) {
    post.value.liked = wasLiked
    post.value.likeCount += wasLiked ? 1 : -1
    MessagePlugin.error(e?.message || '操作失败')
  } finally {
    likingPostIds.delete(props.postId)
  }
}

/* ============================================================
 *  评论 —— 两级回复
 *
 *  数据结构: 后端返回扁平数组(含 parentId),前端按 parentId 分组:
 *    rootComments:    parentId === null 的一级评论
 *    repliesByParent: Map<parentId, replies[]>
 *
 *  排序与后端 listComments 对齐: 一级评论**倒序**(新→旧)、回复正序(旧→新);
 *  本地新增评论必须维持这个顺序(见 submitComment)
 *
 *  回复时:
 *   - 一级评论的"回复"按钮 -> replyTo = { commentId: 该评论id, username: 该评论作者 }
 *   - 二级评论的"回复"按钮 -> parentId 仍指向根, replyToUsername 是被回复人
 *   - 后端会做防深嵌套(三层及以上自动挂到根)
 * ============================================================ */

interface ReplyTarget {
  commentId: string
  /** 真正用于 API 的 parentId(始终是根评论 id) */
  parentId: string
  /** "回复 @x" 显示的目标昵称 */
  username: string
}

const replyTarget = ref<ReplyTarget | null>(
  props.initialReplyTo
    ? {
        commentId: props.initialReplyTo.commentId,
        parentId: props.initialReplyTo.commentId,
        username: props.initialReplyTo.username
      }
    : null
)

/** 按 parentId 分组,模板里渲染嵌套 */
const rootComments = computed<CommunityComment[]>(() => comments.value.filter((c) => !c.parentId))
const repliesByParent = computed<Record<string, CommunityComment[]>>(() => {
  const map: Record<string, CommunityComment[]> = {}
  for (const c of comments.value) {
    if (c.parentId) {
      ;(map[c.parentId] ||= []).push(c)
    }
  }
  /* 回复正序兜底排序:本地新发的回复可能先于"更早但还没加载"的回复落进数组,
   * 等用户点「加载更多回复」把旧的一页并进来,靠排序才能回到正确位置 */
  for (const list of Object.values(map)) {
    list.sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
  }
  return map
})

/** 每条一级评论还没加载的回复数(0 = 全部加载完) */
function pendingReplies(root: CommunityComment): number {
  return Math.max(0, (root.replyCount ?? 0) - (repliesByParent.value[root.id]?.length ?? 0))
}

const REPLIES_PAGE_SIZE = 50
/** 正在加载回复的根评论 id —— 防止连点 */
const loadingReplies = ref<Set<string>>(new Set())

/** 点「加载更多回复」:按根评论翻页(后端同样是每根 50 条一页,正序) */
async function loadMoreReplies(root: CommunityComment) {
  if (loadingReplies.value.has(root.id)) return
  const loaded = repliesByParent.value[root.id]?.length ?? 0
  const page = Math.floor(loaded / REPLIES_PAGE_SIZE) + 1
  loadingReplies.value = new Set(loadingReplies.value).add(root.id)
  try {
    const res = await communityAPI.listReplies(root.id, page, REPLIES_PAGE_SIZE)
    const seen = new Set(comments.value.map((c) => c.id))
    comments.value = [...comments.value, ...res.items.filter((c) => !seen.has(c.id))]
    if (res.total > 0) root.replyCount = res.total
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加载回复失败')
  } finally {
    const next = new Set(loadingReplies.value)
    next.delete(root.id)
    loadingReplies.value = next
  }
}

function startReply(c: CommunityComment) {
  replyTarget.value = {
    commentId: c.id,
    parentId: c.parentId || c.id, // 二级评论的回复也挂在根上
    username: c.username
  }
  // 滚动到输入框 + 聚焦 —— 简单做法: 让 input 自动 focus
  // 实际 focus 在 template 里用 ref 即可,这里省略
}

function cancelReply() {
  replyTarget.value = null
}

async function submitComment() {
  const text = commentInput.value.trim()
  if (!text) return
  if (!requireLogin()) return
  if (text.length > 300) {
    MessagePlugin.warning('评论不超过 300 字')
    return
  }
  submittingComment.value = true
  try {
    const c = await communityAPI.createComment({
      postId: props.postId,
      content: text,
      parentId: replyTarget.value?.parentId,
      replyToCommentId: replyTarget.value?.commentId,
      replyToUsername: replyTarget.value?.username
    })
    /* 一级评论插到最前 —— 后端 listComments 是「根评论倒序」(新的在最前),
     * 本地也得同序,否则新评论会孤零零挂在列表末尾
     * (回复仍是追加:repliesByParent 按 createdAt 排序,新回复自然排在最后) */
    if (c.parentId) {
      comments.value.push(c)
      // 同步根评论的回复计数,否则「加载更多回复」的剩余数会少算一条
      const root = comments.value.find((x) => x.id === c.parentId)
      if (root) root.replyCount = (root.replyCount ?? 0) + 1
    } else {
      comments.value.unshift(c)
    }
    commentInput.value = ''
    replyTarget.value = null
    showSupportNotice(c.support)
    if (post.value) {
      post.value.commentCount += 1
      emit('updated', { ...post.value })
    }
  } catch (e: any) {
    MessagePlugin.error(e?.message || '评论失败')
  } finally {
    submittingComment.value = false
  }
}

async function deleteComment(c: CommunityComment) {
  const confirmDialog = DialogPlugin.confirm({
    header: '删除评论',
    body: '确定删除这条评论吗?',
    onConfirm: async () => {
      try {
        await communityAPI.deleteComment(c.id)
        comments.value = comments.value.filter((x) => x.id !== c.id)
        if (c.parentId) {
          const root = comments.value.find((x) => x.id === c.parentId)
          if (root) root.replyCount = Math.max(0, (root.replyCount ?? 0) - 1)
        }
        if (post.value) {
          post.value.commentCount = Math.max(0, post.value.commentCount - 1)
          emit('updated', { ...post.value })
        }
        MessagePlugin.success('已删除')
      } catch (e: any) {
        MessagePlugin.error(e?.message || '删除失败')
      } finally {
        confirmDialog.destroy()
      }
    },
    onClose: () => confirmDialog.destroy()
  })
}

/** 帖子/评论点赞 in-flight 集合 —— 同一目标请求未完成时忽略二次点击,
 *  避免快速双击导致 +1/-1 在网络往返期间错乱出现负值 */
const likingPostIds = new Set<string>()
const likingCommentIds = new Set<string>()

/** 评论点赞 toggle —— 乐观更新 + 并发去抖 + 服务端校准 */
async function toggleCommentLike(c: CommunityComment) {
  if (!requireLogin()) return
  if (likingCommentIds.has(c.id)) return
  likingCommentIds.add(c.id)
  const was = c.liked
  c.liked = !was
  c.likeCount += was ? -1 : 1
  try {
    const res = await communityAPI.toggleCommentLike(c.id)
    /* 服务端真值与乐观状态不一致(极端并发/网络重排) -> 反向校准 count */
    if (res.liked !== c.liked) {
      c.liked = res.liked
      c.likeCount += res.liked ? 1 : -1
    }
  } catch (e: any) {
    c.liked = was
    c.likeCount += was ? 1 : -1
    MessagePlugin.error(e?.message || '操作失败')
  } finally {
    likingCommentIds.delete(c.id)
  }
}

/* 举报弹窗 —— Electron 不支持 window.prompt,用 t-dialog 替代 */
const reportVisible = ref(false)
const reportReason = ref('')
const reportSubmitting = ref(false)

function onReport() {
  // 举报入口对未登录用户也可见,先拦住避免走到必然失败的提交
  if (!requireLogin()) return
  reportReason.value = ''
  reportVisible.value = true
}

async function submitReport() {
  const reason = reportReason.value.trim()
  if (!reason) {
    MessagePlugin.warning('请填写举报理由')
    return
  }
  if (reason.length > 255) {
    MessagePlugin.warning('理由不超过 255 字')
    return
  }
  reportSubmitting.value = true
  try {
    const res = await communityAPI.report({ postId: props.postId, reason })
    reportVisible.value = false
    if (res.already) {
      MessagePlugin.info('你已经举报过这篇帖子')
    } else if (res.autoOffline) {
      MessagePlugin.success('举报成功,该帖已被自动下线')
      emit('removed', props.postId)
      // 该帖已下线,源卡片已被移除,关闭不走 FLIP 直接淡出
      close(false)
    } else {
      MessagePlugin.success('举报已提交,管理员会复核')
    }
  } catch (e: any) {
    MessagePlugin.error(e?.message || '举报失败')
  } finally {
    reportSubmitting.value = false
  }
}

/* 编辑 —— 复用发帖对话框(editPost 模式) */
const showEdit = ref(false)

function startEdit() {
  showEdit.value = true
}

function onPostEdited(updated: CommunityPost) {
  post.value = updated
  emit('updated', { ...updated })
  MessagePlugin.success('修改已保存')
}

async function onDelete() {
  const confirmDialog = DialogPlugin.confirm({
    header: '删除帖子',
    body: '删除后帖子将从社区中移除,确认删除?',
    onConfirm: async () => {
      try {
        await communityAPI.deletePost(props.postId)
        emit('removed', props.postId)
        // 源卡片即将被移除,关闭不走 FLIP 直接淡出
        close(false)
      } catch (e: any) {
        MessagePlugin.error(e?.message || '删除失败')
      } finally {
        confirmDialog.destroy()
      }
    },
    onClose: () => confirmDialog.destroy()
  })
}

function openAttachmentPlaylist() {
  const a = post.value?.attachment
  if (a?.type === 'playlist' && a.listId) {
    /* 必须带 type=cloud_user,否则 list.vue 会当成网络歌单去请求外部音源,
     * 没配音源会报"请配置音源"。顺手把 title/cover/total 也传过去免空显示 */
    router.push({
      path: `/home/list/${a.listId}`,
      query: {
        type: 'cloud_user',
        title: a.name || '',
        cover: a.cover || '',
        total: a.songCount ? String(a.songCount) : ''
      }
    })
    close()
  }
}

/* ============================================================
 *  附件操作 —— 播放 / 加队列 / 喜欢 / 打开歌单
 *
 *  数据流向:
 *   - musicEmitter.emit('addToPlaylistAndPlay', song)  立即播放
 *   - musicEmitter.emit('addToPlaylistEnd', song)      加到队列末尾
 *   - 喜欢: songListAPI 本地"我的喜欢"歌单 add/remove
 * ============================================================ */

/** 单曲附件: 当前用户是否已喜欢 */
const attSongLiked = ref(false)
/** 喜欢 toggle 去抖 */
const attLikeBusy = ref(false)

const att = computed(() => post.value?.attachment || null)

/** 确保"我的喜欢"本地歌单存在 —— 返回其 id */
async function ensureFavoritesId(): Promise<string | null> {
  try {
    const cached = await (window as any).api?.songList?.getFavoritesId?.()
    if (cached?.data) {
      const ex = await songListAPI.exists(cached.data)
      if (ex.success && ex.data) return cached.data
    }
    const search = await songListAPI.search('我的喜欢', 'local')
    if (search.success && Array.isArray(search.data)) {
      const exact = search.data.find((pl: any) => pl.name === '我的喜欢' && pl.source === 'local')
      if (exact?.id) {
        await (window as any).api?.songList?.setFavoritesId?.(exact.id)
        return exact.id
      }
    }
    const created = await songListAPI.create('我的喜欢', '', 'local')
    if (created.success && created.data?.id) {
      await (window as any).api?.songList?.setFavoritesId?.(created.data.id)
      return created.data.id
    }
  } catch (e) {
    console.warn('ensureFavoritesId 失败', e)
  }
  return null
}

/** 进入详情时 / 切换 post 时检查附件单曲是否已喜欢 */
async function refreshAttLiked() {
  attSongLiked.value = false
  if (att.value?.type !== 'song') return
  const id = await ensureFavoritesId()
  if (!id) return
  const songmid = String(att.value.song?.songmid)
  if (!songmid) return
  const res = await songListAPI.hasSong(id, songKey(att.value.song))
  if (res.success) attSongLiked.value = !!res.data
}

watch(
  () => att.value?.song?.songmid,
  () => void refreshAttLiked(),
  { immediate: true }
)

/** 播放: 单曲 -> 立即播放;歌单 -> 整批替换播放列表 */
async function onAttPlay() {
  const a = att.value
  if (!a) return
  if (a.type === 'song') {
    ;(window as any).musicEmitter?.emit('addToPlaylistAndPlay', toRaw(a.song) as any)
    MessagePlugin.success('正在播放')
  } else if (a.type === 'playlist' && a.listId) {
    try {
      const detail = await cloudSongListAPI.getSongListDetail(a.listId, 'asc', 1000)
      const songs = (detail.list || []) as any[]
      if (songs.length === 0) {
        MessagePlugin.warning('歌单是空的')
        return
      }
      // 第一首 play,剩余 push 到队列
      ;(window as any).musicEmitter?.emit('addToPlaylistAndPlay', toRaw(songs[0]))
      songs.slice(1).forEach((s) => {
        ;(window as any).musicEmitter?.emit('addToPlaylistEnd', toRaw(s))
      })
      MessagePlugin.success(`已加入 ${songs.length} 首并开始播放`)
    } catch (e: any) {
      MessagePlugin.error(e?.message || '获取歌单失败')
    }
  }
}

/** 加入播放队列(末尾) */
async function onAttAddToQueue() {
  const a = att.value
  if (!a) return
  if (a.type === 'song') {
    ;(window as any).musicEmitter?.emit('addToPlaylistEnd', toRaw(a.song) as any)
    MessagePlugin.success('已加入播放队列')
  } else if (a.type === 'playlist' && a.listId) {
    try {
      const detail = await cloudSongListAPI.getSongListDetail(a.listId, 'asc', 1000)
      const songs = (detail.list || []) as any[]
      songs.forEach((s) => {
        ;(window as any).musicEmitter?.emit('addToPlaylistEnd', toRaw(s))
      })
      MessagePlugin.success(`已加入 ${songs.length} 首到队列`)
    } catch (e: any) {
      MessagePlugin.error(e?.message || '加入失败')
    }
  }
}

/** 喜欢 toggle —— 本地"我的喜欢"歌单增删 */
async function onAttToggleLike() {
  if (att.value?.type !== 'song') return
  if (attLikeBusy.value) return
  attLikeBusy.value = true
  const wasLiked = attSongLiked.value
  attSongLiked.value = !wasLiked
  try {
    const id = await ensureFavoritesId()
    if (!id) throw new Error('无法获取喜欢列表')
    const song = att.value.song as any
    if (wasLiked) {
      const res = await songListAPI.removeSong(id, songKey(song))
      if (!res.success) throw new Error(res.error || '取消喜欢失败')
      MessagePlugin.success('已取消喜欢')
    } else {
      const res = await songListAPI.addSongs(id, [toRaw(song) as any])
      if (!res.success) throw new Error(res.error || '添加失败')
      MessagePlugin.success('已添加到喜欢')
    }
  } catch (e: any) {
    // 回滚
    attSongLiked.value = wasLiked
    MessagePlugin.error(e?.message || '操作失败')
  } finally {
    attLikeBusy.value = false
  }
}

function formatTime(iso: string): string {
  const d = new Date(iso)
  const diff = Date.now() - d.getTime()
  const min = 60_000
  if (diff < min) return '刚刚'
  if (diff < 60 * min) return `${Math.floor(diff / min)} 分钟前`
  if (diff < 24 * 60 * min) return `${Math.floor(diff / (60 * min))} 小时前`
  if (diff < 7 * 24 * 60 * min) return `${Math.floor(diff / (24 * 60 * min))} 天前`
  return d.toLocaleDateString()
}
</script>

<template>
  <Teleport to="body">
    <div
      ref="maskEl"
      class="post-modal-mask"
      :class="{ 'is-departing': exitDirection, 'is-arriving': pairedTransition && !exitDirection }"
      :inert="!!exitDirection"
      :aria-hidden="exitDirection ? true : undefined"
      @click.self="() => close()"
      @wheel="onWheel"
    >
      <div class="modal-titlebar-drag" aria-hidden="true" @click.stop />
      <div class="post-modal-viewport" :class="{ 'is-sliding': pairedTransition }">
        <div ref="modalEl" class="post-modal" :aria-busy="switching">
          <div class="top-actions">
            <!-- ⋯ 二级菜单:自己的帖子 → 编辑/删除;他人帖子 → 举报(末位) -->
            <t-dropdown v-if="post" trigger="click" placement="bottom-right">
              <button class="more-btn" type="button" aria-label="更多操作">
                <t-icon name="ellipsis" size="20" />
              </button>
              <t-dropdown-menu>
                <template v-if="isAuthor">
                  <t-dropdown-item @click="startEdit">
                    <span class="menu-item"><EditIcon size="16" />编辑</span>
                  </t-dropdown-item>
                  <t-dropdown-item theme="error" @click="onDelete">
                    <span class="menu-item"><DeleteIcon size="16" />删除</span>
                  </t-dropdown-item>
                </template>
                <t-dropdown-item v-else @click="onReport">
                  <span class="menu-item"><ErrorCircleIcon size="16" />举报</span>
                </t-dropdown-item>
              </t-dropdown-menu>
            </t-dropdown>
            <button class="close-btn" aria-label="关闭详情" @click="() => close()">
              <CloseIcon size="22" />
            </button>
          </div>
          <div v-if="navigationHint" class="navigation-hint" role="status">
            {{ navigationHint }}
          </div>

          <Transition name="skeleton-fade">
            <div v-if="loading || !post" class="post-skeleton">
              <div class="left" role="status" aria-label="正在加载笔记图片">
                <div class="image-skeleton skeleton" />
              </div>
              <div class="right" aria-busy="true" aria-label="正在加载笔记详情">
                <header class="author">
                  <span class="skeleton skeleton-avatar" />
                  <div class="info skeleton-lines">
                    <span class="skeleton skeleton-line name-placeholder" />
                    <span class="skeleton skeleton-line time-placeholder" />
                  </div>
                </header>
                <div class="content-area">
                  <div class="skeleton-summary skeleton-lines">
                    <span class="skeleton skeleton-line" />
                    <span class="skeleton skeleton-line short-line" />
                  </div>
                  <div class="skeleton-attachment">
                    <span class="skeleton skeleton-cover" />
                    <div class="skeleton-lines">
                      <span class="skeleton skeleton-line" />
                      <span class="skeleton skeleton-line short-line" />
                      <span class="skeleton skeleton-line short-line" />
                    </div>
                  </div>
                </div>
                <footer class="action-bar skeleton-footer">
                  <span class="skeleton skeleton-line skeleton-actions short-line" />
                  <span class="skeleton skeleton-input" />
                </footer>
              </div>
            </div>
          </Transition>

          <template v-if="post && !loading">
            <!-- 左侧始终保留完整图片区域，图片加载仅替换区域内的骨架。 -->
            <div class="left detail-pane" :class="{ 'no-img': !hasImages }">
              <template v-if="hasImages">
                <Transition name="skeleton-fade">
                  <div
                    v-if="!shownImage && failedImage !== currentImage"
                    class="image-skeleton skeleton"
                    role="status"
                    aria-label="正在加载笔记图片"
                  />
                </Transition>
                <Transition name="skeleton-fade">
                  <img
                    v-if="shownImage"
                    :key="shownImage"
                    class="image-backdrop"
                    :src="ossDetail(shownImage)"
                    alt=""
                    aria-hidden="true"
                    draggable="false"
                  />
                </Transition>
                <Transition :name="imageTransition" :css="imageSwitchAnimated">
                  <img
                    v-if="shownImage"
                    :key="shownImage"
                    class="big-img"
                    :src="ossDetail(shownImage)"
                    :alt="post.username"
                    :data-image-url="shownImage"
                    :data-cover-url="post.images.length ? undefined : shownImage"
                    @error="onImageError"
                  />
                </Transition>
                <button v-if="post.images.length > 1" class="nav prev" @click="prevImage">
                  <ChevronLeftIcon size="28" />
                </button>
                <button v-if="post.images.length > 1" class="nav next" @click="nextImage">
                  <ChevronRightIcon size="28" />
                </button>
                <div v-if="post.images.length > 1" class="dots">
                  <span
                    v-for="(_, i) in post.images"
                    :key="i"
                    :class="{ active: i === imageIdx }"
                    @click="selectImage(i)"
                  />
                </div>
              </template>
              <TextNoteCover v-else :seed="post.id" :content="post.content" expanded />
            </div>

            <!-- 右:信息 + 评论 -->
            <div class="right detail-pane">
              <header class="author">
                <div class="author-avatar">
                  <img
                    v-if="post.userAvatar && failedAvatar !== post.userAvatar"
                    :key="post.userAvatar"
                    :src="ossAvatar(post.userAvatar)"
                    :data-avatar-url="post.userAvatar"
                    alt=""
                    @load="
                      loadedAvatar = ($event.target as HTMLImageElement).dataset.avatarUrl || ''
                    "
                    @error="
                      failedAvatar = ($event.target as HTMLImageElement).dataset.avatarUrl || ''
                    "
                  />
                  <span v-else class="avatar-fallback">{{ initial }}</span>
                  <Transition name="skeleton-fade">
                    <span
                      v-if="
                        post.userAvatar &&
                        loadedAvatar !== post.userAvatar &&
                        failedAvatar !== post.userAvatar
                      "
                      class="image-skeleton skeleton"
                      aria-label="正在加载头像"
                    />
                  </Transition>
                </div>
                <div class="info">
                  <div class="name">{{ post.username }}</div>
                  <div class="time">
                    {{ formatTime(post.createdAt) }} · {{ post.ipLocation || IP_LOCATION_FALLBACK }}
                  </div>
                </div>
              </header>

              <div class="content-area">
                <p v-if="post.images.length || att" class="content-text">{{ post.content }}</p>

                <!-- 附件:单曲走播放器卡片;歌单走简洁可点击卡片(整张点击跳转) -->
                <template v-if="att">
                  <!-- 单曲: 播放器样式 + 操作集 -->
                  <div v-if="att.type === 'song'" class="att-player">
                    <div class="att-cover">
                      <img
                        v-if="attCoverUrl"
                        :key="attCoverUrl"
                        :src="ossAvatar(attCoverUrl)"
                        :data-cover-url="attCoverUrl"
                        @load="
                          loadedAttachmentCover =
                            ($event.target as HTMLImageElement).dataset.coverUrl || ''
                        "
                        @error="onImageError"
                      />
                      <div v-else class="att-cover-fallback">♬</div>
                      <Transition name="skeleton-fade">
                        <span
                          v-if="attCoverUrl && loadedAttachmentCover !== attCoverUrl"
                          class="image-skeleton skeleton"
                          aria-label="正在加载歌曲封面"
                        />
                      </Transition>
                      <button class="att-cover-play" title="播放" @click="onAttPlay">
                        <PlayCircleIcon size="32" />
                      </button>
                    </div>
                    <div class="att-info">
                      <div class="att-name">{{ att.song?.name }}</div>
                      <div class="att-sub">
                        {{ att.song?.singer }}
                        <template v-if="att.song?.albumName"> · {{ att.song.albumName }}</template>
                      </div>
                      <div class="att-actions">
                        <button class="att-btn primary" @click="onAttPlay">
                          <PlayCircleIcon size="14" />播放
                        </button>
                        <button class="att-btn" @click="onAttAddToQueue">
                          <AddIcon size="14" />加入队列
                        </button>
                        <button
                          class="att-btn like-button"
                          :class="{ liked: attSongLiked }"
                          @click="onAttToggleLike"
                        >
                          <component :is="attSongLiked ? HeartFilledIcon : HeartIcon" size="14" />
                          {{ attSongLiked ? '已喜欢' : '喜欢' }}
                        </button>
                      </div>
                    </div>
                  </div>

                  <!-- 歌单: 简洁卡片,整张点击跳转到歌单详情 -->
                  <div v-else class="att-playlist" @click="openAttachmentPlaylist">
                    <div class="att-cover playlist">
                      <img
                        v-if="attCoverUrl"
                        :key="attCoverUrl"
                        :src="ossAvatar(attCoverUrl)"
                        :data-cover-url="attCoverUrl"
                        @load="
                          loadedAttachmentCover =
                            ($event.target as HTMLImageElement).dataset.coverUrl || ''
                        "
                        @error="onImageError"
                      />
                      <div v-else class="att-cover-fallback">♬</div>
                      <Transition name="skeleton-fade">
                        <span
                          v-if="attCoverUrl && loadedAttachmentCover !== attCoverUrl"
                          class="image-skeleton skeleton"
                          aria-label="正在加载歌单封面"
                        />
                      </Transition>
                    </div>
                    <div class="att-info">
                      <div class="att-name">{{ att.name }}</div>
                      <div class="att-sub">歌单 · {{ att.songCount || 0 }} 首</div>
                    </div>
                    <ChevronRightIcon class="att-arrow" size="20" />
                  </div>
                </template>

                <!-- 评论列表 —— 两级回复 -->
                <section ref="commentsSection" class="comments" :aria-busy="commentsLoading">
                  <h4>评论 {{ post.commentCount }}</h4>
                  <div class="comments-body">
                    <Transition name="skeleton-fade">
                      <div
                        v-if="commentsLoading && !rootComments.length"
                        class="comments-skeleton"
                        role="status"
                        aria-label="正在加载评论"
                      >
                        <div v-for="row in 3" :key="row" class="skeleton-comment">
                          <span class="skeleton skeleton-avatar" />
                          <div class="skeleton-lines">
                            <span class="skeleton skeleton-line name-placeholder" />
                            <span class="skeleton skeleton-line" />
                            <span class="skeleton skeleton-line short-line" />
                          </div>
                        </div>
                      </div>
                    </Transition>
                    <Transition name="skeleton-fade">
                      <div v-if="!commentsLoading || rootComments.length" class="comments-content">
                        <div v-if="rootComments.length === 0" class="empty">
                          还没有评论,说说你的看法
                        </div>

                        <div v-for="c in rootComments" :key="c.id" class="comment">
                          <img
                            v-if="c.userAvatar"
                            :src="ossAvatar(c.userAvatar)"
                            class="c-avatar"
                          />
                          <span v-else class="c-avatar-fallback">{{
                            (c.username || '?').slice(0, 1)
                          }}</span>
                          <!-- 删除放在评论右上角(仅自己的评论) -->
                          <button
                            v-if="isOwnComment(c)"
                            class="c-del-inline"
                            aria-label="删除评论"
                            title="删除"
                            @click="deleteComment(c)"
                          >
                            <DeleteIcon size="14" />
                          </button>
                          <div class="c-body">
                            <div class="c-name">
                              {{ c.username }}
                              <span v-if="isPostAuthor(c)" class="c-author">作者</span>
                              <span v-else-if="isOwnComment(c)" class="c-author me">我</span>
                            </div>
                            <div class="c-text">{{ c.content }}</div>
                            <div class="c-meta">
                              <span class="c-time">{{ formatTime(c.createdAt) }}</span>
                              <span class="c-sep">·</span>
                              <span class="c-location">{{
                                c.ipLocation || IP_LOCATION_FALLBACK
                              }}</span>
                              <button class="c-reply" @click="startReply(c)">回复</button>
                              <button
                                class="c-like"
                                :class="{ liked: c.liked }"
                                @click="toggleCommentLike(c)"
                              >
                                <component :is="c.liked ? HeartFilledIcon : HeartIcon" size="14" />
                                <span v-if="c.likeCount">{{ c.likeCount }}</span>
                              </button>
                            </div>

                            <!-- 二级回复列表 -->
                            <div v-if="repliesByParent[c.id]?.length" class="replies">
                              <div v-for="r in repliesByParent[c.id]" :key="r.id" class="reply">
                                <img
                                  v-if="r.userAvatar"
                                  :src="ossAvatar(r.userAvatar)"
                                  class="c-avatar small"
                                />
                                <span v-else class="c-avatar-fallback small">{{
                                  (r.username || '?').slice(0, 1)
                                }}</span>
                                <button
                                  v-if="isOwnComment(r)"
                                  class="c-del-inline"
                                  aria-label="删除回复"
                                  title="删除"
                                  @click="deleteComment(r)"
                                >
                                  <DeleteIcon size="13" />
                                </button>
                                <div class="c-body">
                                  <div class="c-name">
                                    {{ r.username }}
                                    <span v-if="isPostAuthor(r)" class="c-author">作者</span>
                                    <span v-else-if="isOwnComment(r)" class="c-author me">我</span>
                                    <template v-if="r.replyToUsername">
                                      <span class="reply-to"> 回复 @{{ r.replyToUsername }}</span>
                                    </template>
                                  </div>
                                  <div class="c-text">{{ r.content }}</div>
                                  <div class="c-meta">
                                    <span class="c-time">{{ formatTime(r.createdAt) }}</span>
                                    <span class="c-sep">·</span>
                                    <span class="c-location">{{
                                      r.ipLocation || IP_LOCATION_FALLBACK
                                    }}</span>
                                    <button class="c-reply" @click="startReply(r)">回复</button>
                                    <button
                                      class="c-like"
                                      :class="{ liked: r.liked }"
                                      @click="toggleCommentLike(r)"
                                    >
                                      <component
                                        :is="r.liked ? HeartFilledIcon : HeartIcon"
                                        size="13"
                                      />
                                      <span v-if="r.likeCount">{{ r.likeCount }}</span>
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>

                            <!-- 回复分页:首屏每根 50 条,剩下的点这里翻 -->
                            <button
                              v-if="pendingReplies(c) > 0"
                              class="c-more-replies"
                              :disabled="loadingReplies.has(c.id)"
                              @click="loadMoreReplies(c)"
                            >
                              {{
                                loadingReplies.has(c.id)
                                  ? '加载中…'
                                  : `加载更多回复 (${pendingReplies(c)})`
                              }}
                            </button>
                          </div>
                        </div>

                        <!-- 分页哨兵:进入视口就自动拉下一页(见 loadMoreComments) -->
                        <div ref="commentsSentinel" class="comments-sentinel" aria-hidden="true" />
                        <div v-if="commentsLoadingMore" class="comments-more" role="status">
                          加载更多评论…
                        </div>
                        <div v-else-if="!commentsHasMore && commentsPage > 1" class="comments-more">
                          已显示全部评论
                        </div>
                      </div>
                    </Transition>
                  </div>
                </section>
              </div>

              <footer class="action-bar">
                <div class="actions-left">
                  <button class="action" @click="onLike">
                    <component
                      :is="post.liked ? HeartFilledIcon : HeartIcon"
                      size="20"
                      :class="{ liked: post.liked }"
                    />
                    <span>{{ post.likeCount }}</span>
                  </button>
                  <button class="action stat-only" aria-label="查看评论" @click="scrollToComments">
                    <ChatIcon size="20" />
                    <span>{{ post.commentCount }}</span>
                  </button>
                  <!-- 举报仅对他人的帖子显示(举报自己的帖子没意义) -->
                  <button v-if="!isAuthor" class="action" aria-label="举报" @click="onReport">
                    <ErrorCircleIcon size="18" />
                  </button>
                </div>
                <!-- 回复目标提示条 -->
                <div v-if="replyTarget" class="reply-hint">
                  回复 <strong>@{{ replyTarget.username }}</strong>
                  <button class="reply-cancel" @click="cancelReply">✕</button>
                </div>
                <div class="comment-input">
                  <input
                    v-model="commentInput"
                    :placeholder="replyTarget ? `回复 @${replyTarget.username}` : '说点什么...'"
                    maxlength="300"
                    @keydown.enter="submitComment"
                  />
                  <button
                    :disabled="!commentInput.trim() || submittingComment"
                    @click="submitComment"
                  >
                    发送
                  </button>
                </div>
              </footer>
            </div>
          </template>
        </div>
      </div>
    </div>

    <!-- 举报对话框 —— 替代 window.prompt(Electron 不支持) -->
    <t-dialog
      v-model:visible="reportVisible"
      header="举报帖子"
      :confirm-btn="{ content: '提交举报', loading: reportSubmitting, theme: 'danger' }"
      cancel-btn="取消"
      :on-confirm="submitReport"
      attach="body"
      destroy-on-close
    >
      <p style="margin: 0 0 8px; color: var(--td-text-color-secondary); font-size: 13px">
        请简短描述违规内容(1-255 字),管理员会人工复核
      </p>
      <t-textarea
        v-model="reportReason"
        :rows="4"
        :maxlength="255"
        placeholder="例如:涉黄/广告/人身攻击..."
        autofocus
      />
    </t-dialog>

    <!-- 编辑对话框 —— 复用发帖组件(editPost 模式) -->
    <PostCreateDialog v-model:visible="showEdit" :edit-post="post" @updated="onPostEdited" />
  </Teleport>
</template>

<style scoped lang="scss">
.post-modal-mask {
  --post-modal-height: min(720px, 88vh);
  -webkit-app-region: no-drag;
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  z-index: 2000;
  display: flex;
  align-items: center;
  justify-content: center;

  &.is-arriving {
    background: transparent;
    z-index: 2001;
  }
  &.is-departing {
    pointer-events: none;
  }
}

// 只让弹窗上方的空白条拖动窗口，不与弹窗或关闭按钮相交。
.modal-titlebar-drag {
  -webkit-app-region: drag;
  position: absolute;
  inset: 0 0 auto;
  height: max(0px, min(52px, calc((100vh - var(--post-modal-height)) / 2 - 4px)));
}

.post-modal-viewport {
  width: min(1100px, 92vw);
  height: var(--post-modal-height);
  position: relative;
  z-index: 1;
  border-radius: 12px;

  &.is-sliding {
    overflow: hidden;
  }
}

.post-modal {
  font-family: 'PingFangSC-Semibold';
  -webkit-app-region: no-drag;
  background: var(--td-bg-color-container, #fff);
  border-radius: 12px;
  width: 100%;
  height: 100%;
  overflow: hidden;
  display: flex;
  position: relative;
  z-index: 1;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.3);
}

.navigation-hint {
  position: absolute;
  bottom: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: 8px 16px;
  border-radius: 20px;
  background: rgba(0, 0, 0, 0.65);
  color: #fff;
  font-size: 13px;
  pointer-events: none;
  z-index: 5;
}

.top-actions {
  -webkit-app-region: no-drag;
  position: absolute;
  /* 与 76px 高的作者栏垂直居中: (76 - 32) / 2 */
  top: 22px;
  right: 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  z-index: 10;
}

/* 作者操作入口 —— 白色圆钮,位于关闭按钮左侧 */
.more-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  line-height: 0;
  border-radius: 50%;
  border: 1px solid rgba(0, 0, 0, 0.1);
  background: #fff;
  color: #4b4b4b;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background-color 0.15s ease,
    color 0.15s ease;
  &:hover {
    background: #f3f3f3;
    color: #1f2329;
  }
  :deep(svg) {
    display: block;
    margin: 0;
  }
}

.menu-item {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.close-btn {
  -webkit-app-region: no-drag;
  width: 32px;
  height: 32px;
  padding: 0;
  line-height: 0;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  :deep(svg) {
    display: block;
    margin: 0;
  }
}

.post-skeleton {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  background: var(--td-bg-color-container, #fff);
  pointer-events: none;
}
.skeleton-fade-enter-active,
.skeleton-fade-leave-active {
  transition: opacity 240ms ease;
}
.skeleton-fade-enter-from,
.skeleton-fade-leave-to {
  opacity: 0;
}
.detail-pane {
  animation: detail-reveal 240ms ease both;
}
.comments-body {
  position: relative;
}
.comments-sentinel {
  height: 1px;
}
.c-more-replies {
  display: inline-block;
  margin: 6px 0 2px;
  padding: 2px 10px 2px 0;
  border: none;
  background: none;
  font-size: 12px;
  color: var(--td-brand-color, #ff2442);
  cursor: pointer;
  &:hover {
    text-decoration: underline;
  }
  &:disabled {
    color: var(--td-text-color-placeholder, #aaa);
    cursor: default;
    text-decoration: none;
  }
}
.comments-more {
  padding: 10px 0 2px;
  text-align: center;
  font-size: 12px;
  color: var(--td-text-color-placeholder, #aaa);
}
.comments-skeleton.skeleton-fade-leave-active {
  position: absolute;
  inset: 0 0 auto;
  pointer-events: none;
}
@keyframes detail-reveal {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

.skeleton {
  background: linear-gradient(
    100deg,
    var(--td-bg-color-component, #ededed) 25%,
    var(--td-bg-color-secondarycontainer, #f7f7f7) 50%,
    var(--td-bg-color-component, #ededed) 75%
  );
  background-size: 200% 100%;
  animation: skeleton-shimmer 1.8s ease-in-out infinite;
}
.skeleton-line {
  display: block;
  height: 14px;
  border-radius: 5px;
  width: 100%;
}
.skeleton-lines {
  display: flex;
  flex-direction: column;
  gap: 10px;
  flex: 1;
  min-width: 0;
}
.name-placeholder {
  width: 96px;
}
.time-placeholder {
  width: 64px;
  height: 12px;
}
.short-line {
  width: 60%;
}
.skeleton-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  flex-shrink: 0;
}
.skeleton-summary {
  padding: 4px 0 16px;
}
.skeleton-attachment {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 14px;
  border-radius: 12px;
  background: var(--td-bg-color-secondarycontainer, #f7f7f7);
}
.skeleton-cover {
  width: 80px;
  height: 80px;
  border-radius: 8px;
  flex-shrink: 0;
}
.skeleton-comment {
  display: flex;
  gap: 10px;
  padding: 8px 0 18px;
}
.skeleton-comment .skeleton-avatar {
  width: 32px;
  height: 32px;
}
.skeleton-input {
  display: block;
  height: 36px;
  border-radius: 18px;
}
.skeleton-actions {
  height: 28px;
}
.image-skeleton {
  position: absolute;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}
@keyframes skeleton-shimmer {
  from {
    background-position: 200% 0;
  }
  to {
    background-position: -200% 0;
  }
}
@media (prefers-reduced-motion: reduce) {
  .skeleton-fade-enter-active,
  .skeleton-fade-leave-active {
    transition: none;
  }
  .skeleton,
  .detail-pane {
    animation: none;
  }
}

.left {
  flex: 1.4;
  background: var(--td-bg-color-secondarycontainer, #e8e8ed);
  position: relative;
  isolation: isolate;
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 0;
  overflow: hidden;

  .image-backdrop {
    position: absolute;
    inset: -100px;
    width: calc(100% + 200px);
    height: calc(100% + 200px);
    object-fit: cover;
    filter: blur(64px) brightness(0.8);
    opacity: 0.85;
    pointer-events: none;
    user-select: none;
    z-index: -1;
  }

  .big-img {
    width: 100%;
    height: 100%;
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    display: block;
  }

  /* 轮播式整幅平移:新旧两张图同速、同缓动,边缘相接地滑过,
   * 不做透明度交叉(会产生鬼影),才像真正的轮播图 */
  .image-slide-next-enter-active,
  .image-slide-next-leave-active,
  .image-slide-prev-enter-active,
  .image-slide-prev-leave-active {
    position: absolute;
    inset: 0;
    transition: transform 320ms cubic-bezier(0.22, 0.61, 0.36, 1);
  }
  .image-slide-next-enter-from {
    transform: translateX(100%);
  }
  .image-slide-next-leave-to {
    transform: translateX(-100%);
  }
  .image-slide-prev-enter-from {
    transform: translateX(-100%);
  }
  .image-slide-prev-leave-to {
    transform: translateX(100%);
  }
  @media (prefers-reduced-motion: reduce) {
    .image-slide-next-enter-active,
    .image-slide-next-leave-active,
    .image-slide-prev-enter-active,
    .image-slide-prev-leave-active {
      transition: none;
    }
  }

  .nav {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 36px;
    height: 36px;
    border-radius: 50%;
    border: none;
    background: rgba(255, 255, 255, 0.85);
    color: #333;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    &.prev {
      left: 12px;
    }
    &.next {
      right: 12px;
    }
  }
  .dots {
    position: absolute;
    bottom: 12px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    gap: 6px;
    span {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: rgba(255, 255, 255, 0.5);
      cursor: pointer;
      &.active {
        background: #fff;
      }
    }
  }
}

.right {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-width: 340px;
  min-height: 0;
  border-left: 1px solid var(--td-border-level-1-color, #eee);
}

.author {
  flex-shrink: 0;
  height: 76px;
  box-sizing: border-box;
  display: flex;
  align-items: center;
  gap: 10px;
  /* 右侧预留 ⋯ + ✕ 两个按钮的位置,昵称不会钻到按钮下面 */
  padding: 16px 100px 16px 20px;
  /* 作者栏是 UI 壳层,禁止选中 */
  user-select: none;
  -webkit-user-select: none;
  border-bottom: 1px solid var(--td-border-level-1-color, #eee);

  .author-avatar {
    position: relative;
    width: 40px;
    height: 40px;
    flex-shrink: 0;
    border-radius: 50%;
    overflow: hidden;
  }

  img,
  .avatar-fallback {
    flex-shrink: 0;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    object-fit: cover;
    background: var(--td-brand-color-light, #ffd5db);
    color: var(--td-brand-color, #ff2442);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
  }
  .info {
    min-width: 0;
    flex: 1;
    .name {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      font-size: 14px;
    }
    .time {
      font-size: 12px;
      color: var(--td-text-color-placeholder, #aaa);
      margin-top: 2px;
    }
  }
}

.content-area {
  flex: 1;
  min-height: 0;
  scrollbar-gutter: stable;
  overflow-y: auto;
  overscroll-behavior: contain;
  scroll-padding-block: 16px;
  padding: 18px 22px 24px;
  user-select: text;
  -webkit-user-select: text;
  cursor: default;

  .content-text {
    font-size: 14px;
    line-height: 1.85;
    color: var(--td-text-color-primary, #333);
    margin: 0 0 18px;
    white-space: pre-wrap;
    word-break: break-word;
    letter-spacing: 0.01em;
    user-select: text;
    -webkit-user-select: text;
    cursor: text;
  }
}

/* 歌单附件 —— 简洁可点击卡片,整张点击直接跳详情页 */
.att-playlist {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: var(--td-bg-color-component);
  border-radius: 10px;
  margin-bottom: 16px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover {
    background: var(--td-bg-color-component-hover);
  }

  .att-cover.playlist {
    position: relative;
    width: 48px;
    height: 48px;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--td-brand-color-light);
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .att-cover-fallback {
      width: 100%;
      height: 100%;
      color: var(--td-brand-color);
      font-size: 22px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
  }

  .att-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    .att-name {
      font-size: 14px;
      font-weight: 500;
      color: var(--td-text-color-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .att-sub {
      font-size: 12px;
      color: var(--td-text-color-placeholder);
    }
  }

  .att-arrow {
    color: var(--td-text-color-placeholder);
    flex-shrink: 0;
  }
}

.att-player {
  display: flex;
  align-items: stretch;
  gap: 14px;
  padding: 14px;
  background: linear-gradient(135deg, var(--td-brand-color-light), var(--td-bg-color-component));
  border-radius: 12px;
  margin-bottom: 16px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
  .att-cover {
    position: relative;
    width: 80px;
    height: 80px;
    border-radius: 8px;
    overflow: hidden;
    flex-shrink: 0;
    background: var(--td-brand-color-light);

    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .att-cover-fallback {
      width: 100%;
      height: 100%;
      color: var(--td-brand-color);
      font-size: 36px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .att-cover-play {
      position: absolute;
      inset: 0;
      border: none;
      background: rgba(0, 0, 0, 0.45);
      color: #fff;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      opacity: 0;
      transition: opacity 0.15s;
    }
  }
  &:hover .att-cover .att-cover-play {
    opacity: 1;
  }

  .att-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
    gap: 4px;

    .att-name {
      font-size: 15px;
      font-weight: 600;
      color: var(--td-text-color-primary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .att-sub {
      font-size: 12px;
      color: var(--td-text-color-secondary);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .att-actions {
      display: flex;
      gap: 6px;
      margin-top: 6px;
      flex-wrap: wrap;

      .att-btn {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 4px 10px;
        border-radius: 14px;
        border: 1px solid var(--td-border-level-2-color);
        background: var(--td-bg-color-container);
        color: var(--td-text-color-secondary);
        font-size: 12px;
        cursor: pointer;
        transition: all 0.15s;

        &.like-button {
          min-width: 76px;
          justify-content: center;
        }

        &:hover {
          color: var(--td-brand-color);
          border-color: var(--td-brand-color);
        }

        &.primary {
          background: var(--td-brand-color);
          color: #fff;
          border-color: transparent;
          font-weight: 500;

          &:hover {
            background: var(--td-brand-color-7, #c20c0c);
            color: #fff;
          }
        }
        &.liked {
          color: var(--td-brand-color);
          border-color: var(--td-brand-color);
        }
      }
    }
  }
}

.comments {
  margin-top: 8px;
  padding-top: 14px;
  border-top: 1px solid color-mix(in srgb, var(--td-border-level-1-color, #eee) 80%, transparent);
  /* 评论区壳层(标题/头像/昵称/时间/操作)禁止选中;评论内容在 .c-text 单独放行 */
  user-select: none;
  -webkit-user-select: none;
  h4 {
    font-size: 14px;
    color: var(--td-text-color-secondary, #666);
    margin: 8px 0 12px;
    font-weight: 500;
  }
  .empty {
    text-align: center;
    color: var(--td-text-color-placeholder, #aaa);
    font-size: 13px;
    padding: 20px 0;
  }
  .comment {
    position: relative;
    display: flex;
    gap: 10px;
    margin-bottom: 14px;
    .c-avatar,
    .c-avatar-fallback {
      width: 32px;
      height: 32px;
      border-radius: 50%;
      object-fit: cover;
      background: var(--td-brand-color-light, #ffd5db);
      color: var(--td-brand-color, #ff2442);
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      font-size: 13px;
      font-weight: 600;
    }
    .c-body {
      flex: 1;
      min-width: 0;
      .c-name {
        font-size: 13px;
        color: var(--td-text-color-secondary, #666);
        margin-bottom: 2px;
        /* 右上角删除图标的占位,避免长昵称重叠 */
        padding-right: 1.5rem;
        .c-author {
          display: inline-flex;
          align-items: center;
          height: 16px;
          /* 昵称后模板换行自带一个空格，这里不再叠加外边距 */
          padding: 0 6px;
          border-radius: 999px;
          font-size: 10px;
          font-weight: 500;
          line-height: 1;
          color: var(--td-brand-color, #ff2442);
          background: var(--td-brand-color-light, #ffe3ea);
          vertical-align: middle;
          /* middle 对齐在中西文混排字体下会略偏下(实测 ~1.6px)，向上微调 */
          position: relative;
          top: -1.5px;
        }
        /* 我评论别人的笔记 —— 浅灰底"我"标记(帖子作者优先显示"作者") */
        .c-author.me {
          color: var(--td-text-color-secondary, #666);
          background: var(--td-bg-color-secondarycontainer, #f3f3f5);
        }
        .reply-to {
          color: var(--td-text-color-placeholder);
          margin-left: 4px;
          font-weight: 400;
        }
      }
      .c-text {
        font-size: 14px;
        color: var(--td-text-color-primary, #222);
        line-height: 1.5;
        word-break: break-word;
        user-select: text;
        -webkit-user-select: text;
        cursor: text;
      }
      /* 时间 · IP归属地 · 回复 · 点赞(同一行,点赞靠右) */
      .c-meta {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-top: 4px;
        font-size: 12px;
        line-height: 1.4;
        color: var(--td-text-color-placeholder, #aaa);
        button {
          border: none;
          background: transparent;
          color: inherit;
          cursor: pointer;
          padding: 0;
          /* 按钮默认不继承字体与行高,补上让"回复"与相邻文字同字体同基线 */
          font: inherit;
          &:hover {
            color: var(--td-text-color-secondary);
          }
        }
        .c-like {
          margin-left: auto;
          display: inline-flex;
          align-items: center;
          gap: 3px;
          &.liked {
            color: var(--td-brand-color, #ff2442);
          }
        }
      }
    }
    /* 二级回复缩进 + 灰底 */
    .replies {
      margin-top: 8px;
      padding: 6px 10px;
      background: var(--td-bg-color-component);
      border-radius: 8px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      .reply {
        position: relative;
        display: flex;
        gap: 8px;
        .c-avatar,
        .c-avatar-fallback {
          width: 24px;
          height: 24px;
          font-size: 11px;
        }
      }
    }
    /* 删除按钮(图标): 每条评论/回复的右上角 */
    .c-del-inline {
      position: absolute;
      top: 0;
      right: 0;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      width: 1.25rem;
      height: 1.25rem;
      padding: 0;
      border: none;
      background: transparent;
      color: var(--td-text-color-placeholder, #aaa);
      cursor: pointer;
      transition: color 0.15s ease;
      &:hover {
        color: var(--td-error-color, #e34d59);
      }
      :deep(svg) {
        display: block;
      }
    }
    .c-del {
      border: none;
      background: transparent;
      color: var(--td-text-color-placeholder, #aaa);
      cursor: pointer;
      align-self: flex-start;
      &:hover {
        color: var(--td-error-color, #e34d59);
      }
    }
  }
}

.action-bar {
  flex-shrink: 0;
  min-height: 99px;
  box-sizing: border-box;
  border-top: 1px solid var(--td-border-level-1-color, #eee);
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  /* 操作栏/发送按钮属于 UI 壳层,禁止选中;输入框单独放行 */
  user-select: none;
  -webkit-user-select: none;

  .actions-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .action {
    border: none;
    background: transparent;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 4px;
    color: var(--td-text-color-secondary, #666);
    font-size: 13px;
    padding: 4px;
    &:hover {
      color: var(--td-text-color-primary, #222);
    }
    .liked {
      color: var(--td-brand-color, #ff2442);
    }
    &.danger:hover {
      color: var(--td-error-color, #e34d59);
    }
    &.stat-only {
      cursor: default;
    }
  }
  /* 回复目标提示条 */
  .reply-hint {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--td-brand-color-light);
    color: var(--td-brand-color);
    padding: 4px 10px;
    border-radius: 8px;
    font-size: 12px;
    .reply-cancel {
      border: none;
      background: transparent;
      color: inherit;
      cursor: pointer;
      font-size: 14px;
      padding: 0 2px;
    }
  }
  .comment-input {
    display: flex;
    gap: 8px;
    height: 36px;
    flex-shrink: 0;
    input {
      flex: 1;
      min-width: 0;
      padding: 8px 12px;
      border-radius: 18px;
      border: 1px solid var(--td-border-level-2-color, #ddd);
      outline: none;
      font-size: 13px;
      background: var(--td-bg-color-component, #f7f7f7);
      /* 输入内容仍可选中与编辑 */
      user-select: text;
      -webkit-user-select: text;
      &:focus {
        border-color: var(--td-brand-color, #ff2442);
      }
    }
    button {
      padding: 8px 16px;
      border-radius: 18px;
      border: none;
      background: var(--td-brand-color, #ff2442);
      color: #fff;
      cursor: pointer;
      font-size: 13px;
      &:disabled {
        opacity: 0.5;
        cursor: not-allowed;
      }
    }
  }
}

/* 窄屏自适应 */
@media (max-width: 900px) {
  .post-modal-mask {
    --post-modal-height: 92vh;
  }
  .post-skeleton {
    flex-direction: column;
  }
  .post-modal {
    flex-direction: column;
  }
  .left {
    flex: 0 0 40%;
  }
  .right {
    border-left: none;
    border-top: 1px solid var(--td-border-level-1-color, #eee);
  }
}
</style>
