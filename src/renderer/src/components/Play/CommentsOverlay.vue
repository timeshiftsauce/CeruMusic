<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted, nextTick } from 'vue'
import { CloseIcon, HeartIcon } from 'tdesign-icons-vue-next'
import { useGlobalPlayStatusStore } from '@renderer/store/GlobalPlayStatus'
import { storeToRefs } from 'pinia'

const props = withDefaults(
  defineProps<{
    show: boolean
    mainColor?: string
  }>(),
  {
    mainColor: 'var(--td-brand-color)'
  }
)

const emit = defineEmits(['close'])

const globalPlayStatus = useGlobalPlayStatusStore()
const { player } = storeToRefs(globalPlayStatus)

// 默认是 'hot'，如果用户切换过，下次打开保持
// 实际上组件可能会被销毁重建，如果想持久化需要存到 store 或 localStorage
// 目前组件是通过 v-if 控制显示隐藏（在 CommentsOverlay 内部是 Transition + v-if="show"）
// 但是 FullPlay 中 CommentsOverlay 是常驻的，只是 show 属性变化
const currentType = ref<'hot' | 'latest'>('hot')
const expandedReplies = ref<Record<string | number, boolean>>({})
const loadTrigger = ref<HTMLElement | null>(null)
const contentRef = ref<HTMLElement | null>(null)
let observer: IntersectionObserver | null = null

// 记录上次关闭时的滚动位置，再次打开时恢复
const scrollPositions = ref({
  hot: 0,
  latest: 0
})

const list = computed(() => {
  return currentType.value === 'hot'
    ? player.value.comments.hotList
    : player.value.comments.latestList
})

const isLoading = computed(() => player.value.comments.isLoading)
const hasMore = computed(() => {
  // if (currentType.value === 'hot') return false
  return player.value.comments.page < player.value.comments.maxPage
})

const switchType = (type: 'hot' | 'latest') => {
  if (currentType.value === type) return

  // 切换前保存当前滚动位置
  if (contentRef.value) {
    scrollPositions.value[currentType.value] = contentRef.value.scrollTop
  }

  currentType.value = type

  // 恢复目标类型的滚动位置
  nextTick(() => {
    if (contentRef.value) {
      contentRef.value.scrollTop = scrollPositions.value[type]
    }
  })

  const targetList =
    type === 'hot' ? player.value.comments.hotList : player.value.comments.latestList
  if (targetList.length === 0) {
    globalPlayStatus.fetchComments(1, type)
  }
}

const loadMore = () => {
  if (isLoading.value || !hasMore.value) return
  const nextPage = player.value.comments.page + 1
  globalPlayStatus.fetchComments(nextPage, currentType.value)
}

const toggleReply = (id: string | number) => {
  expandedReplies.value[id] = !expandedReplies.value[id]
}

const formatNumber = (num: number) => {
  if (num > 10000) {
    return (num / 10000).toFixed(1) + 'w'
  }
  return num
}

// Infinite Scroll Observer
const initObserver = () => {
  if (observer) observer.disconnect()

  // 使用 content 元素作为 root
  const rootEl = contentRef.value
  if (!rootEl) return // 如果还没挂载，稍后重试

  observer = new IntersectionObserver(
    (entries) => {
      const entry = entries[0]
      // 只要有交叉，且有更多数据，且不在加载中，就加载
      if (entry.isIntersecting && !isLoading.value && hasMore.value) {
        loadMore()
      }
    },
    {
      threshold: 0.1,
      rootMargin: '200px',
      root: rootEl // 指定滚动容器为 root
    }
  )

  if (loadTrigger.value) {
    observer.observe(loadTrigger.value)
  }
}

watch(
  () => props.show,
  (val) => {
    if (val) {
      nextTick(() => {
        if (contentRef.value) {
          contentRef.value.scrollTop = scrollPositions.value[currentType.value]
        }
        initObserver()
      })
    } else {
      // 关闭时记录位置
      if (contentRef.value) {
        scrollPositions.value[currentType.value] = contentRef.value.scrollTop
      }
      if (observer) observer.disconnect()
    }
  }
)

watch(list, () => {
  nextTick(() => {
    // 列表更新后，如果处于显示状态，重新初始化观察者
    if (props.show && loadTrigger.value) {
      initObserver()
    }
  })
})

