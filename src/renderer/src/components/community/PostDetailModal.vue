<script setup lang="ts">
/**
 * 帖子详情弹窗 —— 小红书风格全屏 modal
 *
 * 布局:
 *  - 左侧 60%: 图片轮播(无图时显示渐变文本块)
 *  - 右侧 40%: 作者头像/昵称 -> 正文 -> 附件(歌单/单曲) -> 评论列表 -> 评论输入 + 操作栏
 *  - 底部操作栏(右侧固定): 点赞 / 举报 / 删除(仅作者) / 关闭
 *
 * 数据:
 *  - 进入时:GET /community/posts/:id + GET /community/posts/:id/comments
 *  - 点赞/评论后本地乐观更新计数,失败回滚
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
  ChevronLeftIcon,
  ChevronRightIcon,
  PlayCircleIcon,
  AddIcon
} from 'tdesign-icons-vue-next'
import { communityAPI, type CommunityPost, type CommunityComment } from '@renderer/api/community'
import { LocalUserDetailStore } from '@renderer/store/LocalUserDetail'
import { ossAvatar, ossCard } from '@renderer/utils/ossImage'
import songListAPI from '@renderer/api/songList'
import { cloudSongListAPI } from '@renderer/api/cloudSongList'
import { usePostAttachmentCover } from './usePostAttachmentCover'
import TextNoteCover from './TextNoteCover.vue'

const props = defineProps<{
  postId: string
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

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches

function showNavigationHint(text: string) {
  clearTimeout(hintTimer)
  navigationHint.value = text
  hintTimer = setTimeout(() => (navigationHint.value = ''), 1800)
}

async function onWheel(event: WheelEvent) {
  const target = event.target as HTMLElement
  if (
    !props.getAdjacentPost ||
    event.ctrlKey ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY) ||
    target.closest(
      '.comments, .comment-input, .reply-hint, input, textarea, [contenteditable="true"]'
    )
  ) {
    wheelTotal = 0
    return
  }

  // 非评论区域只翻笔记，不把滚轮传给背景瀑布流。
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
  await navigatePost(direction, () => props.getAdjacentPost!(direction))
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
const userStore = LocalUserDetailStore()

const post = ref<CommunityPost | null>(props.initialPost ?? null)
const comments = ref<CommunityComment[]>([])
const commentsLoading = ref(true)
const commentInput = ref('')
const submittingComment = ref(false)
const imageIdx = ref(0)
/** 已有列表快照时保留内容，只对尚未获取的数据显示骨架。 */
const loading = ref(!props.initialPost)
const loadedImage = ref('')
const failedImage = ref('')
const loadedAvatar = ref('')
const failedAvatar = ref('')
const loadedAttachmentCover = ref('')

const isAuthor = computed(() => {
  // userStore.userInfo.uid 是用户 sub —— 看其他模块的用法
  const myId = (userStore as any)?.userInfo?.uid || (userStore as any)?.userInfo?.userId
  return !!myId && post.value?.userId === myId
})

const { cover: attCoverUrl, onCoverError } = usePostAttachmentCover(() => post.value)
const currentImage = computed(() => {
  const item = post.value?.images?.[imageIdx.value]
  if (!item) return attCoverUrl.value
  return typeof item === 'string' ? item : item.url
})
const hasImages = computed(() => !!currentImage.value)
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

async function loadComments() {
  commentsLoading.value = true
  try {
    const res = await communityAPI.listComments(props.postId, 1, 100)
    if (disposed) return
    comments.value = res.items
  } catch (e: any) {
    if (disposed) return
    MessagePlugin.error(e?.message || '评论加载失败')
  } finally {
    commentsLoading.value = false
  }
}

function prevImage() {
  if (!post.value) return
  imageIdx.value = (imageIdx.value - 1 + post.value.images.length) % post.value.images.length
}
function nextImage() {
  if (!post.value) return
  imageIdx.value = (imageIdx.value + 1) % post.value.images.length
}

