<script setup lang="ts">
/**
 * 聊天面板 —— 一起听浮层内的聊天 Tab
 *
 * 特点：
 *  - 消息流：自己消息靠右带主题色，他人靠左，系统消息居中半透明
 *  - 输入区：emoji 快捷面板 + 文本框，回车发送
 *  - 自动滚动到底（除非用户主动往上滑了）
 *  - 系统消息模板渲染：member-join / queue-request / queue-approved 等
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useListenTogetherStore } from '@renderer/store'
import { useAuthStore } from '@renderer/store/Auth'
import { SmileIcon, SendIcon } from 'tdesign-icons-vue-next'
import type { ChatMsg } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()
const authStore = useAuthStore()

/** 系统消息模板 —— 把后端 content (key) 转成可读中文 */
function renderSystem(msg: ChatMsg): string {
  const m = msg.meta || {}
  switch (msg.content) {
    case 'member-join':
      return `${m.user || '某人'} 加入了房间`
    case 'queue-request':
      return `${m.user || '某人'} 申请点歌《${m.song || '?'}》`
    case 'queue-approved':
      return `${m.admin || '管理员'} 通过了《${m.song || '?'}》`
    case 'queue-rejected':
      return `${m.admin || '管理员'} 拒绝了《${m.song || '?'}》`
    case 'role-promote':
      return `${m.user || '某人'} 被提升为管理员`
    case 'role-demote':
      return `${m.user || '某人'} 不再是管理员`
    case 'kick':
      return `${m.user || '某人'} 被移出了房间`
    default:
      return msg.content
  }
}

const selfKeys = computed(() => {
  const keys = new Set<string>()
  const user = authStore.user
  if (lt.myUserId) keys.add(String(lt.myUserId))
  if (user?.sub) keys.add(String(user.sub))
  if (user?.username) keys.add(String(user.username))
  if (user?.name) keys.add(String(user.name))
  return keys
})

function isSelf(msg: ChatMsg): boolean {
  if (!msg.from) return false
  const keys = selfKeys.value
  const ownMember = lt.members.find((m) => m.userId === lt.myUserId)
  if (msg.from.userId && keys.has(String(msg.from.userId))) return true
  return Boolean(ownMember?.nickname && msg.from.nickname === ownMember.nickname)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return d
    .toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
    .replace(/^[上下]午/, '')
}

/* 自动滚动 —— 只在贴底时才自动滚（避免打断用户翻历史） */
const scrollerRef = ref<HTMLDivElement | null>(null)
const stickToBottom = ref(true)

function checkStickyState(): void {
  const el = scrollerRef.value
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = distanceFromBottom < 80
}

async function scrollToBottom(): Promise<void> {
  await nextTick()
  const el = scrollerRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

watch(
  () => lt.chat.length,
  () => {
    if (stickToBottom.value) void scrollToBottom()
  }
)
onMounted(() => void scrollToBottom())

/* 输入区 */
const draft = ref('')
const showEmoji = ref(false)

const EMOJIS = [
  '😀', '😂', '🥰', '😍', '😎', '🤔', '😢', '😡', '🤯', '🥳',
  '👍', '👎', '👏', '🙏', '💪', '🔥', '✨', '🎵', '🎶', '🎉',
  '❤️', '💔', '🥺', '😴', '🤤', '😈', '👻', '🙈', '🙉', '🙊'
]

function insertEmoji(e: string): void {
  draft.value += e
  showEmoji.value = false
}

function sendText(): void {
  const t = draft.value.trim()
  if (!t) return
  lt.sendChat('text', t)
  draft.value = ''
  stickToBottom.value = true
}

function sendEmojiOnly(e: string): void {
  // 一个表情就是一条消息（类似微信表情）—— 提升互动感
  lt.sendChat('emoji', e)
  showEmoji.value = false
  stickToBottom.value = true
}

/**
 * t-textarea 的 keydown 事件签名是 (value, ctx: { e: KeyboardEvent }),
 * Vue 的 `.enter` 修饰符会把第一个参数当原生 event 处理 → tdesign 内部
 * `'key' in 51` 报错(value 是字符串/数字)。所以不能用 @keydown.enter,
 * 手动取 ctx.e 判断按键。
 *
 * 行为:
 *  - Enter:发送(preventDefault 阻止默认换行)
 *  - Shift+Enter / Ctrl+Enter / Meta+Enter:让默认行为发生 → 换行
 */
function onTextareaKeydown(_value: unknown, ctx: { e: KeyboardEvent }): void {
  const e = ctx?.e
  if (!e) return
  if (e.key !== 'Enter') return
  if (e.shiftKey || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  sendText()
}

const visibleChat = computed(() => {
  const list = lt.chat
  return list.map((m, i) => ({
    msg: m,
    showTime: i === 0 || m.ts - list[i - 1].ts > 3 * 60_000
  }))
})
</script>

<template>
  <div class="chat-panel">
    <div ref="scrollerRef" class="chat-scroll" @scroll="checkStickyState">
      <template v-for="{ msg, showTime } in visibleChat" :key="msg.id">
        <div v-if="showTime" class="time-divider">{{ formatTime(msg.ts) }}</div>

        <div v-if="msg.type === 'system'" class="msg-system">
          {{ renderSystem(msg) }}
        </div>

        <div v-else class="msg-row" :class="{ 'is-self': isSelf(msg) }">
          <div v-if="!isSelf(msg)" class="msg-avatar">
            <img v-if="msg.from?.avatar" :src="msg.from.avatar" />
            <div v-else class="avatar-fallback">
              {{ (msg.from?.nickname || '?').slice(0, 1).toUpperCase() }}
            </div>
          </div>

          <div class="msg-bubble-wrap">
            <div v-if="!isSelf(msg)" class="msg-name">{{ msg.from?.nickname }}</div>
            <div
              class="msg-bubble"
              :class="{
                'is-emoji-large': msg.type === 'emoji',
                'is-self-bubble': isSelf(msg)
              }"
            >
              {{ msg.content }}
            </div>
          </div>
        </div>
      </template>

      <div v-if="!lt.chat.length" class="chat-empty">还没有人说话，快打个招呼吧 👋</div>
    </div>

    <div class="chat-input">
      <transition name="emoji-fade">
        <div v-if="showEmoji" class="emoji-panel">
          <button
            v-for="e in EMOJIS"
            :key="e"
            class="emoji-btn"
            :title="`点击发送 ${e}（右键插入到输入框）`"
            @click="sendEmojiOnly(e)"
            @contextmenu.prevent="insertEmoji(e)"
          >
            {{ e }}
          </button>
          <div class="emoji-tip">单击直接发送 · 右键插入到输入框</div>
        </div>
      </transition>

      <div class="input-row">
        <t-button
          variant="text"
          shape="circle"
          class="icon-btn"
          :title="showEmoji ? '收起表情' : '打开表情'"
          @click="showEmoji = !showEmoji"
        >
          <SmileIcon />
        </t-button>
        <t-textarea
          v-model="draft"
          :autosize="{ minRows: 1, maxRows: 4 }"
          placeholder="说点什么... (Enter 发送 / Shift+Enter 换行)"
          class="input-textarea"
          @keydown="onTextareaKeydown"
        />
        <t-button
          theme="primary"
          shape="circle"
          class="icon-btn"
          :disabled="!draft.trim()"
          @click="sendText"
        >
          <SendIcon />
        </t-button>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.chat-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  /* 与播放列表的全屏滚动条统一观感:8px 宽,半透明白 thumb,无 track */
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;

  &::-webkit-scrollbar {
    width: 8px;
  }
  &::-webkit-scrollbar-track {
    background: transparent;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 4px;
  }
  &::-webkit-scrollbar-thumb:hover {
    background: rgba(255, 255, 255, 0.5);
  }
}