// 监听加载状态变化，如果变为空闲且仍在视口内，可能需要再次触发
watch(isLoading, (val) => {
  if (!val && hasMore.value && props.show) {
    nextTick(() => {
      if (observer && loadTrigger.value) {
        observer.unobserve(loadTrigger.value)
        observer.observe(loadTrigger.value)
      }
    })
  }
})

onMounted(() => {
  if (props.show) initObserver()
})

onUnmounted(() => {
  if (observer) observer.disconnect()
})

// Reset type when song changes
watch(
  () => player.value.songId,
  () => {
    expandedReplies.value = {}

    // 重置滚动位置
    if (contentRef.value) {
      contentRef.value.scrollTop = 0
      scrollPositions.value = { hot: 0, latest: 0 }
    }
  }
)

// Animation hooks for expanding replies
const onEnter = (el: Element) => {
  const element = el as HTMLElement
  element.style.height = '0'
  element.style.opacity = '0'
  // Force reflow
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  element.offsetHeight
  element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  element.style.height = element.scrollHeight + 'px'
  element.style.opacity = '1'
}

const onAfterEnter = (el: Element) => {
  const element = el as HTMLElement
  element.style.height = 'auto'
  element.style.opacity = ''
  element.style.transition = ''
}

const onLeave = (el: Element) => {
  const element = el as HTMLElement
  element.style.transition = 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
  element.style.height = element.scrollHeight + 'px'
  element.style.opacity = '1'
  // Force reflow
  // eslint-disable-next-line @typescript-eslint/no-unused-expressions
  element.offsetHeight
  element.style.height = '0'
  element.style.opacity = '0'
}
</script>

<template>
  <Teleport to="body">
    <Transition name="fade-overlay">
      <div v-show="show" class="comments-overlay" @click.self="$emit('close')">
        <div class="comments-card">
          <!-- Header -->
          <div class="header">
            <div class="tabs">
              <span
                class="tab-item"
                :class="{ active: currentType === 'hot' }"
                @click="switchType('hot')"
                >热门评论
              </span>
              <span
                class="tab-item"
                :class="{ active: currentType === 'latest' }"
                @click="switchType('latest')"
                >最新评论
                <span v-if="player.comments.total" class="count">{{
                  formatNumber(player.comments.total)
                }}</span></span
              >
            </div>
            <button class="close-btn" @click="$emit('close')">
              <CloseIcon size="24" />
            </button>
          </div>

          <!-- Content -->
          <div ref="contentRef" class="content custom-scrollbar">
            <div v-if="isLoading && list.length === 0" class="loading-state">
              <t-loading text="加载中..." size="small" />
            </div>
            <div v-else-if="list.length === 0" class="empty-state">暂无评论</div>
            <div v-else class="comment-list">
              <div v-for="item in list" :key="item.id" class="comment-item">
                <t-avatar :image="item.avatar" size="40px" shape="circle" class="avatar" />
                <div class="comment-body">
                  <div class="user-info">
                    <span class="name">{{ item.userName }}</span>
                    <span class="time">{{ item.timeStr }}</span>
                  </div>
                  <div class="text">{{ item.text }}</div>

                  <!-- Images -->
                  <div v-if="item.images && item.images.length > 0" class="image-list">
                    <t-image-viewer :images="item.images">
                      <template #trigger="{ open }">
                        <div class="image-grid">
                          <t-image
                            v-for="(img, index) in item.images"
                            :key="index"
                            :src="img"
                            class="comment-image"
                            fit="cover"
                            @click="open(index)"
                          />
                        </div>
                      </template>
                    </t-image-viewer>
                  </div>

                  <!-- Reply -->
                  <div v-if="item.reply && item.reply.length > 0" class="reply-section">
                    <div
                      v-if="!expandedReplies[item.id]"
                      class="expand-reply"
                      @click="toggleReply(item.id)"
                    >
                      展开 {{ item.reply.length }} 条评论
                    </div>
                    <Transition @enter="onEnter" @after-enter="onAfterEnter" @leave="onLeave">
                      <div v-if="expandedReplies[item.id]" class="replies-wrapper">
                        <div class="replies">
                          <div v-for="reply in item.reply" :key="reply.id" class="reply-item">
                            <t-avatar
                              :image="reply.avatar"
                              size="24px"
                              shape="circle"
                              class="reply-avatar"
                            />
                            <div class="reply-content">
                              <span class="reply-user">{{ reply.userName }}</span>
                              <span class="reply-text">: {{ reply.text }}</span>
                            </div>
                          </div>
                          <div class="collapse-reply" @click="toggleReply(item.id)">收起评论</div>
                        </div>
                      </div>
                    </Transition>
                  </div>
                </div>
                <div class="like-info">
                  <HeartIcon size="16" />
                  <span class="count">{{ formatNumber(item.likedCount) }}</span>
                </div>
              </div>

              <div ref="loadTrigger" class="load-trigger">
                <t-loading v-if="isLoading" text="加载中..." size="small" />
                <span v-else-if="!hasMore && list.length > 0" class="no-more">没有更多了</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style lang="scss" scoped>
