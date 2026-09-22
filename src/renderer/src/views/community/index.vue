<script setup lang="ts">
/**
 * 社区主页 —— 桌面瀑布流 (JS 计算列高)
 *
 * 布局规则:
 *  - 容器宽度自适应(不再设 max-width),根据宽度算列数: ⌊(W+gutter)/(minColW+gutter)⌋
 *  - 卡片按下标顺序遍历,每张放到"当前最矮的那一列",更新该列高度
 *    -> 初始全 0 时 minCol 必然取最左,呈现"左到右、上到下"的视觉
 *  - ResizeObserver 监听容器宽度 / posts 变化 / 卡片内图片 load 触发重排
 *
 * 不用 CSS columns 是因为 CSS 多列在子元素是 absolute 时不工作,
 * 且 columns 的视觉是"上到下 -> 下一列",不是"左到右 -> 下一行"。
 */
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { MessagePlugin } from 'tdesign-vue-next'
import { AddIcon, ArrowUpIcon, RefreshIcon } from 'tdesign-icons-vue-next'
import { communityAPI, type CommunityPost } from '@renderer/api/community'
import PostCard from '@renderer/components/community/PostCard.vue'
import PostDetailModal from '@renderer/components/community/PostDetailModal.vue'
import NotePositionIndicator from '@renderer/components/community/NotePositionIndicator.vue'
import PostCreateDialog from '@renderer/components/community/PostCreateDialog.vue'
import { useAuthStore } from '@renderer/store/Auth'

type FeedMode = 'latest' | 'recommend' | 'mine'

const feedMode = ref<FeedMode>('recommend')
const posts = ref<CommunityPost[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const noMore = ref(false)
const showCreate = ref(false)
const showBackToTop = ref(false)
const authStore = useAuthStore()
const currentUserId = computed(() => authStore.user?.sub || '')
const likingPostIds = new Set<string>()
const activePostId = ref<string | null>(null)
const detailModals = ref<InstanceType<typeof PostDetailModal>[]>([])
/**
 * 当前打开的 post 完整数据 —— 从列表里取,
 * 传给 modal 让其挂载瞬间就有数据(动画起点元素首帧存在)
 */
const activePost = computed<CommunityPost | null>(() =>
  activePostId.value ? posts.value.find((p) => p.id === activePostId.value) || null : null
)
/**
 * 一镜到底动画的源矩形 —— 点击卡片时记录卡片视口位置/尺寸,
 * 传给 modal,GSAP 用它把 modal 容器 FLIP 到卡片位置作为起点。
 */
const activeOrigin = ref<{ x: number; y: number; w: number; h: number } | null>(null)
const navigationDirection = ref<-1 | 0 | 1>(0)
const outgoingPost = ref<{
  id: string
  post: CommunityPost | null
  index: number
  direction: -1 | 0 | 1
  exitDirection: -1 | 1
} | null>(null)
const activePostIndex = computed(() =>
  posts.value.findIndex((post) => post.id === activePostId.value)
)
const detailEntries = computed(() => {
  const entries = outgoingPost.value ? [outgoingPost.value] : []
  if (activePostId.value) {
    return [
      ...entries,
      {
        id: activePostId.value,
        post: activePost.value,
        index: activePostIndex.value,
        direction: navigationDirection.value,
        exitDirection: 0 as const
      }
    ]
  }
  return entries
})
const POST_BUFFER = 3

/* 一镜到底动画改用 GSAP timeline 实现 —— 不再走 View Transitions API */

/* ---------------- 瀑布流 ---------------- */

const COL_MIN_WIDTH = 240
const GUTTER = 14

const scrollRoot = ref<HTMLElement | null>(null)
const masonryRef = ref<HTMLElement | null>(null)
const itemRefs = ref<HTMLElement[]>([])
const containerWidth = ref(0)
const containerHeight = ref(0)
const layouts = ref<Array<{ left: number; top: number; width: number }>>([])
const enteringPostIds = ref(new Set<string>())
const pendingPostIds = ref(new Set<string>())
let enteringTimer: ReturnType<typeof setTimeout> | null = null
const LOAD_AHEAD_DISTANCE = 520

const colCount = computed(() => {
  const w = containerWidth.value
  if (!w) return 2
  return Math.max(1, Math.floor((w + GUTTER) / (COL_MIN_WIDTH + GUTTER)))
})
const colWidth = computed(() => {
  const w = containerWidth.value
  const c = colCount.value
  if (c <= 0) return w
  return (w - GUTTER * (c - 1)) / c
})

let relayoutScheduled = false
function scheduleRelayout() {
  if (relayoutScheduled) return
  relayoutScheduled = true
  requestAnimationFrame(async () => {
    relayoutScheduled = false
    await nextTick()
    doRelayout()
  })
}

function doRelayout() {
  const n = posts.value.length
  const cols = colCount.value
  const w = colWidth.value
  if (!cols || w <= 0) return
  const heights: number[] = new Array(cols).fill(0)
  const next: typeof layouts.value = new Array(n)
  for (let i = 0; i < n; i++) {
    const el = itemRefs.value[i]
    if (!el) {
      next[i] = { left: 0, top: 0, width: w }
      continue
    }
    let minCol = 0
    for (let c = 1; c < cols; c++) {
      if (heights[c] < heights[minCol]) minCol = c
    }
    const left = minCol * (w + GUTTER)
    const top = heights[minCol]
    next[i] = { left, top, width: w }
    heights[minCol] = top + el.offsetHeight + GUTTER
  }
  layouts.value = next
  containerHeight.value = Math.max(0, ...heights) - GUTTER
}

/* 容器宽度监听 */
let ro: ResizeObserver | null = null
onMounted(() => {
  if (masonryRef.value) {
    ro = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width || 0
      if (Math.abs(w - containerWidth.value) > 0.5) {
        containerWidth.value = w
        scheduleRelayout()
      }
    })
    ro.observe(masonryRef.value)
  }
  void load(true)
})
onUnmounted(() => ro?.disconnect())
onUnmounted(() => {
  if (enteringTimer) clearTimeout(enteringTimer)
})

