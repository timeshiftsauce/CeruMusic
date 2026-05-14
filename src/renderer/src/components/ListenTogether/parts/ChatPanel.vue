<script setup lang="ts">
/**
 * 聊天面板 —— 一起听浮层内的聊天 Tab
 *
 * 特点：
 *  - 消息流：自己消息靠右带主题色，他人靠左，系统消息居中半透明
 *  - 输入区：emoji 快捷面板 + 文本框，回车发送
 *  - 自动滚动到底（除非用户主动往上滑了）
 *  - 系统消息模板渲染：member-join / queue-request / queue-approved 等
 *  - 虚拟滚动：使用 virtua 的 VList,仅渲染可视区 ± overscan 的消息(ResizeObserver
 *    实测每行高度),上限 500 条历史(store 侧已有环形缓冲)时也不会出现大量 DOM 拖垮性能。
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
import MessageCard from './MessageCard.vue'
import SongCardActions from './SongCardActions.vue'
import type { ShareDetail, PlaylistShareDetail } from '@renderer/api/share'
import type { ChatMsg, RoomMember } from '@renderer/utils/listenTogether/types'
/* 虚拟滚动 —— 用 virtua 的 VList 处理不定高聊天行。
 * 选 virtua 而不是 vue-virtual-scroller 的原因:
 *   - virtua 用真实 absolute 定位(非 transform),能直接接受滚动容器 padding
 *   - 用 ResizeObserver 实测每行高度,不依赖估算,追加新行不会漏渲染
 *   - 原生 shift 模式 —— store 环形缓冲从头部 splice 则滚动位置不跳动
 *   - API 极简:scrollToIndex(i, { align, smooth })、scrollOffset/scrollSize 可读 */
import { VList, type VListHandle } from 'virtua/vue'

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
 * virtua 改造说明:
 *   - scrollerRef 是 VList 实例,通过 VListHandle 暴露 scrollToIndex / scrollOffset /
 *     scrollSize / viewportSize / scrollBy / scrollTo,无需手摸 DOM。
 *   - sticky 判定不再读 .scrollTop —— VList 内部包了真实滚动容器,我们要的几个数
 *     直接拿 handle 上的 readonly 字段即可,避免找错节点。
 *   - 没有现成的 scrollToBottom,统一用 scrollToIndex(最后一行, align='end')。
 *   - VList 的 @scroll 事件参数是当前 offset(number),checkStickyState 直接吃就好。
 */
const scrollerRef = ref<VListHandle | null>(null)
const stickToBottom = ref(true)

function checkStickyState(offset: number): void {
  const s = scrollerRef.value
  if (!s) return
  const distanceFromBottom = s.scrollSize - offset - s.viewportSize
  stickToBottom.value = distanceFromBottom < 80
}

async function scrollToBottom(): Promise<void> {
  // 双拍 nextTick:等 DOM 更新 + 等 VList 通过 ResizeObserver 重测高度后再贴底,
  // 避免第一拍时 scrollSize 还是旧值。
  await nextTick()
  await nextTick()
  const s = scrollerRef.value
  if (!s) return
  const last = visibleRows.value.length - 1
  if (last < 0) return
  s.scrollToIndex(last, { align: 'end' })
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

const EMOJIS = [
  '😀',
  '😂',
  '🥰',
  '😍',
  '😎',
  '🤔',
  '😢',
  '😡',
  '🤯',
  '🥳',
  '👍',
  '👎',
  '👏',
  '🙏',
  '💪',
  '🔥',
  '✨',
  '🎵',
  '🎶',
  '🎉',
  '❤️',
  '💔',
  '🥺',
  '😴',
  '🤤',
  '😈',
  '👻',
  '🙈',
  '🙉',
  '🙊'
]

function insertEmoji(e: string): void {
  draft.value += e
  showEmoji.value = false
}

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
  replyTo.value = {
    id: msg.id,
    from: msg.from?.nickname || '某人',
    preview: (msg.content || '').slice(0, 40)
  }
  nextTick(() => textareaRef.value?.focus())
}

function clearReply(): void {
  replyTo.value = null
}

/** 点击引用条 —— 把视图滚到被引用的原消息位置并高亮一下
 *
 * 虚拟滚动下原消息可能没被渲染,无法用 querySelector 找节点。改成:
 *   1. 在 visibleRows 里按 row.id 找目标 row 的索引
 *   2. 调 scroller.scrollToIndex(index, { align: 'center' }) 让库自己处理滚动
 *   3. 滚到位后高亮(等下一帧 item 渲染出来再加 class)
 */
const highlightedMsgId = ref<string | null>(null)
let highlightTimer: ReturnType<typeof setTimeout> | null = null
function jumpToReplied(replyToId: string | undefined): void {
  if (!replyToId) return
  const rows = visibleRows.value
  const index = rows.findIndex((r) => r.kind === 'msg' && r.id === replyToId)
  if (index < 0) {
    /* 原消息已被环形缓冲冲掉,引用条只剩 preview —— 给个友好提示 */
    MessagePlugin.warning('原消息已不可见')
    return
  }
  scrollerRef.value?.scrollToIndex(index, { align: 'center', smooth: true })
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
  const text = msg.content || ''
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

function sendEmojiOnly(e: string): void {
  // 一个表情就是一条消息（类似微信表情）—— 提升互动感
  lt.sendChat('emoji', e)
  showEmoji.value = false
  stickToBottom.value = true
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
 *  虚拟滚动行项
 *
 *  把"时间分割条"与"消息"打平成同质化 row 数组,VList 按下标渲染。
 *    - row.kind = 'time' → 渲染时间分割条
 *    - row.kind = 'msg'  → 渲染消息气泡/系统消息
 *  time 行 id 形如 `t:${msg.id}`,避免与消息 id 撞键(仅供 jumpToReplied 查找使用)。
 * ============================================================ */
interface VirtualRow {
  /** 唯一 key:消息 id 或 `t:${id}` */
  id: string
  kind: 'time' | 'msg'
  /** 时间分割条用:展示时间戳 */
  ts?: number
  /** 消息行用:对应 ChatMsg */
  msg?: ChatMsg
}

const visibleRows = computed<VirtualRow[]>(() => {
  const list = lt.chat
  const rows: VirtualRow[] = []
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
    <!-- virtua 的 VList:
         - :data 直接吃打平后的 row 数组
         - 不传 :item-size —— virtua 文档明确建议大多数场景由库自动从已测尺寸估算
           (我们的行高差异极大:时间条 ~28、文字消息 ~40、卡片消息 100+、含引用条 +20,
            固定 48 会导致首屏布局偏差,出现"挤一坨/留大白"现象)
         - 不传 bufferSize —— 默认 200 足够吸收快速滚动
         - 不开 shift —— 我们主要 append 到末尾(普通新消息),shift 在 append 场景
           会"保持距底距离"反而让用户已滚动位置出现莫名空白;环形缓冲 500 条上限
           罕见触发,代价可接受
         - @scroll 给的是当前 scrollOffset(number),不用读 DOM -->
    <VList
      v-if="visibleRows.length > 0"
      ref="scrollerRef"
      class="chat-scroll"
      :data="visibleRows"
      @scroll="checkStickyState"
    >
      <template #default="{ item }">
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
    </VList>

    <!-- VList 没有 #empty 槽,空状态外置 -->
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
  /* virtua 的 VList 自身就是滚动容器 —— 用真实流式 absolute 定位,
   * 可以直接接受上下 padding 作为内边距(不像 vue-virtual-scroller 的 transform 实现) */
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

/* VList 每行的 slot 外壳 ——
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
