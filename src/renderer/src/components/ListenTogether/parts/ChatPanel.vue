<script setup lang="ts">
/**
 * 聊天面板 —— 一起听浮层内的聊天 Tab
 *
 * 特点：
 *  - 消息流：自己消息靠右带主题色，他人靠左，系统消息居中半透明
 *  - 输入区：emoji 快捷面板 + 文本框，回车发送
 *  - 自动滚动到底（除非用户主动往上滑了）
 *  - 系统消息模板渲染：member-join / queue-request / queue-approved 等
 *  - 滚动:原生 overflow:auto + v-for —— 之前用 virtua 虚拟滚动反而性能更差
 *    (ResizeObserver 频繁重测 + 卡片消息动态高度引起的 scroll anchor 抖动),
 *    环形缓冲 500 条上限下 DOM 体量可控,直接 v-for 体验最佳。
 *  - @ 提及：输入 @ 触发成员浮层,选中插入 @昵称 并记录 userId 进 meta.mentions
 *  - 回复：消息悬停 → 引用条进输入区,发送时 meta.replyTo* 透传
 *  - 复制：消息悬停 → 把 content 写入剪贴板
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useListenTogetherStore } from '@renderer/store/ListenTogether'
import { useAuthStore } from '@renderer/store/Auth'
import { SmileIcon, SendIcon } from 'tdesign-icons-vue-next'
import { MessagePlugin } from 'tdesign-vue-next'
import { ContextMenu } from '@renderer/components/ContextMenu'
import type { ContextMenuItem, ContextMenuPosition } from '@renderer/components/ContextMenu/types'
import { createMenuItem, createSeparator } from '@renderer/components/ContextMenu/utils'
import { parseShareLink } from '@renderer/utils/listenTogether/shareLink'
import { STICKERS, STICKER_MAP, KAOMOJI } from '@renderer/utils/listenTogether/stickers'
import MessageCard from './MessageCard.vue'
import SongCardActions from './SongCardActions.vue'
import type { ShareDetail, PlaylistShareDetail } from '@renderer/api/share'
import type { ChatMsg, RoomMember } from '@renderer/utils/listenTogether/types'

const lt = useListenTogetherStore()
const authStore = useAuthStore()
const router = useRouter()

/** 系统消息模板 —— 把后端 content (key) 转成可读中文 */
function renderSystem(msg: ChatMsg): string {
  const m = msg.meta || {}
  switch (msg.content) {
    case 'member-join':
      return `${m.user || '某人'} 加入了房间`
    case 'member-leave':
      return `${m.user || '某人'} 离开了房间`
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
    case 'owner-transfer':
      return `${m.user || '某人'} 成为了新房主`
    case 'kick':
      return `${m.user || '某人'} 被 ${m.admin || '管理员'} 移出了房间`
    case 'song-change':
      return `${m.admin || '管理员'} 切歌到《${m.song || '?'}》`
    case 'song-pick':
      return `${m.admin || '管理员'} 选播《${m.song || '?'}》`
    case 'song-skip':
      return `${m.admin || '管理员'} 跳到下一首《${m.song || '?'}》`
    case 'song-prev':
      return `${m.admin || '管理员'} 切回上一首《${m.song || '?'}》`
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

/* 自动滚动 —— 只在贴底时才自动滚（避免打断用户翻历史）
 *
 * 改回原生 DOM 后的逻辑:
 *   - scrollerRef 是 .chat-scroll 的 HTMLDivElement
 *   - 贴底判定读 scrollTop/scrollHeight/clientHeight 三件套
 *   - scrollToBottom = el.scrollTop = el.scrollHeight,不需要 scrollToIndex
 *   - 跳转到被引用消息:querySelector([data-msg-id])之后 scrollIntoView
 *     —— v-for 下所有行都在 DOM 里,没有被虚拟接掉的问题
 */
const scrollerRef = ref<HTMLDivElement | null>(null)
const stickToBottom = ref(true)

function checkStickyState(): void {
  const el = scrollerRef.value
  if (!el) return
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  stickToBottom.value = distanceFromBottom < 80
}

async function scrollToBottom(): Promise<void> {
  // 双拍 nextTick:等 DOM 更新 + 等浏览器重算布局后再贴底,
  // 避免第一拍时 scrollHeight 还是旧值。
  await nextTick()
  await nextTick()
  const el = scrollerRef.value
  if (!el) return
  el.scrollTop = el.scrollHeight
}

/** 卡片消息异步加载完后高度会变(骨架 → 详情 → 封面图)。
 *  普通的 watch(lt.chat.length) 不会触发,因为消息数量没变 —— 必须监听卡片的
 *  resize 信号,在用户处于贴底状态时把视图再补一脚到底,否则就只是放一会儿 */
function onCardResize(): void {
  if (stickToBottom.value) void scrollToBottom()
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
/* 表情面板分类:'sticker' 图片贴纸(发送一条独立 sticker 消息),'kaomoji' 颜文字(插入输入框作为文本)。
 * 用同一个面板容器,只切换内部网格内容,避免上下抖动。 */
const emojiTab = ref<'sticker' | 'kaomoji'>('sticker')

/* 贴纸面板使用的列表与 id→资源 映射,定义在
 * `@renderer/utils/listenTogether/stickers` —— 这里只消费,不在组件内硬编码 */

/* ============================================================
 *  @ 提及 / 回复 / 复制
 *
 * 设计要点:
 *   - selectedMentions:当前 draft 已选过的 (userId, nickname),send 时若昵称
 *     文本还在,就把 userId 拼进 meta.mentions;若用户把文本删了,就自动丢弃。
 *   - 浮层触发规则:光标前最近的 "@xxx"(没有空白)且 @ 前是行首/空白时激活,
 *     避免邮箱、变量名里的 @ 误触。
 *   - 渲染 mention 高亮:用 mentions 里的 userId 查当前 members 的 nickname,
 *     再在 content 里按昵称长度降序匹配,避免 "@张三" 吃掉 "@张三丰"。
 * ============================================================ */

const selectedMentions = ref<Array<{ userId: string; nickname: string }>>([])
const mentionActive = ref(false)
const mentionQuery = ref('')
const mentionAtIndex = ref(-1)
const mentionHighlight = ref(0)

const mentionCandidates = computed<RoomMember[]>(() => {
  if (!mentionActive.value) return []
  const me = lt.myUserId
  const q = mentionQuery.value.toLowerCase()
  return lt.members
    .filter((m) => m.userId !== me)
    .filter((m) => !q || (m.nickname || '').toLowerCase().includes(q))
    .slice(0, 8)
})

function refreshMentionContext(): void {
  const ta = textareaRef.value
  if (!ta) {
    mentionActive.value = false
    return
  }
  const cursor = ta.selectionStart
  const text = draft.value
  let atIdx = -1
  /* 光标前最多回看 16 字符找最近的 @,遇到空白就停 */
  for (let i = cursor - 1; i >= 0 && cursor - i <= 16; i--) {
    const ch = text[i]
    if (ch === '@') {
      atIdx = i
      break
    }
    if (ch === ' ' || ch === '\n' || ch === '\t') break
  }
  if (atIdx < 0) {
    mentionActive.value = false
    return
  }
  /* @ 前必须是行首/空白 —— 避免 user@host 这种邮箱误触 */
  if (atIdx > 0) {
    const prev = text[atIdx - 1]
    if (prev !== ' ' && prev !== '\n' && prev !== '\t') {
      mentionActive.value = false
      return
    }
  }
  mentionActive.value = true
  mentionAtIndex.value = atIdx
  mentionQuery.value = text.slice(atIdx + 1, cursor)
  mentionHighlight.value = 0
}

function pickMention(m: RoomMember): void {
  const ta = textareaRef.value
  if (!ta || mentionAtIndex.value < 0) return
  const cursor = ta.selectionStart
  const before = draft.value.slice(0, mentionAtIndex.value)
  const after = draft.value.slice(cursor)
  const insert = `@${m.nickname} `
  draft.value = before + insert + after
  if (!selectedMentions.value.find((x) => x.userId === m.userId)) {
    selectedMentions.value.push({ userId: m.userId, nickname: m.nickname })
  }
  mentionActive.value = false
  nextTick(() => {
    if (!textareaRef.value) return
    const pos = before.length + insert.length
    textareaRef.value.setSelectionRange(pos, pos)
    textareaRef.value.focus()
    autoResize()
  })
}

function mentionUser(from: { userId?: string; nickname?: string } | null | undefined): void {
  if (!from?.userId) return
  const member = lt.members.find((x) => x.userId === from.userId)
  if (!member) return
  const sep = draft.value && !/\s$/.test(draft.value) ? ' ' : ''
  draft.value += `${sep}@${member.nickname} `
  if (!selectedMentions.value.find((x) => x.userId === member.userId)) {
    selectedMentions.value.push({ userId: member.userId, nickname: member.nickname })
  }
  nextTick(() => {
    textareaRef.value?.focus()
    autoResize()
  })
}

/* 回复 */
const replyTo = ref<{ id: string; from: string; preview: string } | null>(null)

function replyToMessage(msg: ChatMsg): void {
  if (msg.type === 'system') return
  /* 引用预览:贴纸 content 是 id,直接展示 "[贴纸] 等你哦" 这样的可读文本,
   * 让回复条不会出现一串"sticker-5"占位。 */
  let preview = msg.content || ''
  if (msg.type === 'sticker') {
    preview = `[贴纸] ${STICKER_MAP[preview]?.label || preview}`
  }
  replyTo.value = {
    id: msg.id,
    from: msg.from?.nickname || '某人',
    preview: preview.slice(0, 40)
  }
  nextTick(() => textareaRef.value?.focus())
}

function clearReply(): void {
  replyTo.value = null
}

/** 点击引用条 —— 把视图滚到被引用的原消息位置并高亮一下
 *
 * 原生 DOM 下逻辑更直接:querySelector([data-msg-id="..."]).scrollIntoView,
 * v-for 下所有行都在 DOM 里,不需要担心被虚拟接掉的情况。
 * 唯一例外:环形缓冲 500 条上限冲掉了被引用的原消息,此时 lt.chat 里找不到,
 * 提示用户即可。 */
const highlightedMsgId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null
function jumpToReplied(replyToId: string | undefined): void {
  if (!replyToId) return
  const exists = lt.chat.some((m) => m.id === replyToId)
  if (!exists) {
    /* 原消息已被环形缓冲冲掉,引用条只剩 preview —— 给个友好提示 */
    MessagePlugin.warning('原消息已不可见')
    return
  }
  const el = scrollerRef.value?.querySelector<HTMLElement>(
    `[data-msg-id="${CSS.escape(replyToId)}"]`
  )
  if (!el) return
  el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  highlightedMsgId.value = replyToId
  if (highlightTimer) clearTimeout(highlightTimer)
  highlightTimer = setTimeout(() => {
    highlightedMsgId.value = null
    highlightTimer = null
  }, 1600)
  /* 用户主动跳走时取消"贴底"状态,否则下一条新消息会把视图又拽回最底部 */
  stickToBottom.value = false
}

/* 复制 */
async function copyMessage(msg: ChatMsg): Promise<void> {
  /* 贴纸消息复制 content(id) 没意义 —— 改成复制描述文本(如"等你哦"),
   * 用户粘贴到其他地方就是可读的中文,不会出现 "sticker-5" 的尴尬。 */
  let text = msg.content || ''
  if (msg.type === 'sticker') {
    text = STICKER_MAP[text]?.label || text
  }
  if (!text) return
  try {
    await navigator.clipboard.writeText(text)
    MessagePlugin.success('已复制')
  } catch {
    MessagePlugin.warning('复制失败')
  }
}

/* ============================================================
 *  分享卡片点击
 * ============================================================ */

const songActionsVisible = ref(false)
const songActionsDetail = ref<ShareDetail | null>(null)

function onCardSongAction(detail: ShareDetail): void {
  songActionsDetail.value = detail
  songActionsVisible.value = true
}

async function onCardPlaylistAction(detail: PlaylistShareDetail): Promise<void> {
  /* 1. 先收 FullPlay + 浮层 —— 否则跳路由后 FullPlay 还盖在最前面看不到列表 */
  lt.closeOverlay()
  lt.requestCloseFullPlay()
  /* 2. 跳到歌单页 —— query 与 App.vue 的 playlistShareQueue.handler 对齐,
   *    复用同一份 /views/music/list.vue 的 share 入参渲染逻辑 */
  await router.push({
    name: 'list',
    params: { id: detail.id },
    query: {
      title: detail.playlist.name,
      author: detail.username || 'share',
      cover: detail.playlist.cover || '',
      total: String(detail.playlist.total || 0),
      source: 'share',
      type: 'playlist_share',
      description: detail.playlist.describe || '',
      cloudId: detail.playlist.id,
      meta: JSON.stringify({
        cloudId: detail.playlist.id,
        playlistShareId: detail.id,
        sourceShare: true,
        canPlay: detail.canPlay,
        playExpiresAt: detail.playExpiresAt,
        openInAppScheme: detail.openInAppScheme
      })
    }
  })
}

/* ============================================================
 *  右键菜单 —— 复制 / 回复 / @TA 都进这里,不占气泡周围的视觉空间
 * ============================================================ */

const ctxMenuVisible = ref(false)
const ctxMenuPosition = ref<ContextMenuPosition>({ x: 0, y: 0 })
const ctxMenuItems = ref<ContextMenuItem[]>([])

function openMessageContextMenu(event: MouseEvent, msg: ChatMsg): void {
  event.preventDefault()
  event.stopPropagation()
  const items: ContextMenuItem[] = []
  items.push(
    createMenuItem('copy', '复制', {
      onClick: () => void copyMessage(msg)
    })
  )
  items.push(
    createMenuItem('reply', '回复', {
      onClick: () => replyToMessage(msg)
    })
  )
  /* 只有他人消息能 @TA;自己回复自己没意义 */
  if (!isSelf(msg) && msg.from?.userId) {
    items.push(createSeparator())
    items.push(
      createMenuItem('mention', `@ ${msg.from?.nickname || 'TA'}`, {
        onClick: () => mentionUser(msg.from)
      })
    )
  }
  ctxMenuItems.value = items
  ctxMenuPosition.value = { x: event.clientX, y: event.clientY }
  ctxMenuVisible.value = true
}

function closeMessageContextMenu(): void {
  ctxMenuVisible.value = false
}

/* ============================================================
 *  输入区辅助
 * ============================================================ */

function onInput(): void {
  autoResize()
  refreshMentionContext()
}

function onTextareaBlur(): void {
  /* 略延迟关闭 @ 浮层 —— 否则点击候选项时 blur 先触发会让点击丢失 */
  setTimeout(() => {
    mentionActive.value = false
  }, 120)
}

/* 把消息按 @昵称 切片,渲染时给 mention 套高亮 chip */
interface ContentSegment {
  type: 'text' | 'mention'
  text: string
  isSelf?: boolean
}
function renderMessageSegments(msg: ChatMsg): ContentSegment[] {
  const content = msg.content || ''
  const mentionIds = (msg.meta?.mentions || '').split(',').filter(Boolean)
  if (mentionIds.length === 0) return [{ type: 'text', text: content }]
  const known = mentionIds
    .map((id) => {
      const member = lt.members.find((m) => m.userId === id)
      if (!member?.nickname) return null
      return { nickname: member.nickname, isSelf: id === lt.myUserId }
    })
    .filter((x): x is { nickname: string; isSelf: boolean } => !!x)
    .sort((a, b) => b.nickname.length - a.nickname.length)
  if (known.length === 0) return [{ type: 'text', text: content }]

  const segs: ContentSegment[] = []
  let i = 0
  while (i < content.length) {
    if (content[i] === '@') {
      let matched: { nickname: string; isSelf: boolean } | null = null
      for (const n of known) {
        if (content.startsWith(n.nickname, i + 1)) {
          matched = n
          break
        }
      }
      if (matched) {
        segs.push({ type: 'mention', text: '@' + matched.nickname, isSelf: matched.isSelf })
        i += matched.nickname.length + 1
        continue
      }
    }
    const last = segs[segs.length - 1]
    if (last && last.type === 'text') last.text += content[i]
    else segs.push({ type: 'text', text: content[i] })
    i++
  }
  return segs
}

function sendText(): void {
  const t = draft.value.trim()
  if (!t) return
  /* 组装 meta:
   *   - mentions:只保留 nickname 文本还在 draft 里的 userId(用户改/删 @ 文本要同步丢弃)
   *   - replyTo*:有引用就塞进去,后端按白名单透传
   *   - cardType/cardId:自动检测 ceru 分享链接,接收端按 cardId 调分享 API 渲染卡片 */
  const meta: Record<string, string> = {}
  const stillMentioned = selectedMentions.value
    .filter((m) => t.includes(`@${m.nickname}`))
    .map((m) => m.userId)
  if (stillMentioned.length > 0) meta.mentions = stillMentioned.join(',')
  if (replyTo.value) {
    meta.replyToId = replyTo.value.id
    meta.replyToFrom = replyTo.value.from
    meta.replyToPreview = replyTo.value.preview
  }
  const card = parseShareLink(t)
  if (card) {
    meta.cardType = card.cardType
    meta.cardId = card.cardId
  }
  lt.sendChat('text', t, Object.keys(meta).length ? meta : undefined)
  draft.value = ''
  selectedMentions.value = []
  replyTo.value = null
  mentionActive.value = false
  stickToBottom.value = true
}

function sendSticker(id: string): void {
  // 一张贴纸就是一条消息(类似微信表情包)—— 协议只传 id,渲染端按 STICKER_MAP 查图
  if (!STICKER_MAP[id]) return
  lt.sendChat('sticker', id)
  showEmoji.value = false
  stickToBottom.value = true
}

/**
 * 颜文字点击插入 —— 不发送独立消息,只往输入框 caret 位置塞字符串,
 * 走原生 text 通道,所有客户端均可识别。插入后自动聚焦,继续打字或回车发送。
 */
function insertKaomoji(text: string): void {
  const ta = textareaRef.value
  const cursor = ta ? ta.selectionStart : draft.value.length
  const before = draft.value.slice(0, cursor)
  const after = draft.value.slice(cursor)
  draft.value = before + text + after
  nextTick(() => {
    if (!textareaRef.value) return
    const pos = before.length + text.length
    textareaRef.value.setSelectionRange(pos, pos)
    textareaRef.value.focus()
    autoResize()
  })
}

/**
 * 原生 textarea 的 keydown handler —— 替代 t-textarea
 *
 * 之前 t-textarea 的 keydown 是包装事件 (value, ctx),Vue .enter 修饰符
 * 出错;且即便取 ctx.e,Shift+Enter 的 native 换行行为也被 tdesign 内部
 * 干扰。换成 native <textarea> 后,e 是真原生事件,行为完全可控:
 *  - Enter:preventDefault + 发送
 *  - Shift/Ctrl/Meta+Enter:不 preventDefault → native 换行
 */
function onTextareaKeydown(e: KeyboardEvent): void {
  if (mentionActive.value && mentionCandidates.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      mentionHighlight.value = (mentionHighlight.value + 1) % mentionCandidates.value.length
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      mentionHighlight.value =
        (mentionHighlight.value - 1 + mentionCandidates.value.length) %
        mentionCandidates.value.length
      return
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
      e.preventDefault()
      pickMention(mentionCandidates.value[mentionHighlight.value])
      return
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      mentionActive.value = false
      return
    }
  }

  if (e.key !== 'Enter') return
  if (e.shiftKey || e.ctrlKey || e.metaKey) return
  e.preventDefault()
  sendText()
}

/* 自动高度 —— 替代 t-textarea 的 autosize,native 实现:每次输入后用
 * scrollHeight 推算行数,限制 1~4 行。 */
const textareaRef = ref<HTMLTextAreaElement | null>(null)
function autoResize(): void {
  const ta = textareaRef.value
  if (!ta) return
  ta.style.height = 'auto'
  /* 限制最多 4 行高度 */
  const lineHeight = parseFloat(getComputedStyle(ta).lineHeight) || 20
  const maxHeight = lineHeight * 4 + 16 // padding 缓冲
  ta.style.height = `${Math.min(ta.scrollHeight, maxHeight)}px`
}
watch(draft, () => void nextTick(autoResize))
onMounted(() => autoResize())
onBeforeUnmount(() => {
  if (highlightTimer) {
    clearTimeout(highlightTimer)
    highlightTimer = null
  }
})

/* ============================================================
 *  聊天行项
 *
 *  把"时间分割条"与"消息"打平成同质化 row 数组,模板用 v-for 按顺序渲染。
 *    - row.kind = 'time' → 渲染时间分割条
 *    - row.kind = 'msg'  → 渲染消息气泡/系统消息
 *  time 行 id 形如 `t:${msg.id}`,避免与消息 id 撞键。
 * ============================================================ */
interface ChatRow {
  /** 唯一 key:消息 id 或 `t:${id}` */
  id: string
  kind: 'time' | 'msg'
  /** 时间分割条用:展示时间戳 */
  ts?: number
  /** 消息行用:对应 ChatMsg */
  msg?: ChatMsg
}

const visibleRows = computed<ChatRow[]>(() => {
  const list = lt.chat
  const rows: ChatRow[] = []
  for (let i = 0; i < list.length; i++) {
    const m = list[i]
    const showTime = i === 0 || m.ts - list[i - 1].ts > 3 * 60_000
    if (showTime) {
      rows.push({ id: `t:${m.id}`, kind: 'time', ts: m.ts })
    }
    rows.push({ id: m.id, kind: 'msg', msg: m })
  }
  return rows
})
</script>

<template>
  <div class="chat-panel">
    <!-- 聊天消息流 —— 原生 DOM 滚动 + v-for。
         打平的 row 数组(visibleRows)按下标渲染:
           - row.kind = 'time' → 时间分割条
           - row.kind = 'msg'  → 消息气泡/系统消息
         @scroll 用原生事件,handler 直接读 el.scrollTop/scrollHeight 判定贴底 -->
    <div
      v-if="visibleRows.length > 0"
      ref="scrollerRef"
      class="chat-scroll"
      @scroll.passive="checkStickyState"
    >
      <template v-for="item in visibleRows" :key="item.id">
        <div class="chat-row-wrap">
          <!-- 时间分割条 -->
          <div v-if="item.kind === 'time'" class="time-divider-row">
            <span class="time-divider">{{ formatTime(item.ts!) }}</span>
          </div>

          <!-- 系统消息 -->
          <div v-else-if="item.msg!.type === 'system'" class="msg-system-row">
            <span class="msg-system">{{ renderSystem(item.msg!) }}</span>
          </div>

          <!-- 普通消息 -->
          <div
            v-else
            class="msg-row"
            :class="{
              'is-self': isSelf(item.msg!),
              'is-highlighted': highlightedMsgId === item.msg!.id
            }"
            :data-msg-id="item.msg!.id"
            @contextmenu="openMessageContextMenu($event, item.msg!)"
          >
            <div class="msg-avatar">
              <img v-if="item.msg!.from?.avatar" :src="item.msg!.from!.avatar" />
              <div v-else class="avatar-fallback" :class="{ 'is-self': isSelf(item.msg!) }">
                {{ (item.msg!.from?.nickname || '?').slice(0, 1).toUpperCase() }}
              </div>
            </div>

            <div class="msg-bubble-wrap" :class="{ 'is-self': isSelf(item.msg!) }">
              <div v-if="!isSelf(item.msg!)" class="msg-name">{{ item.msg!.from?.nickname }}</div>
              <div
                class="msg-bubble"
                :class="{
                  'is-emoji-large': item.msg!.type === 'emoji',
                  'is-sticker': item.msg!.type === 'sticker',
                  'is-self-bubble': isSelf(item.msg!),
                  'is-card': !!item.msg!.meta?.cardType
                }"
              >
                <div
                  v-if="item.msg!.meta?.replyToId"
                  class="msg-quote"
                  :title="`跳转到 ${item.msg!.meta.replyToFrom || '原消息'}`"
                  @click="jumpToReplied(item.msg!.meta.replyToId)"
                >
                  <span class="msg-quote-from">{{ item.msg!.meta.replyToFrom || '回复' }}</span>
                  <span class="msg-quote-text">{{ item.msg!.meta.replyToPreview || '' }}</span>
                </div>

                <!-- 分享卡片 —— 单曲/歌单,有 meta.cardType 时优先渲染卡片,
                     原始文本作为悄悄保留的 fallback(老客户端/盲文 reader 看得到) -->
                <MessageCard
                  v-if="item.msg!.meta?.cardType && item.msg!.meta?.cardId"
                  :card-type="item.msg!.meta.cardType"
                  :card-id="item.msg!.meta.cardId"
                  @action-song="onCardSongAction"
                  @action-playlist="onCardPlaylistAction"
                  @resize="onCardResize"
                />

                <!-- 贴纸消息 —— 只显示图片,描述仅作 title 悬浮提示。
                     找不到 id(对端版本贴纸表更新了)就退回纯文本 fallback,不会显示空白。 -->
                <div
                  v-else-if="item.msg!.type === 'sticker'"
                  class="sticker-msg"
                  :title="STICKER_MAP[item.msg!.content]?.label || item.msg!.content"
                >
                  <img
                    v-if="STICKER_MAP[item.msg!.content]"
                    class="sticker-msg-img"
                    :src="STICKER_MAP[item.msg!.content].src"
                    :alt="STICKER_MAP[item.msg!.content].label"
                    draggable="false"
                  />
                  <span v-else class="sticker-msg-fallback">[贴纸] {{ item.msg!.content }}</span>
                </div>

                <div v-else class="msg-bubble-body">
                  <span
                    v-for="(seg, segIdx) in renderMessageSegments(item.msg!)"
                    :key="segIdx"
                    :class="
                      seg.type === 'mention'
                        ? ['msg-mention', { 'is-self-mention': seg.isSelf }]
                        : 'msg-text-seg'
                    "
                    >{{ seg.text }}</span
                  >
                </div>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 空状态 -->
    <div v-else class="chat-empty">还没有人说话，快打个招呼吧 👋</div>

    <div class="chat-input">
      <!-- @ 提及候选浮层 -->
      <transition name="emoji-fade">
        <div v-if="mentionActive && mentionCandidates.length" class="mention-popup">
          <button
            v-for="(m, idx) in mentionCandidates"
            :key="m.userId"
            class="mention-item"
            :class="{ active: idx === mentionHighlight }"
            @click="pickMention(m)"
            @mouseenter="mentionHighlight = idx"
          >
            <img v-if="m.avatar" :src="m.avatar" class="mention-avatar" />
            <div v-else class="mention-avatar mention-avatar-fallback">
              {{ (m.nickname || '?').slice(0, 1).toUpperCase() }}
            </div>
            <span class="mention-name">{{ m.nickname }}</span>
            <span v-if="m.role !== 'member'" class="mention-role">{{ m.role }}</span>
          </button>
        </div>
      </transition>

      <!-- 回复引用条 -->
      <transition name="emoji-fade">
        <div v-if="replyTo" class="reply-chip">
          <div class="reply-chip-body">
            <div class="reply-chip-title">回复 {{ replyTo.from }}</div>
            <div class="reply-chip-preview">{{ replyTo.preview }}</div>
          </div>
          <button class="reply-chip-x" title="取消回复" @click="clearReply">✕</button>
        </div>
      </transition>

      <transition name="emoji-fade">
        <div v-if="showEmoji" class="sticker-panel-wrapper">
          <!-- 分类切换 tab —— 贴纸/颜文字。tab 放面板顶部,内容区只换 grid,
               面板本身高度由内容决定不会跳动 -->
          <div class="emoji-tabs">
            <button
              class="emoji-tab"
              :class="{ active: emojiTab === 'sticker' }"
              @click="emojiTab = 'sticker'"
            >
              贴纸
            </button>
            <button
              class="emoji-tab"
              :class="{ active: emojiTab === 'kaomoji' }"
              @click="emojiTab = 'kaomoji'"
            >
              颜文字
            </button>
          </div>

          <!-- 贴纸网格 —— 点击发送一条 sticker 消息 -->
          <div v-if="emojiTab === 'sticker'" class="sticker-panel">
            <button
              v-for="s in STICKERS"
              :key="s.id"
              class="sticker-btn"
              :title="s.label"
              @click="sendSticker(s.id)"
            >
              <img class="sticker-btn-img" :src="s.src" :alt="s.label" draggable="false" />
            </button>
          </div>

          <!-- 颜文字网格 —— 点击只是把字符串插入输入框 caret 位置,不发送 -->
          <div v-else class="kaomoji-panel">
            <button
              v-for="(k, i) in KAOMOJI"
              :key="i"
              class="kaomoji-btn"
              :title="k"
              @click="insertKaomoji(k)"
            >
              {{ k }}
            </button>
          </div>
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
        <textarea
          ref="textareaRef"
          v-model="draft"
          class="input-textarea"
          rows="1"
          placeholder="说点什么... (@ 提及成员 · Enter 发送 · Shift+Enter 换行)"
          @keydown="onTextareaKeydown"
          @input="onInput"
          @click="refreshMentionContext"
          @blur="onTextareaBlur"
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

    <!-- 消息右键菜单(复制 / 回复 / @TA) -->
    <ContextMenu
      v-model:visible="ctxMenuVisible"
      :position="ctxMenuPosition"
      :items="ctxMenuItems"
      @close="closeMessageContextMenu"
    />

    <!-- 单曲卡片点击后的二级动作面板 -->
    <SongCardActions v-model:visible="songActionsVisible" :detail="songActionsDetail" />
  </div>