/* posts 变更 -> 重排;同时监听数组身份(切换排序时 length 可能不变,
 * 必须用引用变化触发) */
watch(
  () => posts.value,
  () => scheduleRelayout()
)
/* 但 watch 数组身份只在赋值 posts.value = [...] 时触发,
 * push() 不会;所以保留长度 watch 给 load() 增量加载用 */
watch(
  () => posts.value.length,
  () => scheduleRelayout()
)

/* 图片加载完才知道真实高度 -> capture 阶段委托监听 */
function onMediaLoad() {
  scheduleRelayout()
}

/* itemRefs 自动收集 */
function setItemRef(el: any, i: number) {
  if (el) itemRefs.value[i] = el as HTMLElement
}

/* ---------------- 数据加载 ---------------- */

let pendingLoad: Promise<void> | null = null
function load(reset = false): Promise<void> {
  if (pendingLoad) return pendingLoad
  pendingLoad = loadPage(reset).finally(() => {
    pendingLoad = null
  })
  return pendingLoad
}

async function loadPage(reset = false) {
  if (loading.value) return
  if (!reset && noMore.value) return
  loading.value = true
  try {
    const target = reset ? 1 : page.value
    const res = await communityAPI.listPosts({
      // 只有「推荐」走推荐排序;「最新」「我的」都按发布时间倒序(新的在前)
      sort: feedMode.value === 'recommend' ? 'recommend' : 'latest',
      userId: feedMode.value === 'mine' ? currentUserId.value || undefined : undefined,
      page: target,
      pageSize
    })
    if (reset) {
      posts.value = res.items
      itemRefs.value = []
      layouts.value = []
      containerHeight.value = 0
      enteringPostIds.value = new Set()
      pendingPostIds.value = new Set()
      page.value = 2
    } else {
      const exist = new Set(posts.value.map((p) => p.id))
      const incoming = res.items.filter((p) => !exist.has(p.id))
      if (incoming.length) {
        const incomingIds = new Set(incoming.map((p) => p.id))
        pendingPostIds.value = incomingIds
        enteringPostIds.value = new Set()
        posts.value.push(...incoming)
        await nextTick()
        doRelayout()
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
        pendingPostIds.value = new Set()
        enteringPostIds.value = incomingIds
        if (enteringTimer) clearTimeout(enteringTimer)
        enteringTimer = setTimeout(() => {
          enteringPostIds.value = new Set()
          enteringTimer = null
        }, 460)
      }
      page.value += 1
    }
    total.value = res.total
    noMore.value = posts.value.length >= res.total
  } catch (e: any) {
    MessagePlugin.error(e?.message || '加载失败')
  } finally {
    loading.value = false
  }
}

