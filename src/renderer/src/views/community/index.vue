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
import { AddIcon } from 'tdesign-icons-vue-next'
import { communityAPI, type CommunityPost } from '@renderer/api/community'
import PostCard from '@renderer/components/community/PostCard.vue'
import PostDetailModal from '@renderer/components/community/PostDetailModal.vue'
import PostCreateDialog from '@renderer/components/community/PostCreateDialog.vue'

type Sort = 'latest' | 'recommend'

const sort = ref<Sort>('recommend')
const posts = ref<CommunityPost[]>([])
const page = ref(1)
const pageSize = 20
const total = ref(0)
const loading = ref(false)
const noMore = ref(false)
const showCreate = ref(false)
const activePostId = ref<string | null>(null)
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

async function load(reset = false) {
  if (loading.value) return
  if (!reset && noMore.value) return
  loading.value = true
  try {
    const target = reset ? 1 : page.value
    const res = await communityAPI.listPosts({ sort: sort.value, page: target, pageSize })
    if (reset) {
      posts.value = res.items
      itemRefs.value = []
      page.value = 2
    } else {
      const exist = new Set(posts.value.map((p) => p.id))
      posts.value.push(...res.items.filter((p) => !exist.has(p.id)))
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

function switchSort(next: Sort) {
  if (sort.value === next) return
  sort.value = next
  noMore.value = false
  page.value = 1
  load(true)
}

function onScroll() {
  const el = scrollRoot.value
  if (!el) return
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 280) {
    void load(false)
  }
}

const showEmpty = computed(() => !loading.value && posts.value.length === 0)

async function onCardClick(post: CommunityPost, ev: MouseEvent) {
  /* GSAP timeline 用整个卡片矩形做 FLIP 起点 */
  const cardEl = (ev.currentTarget as HTMLElement) || (ev.target as HTMLElement)
  const rect = cardEl?.getBoundingClientRect()
  activeOrigin.value = rect
    ? { x: rect.left, y: rect.top, w: rect.width, h: rect.height }
    : null
  activePostId.value = post.id
}

function onClose() {
  // GSAP 关闭动画在 modal 内部播完才 emit('close'),此处只清状态卸载
  activePostId.value = null
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
          <button :class="{ active: sort === 'recommend' }" @click="switchSort('recommend')">
            推荐
          </button>
          <button :class="{ active: sort === 'latest' }" @click="switchSort('latest')">最新</button>
        </div>
        <t-button theme="primary" @click="showCreate = true">
          <AddIcon size="16" />
          <span style="margin-left: 4px">发笔记</span>
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
        :style="{
          width: (layouts[i]?.width || colWidth) + 'px',
          transform: `translate3d(${layouts[i]?.left || 0}px, ${layouts[i]?.top || 0}px, 0)`
        }"
      >
        <PostCard :post="p" @click="(ev) => onCardClick(p, ev)" />
      </div>
    </div>

    <div v-if="loading" class="state">加载中...</div>
    <div v-else-if="noMore && posts.length > 0" class="state">- 没有更多笔记了 -</div>
    <div v-if="showEmpty" class="state empty">
      <div class="empty-illust">♬</div>
      <p>还没有人发布笔记，写下第一篇吧</p>
    </div>

    <PostCreateDialog v-model:visible="showCreate" @created="onCreated" />
    <PostDetailModal
      v-if="activePostId"
      :post-id="activePostId"
      :initial-post="activePost"
      :origin="activeOrigin"
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
  background: rgba(255, 255, 255, 0.72);
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

.state {
  text-align: center;
  padding: 18px 0;
  color: var(--td-text-color-placeholder);
  font-size: 13px;

  &.empty {
    padding: 80px 0;
    .empty-illust {
      font-size: 56px;
      color: var(--td-brand-color-light);
      margin-bottom: 12px;
    }
    p {
      margin: 0;
    }
  }
}
</style>