</template>

<style scoped lang="scss">
.chat-panel {
  height: 100%;
  display: flex;
  flex-direction: column;
  font-family: 'PingFangSC-Semibold', 'Courier New', Courier, monospace;
}

.chat-scroll {
  flex: 1;
  /* 原生 DOM 滚动容器:之前用 virtua 时它自带滚动,现在需要显式声明 overflow */
  overflow-y: auto;
  overflow-x: hidden;
  min-height: 0;
  padding: 8px 0;
  box-sizing: border-box;
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

/* 聊天行外壳 —— v-for 每条消息的容器 ——
 * 左右 12px padding,上下各 4px 间距(相当于原来 gap: 8px 的一半)。
 * 内部用 flex 让自身消息靠右,他人消息靠左,系统消息/时间分割条居中。 */
.chat-row-wrap {
  padding: 4px 12px;
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
}

.time-divider-row,
.msg-system-row {
  display: flex;
  justify-content: center;
}

.chat-empty {
  text-align: center;
  color: rgba(255, 255, 255, 0.55);
  font-size: 13px;
  padding: 32px 0;
}

.time-divider {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.08);
  border-radius: 10px;
}

.msg-system {
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
    margin-left: auto;
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
  /* 自己头像用主题色调,与气泡色一致,直观区分 */
  &.is-self {
    background: linear-gradient(135deg, var(--lt-accent, #4080ff), #6aa5ff);
  }
}

.msg-bubble-wrap {
  display: flex;
  flex-direction: column;
  gap: 2px;
  /* 自己的消息气泡靠右贴边对齐,避免 row-reverse 下气泡里的文字偏左不自然 */
  &.is-self {
    align-items: flex-end;
  }
}

.msg-name {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.55);
  margin-left: 4px;
}

.msg-bubble {
  padding: 8px 12px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.16);
  font-family: 'PingFangSC-Semibold', Helvetica, Arial, sans-serif;
  color: #fff;
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
  white-space: pre-wrap;
  backdrop-filter: blur(4px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  letter-spacing: 0.06em;

  &.is-self-bubble {
    background: var(--td-brand-color-5);
    color: #fff;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.22);
  }

  &.is-emoji-large {
    background: transparent;
    box-shadow: none;
    font-size: 32px;
    padding: 0;
    line-height: 1;
    backdrop-filter: none;
  }

  /* 贴纸消息气泡 —— 与表情大字共享"裸"样式,差异在内部用图+描述布局
   * (.sticker-msg 自己控制图片尺寸/描述),气泡只负责"消失" */
  &.is-sticker {
    background: transparent;
    box-shadow: none;
    padding: 0;
    line-height: 1;
    backdrop-filter: none;
  }

  /* 卡片消息气泡 —— 卡片自带 padding,气泡背景隐去避免重影 */
  &.is-card {
    padding: 0;
    background: transparent;
    box-shadow: none;
    backdrop-filter: none;
  }
}

.chat-input {
  border-top: 1px solid rgba(255, 255, 255, 0.14);
  padding: 10px 12px;
  /* 给输入区一层比消息流稍亮的底色,跟消息气泡区拉开层次 */
  background: rgba(0, 0, 0, 0.18);
  /* 表情面板展开后不允许撑爆聊天区:
   *   - flex-shrink:0 避免被护出可视区(输入框必须始终可见)
   *   - max-height:60% 为面板与 tab/input-row 总高设上限
   *   - display:flex column 让表情面板是唯一可压缩的子项
   *   - overflow:hidden 兵底兑现 max-height —— 防止子项内容横冲边界看起来
   *     「盖住」上方 chat-scroll */
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  max-height: 60%;
  min-height: 0;
  box-sizing: border-box;
  overflow: hidden;
}

.input-row {
  display: flex;
  align-items: flex-end;
  gap: 6px;
  overflow: hidden;
}

.input-textarea {
  flex: 1;
  /* 提亮 textarea: bg / 边框 / placeholder 都明显加重,
   * 解决"在深色浮层背景上看不见输入框"的对比度问题 */
  min-height: 32px;
  max-height: 96px;
  padding: 6px 12px;
  border-radius: 14px;
  border: 1px solid rgba(255, 255, 255, 0.25);
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
  font-size: 13px;
  line-height: 1.5;
  font-family: inherit;
  resize: none;
  outline: none;
  overflow: auto;
  transition:
    border-color 0.15s,
    background 0.15s,
    box-shadow 0.15s;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;

  &::placeholder {
    color: rgba(255, 255, 255, 0.58);
  }
  &:hover {
    background: rgba(255, 255, 255, 0.18);
    border-color: rgba(255, 255, 255, 0.34);
  }
  &:focus {
    background: rgba(255, 255, 255, 0.22);
    border-color: rgba(255, 255, 255, 0.5);
    box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.08);
  }
  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
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

/* ---- 表情面板外壳 ----
 *
 * .emoji-panel 默认是 grid(老 unicode 表情时代留下的),现在我们要在内部
 * 垂直堆「tab 头 + 网格」两块,所以包一层 .sticker-panel-wrapper 把布局
 * 重置成 flex column —— grid 只保留给真正放表情格子的内层。
 *
 * 高度策略:外壳只负责「能高多高」(由父节点 .chat-input 限制),内层的
 * 贴纸/颜文字网格是唯一会被压缩的子项。min-height:0 是关键—— flex 子项
 * 默认 min-height:auto 会以内容本身为下限,随便就能撑爆父。 */
.sticker-panel-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 0;
  /* 不再写 flex:1 1 auto —— 如果面板该能多高就多高。反而用 flex-shrink:1
   * 让它在 .chat-input 被 max-height 限制时被压缩,避免抢占 input-row 空间。
   * 另加 max-height 240px 兑现「面板不超过 240px」的稳当上限 —— 不依赖
   * 父层 flex 协商,太高时内部滚动。 */
  flex: 0 1 auto;
  max-height: 240px;
  overflow: hidden;
  /* 复用原 .emoji-panel 的视觉外观:深色半透明底 + 圆角 + 与下方 input-row 留间距 */
  padding: 8px;
  border-radius: 8px;
  background: rgba(0, 0, 0, 0.25);
  margin-bottom: 8px;
}