async function switchFeed(next: FeedMode) {
  if (feedMode.value === next) return
  if (next === 'mine' && !currentUserId.value) {
    MessagePlugin.warning('请先登录后查看我的笔记')
    return
  }
  feedMode.value = next
  noMore.value = false
  page.value = 1
  scrollRoot.value?.scrollTo({ top: 0, behavior: 'auto' })
  showBackToTop.value = false
  if (pendingLoad) await pendingLoad
  await load(true)
}

async function refreshFeed() {
  noMore.value = false
  page.value = 1
  scrollRoot.value?.scrollTo({ top: 0, behavior: 'smooth' })
  if (pendingLoad) await pendingLoad
  await load(true)
}

function onScroll() {
  const el = scrollRoot.value
  if (!el) return
  showBackToTop.value = el.scrollTop > 360
  if (el.scrollHeight - el.scrollTop - el.clientHeight < LOAD_AHEAD_DISTANCE) {
    void load(false)
  }
}

function scrollToTop() {
  scrollRoot.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

async function onPostLike(post: CommunityPost) {
  if (likingPostIds.has(post.id)) return
  likingPostIds.add(post.id)
  const wasLiked = post.liked
  post.liked = !wasLiked
  post.likeCount += wasLiked ? -1 : 1
  try {
    const result = await communityAPI.toggleLike(post.id)
    if (result.liked !== post.liked) {
      post.liked = result.liked
      post.likeCount += result.liked ? 1 : -1
    }
  } catch (error: any) {
    post.liked = wasLiked
    post.likeCount += wasLiked ? 1 : -1
    MessagePlugin.error(error?.message || '操作失败')
  } finally {
    likingPostIds.delete(post.id)
  }
}

const showEmpty = computed(() => !loading.value && posts.value.length === 0)

async function onCardClick(post: CommunityPost, ev: MouseEvent) {
  /* GSAP timeline 用整个卡片矩形做 FLIP 起点 */
  const cardEl = (ev.currentTarget as HTMLElement) || (ev.target as HTMLElement)
  const rect = cardEl?.getBoundingClientRect()
  activeOrigin.value = rect ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height } : null
  navigationDirection.value = 0
  activePostId.value = post.id
}

// 提前三篇补下一页；滚轮翻页与瀑布流触底共用同一个进行中的请求。
watch([activePostId, () => posts.value.length], () => {
  const index = posts.value.findIndex((post) => post.id === activePostId.value)
  if (index >= 0 && posts.value.length - index - 1 <= POST_BUFFER && !noMore.value) {
    void load(false)
  }
})

async function getAdjacentPost(direction: -1 | 1): Promise<CommunityPost | null> {
  const index = posts.value.findIndex((post) => post.id === activePostId.value)
  if (index < 0) return null
  return getPostAt(index + direction)
}

async function getPostAt(index: number): Promise<CommunityPost | null> {
  if (!Number.isInteger(index) || index < 0 || index >= Math.max(total.value, posts.value.length))
    return null
  const currentId = activePostId.value
  while (index >= posts.value.length && !noMore.value) {
    const previousLength = posts.value.length
    await load(false)
    if (activePostId.value !== currentId) return null
    if (posts.value.length <= previousLength) return null
  }
  return posts.value[index] ?? null
}

function onPositionSelect(index: number) {
  const modal = detailModals.value.find((instance) => instance.postId === activePostId.value)
  void modal?.navigateTo(index)
}