.comments-overlay {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
  background: rgba(0, 0, 0, 0.4);
  backdrop-filter: blur(8px);
}

.comments-card {
  width: 80vw;
  height: 80vh;
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(60px);
  -webkit-backdrop-filter: blur(60px);
  border-radius: 24px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 20px 50px rgba(0, 0, 0, 0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  color: #fff;
}

.header {
  height: 60px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.1);
}

.tabs {
  display: flex;
  gap: 20px;
}

.tab-item {
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  opacity: 0.6;
  transition: all 0.3s;
  position: relative;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
  display: flex;
  align-items: center;
  gap: 6px;

  .count {
    font-size: 12px;
    opacity: 0.8;
    font-weight: normal;
  }

  &:hover {
    opacity: 0.9;
  }

  &.active {
    opacity: 1;
    font-size: 18px;

    &::after {
      content: '';
      position: absolute;
      bottom: -6px;
      left: 0;
      width: 100%;
      height: 3px;
      background: v-bind(mainColor);
      border-radius: 2px;
      box-shadow: 0 0 8px v-bind(mainColor);
    }
  }
}

.close-btn {
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.8);
  cursor: pointer;
  padding: 8px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.3s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.content {
  flex: 1;
  overflow-y: auto;
  padding: 20px;
}

.loading-state,
.empty-state {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
}

.comment-list {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.comment-item {
  display: flex;
  gap: 16px;
  position: relative;
}

.avatar {
  flex-shrink: 0;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
}

.comment-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;

  .name {
    font-size: 14px;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .time {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.5);
  }
}

.text {
  font-size: 14px;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.9);
  white-space: pre-wrap;
  font-weight: 400;
  user-select: text;
}

.like-info {
  position: absolute;
  top: 0;
  right: 0;
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);

  .count {
    min-width: 20px;
  }
}

.image-list {
  margin-top: 8px;
}

.image-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.comment-image {
  width: 100px;
  height: 100px;
  border-radius: 8px;
  cursor: zoom-in;
  border: 1px solid rgba(255, 255, 255, 0.1);
  transition: transform 0.2s;

  &:hover {
    transform: scale(1.02);
    border-color: rgba(255, 255, 255, 0.3);
  }
}

.reply-section {
  margin-top: 12px;
  background: rgba(0, 0, 0, 0.15);
  border-radius: 12px;
  padding: 12px;
  font-size: 13px;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.expand-reply,
.collapse-reply {
  color: v-bind(mainColor);
  cursor: pointer;
  font-size: 12px;
  opacity: 0.9;

  &:hover {
    text-decoration: underline;
    opacity: 1;
  }
}

.replies-wrapper {
  overflow: hidden;
}

.replies {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding-top: 8px;
}

.reply-item {
  display: flex;
  gap: 8px;
  align-items: flex-start;

  .reply-avatar {
    flex-shrink: 0;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .reply-content {
    line-height: 1.5;
    flex: 1;
  }

  .reply-user {
    color: rgba(255, 255, 255, 0.95);
    font-weight: 600;
    margin-right: 4px;
  }

  .reply-text {
    color: rgba(255, 255, 255, 0.85);
    user-select: text;
  }
}

.load-trigger {
  display: flex;
  justify-content: center;
  padding: 20px 0;
  min-height: 40px;
}

.no-more {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.4);
}

/* Custom Scrollbar */
.custom-scrollbar {
  scrollbar-arrow-color: transparent;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;
}

.custom-scrollbar::-webkit-scrollbar {
  width: 8px;
}

.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.3);
  border-radius: 4px;
}

.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.5);
}

.fade-overlay-enter-active,
.fade-overlay-leave-active {
  transition: opacity 0.3s ease;
}

.fade-overlay-enter-from,
.fade-overlay-leave-to {
  opacity: 0;
}
</style>