.emoji-tabs {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
}

.emoji-tab {
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  font-size: 13px;
  padding: 4px 12px;
  border-radius: 999px;
  cursor: pointer;
  transition:
    background 0.12s,
    color 0.12s;

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.9);
  }
  &.active {
    background: rgba(255, 255, 255, 0.18);
    color: #fff;
  }
}

/* ---- 贴纸面板 ----
 *
 * 实现策略(经多轮调整后定稿):
 *   - 不用 grid:grid 的 stretch 行高与 aspect-ratio 互相抢控制权,在窄宽
 *     容器 + 自适应列数(auto-fill/minmax)下会出现 subpixel 误差,导致下
 *     一行第一张贴纸跨入前一行的视觉区。
 *   - 改用 flex-wrap:行高严格 = 该行最高子项高度。按钮不设 aspect-ratio,
 *     高度交给内部 <img>(PNG 是 1:1 像素,浏览器默认按原始比例渲染),
 *     按钮自然成正方形,绝不会上下行重叠。
 *   - 按钮宽度用 flex-basis: calc((100% - gap*(N-1)) / N) 的近似:这里用
 *     min(96px, ...)+ flex-grow 让每行自适应。简单点:flex: 0 1 96px。 */
.sticker-panel {
  display: flex;
  flex-wrap: wrap;
  /* gap 同时控制行/列间距,flex-wrap 下行高由子项决定,gap 行间距完全准确 */
  gap: 8px;
  /* align-content:flex-start 防止行数少时被 flex 父级 stretch 拉开间距 */
  align-content: flex-start;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
}