function onNavigate(nextPost: CommunityPost, direction: -1 | 1) {
  if (!activePostId.value || outgoingPost.value) return
  outgoingPost.value = {
    id: activePostId.value,
    post: activePost.value,
    index: activePostIndex.value,
    direction: navigationDirection.value,
    exitDirection: direction
  }
  navigationDirection.value = direction
  // 切换后不再缩回最初那张卡片。
  activeOrigin.value = null
  activePostId.value = nextPost.id
}

function onDeparted(id: string) {
  if (outgoingPost.value?.id === id) outgoingPost.value = null
}

function onClose() {
  // GSAP 关闭动画在 modal 内部播完才 emit('close'),此处只清状态卸载
  activePostId.value = null
  outgoingPost.value = null
}

function onCreated(newPost: CommunityPost) {
  posts.value.unshift(newPost)
  itemRefs.value = []
  showCreate.value = false
  MessagePlugin.success('发布成功')
}

function onPostUpdated(updated: CommunityPost) {
  const idx = posts.value.findIndex((p) => p.id === updated.id)
  if (idx !== -1) posts.value[idx] = updated
}

function onPostRemoved(id: string) {
  // 仅从列表移除,activePostId 留给 modal 自己 close 动画结束后再清
  posts.value = posts.value.filter((p) => p.id !== id)
  itemRefs.value = []
}
</script>

<template>
  <div ref="scrollRoot" class="community-page" @scroll="onScroll">
    <div class="page-header">
      <div class="header-left">
        <h2>笔记</h2>
        <div class="stats">
          <span>{{ total }} 篇笔记</span>
          <span>分享你正在听的、想说的</span>
        </div>
      </div>
      <div class="header-actions">
        <div class="tabs">
          <button :class="{ active: feedMode === 'recommend' }" @click="switchFeed('recommend')">
            推荐
          </button>
          <button :class="{ active: feedMode === 'latest' }" @click="switchFeed('latest')">
            最新
          </button>
          <button :class="{ active: feedMode === 'mine' }" @click="switchFeed('mine')">我的</button>
        </div>
        <button
          class="refresh-button"
          :class="{ 'is-loading': loading }"
          type="button"
          aria-label="刷新笔记"
          title="刷新笔记"
          :aria-busy="loading"
          :disabled="loading"
          @click="refreshFeed"
        >
          <RefreshIcon size="17" />
        </button>
        <t-button theme="primary" @click="showCreate = true">
          <template #icon><AddIcon size="16" /></template>
          发笔记
        </t-button>
      </div>
    </div>

    <!-- 瀑布流容器:子项绝对定位,容器高度 = 最高列 -->
    <div
      ref="masonryRef"
      class="masonry"
      :style="{ height: containerHeight + 'px' }"
      @load.capture.passive="onMediaLoad"
    >
      <div
        v-for="(p, i) in posts"
        :key="p.id"
        :ref="(el) => setItemRef(el, i)"
        class="m-item"
        :class="{
          'is-entering': enteringPostIds.has(p.id),
          'is-pending': pendingPostIds.has(p.id)
        }"
        :style="{
          width: (layouts[i]?.width || colWidth) + 'px',
          transform: `translate3d(${layouts[i]?.left || 0}px, ${layouts[i]?.top || 0}px, 0)`,
          visibility: layouts[i] && !pendingPostIds.has(p.id) ? 'visible' : 'hidden'
        }"
      >
        <PostCard :post="p" @click="(ev) => onCardClick(p, ev)" @like="onPostLike(p)" />
      </div>
    </div>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="noMore && posts.length > 0" class="state">- 没有更多笔记了 -</div>
    <section v-if="showEmpty" class="community-empty" aria-labelledby="empty-note-title">
      <div class="empty-artwork" aria-hidden="true">
        <span class="empty-halo" />
        <span class="empty-record"><span>♪</span></span>
        <div class="empty-paper">
          <span class="empty-tape" />
          <span class="paper-caption">今日随记</span>
          <span class="paper-line" />
          <span class="paper-line short" />
          <span class="paper-music">♫</span>
        </div>
        <span class="empty-spark spark-one">✦</span>
        <span class="empty-spark spark-two">✧</span>
      </div>
      <h3 id="empty-note-title">让喜欢的音乐，有个回响</h3>
      <p class="empty-description">这里还没有笔记。分享一首歌，或记下此刻的心情。</p>
      <button class="empty-create" @click="showCreate = true">
        <AddIcon size="17" />
        写下第一篇笔记
      </button>
      <p class="empty-hint">文字、照片、歌曲和歌单，都可以分享</p>
    </section>

    <Transition name="back-to-top">
      <button
        v-if="showBackToTop"
        class="back-to-top"
        type="button"
        aria-label="回到顶部"
        title="回到顶部"
        @click="scrollToTop"
      >
        <ArrowUpIcon size="19" />
      </button>
    </Transition>

    <PostCreateDialog v-model:visible="showCreate" @created="onCreated" />
    <NotePositionIndicator
      v-if="activePostId"
      :index="activePostIndex"
      :count="Math.max(total, posts.length)"
      :disabled="!!outgoingPost"
      @select="onPositionSelect"
    />
    <PostDetailModal
      v-for="entry in detailEntries"
      :key="entry.id"
      ref="detailModals"
      :post-id="entry.id"
      :initial-post="entry.post"
      :origin="activeOrigin"
      :navigation-direction="entry.direction"
      :exit-direction="entry.exitDirection"
      :paired-transition="!!outgoingPost"
      :get-adjacent-post="getAdjacentPost"
      :get-post-at="getPostAt"
      :post-index="entry.index"
      @departed="onDeparted"
      @navigate="onNavigate"
      @close="onClose"
      @updated="onPostUpdated"
      @removed="onPostRemoved"
    />
  </div>
