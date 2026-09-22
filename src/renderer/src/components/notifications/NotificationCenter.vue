<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next'
import {
  ChatIcon,
  HeartIcon,
  NotificationIcon,
  RefreshIcon,
  DeleteIcon,
  CloseIcon
} from 'tdesign-icons-vue-next'
import { useNotificationsStore } from '@renderer/store/Notifications'
import { useNotificationConnection } from '@renderer/composables/useNotificationConnection'
import { ossAvatar, ossCard } from '@renderer/utils/ossImage'
import type { InboxMessage, MessageCategory } from '@renderer/api/notifications'
import NoticeCard from './NoticeCard.vue'
import PostDetailModal from '../community/PostDetailModal.vue'

const inbox = useNotificationsStore()
useNotificationConnection(inbox)
const router = useRouter()
const activePost = ref<string | null>(null)
const scrollRoot = ref<HTMLElement>()
watch(
  () => inbox.items,
  async () => {
    const root = scrollRoot.value
    if (!root || root.scrollTop < 1) return
    const top = root.getBoundingClientRect().top
    const anchor = [...root.querySelectorAll<HTMLElement>('[data-notification-id]')].find(
      (node) => node.getBoundingClientRect().bottom > top
    )
    if (!anchor) return
    const id = anchor.dataset.notificationId
    const offset = anchor.getBoundingClientRect().top
    await nextTick()
    if (scrollRoot.value !== root) return
    const retained = [...root.querySelectorAll<HTMLElement>('[data-notification-id]')].find(
      (node) => node.dataset.notificationId === id
    )
    if (retained) root.scrollTop += retained.getBoundingClientRect().top - offset
  }
)
const replyTo = ref<{ commentId: string; username: string }>()
const tabs: { key: MessageCategory; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'notice', label: '通知' },
  { key: 'interaction', label: '赞与回复' },
  { key: 'comment', label: '收到的评论' }
]
const unreadText = computed(() =>
  inbox.counts.all ? `${inbox.counts.all} 条未读消息` : '每一次回应，都在这里'
)
onBeforeUnmount(() => {
  void inbox.flushRead()
})
watch(
  () => inbox.account,
  () => {
    activePost.value = null
  }
)
function onScroll(event: Event) {
  const el = event.target as HTMLElement
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 120 && !inbox.error) void inbox.load()
}
function clearMessages() {
  const dialog = DialogPlugin.confirm({
    header: '清理已读消息',
    body: '清理所有分类中已经读过的消息，未读消息会保留。',
    confirmBtn: '清理已读',
    onConfirm: async () => {
      dialog.destroy()
      if (await inbox.clearRead()) MessagePlugin.success('已清理已读消息')
    },
    onClose: () => dialog.destroy()
  })
}
async function openMessage(item: InboxMessage) {
  if (!item.postId) return
  const account = inbox.account
  inbox.markRead([item])
  void inbox.flushRead()
  try {
    if (router.currentRoute.value.name !== 'community') {
      const failure = await router.push({ name: 'community' })
      if (failure) return
    }
  } catch {
    MessagePlugin.error('无法打开社区，请重试')
    return
  }
  if (inbox.account !== account) return
  inbox.open = false
  replyTo.value =
    item.commentId && (item.kind === 'reply' || item.kind === 'comment')
      ? { commentId: item.commentId, username: item.actorName || '音乐同好' }
      : undefined
  activePost.value = item.postId
}
</script>
<template>
  <t-drawer
    v-model:visible="inbox.open"
    placement="right"
    size="min(440px, calc(100vw - 24px))"
    :footer="false"
    :header="false"
    :z-index="1900"
    :show-overlay="true"
    :close-on-overlay-click="true"
    :close-on-esc-keydown="true"
    :destroy-on-close="true"
    :close-btn="false"
    drawer-class-name="notification-drawer"
  >
    <section class="inbox">
      <header class="inbox-header">
        <div>
          <div class="eyebrow">YOUR INBOX</div>
          <h2>消息</h2>
          <p>{{ unreadText }}</p>
        </div>
        <button class="inbox-close" type="button" aria-label="关闭消息" @click="inbox.open = false">
          <CloseIcon size="18" />
        </button>
      </header>
      <nav class="inbox-tabs" aria-label="消息分类">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          :class="{ active: inbox.category === tab.key }"
          :aria-pressed="inbox.category === tab.key"
          @click="inbox.category = tab.key"
        >
          {{ tab.label
          }}<span v-if="inbox.counts[tab.key]">{{
            inbox.counts[tab.key] > 99 ? '99+' : inbox.counts[tab.key]
          }}</span>
        </button>
      </nav>
      <div class="inbox-toolbar">
        <span>{{ inbox.items.length ? `已加载 ${inbox.items.length} 条` : '与你有关的消息' }}</span>
        <div>
          <button
            aria-label="刷新消息"
            title="刷新"
            :disabled="inbox.loading"
            @click="inbox.load(true)"
          >
            <RefreshIcon size="16" />
          </button>
          <button :disabled="inbox.clearing" @click="clearMessages">
            <DeleteIcon size="15" />{{ inbox.clearing ? '清理中' : '清理已读' }}
          </button>
        </div>
      </div>
      <p v-if="inbox.syncError" class="sync-error" role="status">
        {{ inbox.syncError }} <button @click="inbox.flushRead()">重试</button>
      </p>
      <div v-if="inbox.open" ref="scrollRoot" class="inbox-scroll" @scroll.passive="onScroll">
        <template v-for="item in inbox.items" :key="item.id">
          <NoticeCard
            v-if="item.category === 'notice'"
            :message="item"
            :data-notification-id="item.id"
            @seen="inbox.markRead([item])"
            @open="openMessage(item)"
          />
          <article
            v-else
            class="interaction"
            :class="{ 'session-new': inbox.sessionNewIds.has(item.id) }"
            :data-notification-id="item.id"
          >
            <div class="avatar-wrap">
              <img
                v-if="item.actorAvatar"
                :src="ossAvatar(item.actorAvatar)"
                alt=""
                @error="($event.target as HTMLImageElement).style.display = 'none'"
              /><span v-else>{{ (item.actorName || '音').slice(0, 1) }}</span
              ><i :class="{ heart: item.kind.includes('like') }"
                ><HeartIcon v-if="item.kind.includes('like')" size="12" /><ChatIcon
                  v-else
                  size="12"
              /></i>
            </div>
            <div class="interaction-body">
              <strong>{{ item.actorName || '音乐同好' }}</strong>
              <div class="interaction-meta">
                {{ item.title }}
                <time>{{ new Date(item.createdAt).toLocaleDateString('zh-CN') }}</time>
              </div>
              <p>{{ item.content }}</p>
              <button class="view-message" @click="openMessage(item)">
                {{ item.kind === 'reply' || item.kind === 'comment' ? '回复评论' : '查看笔记' }} →
              </button>
            </div>
            <button
              v-if="item.cover"
              class="post-preview"
              aria-label="查看相关笔记"
              @click="openMessage(item)"
            >
              <img :src="ossCard(item.cover)" alt="笔记封面" />
            </button>
          </article>
        </template>
        <div v-if="!inbox.items.length && !inbox.loading && !inbox.error" class="inbox-empty">
          <NotificationIcon size="40" />
          <h3>暂时没有消息</h3>
          <p>新的回应和通知会在这里与你见面</p>
        </div>
        <div v-if="inbox.error" class="feed-status" role="alert">
          {{ inbox.error }} <button @click="inbox.load(!inbox.items.length)">重新加载</button>
        </div>
        <div v-else-if="inbox.loading" class="feed-status">
          <t-loading size="small" /> 正在加载消息
        </div>
        <button v-else-if="inbox.nextCursor" class="load-more" @click="inbox.load()">
          加载更多
        </button>
        <div v-else-if="inbox.items.length" class="feed-status">已经看完啦</div>
      </div>
    </section>
  </t-drawer>
  <PostDetailModal
    v-if="activePost"
    :key="activePost"
    :post-id="activePost"
    :initial-reply-to="replyTo"
    @close="activePost = null"
    @removed="activePost = null"
  />