.sticker-btn {
  /* flex 子项:基准宽度 96px,允许收缩到 80,允许 grow 占满剩余空间。
   * 不写 aspect-ratio —— 高度由内部 <img> 的原始比例决定(PNG 是正方形),
   * 与父布局零协商,根除"行高错乱→上下重叠"。 */
  flex: 1 0 96px;
  max-width: 140px;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  padding: 4px;
  cursor: pointer;
  border-radius: 8px;
  /* hover/active 用伪元素做遮罩层,不再缩放,避免周围贴纸跟着抖动 */
  transition: background 0.12s;
  overflow: hidden;

  &::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: rgba(255, 255, 255, 0);
    transition: background 0.12s;
    pointer-events: none;
  }

  &:hover::after {
    background: rgba(255, 255, 255, 0.15);
  }
  &:active::after {
    background: rgba(255, 255, 255, 0.25);
  }
}

.sticker-btn-img {
  /* 宽度填满按钮内边距,高度按图片原始比例(PNG 是 1:1)自适应 —— 这是
   * 整个面板"不重叠"方案的核心:按钮没有显式高度,完全由这张图撑起,
   * 浏览器没有任何尺寸协商空间,subpixel 误差无处发生。 */
  width: 100%;
  height: auto;
  display: block;
  /* 贴纸是带白色描边的卡通形象,object-fit:contain 比 cover 更保守地保留四边留白,
   * 不会把"等你哦"小人裁掉头 */
  object-fit: contain;
  /* 图片自身也加圆角,与按钮容器圆角一致 —— hover mask 也用 inherit 跟着圆 */
  border-radius: 8px;
  pointer-events: none;
  user-select: none;
}