.chat-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  padding: 32px 0;
}

.time-divider {
  align-self: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  margin: 4px 0;
}

.msg-system {
  align-self: center;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.55);
  font-style: italic;
}

.msg-row {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  max-width: 80%;

  &.is-self {
    align-self: flex-end;
    flex-direction: row-reverse;
  }
}

.msg-avatar {
  flex: 0 0 auto;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.15);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    display: block;
  }
}

.avatar-fallback {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #6691ff, #93b6ff);
  color: #fff;
  font-size: 12px;
  font-weight: 600;
}

.msg-bubble-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.msg-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  margin-left: 4px;
}

.msg-bubble {
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  backdrop-filter: blur(4px);

  &.is-self-bubble {
    background: var(--lt-accent, rgba(64, 128, 255, 0.85));
    color: #fff;
  }

  &.is-emoji-large {
    background: transparent;
    font-size: 32px;
    padding: 0;
    line-height: 1;
    backdrop-filter: none;
  }
}

.chat-input {
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  padding: 8px 12px;
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
}

.input-textarea {
  flex: 1;
}

/* 深色浮层背景下,t-button variant=text 默认 icon 颜色对比度差 ——
 * 用 :deep 强制 emoji/send icon 用半透明白,与浮层风格统一。
 * 主题按钮(send 在 disabled 时)也避免变灰看不见。 */
.icon-btn :deep(.t-icon) {
  color: rgba(255, 255, 255, 0.78);
  font-size: 20px;
}
.icon-btn:hover :deep(.t-icon) {
  color: rgba(255, 255, 255, 0.95);
}
.icon-btn.t-is-disabled :deep(.t-icon),
.icon-btn[disabled] :deep(.t-icon) {
  color: rgba(255, 255, 255, 0.35);
}

/* tdesign t-button hover 默认底色偏浅(几乎白),配白 icon 对比度全无 ——
 * 强制 hover/active 用半透明白底,与浮层深色风格协调。 */
.icon-btn:hover {
  background-color: rgba(255, 255, 255, 0.12) !important;
}
.icon-btn:active {
  background-color: rgba(255, 255, 255, 0.18) !important;
}

.emoji-panel {
  display: grid;
  grid-template-columns: repeat(10, 1fr);
  gap: 4px;
  padding: 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  margin-bottom: 8px;
}

.emoji-btn {
  border: none;
  background: transparent;
  font-size: 22px;
  padding: 4px;
  cursor: pointer;
  border-radius: 6px;
  transition: background 0.1s;

  &:hover {
    background: rgba(255, 255, 255, 0.1);
  }
}

.emoji-tip {
  grid-column: 1 / -1;
  text-align: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 4px;
}

.emoji-fade-enter-active,
.emoji-fade-leave-active {
  transition: opacity 0.15s, transform 0.15s;
}
.emoji-fade-enter-from,
.emoji-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