</template>

<style scoped lang="scss">
.community-page {
  height: 100%;
  overflow-y: auto;
  padding: 0 24px 100px;
  background: transparent;
}

/* 复用项目 page-header 风格 —— 与 songlist.vue 对齐 */
.page-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin: 0 -24px 1.5rem; /* 抵消父级 padding,让 header 横向贴边 */
  padding: 16px 24px 12px;
  font-family: Arial, Helvetica, sans-serif;
  background: color-mix(in srgb, var(--td-bg-color-container, #fff) 72%, transparent);
  backdrop-filter: saturate(180%) blur(16px);
  -webkit-backdrop-filter: saturate(180%) blur(16px);
  border-bottom: 1px solid var(--td-component-stroke);

  .header-left {
    h2 {
      border-left: 8px solid var(--td-brand-color-3);
      padding-left: 12px;
      border-radius: 8px;
      line-height: 1.5em;
      color: var(--local-text-primary, var(--td-text-color-primary));
      margin: 0 0 0.5rem;
      font-size: 1.875rem;
      font-weight: 600;
    }
    .stats {
      display: flex;
      gap: 1rem;
      font-size: 0.875rem;
      color: var(--local-text-secondary, var(--td-text-color-secondary));

      span:not(:last-child)::after {
        content: '•';
        margin-left: 1rem;
        color: var(--local-border, var(--td-component-stroke));
      }
    }
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 12px;

    .tabs {
      display: inline-flex;
      gap: 2px;
      background: var(--td-bg-color-component);
      border-radius: 18px;
      padding: 3px;

      button {
        border: none;
        background: transparent;
        padding: 6px 16px;
        cursor: pointer;
        border-radius: 14px;
        font-size: 13px;
        color: var(--td-text-color-secondary);
        font-weight: 500;
        transition: all 0.15s;

        &.active {
          background: var(--td-bg-color-container);
          color: var(--td-brand-color);
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.06);
        }
        &:hover:not(.active) {
          color: var(--td-text-color-primary);
        }
      }
    }

    .refresh-button {
      width: 34px;
      height: 34px;
      flex: 0 0 34px;
      display: grid;
      place-items: center;
      padding: 0;
      border: 1px solid var(--td-component-stroke);
      border-radius: 50%;
      color: var(--td-text-color-secondary);
      background: color-mix(in srgb, var(--td-bg-color-container) 76%, transparent);
      cursor: pointer;
      transition:
        color 160ms ease,
        border-color 160ms ease,
        background 160ms ease,
        transform 160ms ease;

      &:hover:not(:disabled) {
        color: var(--td-brand-color);
        border-color: var(--td-brand-color-light);
        background: var(--td-bg-color-container);
        transform: rotate(20deg);
      }

      &:active:not(:disabled) {
        transform: rotate(20deg) scale(0.92);
      }

      &:focus-visible {
        outline: 2px solid var(--td-brand-color);
        outline-offset: 3px;
      }

      &:disabled {
        cursor: wait;
        opacity: 0.7;
      }

      &.is-loading :deep(svg) {
        animation: refresh-spin 800ms linear infinite;
      }
    }
  }
}