/* ---- 颜文字面板 ----
 *
 * 与贴纸面板共用外壳 .sticker-panel-wrapper,实现策略也保持一致:
 *   - 用 flex-wrap 而非 grid:颜文字字符高度参差不齐(含组合字符/上下角标),
 *     grid 的行 stretch 会把矮的项拉成最高那条的高度,视觉上像被"压扁"。
 *   - flex-wrap 行高严格 = 该行最高子项,每行子项 align-items:center,
 *     行间不互相干扰。 */
.kaomoji-panel {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  align-content: flex-start;
  /* 同 .sticker-panel:高度由 flex 外壳压缩,不写死 max-height */
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 255, 255, 0.3) transparent;

  &::-webkit-scrollbar {
    width: 6px;
  }
  &::-webkit-scrollbar-thumb {
    background: rgba(255, 255, 255, 0.3);
    border-radius: 3px;
  }
}

.kaomoji-btn {
  /* flex 子项:基准 96px、可 grow 占满剩余,与贴纸格子节奏一致 */
  flex: 1 0 96px;
  max-width: 160px;
  /* 固定高度,而非 stretch —— 这是关键:颜文字字符高度不一,
   * 不固定高度时该行最高项会决定整行高,矮的项视觉被拉伸 */
  height: 36px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.92);
  font-size: 13px;
  /* 颜文字大量使用全角和组合字符 —— 用等宽近似的 sans 字体栈,
   * 行高拉紧,避免上下空一大截 */
  font-family:
    -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Microsoft YaHei', sans-serif;
  line-height: 1.2;
  padding: 0 6px;
  cursor: pointer;
  border-radius: 8px;
  transition:
    background 0.12s,
    transform 0.08s;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  user-select: none;

  &:hover {
    background: rgba(255, 255, 255, 0.16);
  }
  &:active {
    background: rgba(255, 255, 255, 0.24);
    transform: scale(0.97);
  }
}