async function onLike() {
  if (!post.value) return
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
 *  回复时:
 *   - 一级评论的"回复"按钮 -> replyTo = { commentId: 该评论id, username: 该评论作者 }
 *   - 二级评论的"回复"按钮 -> parentId 仍指向根, replyToUsername 是被回复人
 *   - 后端会做防深嵌套(三层及以上自动挂到根)
 * ============================================================ */

interface ReplyTarget {
  /** 真正用于 API 的 parentId(始终是根评论 id) */
  parentId: string
  /** "回复 @x" 显示的目标昵称 */
  username: string
}

const replyTarget = ref<ReplyTarget | null>(null)

/** 按 parentId 分组,模板里渲染嵌套 */
const rootComments = computed<CommunityComment[]>(() => comments.value.filter((c) => !c.parentId))
const repliesByParent = computed<Record<string, CommunityComment[]>>(() => {
  const map: Record<string, CommunityComment[]> = {}
  for (const c of comments.value) {
    if (c.parentId) {
      ;(map[c.parentId] ||= []).push(c)
    }
  }
  return map
})

function startReply(c: CommunityComment) {
  replyTarget.value = {
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
      replyToUsername: replyTarget.value?.username
    })
    /* 回复挂在已有列表合适位置 —— 一级 push 到末尾,二级 push 到末尾(按时序)
     * listComments 已经按 createdAt asc,所以新回复自然出现在末尾 */
    comments.value.push(c)
    commentInput.value = ''
    replyTarget.value = null
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

async function onDelete() {
  const confirmDialog = DialogPlugin.confirm({
    header: '删除帖子',
    body: '帖子删除后无法恢复,确认删除?',
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
  const res = await songListAPI.hasSong(id, songmid)
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
      const res = await songListAPI.removeSong(id, String(song.songmid))
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
          <button class="close-btn" aria-label="关闭详情" @click="() => close()">
            <CloseIcon size="22" />
          </button>
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
                    v-if="loadedImage !== currentImage && failedImage !== currentImage"
                    class="image-skeleton skeleton"
                    role="status"
                    aria-label="正在加载笔记图片"
                  />
                </Transition>
                <img
                  class="image-backdrop"
                  :src="ossCard(currentImage)"
                  alt=""
                  aria-hidden="true"
                  draggable="false"
                />
                <img
                  :key="currentImage"
                  class="big-img"
                  :src="ossCard(currentImage)"
                  :alt="post.username"
                  :data-image-url="currentImage"
                  :data-cover-url="post.images.length ? undefined : currentImage"
                  @load="loadedImage = ($event.target as HTMLImageElement).dataset.imageUrl || ''"
                  @error="onImageError"
                />
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
                    @click="imageIdx = i"
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
                  <div class="time">{{ formatTime(post.createdAt) }}</div>
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
                <section class="comments" :aria-busy="commentsLoading">
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
                          <div class="c-body">
                            <div class="c-name">
                              {{ c.username }}
                              <span class="c-time">{{ formatTime(c.createdAt) }}</span>
                            </div>
                            <div class="c-text">{{ c.content }}</div>
                            <div class="c-actions">
                              <button
                                class="c-like"
                                :class="{ liked: c.liked }"
                                @click="toggleCommentLike(c)"
                              >
                                <component :is="c.liked ? HeartFilledIcon : HeartIcon" size="13" />
                                <span v-if="c.likeCount">{{ c.likeCount }}</span>
                              </button>
                              <button class="c-reply" @click="startReply(c)">回复</button>
                              <button
                                v-if="
                                  (userStore as any)?.userInfo?.uid === c.userId ||
                                  (userStore as any)?.userInfo?.userId === c.userId
                                "
                                class="c-del-inline"
                                @click="deleteComment(c)"
                              >
                                删除
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
                                <div class="c-body">
                                  <div class="c-name">
                                    {{ r.username }}
                                    <template v-if="r.replyToUsername">
                                      <span class="reply-to"> 回复 @{{ r.replyToUsername }}</span>
                                    </template>
                                    <span class="c-time">{{ formatTime(r.createdAt) }}</span>
                                  </div>
                                  <div class="c-text">{{ r.content }}</div>
                                  <div class="c-actions">
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
                                    <button class="c-reply" @click="startReply(r)">回复</button>
                                    <button
                                      v-if="
                                        (userStore as any)?.userInfo?.uid === r.userId ||
                                        (userStore as any)?.userInfo?.userId === r.userId
                                      "
                                      class="c-del-inline"
                                      @click="deleteComment(r)"
                                    >
                                      删除
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
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
                  <div class="action stat-only">
                    <ChatIcon size="20" />
                    <span>{{ post.commentCount }}</span>
                  </div>
                  <button class="action" @click="onReport"><ErrorCircleIcon size="18" /></button>
                  <button v-if="isAuthor" class="action danger" @click="onDelete">
                    <DeleteIcon size="18" />
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

.close-btn {
  -webkit-app-region: no-drag;
  position: absolute;
  top: 12px;
  right: 12px;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: none;
  background: rgba(0, 0, 0, 0.4);
  color: #fff;
  cursor: pointer;
  z-index: 10;
  display: flex;
  align-items: center;
  justify-content: center;
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
  padding: 16px 60px 16px 20px;
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
  padding: 12px 20px;

  .content-text {
    font-size: 14px;
    line-height: 1.7;
    color: var(--td-text-color-primary, #333);
    margin: 0 0 12px;
    white-space: pre-wrap;
    word-break: break-word;
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
        .reply-to {
          color: var(--td-text-color-placeholder);
          margin-left: 4px;
          font-weight: 400;
        }
        .c-time {
          color: var(--td-text-color-placeholder, #aaa);
          font-size: 11px;
          margin-left: 8px;
        }
      }
      .c-text {
        font-size: 14px;
        color: var(--td-text-color-primary, #222);
        line-height: 1.5;
        word-break: break-word;
      }
      .c-actions {
        display: flex;
        gap: 12px;
        margin-top: 4px;
        font-size: 12px;
        button {
          border: none;
          background: transparent;
          color: var(--td-text-color-placeholder);
          cursor: pointer;
          padding: 0;
          &:hover {
            color: var(--td-text-color-secondary);
          }
        }
        .c-like {
          display: inline-flex;
          align-items: center;
          gap: 3px;
          &.liked {
            color: var(--td-brand-color, #ff2442);
          }
        }
        .c-del-inline:hover {
          color: var(--td-error-color, #e34d59);
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