</template>
<style scoped>
.inbox {
  height: 100%;
  display: flex;
  flex-direction: column;
  color: var(--td-text-color-primary);
  -webkit-app-region: no-drag;
}
.inbox-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 22px 20px;
  background: linear-gradient(135deg, var(--td-brand-color-light), transparent);
}
.inbox-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 50%;
  color: var(--td-text-color-secondary);
  background: transparent;
  cursor: pointer;
  flex-shrink: 0;
}
.inbox-close:hover {
  background: var(--td-bg-color-container-hover);
}
.eyebrow {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--td-brand-color);
}
h2 {
  margin: 8px 0;
  font-size: 28px;
  letter-spacing: 2px;
}
.inbox-header p {
  margin: 0;
  color: var(--td-text-color-secondary);
  font-size: 12px;
}
.inbox-tabs {
  display: flex;
  gap: 4px;
  padding: 0 14px;
  border-bottom: 1px solid var(--td-component-border);
}
.inbox-tabs button {
  flex: 1;
  padding: 14px 4px;
  white-space: nowrap;
  font-size: 12px;
  border: none;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--td-text-color-secondary);
  cursor: pointer;
}
.inbox-tabs button.active {
  color: var(--td-brand-color);
  border-bottom-color: var(--td-brand-color);
  font-weight: 600;
}
.inbox-tabs span {
  margin-left: 4px;
  font-size: 10px;
}
.inbox-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 20px;
  color: var(--td-text-color-placeholder);
  font-size: 11px;
}
.inbox-toolbar > div {
  display: flex;
  gap: 10px;
}
.inbox-toolbar button,
.sync-error button {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  border: 0;
  padding: 0;
  background: transparent;
  color: var(--td-text-color-secondary);
  cursor: pointer;
  font-size: 11px;
}
.inbox-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  margin: 0 8px 12px;
  padding: 8px 10px 16px;
  border-radius: 10px;
  scrollbar-gutter: stable;
  scrollbar-width: auto;
  scrollbar-color: auto;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.inbox-scroll::-webkit-scrollbar {
  width: 6px;
}
.inbox-scroll::-webkit-scrollbar-track {
  background: transparent;
  margin-block: 8px;
}
.inbox-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--td-scrollbar-color, rgb(128 128 128 / 24%));
}
.inbox-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--td-scrollbar-hover-color, rgb(128 128 128 / 42%));
}
.inbox-scroll::-webkit-scrollbar-button {
  display: none;
}
.inbox-scroll > * {
  flex-shrink: 0;
}
.interaction {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px 10px;
  border-bottom: 1px solid var(--td-component-border);
  border-radius: 10px;
}
.interaction.session-new {
  background: color-mix(in srgb, var(--td-brand-color) 12%, var(--td-bg-color-container));
  border-bottom-color: color-mix(in srgb, var(--td-brand-color) 24%, var(--td-component-border));
}
.avatar-wrap {
  position: relative;
  flex-shrink: 0;
  width: 42px;
  height: 42px;
  border-radius: 50%;
  background: var(--td-brand-color-light);
  color: var(--td-brand-color);
  display: grid;
  place-items: center;
}
.avatar-wrap > img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  border-radius: 50%;
}
.avatar-wrap i {
  display: grid;
  place-items: center;
  position: absolute;
  right: -3px;
  bottom: -2px;
  width: 19px;
  height: 19px;
  border-radius: 50%;
  background: #4199ec;
  color: white;
  border: 2px solid var(--td-bg-color-container);
}
.avatar-wrap i.heart {
  background: #ef6e88;
}
.interaction-body {
  flex: 1;
  min-width: 0;
  font-size: 13px;
}
.interaction-body strong {
  font-weight: 600;
}
.interaction-meta {
  margin-top: 4px;
  font-size: 11px;
  color: var(--td-text-color-secondary);
}
time {
  color: var(--td-text-color-placeholder);
  margin-left: 3px;
}
.interaction-body p {
  margin: 8px 0;
  color: var(--td-text-color-secondary);
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
.view-message {
  border: none;
  background: var(--td-bg-color-secondarycontainer);
  color: var(--td-text-color-secondary);
  border-radius: 20px;
  padding: 5px 10px;
  cursor: pointer;
  font-size: 11px;
}
.post-preview {
  flex-shrink: 0;
  width: 56px;
  height: 64px;
  border: 0;
  padding: 0;
  background: var(--td-bg-color-secondarycontainer);
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
}
.post-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.inbox-empty {
  text-align: center;
  padding: 80px 0;
  color: var(--td-text-color-placeholder);
}
.inbox-empty h3 {
  font-size: 15px;
  font-weight: 500;
  color: var(--td-text-color-secondary);
}
.inbox-empty p {
  font-size: 12px;
}
.feed-status {
  display: flex;
  justify-content: center;
  gap: 8px;
  align-items: center;
  padding: 18px 0;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.load-more,
.feed-status button {
  padding: 10px;
  color: var(--td-brand-color);
  background: none;
  border: 0;
  cursor: pointer;
}
.sync-error {
  margin: 0;
  padding: 6px 18px;
  font-size: 11px;
  color: var(--td-warning-color);
}
:global(.notification-drawer .t-drawer__body) {
  padding: 0;
  height: 100%;
  overflow: hidden;
}
:global(.notification-drawer .t-drawer__mask) {
  background: transparent;
}
:global(.notification-drawer .t-drawer__content-wrapper) {
  top: 72px;
  bottom: calc(var(--play-bottom-height, 80px) + 8px);
  height: auto;
  border-radius: 16px 0 0 16px;
  overflow: hidden;
  box-shadow: 0 8px 36px rgb(0 0 0 / 16%);
}
:global(.notification-drawer .t-drawer__content) {
  height: 100%;
  border-radius: inherit;
}
</style>