/* ---- 聊天气泡里的贴纸消息 ----
 *
 * 协议层只传 sticker id —— 渲染端按 id 查 STICKER_MAP 拿到 src + label。
 * 气泡本身在 .is-sticker 下置空背景(同 .is-emoji-large),让贴纸像微信表情
 * 一样"裸"地飘在聊天流里,避免外面套一层方块边框破坏卡通造型。 */
.sticker-msg {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  user-select: none;
}

.sticker-msg-img {
  width: 120px;
  height: 120px;
  object-fit: contain;
  /* 与面板里的格子保持同样的圆角风格,聊天里发出去的贴纸也是软角 */
  border-radius: 12px;
  pointer-events: none;
}

.sticker-msg-fallback {
  /* 对端版本没有该贴纸 id 时的兜底,样式上偏向普通文本但保持斜体提示 */
  font-style: italic;
  color: rgba(255, 255, 255, 0.6);
  font-size: 12px;
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
  transition:
    opacity 0.15s,
    transform 0.15s;
}
.emoji-fade-enter-from,
.emoji-fade-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ---- 引用条(气泡内顶部) ---- */
.msg-quote {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 5px 8px 5px 10px;
  margin-bottom: 6px;
  position: relative;
  background: rgba(0, 0, 0, 0.22);
  border-radius: 6px;
  font-size: 11.5px;
  line-height: 1.35;
  max-width: 260px;
  cursor: pointer;
  transition:
    background 0.15s,
    transform 0.15s;

  /* 左侧色条 —— 用伪元素以便 hover 时拓宽更顺滑 */
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 4px;
    bottom: 4px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: rgba(255, 255, 255, 0.45);
    transition: background 0.15s;
  }
  &:hover {
    background: rgba(0, 0, 0, 0.32);
    transform: translateX(1px);
    &::before {
      background: var(--td-brand-color-5, #4080ff);
    }
  }

  .msg-quote-from {
    color: rgba(255, 255, 255, 0.92);
    font-weight: 600;
    font-size: 11px;
    letter-spacing: 0.02em;
  }
  .msg-quote-text {
    color: rgba(255, 255, 255, 0.62);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}

/* 自己气泡里的引用条调色 —— 主题色背景上需要更亮的对比 */
.msg-bubble.is-self-bubble .msg-quote {
  background: rgba(255, 255, 255, 0.16);
  &::before {
    background: rgba(255, 255, 255, 0.7);
  }
  &:hover {
    background: rgba(255, 255, 255, 0.24);
    &::before {
      background: #fff;
    }
  }
  .msg-quote-text {
    color: rgba(255, 255, 255, 0.82);
  }
}

/* 气泡内容主体 —— 把 mention 与文本统一在一个 inline 容器,避免 flex 影响 */
.msg-bubble-body {
  display: inline;
}

/* ---- @ 提及高亮 ---- */
.msg-mention {
  /* 不用方框,改用颜色 + 下划线呼应 IM 通用风格,视觉更轻 */
  // color: var(--td-brand-color-5, #4080ff);
  font-weight: 600;
  padding: 0 1px;
}

/* @你 —— 红色文字 + 下划线,轻量提示而非整段填色块 */
.msg-mention.is-self-mention {
  background: transparent;
  padding: 0 1px;
  border-radius: 0;
  font-weight: 600;
  box-shadow: none;
  text-decoration: underline;
  text-decoration-color: var(--td-brand-color-5, #e34d59);
  text-underline-offset: 2px;
  text-decoration-thickness: 1.5px;
  font-weight: 900;
}

/* 自己气泡(主题色底)里的 mention —— 反白显眼 */
.msg-bubble.is-self-bubble .msg-mention {
  color: #fff;
  text-decoration: underline;
  text-underline-offset: 2px;
  text-decoration-color: rgba(255, 255, 255, 0.55);
}
/* 自己气泡里 @自己(理论上少见,但保持视觉一致):
 * 主题色底已经很亮了,这里红色会跟主题色打架,降级为白色下划线加粗 */
.msg-bubble.is-self-bubble .msg-mention.is-self-mention {
  color: #fff;
  background: transparent;
  text-decoration: underline;
  text-decoration-color: #fff;
  text-decoration-thickness: 1.5px;
  box-shadow: none;
}

/* 跳转高亮 —— 点击引用条时的目标消息脉冲 */
.msg-row.is-highlighted .msg-bubble {
  animation: msg-jump-pulse 1.6s ease-out;
}

@keyframes msg-jump-pulse {
  0%,
  100% {
    box-shadow: 0 1px 2px rgba(0, 0, 0, 0.18);
  }
  20% {
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.18),
      0 0 0 4px rgba(64, 128, 255, 0.45);
  }
  60% {
    box-shadow:
      0 1px 2px rgba(0, 0, 0, 0.18),
      0 0 0 6px rgba(64, 128, 255, 0);
  }
}

/* ---- 回复引用条(输入区上方) ---- */
.reply-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px 6px 10px;
  margin-bottom: 8px;
  position: relative;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 8px;

  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 6px;
    bottom: 6px;
    width: 3px;
    border-radius: 0 3px 3px 0;
    background: var(--td-brand-color-5, #4080ff);
  }

  .reply-chip-body {
    flex: 1;
    min-width: 0;
  }
  .reply-chip-title {
    font-size: 11px;
    color: var(--td-brand-color-5, #4080ff);
    font-weight: 600;
    letter-spacing: 0.02em;
  }
  .reply-chip-preview {
    font-size: 12px;
    color: rgba(255, 255, 255, 0.7);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .reply-chip-x {
    flex: 0 0 auto;
    width: 20px;
    height: 20px;
    border: none;
    border-radius: 50%;
    background: transparent;
    color: rgba(255, 255, 255, 0.55);
    cursor: pointer;
    font-size: 11px;
    line-height: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    transition:
      background 0.12s,
      color 0.12s;
    &:hover {
      background: rgba(255, 255, 255, 0.14);
      color: #fff;
    }
  }
}

/* ---- @ 候选浮层 ---- */
.mention-popup {
  display: flex;
  flex-direction: column;
  gap: 1px;
  padding: 5px;
  margin-bottom: 8px;
  border-radius: 10px;
  background: rgba(20, 22, 28, 0.72);
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.35);
  max-height: 240px;
  overflow-y: auto;

  .mention-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 6px 8px;
    border: none;
    background: transparent;
    border-radius: 7px;
    color: #fff;
    cursor: pointer;
    text-align: left;
    transition:
      background 0.12s,
      transform 0.12s;
    font-family: inherit;

    &.active {
      background: var(--td-brand-color-5, #4080ff);
      transform: translateX(2px);
    }
    &:hover:not(.active) {
      background: rgba(255, 255, 255, 0.08);
    }

    .mention-avatar {
      width: 24px;
      height: 24px;
      border-radius: 50%;
      object-fit: cover;
      flex: 0 0 auto;
      border: 1px solid rgba(255, 255, 255, 0.12);
    }
    .mention-avatar-fallback {
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(135deg, #6691ff, #93b6ff);
      font-size: 11px;
      font-weight: 600;
      border: none;
    }
    .mention-name {
      flex: 1;
      font-size: 13px;
      letter-spacing: 0.02em;
    }
    .mention-role {
      font-size: 10px;
      padding: 1px 6px;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.16);
      color: rgba(255, 255, 255, 0.78);
      letter-spacing: 0.04em;
    }
    &.active .mention-role {
      background: rgba(255, 255, 255, 0.28);
      color: #fff;
    }
  }
}
</style>