@keyframes refresh-spin {
  to {
    transform: rotate(360deg);
  }
}

/* 瀑布流容器 —— 相对定位,子项 absolute */
.masonry {
  position: relative;
  width: 100%;
}
.m-item {
  position: absolute;
  top: 0;
  left: 0;
  transition: transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
  will-change: transform;
}
.m-item.is-entering {
  /* Newly appended items already render at their measured masonry position. */
  transition: none;
}
.m-item.is-pending {
  transition: none;
}
.m-item.is-entering :deep(.note-card) {
  animation: note-card-rise-in 360ms cubic-bezier(0.22, 0.61, 0.36, 1) both;
}

@keyframes note-card-rise-in {
  from {
    opacity: 0;
    transform: translateY(16px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.state {
  text-align: center;
  padding: 18px 0;
  color: var(--td-text-color-placeholder);
  font-size: 13px;
}

.back-to-top {
  position: fixed;
  right: 28px;
  bottom: 104px;
  z-index: 20;
  width: 42px;
  height: 42px;
  display: grid;
  place-items: center;
  padding: 0;
  border: 1px solid color-mix(in srgb, var(--td-component-stroke) 72%, transparent);
  border-radius: 50%;
  color: var(--td-text-color-primary);
  /* 更通透的毛玻璃:底色更透明、模糊更强 */
  background: color-mix(in srgb, var(--td-bg-color-container) 44%, transparent);
  backdrop-filter: blur(24px) saturate(160%);
  -webkit-backdrop-filter: blur(24px) saturate(160%);
  box-shadow: 0 8px 24px rgb(25 31 43 / 12%);
  cursor: pointer;
  transition:
    transform 180ms ease,
    background 180ms ease,
    box-shadow 180ms ease;

  /* 悬停只把透明度拉回原来的 68%,不再上浮 */
  &:hover {
    background: color-mix(in srgb, var(--td-bg-color-container) 68%, transparent);
    box-shadow: 0 10px 26px rgb(25 31 43 / 16%);
  }

  &:active {
    transform: scale(0.94);
  }

  &:focus-visible {
    outline: 2px solid var(--td-brand-color);
    outline-offset: 3px;
  }
}

.back-to-top-enter-active,
.back-to-top-leave-active {
  transition:
    opacity 180ms ease,
    transform 220ms cubic-bezier(0.22, 0.61, 0.36, 1);
}
.back-to-top-enter-from,
.back-to-top-leave-to {
  opacity: 0;
  transform: translateY(10px) scale(0.86);
}

.community-empty {
  min-height: clamp(390px, 58vh, 540px);
  box-sizing: border-box;
  padding: 32px 16px 48px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  animation: empty-appear 360ms ease both;

  h3 {
    margin: 22px 0 10px;
    font-size: 22px;
    line-height: 1.5;
    font-weight: 600;
    letter-spacing: 0.5px;
    color: var(--td-text-color-primary);
  }
}
.empty-artwork {
  position: relative;
  width: 242px;
  height: 180px;
}
.empty-halo {
  position: absolute;
  width: 170px;
  height: 170px;
  left: 36px;
  top: 4px;
  border-radius: 50%;
  background: var(--td-brand-color-light, #fff0f4);
  opacity: 0.75;
}
.empty-record {
  position: absolute;
  right: 17px;
  top: 37px;
  width: 114px;
  height: 114px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: #343943;
  box-shadow: 0 8px 16px rgba(25, 31, 43, 0.12);

  &::before,
  &::after {
    content: '';
    position: absolute;
    inset: 9px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 50%;
  }
  &::after {
    inset: 17px;
  }
  span {
    width: 39px;
    height: 39px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--td-brand-color, #fb668b);
    color: #fff;
    font-size: 23px;
  }
}
.empty-paper {
  position: absolute;
  left: 32px;
  top: 20px;
  width: 118px;
  height: 142px;
  padding: 30px 19px 16px;
  box-sizing: border-box;
  border-radius: 8px;
  border: 1px solid var(--td-border-level-1-color, #eee);
  background: var(--td-bg-color-container, #fff);
  transform: rotate(-9deg);
  box-shadow: 0 10px 26px rgba(40, 30, 36, 0.08);
}
.empty-tape {
  position: absolute;
  width: 44px;
  height: 17px;
  top: -7px;
  left: 36px;
  transform: rotate(4deg);
  background: color-mix(
    in srgb,
    var(--td-brand-color, #fb668b) 22%,
    var(--td-bg-color-container, #fff)
  );
  opacity: 0.85;
}
.paper-caption {
  display: block;
  font-size: 15px;
  font-family: 'lyricfont', cursive;
  color: var(--td-text-color-secondary);
  text-align: left;
  margin-bottom: 14px;
}
.paper-line {
  display: block;
  height: 3px;
  border-radius: 2px;
  background: var(--td-bg-color-component, #eee);
  margin-top: 8px;
  &.short {
    width: 65%;
  }
}
.paper-music {
  display: block;
  text-align: right;
  margin-top: 6px;
  font-size: 26px;
  line-height: 1;
  color: var(--td-brand-color, #fb668b);
}
.empty-spark {
  position: absolute;
  color: var(--td-brand-color, #fb668b);
  opacity: 0.6;
  &.spark-one {
    right: 20px;
    top: 8px;
    font-size: 19px;
  }
  &.spark-two {
    left: 9px;
    bottom: 18px;
    font-size: 24px;
  }
}
.empty-description {
  margin: 0;
  max-width: 360px;
  font-size: 14px;
  line-height: 1.8;
  color: var(--td-text-color-secondary);
  text-wrap: balance;
}
.empty-create {
  -webkit-app-region: no-drag;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 40px;
  margin-top: 25px;
  padding: 0 22px;
  border: none;
  border-radius: 22px;
  font: inherit;
  font-size: 14px;
  font-weight: 500;
  color: var(--td-text-color-anti, #fff);
  background: var(--td-brand-color, #fb668b);
  cursor: pointer;
  transition:
    transform 180ms ease,
    background 180ms ease;
  &:hover {
    background: var(--td-brand-color-hover);
    transform: translateY(-2px);
  }
  &:active {
    transform: translateY(0) scale(0.97);
  }
  &:focus-visible {
    outline: 2px solid var(--td-brand-color);
    outline-offset: 4px;
  }
}
.empty-hint {
  margin: 14px 0 0;
  font-size: 12px;
  line-height: 1.7;
  color: var(--td-text-color-placeholder);
}
@keyframes empty-appear {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .community-empty {
    animation: none;
  }
  .m-item {
    transition: none;
  }
  .m-item.is-entering :deep(.note-card) {
    animation: none;
  }
  .empty-create {
    transition: none;
  }
  .refresh-button {
    transition: none;
  }
  .refresh-button.is-loading :deep(svg) {
    animation: none;
  }
  .back-to-top {
    transition: none;
  }
  .back-to-top-enter-active,
  .back-to-top-leave-active {
    transition: none;
  }
}

@media (max-width: 720px) {
  .community-page {
    padding-right: 14px;
    padding-left: 14px;
  }

  .page-header {
    flex-direction: column;
    gap: 12px;
    margin-right: -14px;
    margin-left: -14px;
    padding: 14px;

    .header-left {
      width: 100%;

      h2 {
        font-size: 1.6rem;
      }
    }

    .header-actions {
      width: 100%;
      gap: 8px;

      .tabs {
        flex: 1;

        button {
          flex: 1;
          padding-right: 10px;
          padding-left: 10px;
        }
      }
    }
  }

  .back-to-top {
    right: 16px;
    bottom: 88px;
  }
}
</style>
